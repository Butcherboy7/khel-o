from typing import Optional
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.platform_fee import PlatformFee
from app.repositories.base import BaseRepository

class PlatformFeeRepository(BaseRepository[PlatformFee]):
    def __init__(self, db: AsyncSession):
        super().__init__(PlatformFee, db)

    async def get_by_id(self, fee_id: UUID) -> Optional[PlatformFee]:
        result = await self.db.execute(select(PlatformFee).where(PlatformFee.id == fee_id))
        return result.scalars().first()

    async def get_by_booking_id(self, booking_id: UUID) -> Optional[PlatformFee]:
        result = await self.db.execute(select(PlatformFee).where(PlatformFee.booking_id == booking_id))
        return result.scalars().first()

    async def create(self, fee_data: dict) -> PlatformFee:
        fee_obj = PlatformFee(**fee_data)
        self.db.add(fee_obj)
        await self.db.commit()
        await self.db.refresh(fee_obj)
        return fee_obj
