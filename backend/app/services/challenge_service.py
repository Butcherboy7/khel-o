"""Challenges: who has a spot, who waits, and who moves up.

Spots go in join order. Every change to who has a spot runs as one short
transaction that locks the challenge row (Postgres) and also bumps
Challenge.spot_version only if nobody else bumped it first. A clash is simply
retried, so two people tapping at the same moment can never both get the last
spot. Join order (position) is unique per challenge as a last guard.

When a confirmed person drops out (taps "Can't make it", answers "No", is
released for not answering, or is marked a no-show), the first person on the
waitlist moves up, unless they already said they aren't coming. Before the
day only: on the day, check-in decides who plays (wave 2).
"""
from __future__ import annotations

import asyncio
import random
from datetime import datetime, timezone
from typing import Awaitable, Callable, Optional, TypeVar

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.challenge import Challenge, ChallengeEntry

ACTIVE = ("confirmed", "waitlist")
# Statuses where a dropped spot is passed on automatically.
AUTO_PROMOTE_STATUSES = ("open", "closed")
ATTEMPTS = 25

T = TypeVar("T")

# Status moves the edit form may make. Everything else has its own action
# (draw, Finish, Reopen, Cancel) with its own checks, so the form can't skip them.
EDIT_MOVES = {
    "draft": {"open", "closed"},
    "open": {"closed", "draft"},
    "closed": {"open", "draft"},
}
CREATE_STATUSES = ("draft", "open", "closed")
_USE_ACTION = {
    "live": "A challenge goes live when you make the draw on the Challenge day page.",
    "finished": "Use Finish on the Challenge day page.",
    "cancelled": "Cancelling has its own button, with a reason.",
}


class StatusChangeError(Exception):
    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.message = message
        self.code = code


def check_status_change(old: str, new: str, has_real_players: bool) -> None:
    """Refuse a status change the edit form isn't allowed to make."""
    if old == new:
        return
    if old == "cancelled":
        raise StatusChangeError("A cancelled challenge can't be changed. Create a new one instead.", "CHALLENGE_CANCELLED")
    if old == "finished":
        raise StatusChangeError("Use Reopen on the Challenge day page to change a finished challenge.", "USE_ACTION")
    if old == "live":
        raise StatusChangeError("The challenge is live. Use Finish on the Challenge day page.", "USE_ACTION")
    if new == "draft" and has_real_players:
        raise StatusChangeError(
            "Players have signed up, so it can't go back to draft: that would hide their page. Set it to Closed instead.",
            "HAS_PLAYERS",
        )
    if new not in EDIT_MOVES.get(old, set()):
        raise StatusChangeError(_USE_ACTION.get(new, "That status change isn't allowed here."), "USE_ACTION")


async def has_real_players(db: AsyncSession, challenge_id) -> bool:
    """Anyone who signed up for real (not our test or practice entries), in any status."""
    return (await db.execute(
        select(ChallengeEntry.id).where(ChallengeEntry.challenge_id == challenge_id, ChallengeEntry.is_test.is_(False)).limit(1)
    )).first() is not None


def now() -> datetime:
    return datetime.now(timezone.utc)


def public_name(entry: ChallengeEntry) -> str:
    """What a public page may show: the gamer tag, else "Arjun R."."""
    if entry.display_name:
        return entry.display_name
    parts = entry.name.split()
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0].upper()}."


async def lock(db: AsyncSession, challenge_id) -> Challenge:
    return (await db.execute(
        select(Challenge).where(Challenge.id == challenge_id).with_for_update()
        .execution_options(populate_existing=True)
    )).scalar_one()


async def entries(db: AsyncSession, challenge_id) -> list[ChallengeEntry]:
    await db.flush()  # never overwrite unsaved changes with what's in the table
    return list((await db.execute(
        select(ChallengeEntry).where(ChallengeEntry.challenge_id == challenge_id).order_by(ChallengeEntry.position)
        .execution_options(populate_existing=True)
    )).scalars().all())


