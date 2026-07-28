from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.hardware_tier import HardwareTier
from app.repositories.base import BaseRepository

class HardwareTierRepository(BaseRepository[HardwareTier]):
    def __init__(self, db: AsyncSession):
        super().__init__(HardwareTier, db)

    async def get_by_cafe(self, cafe_id: UUID) -> List[HardwareTier]:
        result = await self.db.execute(
            select(HardwareTier).where(HardwareTier.cafe_id == cafe_id, HardwareTier.is_active == True)
        )
        return list(result.scalars().all())
