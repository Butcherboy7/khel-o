from typing import List, Optional, Any
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, or_, and_
from app.models.promotion import Promotion
from app.repositories.base import BaseRepository

class PromotionRepository(BaseRepository[Promotion]):
    def __init__(self, db: AsyncSession):
        super().__init__(Promotion, db)

    async def get_by_id(self, promotion_id: UUID) -> Optional[Promotion]:
        result = await self.db.execute(select(Promotion).where(Promotion.id == promotion_id))
        return result.scalars().first()

    async def get_by_cafe_id(self, cafe_id: UUID) -> List[Promotion]:
        result = await self.db.execute(
            select(Promotion).where(Promotion.cafe_id == cafe_id).order_by(Promotion.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_active_for_cafe(self, cafe_id: UUID, now: datetime) -> List[Promotion]:
        stmt = select(Promotion).where(
            Promotion.cafe_id == cafe_id,
            Promotion.is_active == True,
            Promotion.valid_from <= now,
            Promotion.valid_until >= now
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_active_for_tier(self, tier_id: UUID, cafe_id: UUID, now: datetime) -> List[Promotion]:
        stmt = select(Promotion).where(
            Promotion.cafe_id == cafe_id,
            Promotion.is_active == True,
            Promotion.valid_from <= now,
            Promotion.valid_until >= now,
            or_(
                Promotion.applicable_tier_id == tier_id,
                Promotion.applicable_tier_id.is_(None)
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create(self, promo_data: dict[str, Any] | Promotion) -> Promotion:
        if isinstance(promo_data, Promotion):
            promo_obj = promo_data
        else:
            promo_obj = Promotion(**promo_data)
        self.db.add(promo_obj)
        await self.db.commit()
        await self.db.refresh(promo_obj)
        return promo_obj

    async def update(self, promotion_id: UUID, update_data: dict[str, Any]) -> Optional[Promotion]:
        promo = await self.get_by_id(promotion_id)
        if not promo:
            return None
        for field, value in update_data.items():
            if hasattr(promo, field) and value is not None:
                setattr(promo, field, value)
        await self.db.commit()
        await self.db.refresh(promo)
        return promo

    async def increment_uses(self, promotion_id: UUID) -> None:
        stmt = update(Promotion).where(Promotion.id == promotion_id).values(
            current_uses=Promotion.current_uses + 1
        )
        await self.db.execute(stmt)
        await self.db.commit()

    async def deactivate(self, promotion_id: UUID) -> Optional[Promotion]:
        promo = await self.get_by_id(promotion_id)
        if not promo:
            return None
        promo.is_active = False
        await self.db.commit()
        await self.db.refresh(promo)
        return promo