async def entry_for(db: AsyncSession, challenge_id, *, user_id=None, entry_id=None) -> Optional[ChallengeEntry]:
    q = select(ChallengeEntry).where(ChallengeEntry.challenge_id == challenge_id)
    q = q.where(ChallengeEntry.user_id == user_id) if user_id is not None else q.where(ChallengeEntry.id == entry_id)
    return (await db.execute(q.execution_options(populate_existing=True))).scalar_one_or_none()


async def counts(db: AsyncSession, challenge_id) -> dict[str, int]:
    await db.flush()
    rows = (await db.execute(
        select(ChallengeEntry.status, func.count()).where(ChallengeEntry.challenge_id == challenge_id)
        .group_by(ChallengeEntry.status)
    )).all()
    out = {"confirmed": 0, "waitlist": 0, "withdrawn": 0, "no_show": 0}
    out.update({status: n for status, n in rows})
    return out


def rank(entry: ChallengeEntry, all_entries: list[ChallengeEntry]) -> Optional[int]:
    """"Confirmed #4" / "Waitlist #2": their place among people with the same status."""
    if entry.status not in ACTIVE:
        return None
    same = [e for e in all_entries if e.status == entry.status]
    return next(i for i, e in enumerate(same, start=1) if e.id == entry.id)


class _Clash(Exception):
    """Someone else changed the spots in the same instant."""


async def _claim(db: AsyncSession, challenge: Challenge) -> None:
    res = await db.execute(
        update(Challenge)
        .where(Challenge.id == challenge.id, Challenge.spot_version == challenge.spot_version)
        .values(spot_version=Challenge.spot_version + 1)
        .execution_options(synchronize_session=False)
    )
    if res.rowcount != 1:
        raise _Clash()


async def change_spots(db: AsyncSession, challenge_id, work: Callable[[Challenge], Awaitable[T]]) -> T:
    """Run `work(locked_challenge)` as one spot change and commit it; retried
    from the top if another change landed first. `work` must load what it
    needs itself (a retry starts from a clean session)."""
    for _ in range(ATTEMPTS):
        try:
            locked = await lock(db, challenge_id)
            result = await work(locked)
            await db.flush()
            await _claim(db, locked)
            await db.commit()
            return result
        except (_Clash, IntegrityError):
            await db.rollback()
            # A short random pause so the people who clashed don't clash again.
            await asyncio.sleep(random.uniform(0.005, 0.05))
    raise RuntimeError("The spots kept changing; try again")


async def fill_spots(db: AsyncSession, challenge: Challenge) -> list[ChallengeEntry]:
    """Move waitlist people up, in join order, until every spot is taken.
    Skips anyone who already said they aren't coming. Doesn't commit: run it
    inside change_spots."""
    rows = await entries(db, challenge.id)
    free = challenge.capacity - sum(1 for e in rows if e.status == "confirmed")
    moved = []
    for e in rows:
        if free <= 0:
            break
        if e.status == "waitlist" and e.coming != "no":
            e.status = "confirmed"
            e.promoted_at = now()
            e.told_at = None
            moved.append(e)
            free -= 1
    return moved


class AlreadySignedUp(Exception):
    """This phone number is on another account's entry for the same challenge."""


async def join(db: AsyncSession, challenge_id, user_id, fields: dict) -> tuple[ChallengeEntry, bool]:
    """Sign someone up, or hand back the entry they already have.
    Returns (entry, created)."""
    async def work(locked: Challenge):
        mine = await entry_for(db, locked.id, user_id=user_id)
        if mine is not None and mine.status in ACTIVE:
            return mine, False
        other = (await db.execute(
            select(ChallengeEntry.id).where(
                ChallengeEntry.challenge_id == locked.id,
                ChallengeEntry.phone == fields["phone"],
                ChallengeEntry.user_id != user_id,
            )
        )).first()
        if other is not None:
            raise AlreadySignedUp()

        confirmed = (await counts(db, locked.id))["confirmed"]
        status = "confirmed" if confirmed < locked.capacity else "waitlist"
        top = (await db.execute(
            select(func.max(ChallengeEntry.position)).where(ChallengeEntry.challenge_id == locked.id)
        )).scalar_one()
        position = (top or 0) + 1
        if mine is not None:
            # Dropped out earlier and back again: the back of the line.
            for key, value in fields.items():
                setattr(mine, key, value)
            mine.position, mine.status = position, status
            mine.coming = mine.coming_at = mine.withdrawn_at = mine.withdrawn_by = None
            mine.promoted_at = mine.told_at = None
            return mine, True
        entry = ChallengeEntry(challenge_id=locked.id, user_id=user_id, position=position, status=status, **fields)
        db.add(entry)
        return entry, True

    try:
        return await change_spots(db, challenge_id, work)
    except AlreadySignedUp:
        await db.rollback()
        raise


