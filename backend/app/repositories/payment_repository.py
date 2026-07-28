from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.payment import Payment
from app.repositories.base import BaseRepository

class PaymentRepository(BaseRepository[Payment]):
    def __init__(self, db: AsyncSession):
        super().__init__(Payment, db)

    async def get_by_razorpay_order_id(self, order_id: str) -> Optional[Payment]:
        result = await self.db.execute(select(Payment).where(Payment.razorpay_order_id == order_id))
        return result.scalars().first()

    async def get_by_booking_id(self, booking_id: UUID) -> Optional[Payment]:
        result = await self.db.execute(select(Payment).where(Payment.booking_id == booking_id))
        return result.scalars().first()
