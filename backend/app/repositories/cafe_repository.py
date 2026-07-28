from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.cafe import Cafe, VerificationStatus
from app.repositories.base import BaseRepository

class CafeRepository(BaseRepository[Cafe]):
    def __init__(self, db: AsyncSession):
        super().__init__(Cafe, db)

    async def get_by_owner(self, owner_id: UUID) -> List[Cafe]:
        result = await self.db.execute(select(Cafe).where(Cafe.owner_id == owner_id))
        return list(result.scalars().all())

    async def get_verified_cafes(self, city: Optional[str] = None) -> List[Cafe]:
        query = select(Cafe).where(Cafe.verification_status == VerificationStatus.VERIFIED, Cafe.is_active == True)
        if city:
            query = query.where(Cafe.city.ilike(f"%{city}%"))
        result = await self.db.execute(query)
        return list(result.scalars().all())
