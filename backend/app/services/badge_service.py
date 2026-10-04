"""Collectible badges earned by helping a café join KHEL-O.

Each is a UserBadge row (held for good) worth a one-off XP bonus, which
/rewards adds to the player's total. Badge keys and XP live here only, so the
rewards page, the vote response and the grant sites cannot drift apart.
"""
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.promotion_repository import PromotionRepository

# key -> (title, how it is earned, XP)
HELPER_BADGES: dict[str, tuple[str, str, int]] = {
    "day_one": ("Early Voter", "Vote for a café that isn't on KHEL-O yet.", 25),
    "matchmaker": ("Matchmaker", "Introduce us to a café owner and we get in touch.", 100),
    "local_legend": ("Local Legend", "A café you voted for or introduced goes live on KHEL-O.", 500),
    "champion": ("Champion", "Win a KHEL-O tournament.", 300),
}


def xp_for(key: str) -> int:
    return HELPER_BADGES[key][2]


async def grant_helper_badge(db: AsyncSession, user_id: UUID, key: str) -> Optional[dict]:
    """Grant once. Returns the badge payload only when it was newly earned, so
    the caller can celebrate it; None for a repeat."""
    _, created = await PromotionRepository(db).grant_badge(user_id, key, None)
    if not created:
        return None
    title, _, xp = HELPER_BADGES[key]
    return {"key": key, "title": title, "xp": xp}
