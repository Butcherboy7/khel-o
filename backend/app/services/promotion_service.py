from typing import List
from uuid import UUID
from app.repositories.promotion_repository import PromotionRepository
from app.schemas.promotion import PromotionCreate, PromotionResponse
from app.models.promotion import Promotion

class PromotionService:
    def __init__(self, promo_repo: PromotionRepository):
        self.promo_repo = promo_repo

    async def create_promotion(self, promo_in: PromotionCreate) -> PromotionResponse:
        promo = Promotion(
            cafe_id=promo_in.cafe_id,
            title=promo_in.title,
            description=promo_in.description,
            discount_percentage=promo_in.discount_percentage,
            applicable_tier_id=promo_in.applicable_tier_id,
            valid_from=promo_in.valid_from,
            valid_until=promo_in.valid_until,
            days_of_week=promo_in.days_of_week,
            start_hour=promo_in.start_hour,
            end_hour=promo_in.end_hour,
            max_uses=promo_in.max_uses,
            is_active=True
        )
        created = await self.promo_repo.create(promo)
        return PromotionResponse.model_validate(created)

    async def list_active_promotions(self, cafe_id: UUID) -> List[PromotionResponse]:
        promos = await self.promo_repo.get_active_by_cafe(cafe_id)
        return [PromotionResponse.model_validate(p) for p in promos]
