from typing import List, Optional, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.hardware_tier import HardwareTier
from app.repositories.base import BaseRepository

CONSOLE_GUESS_KEYWORDS = {
    "playstation": ["ps5", "ps4", "ps3", "ps2", "playstation"],
    "xbox": ["xbox"],
    "nintendo": ["switch", "nintendo"],
}
PC_GUESS_KEYWORDS = ["rtx", "gtx", "radeon", "nvidia", "amd"]


def guess_platform_and_model(tier: "HardwareTier") -> tuple[str, str]:
    """Best-effort guess for the re-confirmation prompt only — this value
    is always shown to the owner as an editable draft, never saved without
    explicit confirmation (see Task 6). Mirrors the keyword logic already
    used client-side in lib/platformTags.ts and owner/tiers/page.tsx's
    detectPlatform()."""
    haystack = f"{tier.name} {tier.specs.get('gpu', '')}".lower()
    for platform, keywords in CONSOLE_GUESS_KEYWORDS.items():
        if any(kw in haystack for kw in keywords):
            return platform, tier.name
    if any(kw in haystack for kw in PC_GUESS_KEYWORDS):
        return "pc", tier.specs.get("gpu", tier.name)
    return "other", tier.name


class HardwareTierRepository(BaseRepository[HardwareTier]):
    def __init__(self, db: AsyncSession):
        super().__init__(HardwareTier, db)

    async def get_by_id(self, tier_id: UUID) -> Optional[HardwareTier]:
        result = await self.db.execute(select(HardwareTier).where(HardwareTier.id == tier_id))
        return result.scalars().first()

    async def get_by_cafe_id(self, cafe_id: UUID, active_only: bool = True) -> List[HardwareTier]:
        stmt = select(HardwareTier).where(HardwareTier.cafe_id == cafe_id)
        if active_only:
            stmt = stmt.where(HardwareTier.is_active == True)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    get_by_cafe = get_by_cafe_id

    async def create(self, tier_data: dict[str, Any] | HardwareTier) -> HardwareTier:
        if isinstance(tier_data, HardwareTier):
            tier_obj = tier_data
        else:
            tier_obj = HardwareTier(**tier_data)
        self.db.add(tier_obj)
        await self.db.commit()
        await self.db.refresh(tier_obj)
        return tier_obj

    async def update(self, tier_id: UUID, update_data: dict[str, Any]) -> Optional[HardwareTier]:
        tier = await self.get_by_id(tier_id)
        if not tier:
            return None
        for field, value in update_data.items():
            if hasattr(tier, field) and value is not None:
                setattr(tier, field, value)
        await self.db.commit()
        await self.db.refresh(tier)
        return tier

    async def deactivate(self, tier_id: UUID) -> Optional[HardwareTier]:
        return await self.update(tier_id, {"is_active": False})
