from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.booking import Booking
from app.repositories.base import BaseRepository

class BookingRepository(BaseRepository[Booking]):
    def __init__(self, db: AsyncSession):
        super().__init__(Booking, db)

    async def get_by_reference(self, reference: str) -> Optional[Booking]:
        result = await self.db.execute(select(Booking).where(Booking.booking_reference == reference))
        return result.scalars().first()

    async def get_by_gamer(self, gamer_id: UUID) -> List[Booking]:
        result = await self.db.execute(select(Booking).where(Booking.gamer_id == gamer_id).order_by(Booking.created_at.desc()))
        return list(result.scalars().all())

    async def get_by_cafe(self, cafe_id: UUID) -> List[Booking]:
        result = await self.db.execute(select(Booking).where(Booking.cafe_id == cafe_id).order_by(Booking.created_at.desc()))
        return list(result.scalars().all())
