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

# Keyword -> real PLATFORM_MODELS[platform] entry, most-specific keyword
# first (e.g. "ps5 pro" must be checked before "ps5"). Used only to guess a
# *model* that derive_tier_display will actually accept — see _guess_model.
_MODEL_GUESS_KEYWORDS = {
    "playstation": [("ps5 pro", "PS5 Pro"), ("ps5", "PS5"), ("ps4 pro", "PS4 Pro"), ("ps4", "PS4")],
    "xbox": [("series x", "Series X"), ("series s", "Series S"), ("one x", "One X"), ("one s", "One S")],
    "nintendo": [("switch oled", "Switch OLED"), ("switch lite", "Switch Lite"), ("switch", "Switch")],
    "pc": [("4090", "RTX 4090"), ("4070", "RTX 4070"), ("3060", "RTX 3060")],
}


def _guess_model(platform: str, haystack: str) -> str:
    """Keyword-map to the closest real model in PLATFORM_MODELS[platform];
    fall back to 'Custom' (present in every platform's picklist) rather than
    ever returning free text. The guess is shown to the owner as an editable
    draft, but derive_tier_display rejects any model not in the picklist —
    returning free text here is what made the "accept the guess as-is" path
    always 422 (see final-review.md C1)."""
    for keyword, model in _MODEL_GUESS_KEYWORDS.get(platform, []):
        if keyword in haystack:
            return model
    return "Custom"


def guess_platform_and_model(tier: "HardwareTier") -> tuple[str, str]:
    """Best-effort guess for the re-confirmation prompt only — this value
    is always shown to the owner as an editable draft, never saved without
    explicit confirmation (see Task 6). Mirrors the keyword logic already
    used client-side in lib/platformTags.ts. The returned model is always a
    member of PLATFORM_MODELS[platform] (or free text for "other", which has
    no fixed picklist) — never the tier's raw name/gpu string."""
    haystack = f"{tier.name} {tier.specs.get('gpu', '')}".lower()
    for platform, keywords in CONSOLE_GUESS_KEYWORDS.items():
        if any(kw in haystack for kw in keywords):
            return platform, _guess_model(platform, haystack)
    if any(kw in haystack for kw in PC_GUESS_KEYWORDS):
        return "pc", _guess_model("pc", haystack)
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
