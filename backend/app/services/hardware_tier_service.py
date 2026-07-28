from typing import List
from uuid import UUID
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.schemas.hardware_tier import HardwareTierCreate, HardwareTierUpdate, HardwareTierResponse
from app.models.hardware_tier import HardwareTier
from app.core.exceptions import NotFoundException

class HardwareTierService:
    def __init__(self, tier_repo: HardwareTierRepository):
        self.tier_repo = tier_repo

    async def create_tier(self, tier_in: HardwareTierCreate) -> HardwareTierResponse:
        tier = HardwareTier(
            cafe_id=tier_in.cafe_id,
            name=tier_in.name,
            description=tier_in.description,
            specs=tier_in.specs,
            seats_in_tier=tier_in.seats_in_tier,
            price_per_hour=tier_in.price_per_hour,
            is_active=True
        )
        created = await self.tier_repo.create(tier)
        return HardwareTierResponse.model_validate(created)

    async def get_tier(self, tier_id: UUID) -> HardwareTierResponse:
        tier = await self.tier_repo.get_by_id(tier_id)
        if not tier:
            raise NotFoundException(message="Hardware tier not found", error_code="TIER_NOT_FOUND")
        return HardwareTierResponse.model_validate(tier)

    async def list_cafe_tiers(self, cafe_id: UUID) -> List[HardwareTierResponse]:
        tiers = await self.tier_repo.get_by_cafe(cafe_id)
        return [HardwareTierResponse.model_validate(t) for t in tiers]
