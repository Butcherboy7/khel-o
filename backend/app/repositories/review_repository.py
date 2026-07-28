from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.review import Review
from app.repositories.base import BaseRepository

class ReviewRepository(BaseRepository[Review]):
    def __init__(self, db: AsyncSession):
        super().__init__(Review, db)

    async def get_by_cafe(self, cafe_id: UUID) -> List[Review]:
        result = await self.db.execute(
            select(Review).where(Review.cafe_id == cafe_id, Review.is_visible == True).order_by(Review.created_at.desc())
        )
        return list(result.scalars().all())
