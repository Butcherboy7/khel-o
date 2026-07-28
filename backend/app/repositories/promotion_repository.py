from typing import List
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.promotion import Promotion
from app.repositories.base import BaseRepository

class PromotionRepository(BaseRepository[Promotion]):
    def __init__(self, db: AsyncSession):
        super().__init__(Promotion, db)

    async def get_active_by_cafe(self, cafe_id: UUID) -> List[Promotion]:
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(Promotion).where(
                Promotion.cafe_id == cafe_id,
                Promotion.is_active == True,
                Promotion.valid_from <= now,
                Promotion.valid_until >= now
            )
        )
        return list(result.scalars().all())
