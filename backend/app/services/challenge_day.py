"""The day itself: check-in, the draw, results and the final standings.

Check-in: every entry has a QR that opens /challenge/<slug>/checkin/<token>.
The token is the entry id plus a short signature made with the server's
secret, so nobody can check in someone else by guessing. Only an admin or the
challenge café's owner can use it.

Closing check-in: anyone confirmed who isn't there becomes a no-show, and
people on the waitlist who did turn up take the free spots in join order.

The draw: the confirmed players who are there, shuffled, in a single-
elimination bracket with a 3rd-place match. Byes go through on their own.
Results move the winner on (and a semi-final loser into the 3rd-place match).
A result can be corrected while the match it fed is still undecided.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import io
import random
import uuid
from typing import Optional

import qrcode
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.challenge import Challenge, ChallengeEntry, ChallengeMatch
from app.services import challenge_bracket as bracket
from app.services import challenge_results as results
from app.services import challenge_service as svc


# The draw may be made (or redone) only while sign-ups are open or closed, or on the day.
DRAW_STATUSES = ("open", "closed", "live")
# Error codes that mean "the challenge is in the wrong state": answered 409.
STATE_CODES = {"CHALLENGE_FINISHED", "WRONG_STATUS", "USE_ACTION", "CHALLENGE_CANCELLED", "BRACKET_INCOMPLETE"}
# A result that can't have happened: answered 422.
RESULT_CODES = {"INVALID_RESULT", "INVALID_WINNER", "TIEBREAK_NEEDED"}
# Where a player can be checked in at the door.
CHECKIN_STATUSES = ("open", "closed", "live")
CHECKIN_ENTRY_STATUSES = ("confirmed", "waitlist")


class DayError(Exception):
    """A plain-English reason an action can't happen right now."""

    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.message = message
        self.code = code


# ── Check-in ───────────────────────────────────────────────────────────────


def _sign(entry_id: uuid.UUID) -> str:
    mac = hmac.new(settings.SECRET_KEY.encode(), f"challenge-checkin:{entry_id.hex}".encode(), hashlib.sha256)
    return mac.hexdigest()[:16]


def checkin_token(entry_id: uuid.UUID) -> str:
    return f"{entry_id.hex}{_sign(entry_id)}"


def entry_id_from_token(token: str) -> Optional[uuid.UUID]:
    token = (token or "").strip().lower()
    if len(token) != 48:
        return None
    try:
        entry_id = uuid.UUID(hex=token[:32])
    except ValueError:
        return None
    return entry_id if hmac.compare_digest(token[32:], _sign(entry_id)) else None


