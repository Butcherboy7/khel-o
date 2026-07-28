from typing import List, Optional
from uuid import UUID, uuid4
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.repositories.cafe_repository import CafeRepository
from app.schemas.hardware_tier import HardwareTierCreateRequest, HardwareTierUpdateRequest, HardwareTierResponse
from app.models.hardware_tier import HardwareTier
from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException

class HardwareTierService:
    def __init__(self, tier_repo: HardwareTierRepository, cafe_repo: Optional[CafeRepository] = None):
        self.tier_repo = tier_repo
        self.cafe_repo = cafe_repo

    async def add_hardware_tier(self, cafe_id: UUID, owner_id: UUID, tier_in: HardwareTierCreateRequest) -> HardwareTierResponse:
        if self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(cafe_id)
            if not cafe:
                raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
            if str(cafe.owner_id) != str(owner_id):
                raise ForbiddenException(message="You can only manage hardware tiers for your own café", error_code="FORBIDDEN")

        if tier_in.price_per_hour <= 0:
            raise ValidationException(message="Price per hour must be greater than 0", error_code="INVALID_PRICE")
        if tier_in.seats_in_tier <= 0:
            raise ValidationException(message="Seats in tier must be greater than 0", error_code="INVALID_SEATS")

        tier_dict = tier_in.model_dump()
        tier_dict["id"] = uuid4()
        tier_dict["cafe_id"] = cafe_id
        tier_dict["is_active"] = True

        created = await self.tier_repo.create(tier_dict)
        return HardwareTierResponse.model_validate(created)

    create_tier = add_hardware_tier

    async def update_hardware_tier(self, tier_id: UUID, owner_id: UUID, update_data: HardwareTierUpdateRequest) -> HardwareTierResponse:
        tier = await self.tier_repo.get_by_id(tier_id)
        if not tier:
            raise NotFoundException(message="Hardware tier not found", error_code="TIER_NOT_FOUND")

        if self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(tier.cafe_id)
            if not cafe:
                raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
            if str(cafe.owner_id) != str(owner_id):
                raise ForbiddenException(message="You can only manage hardware tiers for your own café", error_code="FORBIDDEN")

        if update_data.price_per_hour is not None and update_data.price_per_hour <= 0:
            raise ValidationException(message="Price per hour must be greater than 0", error_code="INVALID_PRICE")
        if update_data.seats_in_tier is not None and update_data.seats_in_tier <= 0:
            raise ValidationException(message="Seats in tier must be greater than 0", error_code="INVALID_SEATS")

        update_dict = update_data.model_dump(exclude_unset=True)
        updated = await self.tier_repo.update(tier_id, update_dict)
        return HardwareTierResponse.model_validate(updated)

    async def get_tier(self, tier_id: UUID) -> HardwareTierResponse:
        tier = await self.tier_repo.get_by_id(tier_id)
        if not tier:
            raise NotFoundException(message="Hardware tier not found", error_code="TIER_NOT_FOUND")
        return HardwareTierResponse.model_validate(tier)

    async def get_cafe_tiers(self, cafe_id: UUID) -> List[HardwareTierResponse]:
        tiers = await self.tier_repo.get_by_cafe(cafe_id)
        return [HardwareTierResponse.model_validate(t) for t in tiers]

    list_cafe_tiers = get_cafe_tiers