async def withdraw(db: AsyncSession, challenge_id, entry_id, by: str, status: str = "withdrawn") -> list[ChallengeEntry]:
    """Take someone out (withdrawn or no_show) and pass their spot on."""
    async def work(locked: Challenge):
        entry = await entry_for(db, locked.id, entry_id=entry_id)
        entry.status = status
        entry.withdrawn_at = now()
        entry.withdrawn_by = by
        return await fill_spots(db, locked) if locked.status in AUTO_PROMOTE_STATUSES else []

    return await change_spots(db, challenge_id, work)


async def answer_coming(db: AsyncSession, challenge_id, entry_id, coming: str) -> None:
    """"Coming on the day?" A confirmed "No" frees the spot. A waitlist "No"
    keeps their place on the list, but they won't be moved up."""
    async def work(locked: Challenge):
        entry = await entry_for(db, locked.id, entry_id=entry_id)
        entry.coming = coming
        entry.coming_at = now()
        if coming == "no" and entry.status == "confirmed":
            entry.status = "withdrawn"
            entry.withdrawn_at = now()
            entry.withdrawn_by = "player"
            if locked.status in AUTO_PROMOTE_STATUSES:
                await fill_spots(db, locked)

    await change_spots(db, challenge_id, work)


async def release_silent(db: AsyncSession, challenge_id) -> tuple[int, int]:
    """Confirmed people who never answered "Coming?" lose their spot; the
    waitlist moves up. Returns (released, moved_up)."""
    async def work(locked: Challenge):
        released = [e for e in await entries(db, locked.id) if e.status == "confirmed" and e.coming is None]
        for e in released:
            e.status = "withdrawn"
            e.withdrawn_at = now()
            e.withdrawn_by = "silent"
        moved = await fill_spots(db, locked) if locked.status in AUTO_PROMOTE_STATUSES else []
        return len(released), len(moved)

    return await change_spots(db, challenge_id, work)


async def restore(db: AsyncSession, challenge_id, entry_id) -> None:
    """Undo a drop-out: back in, with a spot if one is free, else the waitlist."""
    async def work(locked: Challenge):
        entry = await entry_for(db, locked.id, entry_id=entry_id)
        full = (await counts(db, locked.id))["confirmed"] >= locked.capacity
        entry.status = "waitlist" if full else "confirmed"
        entry.withdrawn_at = entry.withdrawn_by = None

    await change_spots(db, challenge_id, work)


class NoFreeSpot(Exception):
    pass


async def promote(db: AsyncSession, challenge_id, entry_id) -> None:
    """Admin moves one waitlist person up by hand, if a spot is free."""
    async def work(locked: Challenge):
        if (await counts(db, locked.id))["confirmed"] >= locked.capacity:
            raise NoFreeSpot()
        entry = await entry_for(db, locked.id, entry_id=entry_id)
        entry.status = "confirmed"
        entry.promoted_at = now()
        entry.told_at = None

    try:
        await change_spots(db, challenge_id, work)
    except NoFreeSpot:
        await db.rollback()
        raise


async def set_capacity(db: AsyncSession, challenge_id, apply_fields: Callable[[Challenge], None]) -> None:
    """Save an admin edit; if it added spots, the waitlist moves up into them."""
    async def work(locked: Challenge):
        before = locked.capacity
        apply_fields(locked)
        if locked.capacity > before and locked.status in AUTO_PROMOTE_STATUSES:
            await fill_spots(db, locked)

    await change_spots(db, challenge_id, work)
