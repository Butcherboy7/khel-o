from typing import List, Optional, Tuple, Any
from uuid import UUID
from datetime import date, time
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.models.booking import Booking, BookingStatus
from app.repositories.base import BaseRepository

class BookingRepository(BaseRepository[Booking]):
    def __init__(self, db: AsyncSession):
        super().__init__(Booking, db)

    async def get_by_id(self, booking_id: UUID) -> Optional[Booking]:
        result = await self.db.execute(select(Booking).where(Booking.id == booking_id))
        return result.scalars().first()

    async def get_by_reference(self, reference: str) -> Optional[Booking]:
        result = await self.db.execute(select(Booking).where(Booking.booking_reference == reference))
        return result.scalars().first()

    async def get_by_gamer_id(self, gamer_id: UUID, page: int = 1, limit: int = 20) -> Tuple[List[Booking], int]:
        stmt = select(Booking).where(Booking.gamer_id == gamer_id).order_by(Booking.created_at.desc())
        
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        offset = (page - 1) * limit
        paginated_stmt = stmt.offset(offset).limit(limit)
        result = await self.db.execute(paginated_stmt)
        items = list(result.scalars().all())

        return items, total

    get_by_gamer = get_by_gamer_id

    async def get_by_cafe_id(self, cafe_id: UUID, page: int = 1, limit: int = 20) -> Tuple[List[Booking], int]:
        stmt = select(Booking).where(Booking.cafe_id == cafe_id).order_by(Booking.created_at.desc())
        
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        offset = (page - 1) * limit
        paginated_stmt = stmt.offset(offset).limit(limit)
        result = await self.db.execute(paginated_stmt)
        items = list(result.scalars().all())

        return items, total

    get_by_cafe = get_by_cafe_id

    async def get_overlapping_bookings_count(
        self,
        tier_id: UUID,
        session_date: date,
        start_time: time,
        end_time: time
    ) -> int:
        """
        Count active/pending bookings for tier_id on session_date where
        existing_start < new_end AND existing_end > new_start
        """
        stmt = select(func.count()).select_from(Booking).where(
            Booking.hardware_tier_id == tier_id,
            Booking.session_date == session_date,
            Booking.status.in_([BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED]),
            and_(
                Booking.start_time < end_time,
                Booking.end_time > start_time
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def create(self, booking_data: dict[str, Any] | Booking) -> Booking:
        if isinstance(booking_data, Booking):
            booking_obj = booking_data
        else:
            booking_obj = Booking(**booking_data)
        self.db.add(booking_obj)
        await self.db.commit()
        await self.db.refresh(booking_obj)
        return booking_obj

    async def update(self, booking_id: UUID, update_data: dict[str, Any]) -> Optional[Booking]:
        booking = await self.get_by_id(booking_id)
        if not booking:
            return None
        for field, value in update_data.items():
            if hasattr(booking, field) and value is not None:
                setattr(booking, field, value)
        await self.db.commit()
        await self.db.refresh(booking)
        return booking
