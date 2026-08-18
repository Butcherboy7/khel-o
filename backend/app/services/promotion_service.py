from typing import List, Optional
from uuid import UUID, uuid4
from decimal import Decimal
from datetime import datetime, timezone

from app.repositories.promotion_repository import PromotionRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.schemas.promotion import (
    PromotionCreateRequest,
    PromotionUpdateRequest,
    PromotionResponse,
    ActivePromotionResponse
)
from app.models.promotion import Promotion
from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException

class PromotionService:
    def __init__(
        self,
        promo_repo: PromotionRepository,
        cafe_repo: Optional[CafeRepository] = None,
        tier_repo: Optional[HardwareTierRepository] = None
    ):
        self.promo_repo = promo_repo
        self.cafe_repo = cafe_repo
        self.tier_repo = tier_repo

    def _is_promotion_active(self, promo: Promotion, now: Optional[datetime] = None) -> bool:
        if not now:
            now = datetime.now(timezone.utc)
        elif now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        if not promo.is_active:
            return False

        # Datetime range check
        valid_from = promo.valid_from.replace(tzinfo=timezone.utc) if promo.valid_from.tzinfo is None else promo.valid_from
        valid_until = promo.valid_until.replace(tzinfo=timezone.utc) if promo.valid_until.tzinfo is None else promo.valid_until

        if not (valid_from <= now <= valid_until):
            return False

        # Day of week check (0=Monday, 6=Sunday)
        if now.weekday() not in promo.days_of_week:
            return False

        # Hour window check (start_hour <= current_hour < end_hour)
        if not (promo.start_hour <= now.hour < promo.end_hour):
            return False

        # Max uses check
        if promo.max_uses is not None and promo.current_uses >= promo.max_uses:
            return False

        return True

    async def create_promotion(
        self,
        cafe_id: UUID,
        owner_id: UUID,
        promo_in: PromotionCreateRequest
    ) -> PromotionResponse:
        # Rule 1 — Discount cap
        if promo_in.discount_percentage < 1 or promo_in.discount_percentage > 50:
            raise ValidationException(
                message="Discount percentage must be between 1 and 50",
                error_code="INVALID_DISCOUNT"
            )

        # Rule 2 — Time window validation
        if promo_in.valid_until <= promo_in.valid_from:
            raise ValidationException(
                message="valid_until must be after valid_from",
                error_code="INVALID_DATE_RANGE"
            )

        if promo_in.end_hour <= promo_in.start_hour:
            raise ValidationException(
                message="end_hour must be greater than start_hour",
                error_code="INVALID_HOUR_RANGE"
            )

        if promo_in.start_hour < 0 or promo_in.start_hour > 23 or promo_in.end_hour < 1 or promo_in.end_hour > 24:
            raise ValidationException(
                message="start_hour must be 0-23 and end_hour must be 1-24",
                error_code="INVALID_HOUR_RANGE"
            )

        # Validate Cafe ownership
        if self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(cafe_id)
            if not cafe:
                raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
            if str(cafe.owner_id) != str(owner_id):
                raise ForbiddenException(message="You can only create promotions for your own café", error_code="FORBIDDEN")

        # Validate Tier ownership if specified
        if promo_in.applicable_tier_id and self.tier_repo:
            tier = await self.tier_repo.get_by_id(promo_in.applicable_tier_id)
            if not tier or str(tier.cafe_id) != str(cafe_id):
                raise ValidationException(message="Selected tier does not belong to this café", error_code="INVALID_TIER")

        # Rule 3 — Go live immediately (is_active = True)
        promo_dict = {
            "id": uuid4(),
            "cafe_id": cafe_id,
            "title": promo_in.title,
            "description": promo_in.description,
            "discount_percentage": promo_in.discount_percentage,
            "applicable_tier_id": promo_in.applicable_tier_id,
            "valid_from": promo_in.valid_from,
            "valid_until": promo_in.valid_until,
            "days_of_week": promo_in.days_of_week,
            "start_hour": promo_in.start_hour,
            "end_hour": promo_in.end_hour,
            "max_uses": promo_in.max_uses,
            "current_uses": 0,
            "is_active": True
        }

        created = await self.promo_repo.create(promo_dict)
        return PromotionResponse.model_validate(created)

    async def get_active_promotions_for_cafe(self, cafe_id: UUID) -> List[ActivePromotionResponse]:
        now = datetime.now(timezone.utc)
        candidate_promos = await self.promo_repo.get_active_for_cafe(cafe_id, now)

        active_promos: List[ActivePromotionResponse] = []
        for p in candidate_promos:
            if self._is_promotion_active(p, now):
                tier_name: Optional[str] = None
                if p.applicable_tier_id and self.tier_repo:
                    tier = await self.tier_repo.get_by_id(p.applicable_tier_id)
                    if tier:
                        tier_name = tier.name

                slots_rem = (p.max_uses - p.current_uses) if p.max_uses is not None else None

                active_promos.append(ActivePromotionResponse(
                    id=p.id,
                    title=p.title,
                    description=p.description,
                    discount_percentage=p.discount_percentage,
                    applicable_tier_name=tier_name,
                    valid_until=p.valid_until,
                    start_hour=p.start_hour,
                    end_hour=p.end_hour,
                    days_of_week=p.days_of_week,
                    slots_remaining=slots_rem
                ))

        return active_promos

    async def get_promotions_for_owner(self, cafe_id: UUID, owner_id: UUID) -> List[PromotionResponse]:
        """Full promotion list for the owner's management view — every status, not just currently-active."""
        if self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(cafe_id)
            if not cafe:
                raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
            if str(cafe.owner_id) != str(owner_id):
                raise ForbiddenException(message="You can only view promotions for your own café", error_code="FORBIDDEN")

        promos = await self.promo_repo.get_by_cafe_id(cafe_id)
        return [PromotionResponse.model_validate(p) for p in promos]

    async def get_promotion(self, promotion_id: UUID) -> PromotionResponse:
        promo = await self.promo_repo.get_by_id(promotion_id)
        if not promo:
            raise NotFoundException(message="Promotion not found", error_code="PROMOTION_NOT_FOUND")
        return PromotionResponse.model_validate(promo)

    async def update_promotion(
        self,
        promotion_id: UUID,
        owner_id: UUID,
        update_in: PromotionUpdateRequest
    ) -> PromotionResponse:
        promo = await self.promo_repo.get_by_id(promotion_id)
        if not promo:
            raise NotFoundException(message="Promotion not found", error_code="PROMOTION_NOT_FOUND")

        if self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(promo.cafe_id)
            if not cafe or str(cafe.owner_id) != str(owner_id):
                raise ForbiddenException(message="You do not have permission to update this promotion", error_code="FORBIDDEN")

        if update_in.discount_percentage is not None:
            if update_in.discount_percentage < 1 or update_in.discount_percentage > 50:
                raise ValidationException(message="Discount percentage must be between 1 and 50", error_code="INVALID_DISCOUNT")

        update_dict = update_in.model_dump(exclude_unset=True)
        updated = await self.promo_repo.update(promotion_id, update_dict)
        return PromotionResponse.model_validate(updated)

    async def deactivate_promotion(self, promotion_id: UUID, owner_id: UUID) -> None:
        promo = await self.promo_repo.get_by_id(promotion_id)
        if not promo:
            raise NotFoundException(message="Promotion not found", error_code="PROMOTION_NOT_FOUND")

        if self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(promo.cafe_id)
            if not cafe or str(cafe.owner_id) != str(owner_id):
                raise ForbiddenException(message="You do not have permission to deactivate this promotion", error_code="FORBIDDEN")

        await self.promo_repo.deactivate(promotion_id)

    async def apply_promotion_to_booking(
        self,
        promotion_id: UUID,
        cafe_id: UUID,
        tier_id: UUID,
        base_amount: Decimal
    ) -> Decimal:
        promo = await self.promo_repo.get_by_id(promotion_id)
        if not promo:
            raise ValidationException(message="Promotion not found", error_code="PROMOTION_NOT_FOUND")

        if str(promo.cafe_id) != str(cafe_id):
            raise ValidationException(message="Promotion does not belong to this café", error_code="PROMOTION_CAFE_MISMATCH")

        if promo.max_uses is not None and promo.current_uses >= promo.max_uses:
            raise ValidationException(
                message="This promotion has reached its maximum uses",
                error_code="PROMOTION_EXHAUSTED"
            )

        now = datetime.now(timezone.utc)
        if not self._is_promotion_active(promo, now):
            raise ValidationException(message="Promotion is no longer active", error_code="PROMOTION_INACTIVE")

        if promo.applicable_tier_id and str(promo.applicable_tier_id) != str(tier_id):
            raise ValidationException(message="Promotion does not apply to the selected hardware tier", error_code="PROMOTION_TIER_MISMATCH")

        # Rule 5 Math: discount_amount = base_amount * (discount_percentage / 100)
        discount_percentage = Decimal(str(promo.discount_percentage))
        discount_amount = (base_amount * (discount_percentage / Decimal('100'))).quantize(Decimal('0.01'))

        return discount_amount

    async def increment_promotion_uses(self, promotion_id: UUID) -> None:
        await self.promo_repo.increment_uses(promotion_id)
