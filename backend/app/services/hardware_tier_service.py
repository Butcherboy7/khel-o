from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.promotion_repository import PromotionRepository
from app.services.promotion_service import PromotionService
from app.schemas.hardware_tier import HardwareTierCreateRequest, HardwareTierUpdateRequest, HardwareTierResponse
from app.models.hardware_tier import HardwareTier
from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException

class HardwareTierService:
    def __init__(
        self,
        tier_repo: HardwareTierRepository,
        cafe_repo: Optional[CafeRepository] = None,
        promo_repo: Optional[PromotionRepository] = None
    ):
        self.tier_repo = tier_repo
        self.cafe_repo = cafe_repo
        self.promo_repo = promo_repo

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
        res = HardwareTierResponse.model_validate(created)
        res.active_promotion = None
        return res

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
        res = HardwareTierResponse.model_validate(updated)
        res.active_promotion = None
        return res

    async def get_tier(self, tier_id: UUID) -> HardwareTierResponse:
        tier = await self.tier_repo.get_by_id(tier_id)
        if not tier:
            raise NotFoundException(message="Hardware tier not found", error_code="TIER_NOT_FOUND")
        res = HardwareTierResponse.model_validate(tier)
        res.active_promotion = None
        return res

    async def get_cafe_tiers(self, cafe_id: UUID) -> List[HardwareTierResponse]:
        tiers = await self.tier_repo.get_by_cafe(cafe_id, active_only=True)

        active_promos = []
        if self.promo_repo:
            promo_service = PromotionService(self.promo_repo, tier_repo=self.tier_repo)
            active_promos = await promo_service.get_active_promotions_for_cafe(cafe_id)

        result: List[HardwareTierResponse] = []
        for t in tiers:
            r = HardwareTierResponse.model_validate(t)
            matching_promo = None
            for p in active_promos:
                # Active promotion match check
                if p.applicable_tier_name is None or p.applicable_tier_name == t.name:
                    matching_promo = p.model_dump(by_alias=True)
                    break
            r.active_promotion = matching_promo
            result.append(r)

        return result

    list_cafe_tiers = get_cafe_tiers
