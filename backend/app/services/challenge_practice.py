"""Practice players for a rehearsal on dev: fill a challenge with made-up
players so the host can try check-in, the draw, results and rewards before
the real day. Never available on production (the API refuses it there)."""

import uuid

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models.challenge import Challenge, ChallengeEntry, ChallengeMatch
from app.models.promotion import OfferCampaign
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.services import challenge_service as svc

NAMES = [
    "Rohan", "Ronak", "Aarav", "Ishaan", "Kabir", "Vihaan", "Arjun", "Dev", "Meera",
    "Kiran", "Sana", "Zoya", "Rahul", "Neha", "Aditya", "Tara", "Yash", "Riya",
]
CHARACTERS = ["Jin", "Kazuya", "Paul", "King", "Law", "Nina", "Hwoarang", "Asuka", "Lili"]
MAX_CONFIRMED = 16
WAITLIST = 2


def email(i: int) -> str:
    return f"practice-{i:02d}@example.com"


async def _user(db: AsyncSession, i: int) -> User:
    u = (await db.execute(select(User).where(User.email == email(i)))).scalar_one_or_none()
    if u is None:
        u = User(id=uuid.uuid4(), email=email(i), password_hash=get_password_hash(uuid.uuid4().hex),
                 full_name=f"{NAMES[i - 1]} (practice)", role=UserRole.GAMER, is_active=True)
        db.add(u)
        await db.flush()
        db.add(UserRoleMapping(id=uuid.uuid4(), user_id=u.id, role=UserRole.GAMER, cafe_id=None))
        await db.flush()
    return u


async def fill(db: AsyncSession, ch: Challenge) -> int:
    """Sign up enough practice players to fill the spots (up to 16) plus 2 on
    the waitlist. Nobody is checked in yet. Returns how many were added."""
    want = min(ch.capacity, MAX_CONFIRMED) + WAITLIST
    users = [await _user(db, i) for i in range(1, want + 1)]
    await db.commit()
    added = 0
    for i, u in enumerate(users, start=1):
        name = NAMES[i - 1]
        entry, created = await svc.join(db, ch.id, u.id, {
            "name": f"{name} Practice",
            "display_name": name,
            "phone": f"+9190000003{i:02d}",
            "main_character": CHARACTERS[(i - 1) % len(CHARACTERS)],
            "consent_rules": True,
            "consent_age": True,
        })
        if created:
            entry.is_test = True
            added += 1
    await db.commit()
    return added


async def count(db: AsyncSession, challenge_id) -> int:
    return len((await db.execute(
        select(ChallengeEntry.id).join(User, User.id == ChallengeEntry.user_id).where(
            ChallengeEntry.challenge_id == challenge_id, User.email.like("practice-%@example.com"),
        )
    )).all())


async def clear(db: AsyncSession, ch: Challenge) -> int:
    """Remove the practice players and everything the rehearsal made: the
    bracket, check-in close, champion photo and the rewards (switched off).
    The challenge goes back to open for sign-ups."""
    ids = [r[0] for r in (await db.execute(
        select(ChallengeEntry.id).join(User, User.id == ChallengeEntry.user_id).where(
            ChallengeEntry.challenge_id == ch.id, User.email.like("practice-%@example.com"),
        )
    )).all()]
    await db.execute(delete(ChallengeMatch).where(ChallengeMatch.challenge_id == ch.id))
    if ids:
        await db.execute(delete(ChallengeEntry).where(ChallengeEntry.id.in_(ids)))
    await db.execute(update(OfferCampaign).where(OfferCampaign.challenge_id == ch.id).values(is_active=False))
    ch.drawn_at = None
    ch.checkin_closed_at = None
    ch.champion_photo_url = None
    if ch.status in ("live", "finished"):
        ch.status = "open"
    await db.commit()

    # Real players start fresh too: not checked in, and anyone the rehearsal
    # marked as a no-show gets their place back (spots refilled in join order).
    async def work(locked: Challenge):
        for e in await svc.entries(db, locked.id):
            e.present, e.checked_in_at = False, None
            if e.status == "no_show" and e.withdrawn_by == "checkin":
                e.status, e.withdrawn_at, e.withdrawn_by = "waitlist", None, None
        await svc.fill_spots(db, locked)
    await svc.change_spots(db, ch.id, work)
    return len(ids)