def qr_data_url(url: str) -> str:
    """A PNG QR code as a data: URL, so the page needs no QR library."""
    img = qrcode.make(url, box_size=8, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def check_can_check_in(ch: Challenge, entry: ChallengeEntry) -> None:
    """Only someone still in (confirmed or waiting) at a challenge that's on."""
    if ch.status not in CHECKIN_STATUSES:
        raise DayError(
            "This challenge is finished." if ch.status == "finished"
            else "This challenge was cancelled." if ch.status == "cancelled"
            else "Check-in isn't open: the challenge is a draft.",
            "CHALLENGE_FINISHED" if ch.status == "finished" else "WRONG_STATUS",
        )
    if entry.status not in CHECKIN_ENTRY_STATUSES:
        raise DayError(
            "They dropped out of this challenge, so they can't be checked in." if entry.status == "withdrawn"
            else "They were marked as not here when check-in closed.",
            "ENTRY_NOT_ACTIVE",
        )


async def set_present(db: AsyncSession, entry: ChallengeEntry, present: bool) -> None:
    if present:
        ch = await db.get(Challenge, entry.challenge_id)
        check_can_check_in(ch, entry)
    entry.present = present
    entry.checked_in_at = svc.now() if present else None
    await db.commit()


async def close_checkin(db: AsyncSession, challenge_id) -> tuple[int, int]:
    """Confirmed but not here → no-show; waitlist people who are here take
    the free spots in join order. Safe to press again. Returns (no_shows, moved_up)."""
    async def work(locked: Challenge):
        rows = await svc.entries(db, locked.id)
        no_shows = 0
        for e in rows:
            if e.status == "confirmed" and not e.present:
                e.status = "no_show"
                e.withdrawn_at = svc.now()
                e.withdrawn_by = "checkin"
                no_shows += 1
        free = locked.capacity - sum(1 for e in rows if e.status == "confirmed")
        moved = 0
        for e in rows:
            if free <= 0:
                break
            if e.status == "waitlist" and e.present:
                e.status = "confirmed"
                e.promoted_at = e.told_at = svc.now()
                moved += 1
                free -= 1
        locked.checkin_closed_at = svc.now()
        # Sign-ups end with check-in: nobody can join after the door closes.
        if locked.status == "open":
            locked.status = "closed"
        return no_shows, moved

    return await svc.change_spots(db, challenge_id, work)


# ── Bracket ────────────────────────────────────────────────────────────────


async def matches(db: AsyncSession, challenge_id) -> list[ChallengeMatch]:
    return list((await db.execute(
        select(ChallengeMatch).where(ChallengeMatch.challenge_id == challenge_id)
        .order_by(ChallengeMatch.is_third_place, ChallengeMatch.round, ChallengeMatch.position)
        .execution_options(populate_existing=True)
    )).scalars().all())


def rounds_of(rows: list[ChallengeMatch]) -> int:
    main = [m.round for m in rows if not m.is_third_place]
    return (max(main) + 1) if main else 0


def _find(rows: list[ChallengeMatch], round_: int, position: int, third: bool = False) -> Optional[ChallengeMatch]:
    return next((m for m in rows if m.round == round_ and m.position == position and m.is_third_place == third), None)


def _third(rows: list[ChallengeMatch]) -> Optional[ChallengeMatch]:
    return next((m for m in rows if m.is_third_place), None)


def _loser(m: ChallengeMatch):
    if m.winner_entry_id is None or m.bye:
        return None
    return m.entry_b_id if m.winner_entry_id == m.entry_a_id else m.entry_a_id


def _settle_third(rows: list[ChallengeMatch]) -> None:
    """Fill the 3rd-place match from the semi-final losers. When a semi was a
    bye there's only one loser: they take 3rd without playing."""
    third = _third(rows)
    if third is None:
        return
    rounds = rounds_of(rows)
    semis = [_find(rows, rounds - 2, 0), _find(rows, rounds - 2, 1)]
    if third.winner_entry_id is not None and not third.bye:
        return  # played: never touched here
    third.entry_a_id = _loser(semis[0]) if semis[0] else None
    third.entry_b_id = _loser(semis[1]) if semis[1] else None
    third.winner_entry_id = third.completed_at = None
    third.bye = False
    if all(s is not None and s.winner_entry_id is not None for s in semis):
        players = [p for p in (third.entry_a_id, third.entry_b_id) if p is not None]
        if len(players) == 1:
            third.winner_entry_id = players[0]
            third.bye = True
            third.completed_at = svc.now()


def _advance(rows: list[ChallengeMatch], m: ChallengeMatch) -> None:
    """Put m's winner into the next match (replacing whoever was there)."""
    if m.is_third_place or m.round >= rounds_of(rows) - 1:
        return
    r, p, side = bracket.next_slot(m.round, m.position)
    nxt = _find(rows, r, p)
    if nxt is not None:
        setattr(nxt, f"entry_{side}_id", m.winner_entry_id)


async def draw(db: AsyncSession, challenge_id) -> int:
    """Shuffle the confirmed players who are here into a bracket. Can be redone
    until the first real result is in. Returns the number of players."""
    ch = await db.get(Challenge, challenge_id)
    if ch.status not in DRAW_STATUSES:
        raise DayError(
            "This challenge is finished. Reopen it first." if ch.status == "finished"
            else "Open the challenge before making the draw.",
            "CHALLENGE_FINISHED" if ch.status == "finished" else "WRONG_STATUS",
        )
    existing = await matches(db, challenge_id)
    if any(m.completed_at and not m.bye for m in existing):
        raise DayError("Results are already in. The draw can't be redone now.", "RESULTS_IN")
    rows = await svc.entries(db, challenge_id)
    players = [e for e in rows if e.status == "confirmed" and e.present]
    if len(players) < 2:
        raise DayError("Check in at least 2 confirmed players first.", "TOO_FEW_PLAYERS")

    await db.execute(delete(ChallengeMatch).where(ChallengeMatch.challenge_id == challenge_id))
    random.SystemRandom().shuffle(players)
    plan = bracket.plan(len(players), third_place=True)
    made = []
    for s in plan.matches:
        m = ChallengeMatch(
            challenge_id=challenge_id, round=s.round, position=s.position, is_third_place=s.is_third_place,
            entry_a_id=players[s.a].id if s.a is not None else None,
            entry_b_id=players[s.b].id if s.b is not None else None,
            bye=s.bye,
        )
        if s.bye:
            m.winner_entry_id = m.entry_a_id or m.entry_b_id
            m.completed_at = svc.now()
        made.append(m)
        db.add(m)
    for m in made:
        if m.bye:
            _advance(made, m)
    _settle_third(made)
    ch.drawn_at = svc.now()
    ch.status = "live"
    await db.commit()
    return len(players)


def _downstream_decided(rows: list[ChallengeMatch], m: ChallengeMatch) -> bool:
    if m.is_third_place:
        return False
    rounds = rounds_of(rows)
    if m.round < rounds - 1:
        r, p, _ = bracket.next_slot(m.round, m.position)
        nxt = _find(rows, r, p)
        if nxt is not None and nxt.winner_entry_id is not None and not nxt.bye:
            return True
    if m.round == rounds - 2:
        third = _third(rows)
        if third is not None and third.winner_entry_id is not None and not third.bye:
            return True
    return False


async def _lock_live(db: AsyncSession, challenge_id) -> Challenge:
    """Lock the challenge row and make sure results can change now."""
    ch = await svc.lock(db, challenge_id)
    if ch.status == "finished":
        raise DayError("This challenge is finished, so its results are locked. Reopen it first.", "CHALLENGE_FINISHED")
    if ch.status != "live":
        raise DayError("Results go in once the draw is made.", "WRONG_STATUS")
    return ch


async def record_result(
    db: AsyncSession, challenge_id, match_id, winner: str, score_a: Optional[int], score_b: Optional[int],
    tiebreak: Optional[str] = None, tiebreak_a: Optional[int] = None, tiebreak_b: Optional[int] = None,
) -> None:
    try:
        ch = await _lock_live(db, challenge_id)
        await _record(db, ch, match_id, winner, score_a, score_b, tiebreak, tiebreak_a, tiebreak_b)
    except (DayError, results.ResultError):
        await db.rollback()
        raise


async def _record(db, ch, match_id, winner, score_a, score_b, tiebreak, tiebreak_a, tiebreak_b) -> None:
    challenge_id = ch.id
    rows = await matches(db, challenge_id)
    m = next((x for x in rows if x.id == match_id), None)
    if m is None:
        raise DayError("No such match.", "MATCH_NOT_FOUND")
    if m.bye:
        raise DayError("This one is a bye: the player goes through without playing.", "MATCH_IS_BYE")
    if m.entry_a_id is None or m.entry_b_id is None:
        raise DayError("Both players aren't known yet.", "MATCH_NOT_READY")
    if _downstream_decided(rows, m):
        raise DayError("The next match already has a result. Clear that one first.", "NEXT_MATCH_DECIDED")
    results.check_result(
        results.result_type(ch), results.match_best_of(ch, rounds_of(rows), m),
        winner, score_a, score_b, tiebreak, tiebreak_a, tiebreak_b,
    )
    m.winner_entry_id = m.entry_a_id if winner == "a" else m.entry_b_id
    m.score_a, m.score_b = score_a, score_b
    m.tiebreak, m.tiebreak_a, m.tiebreak_b = tiebreak, tiebreak_a, tiebreak_b
    m.completed_at = svc.now()
    _advance(rows, m)
    _settle_third(rows)
    await db.commit()


async def clear_result(db: AsyncSession, challenge_id, match_id) -> None:
    try:
        await _lock_live(db, challenge_id)
        rows = await matches(db, challenge_id)
        m = next((x for x in rows if x.id == match_id), None)
        if m is None or m.bye:
            raise DayError("Nothing to clear here.", "MATCH_NOT_FOUND")
        if _downstream_decided(rows, m):
            raise DayError("The next match already has a result. Clear that one first.", "NEXT_MATCH_DECIDED")
    except DayError:
        await db.rollback()
        raise
    m.winner_entry_id = None
    m.score_a = m.score_b = None
    m.tiebreak = m.tiebreak_a = m.tiebreak_b = None
    m.completed_at = None
    _advance(rows, m)
    _settle_third(rows)
    await db.commit()


async def finish(db: AsyncSession, challenge_id) -> bool:
    """Lock the results. Only a live challenge whose whole bracket is played
    and consistent can finish. Returns False if it was already finished."""
    ch = await svc.lock(db, challenge_id)
    try:
        if ch.status == "finished":
            return False
        if ch.status != "live":
            raise DayError("Make the draw and play it out before finishing.", "USE_ACTION")
        problems = results.bracket_problems(ch, await matches(db, challenge_id))
        if problems:
            raise DayError("Not ready to finish: " + " ".join(problems[:5]), "BRACKET_INCOMPLETE")
    except DayError:
        await db.rollback()
        raise
    ch.status = "finished"
    ch.finished_at = svc.now()
    await db.commit()
    return True


def standings(rows: list[ChallengeMatch]) -> dict[int, uuid.UUID]:
    """{1: entry_id, 2: entry_id, 3: entry_id}: only places already decided."""
    rounds = rounds_of(rows)
    out: dict[int, uuid.UUID] = {}
    final = _find(rows, rounds - 1, 0) if rounds else None
    if final is not None and final.winner_entry_id is not None:
        out[1] = final.winner_entry_id
        loser = _loser(final)
        if loser is not None:
            out[2] = loser
    third = _third(rows)
    if third is not None and third.winner_entry_id is not None:
        out[3] = third.winner_entry_id
    return out


def ready_matches(rows: list[ChallengeMatch]) -> list[ChallengeMatch]:
    """Every match that can be played now (both players known, no result yet),
    in playing order: earlier rounds first, the 3rd-place match just before
    the final. The café sends players to whichever setup is free."""
    ready = [m for m in rows if m.winner_entry_id is None and m.entry_a_id and m.entry_b_id]
    rounds = rounds_of(rows)
    ready.sort(key=lambda m: (m.round + (0 if m.is_third_place else (0.5 if m.round == rounds - 1 else 0)), m.position))
    return ready


def up_next(rows: list[ChallengeMatch]) -> Optional[ChallengeMatch]:
    """The first of the ready matches."""
    ready = ready_matches(rows)
    return ready[0] if ready else None
