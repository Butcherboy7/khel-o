from typing import Optional, Any
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.payment import Payment, PaymentStatus
from app.repositories.base import BaseRepository

class PaymentRepository(BaseRepository[Payment]):
    def __init__(self, db: AsyncSession):
        super().__init__(Payment, db)

    async def get_by_id(self, payment_id: UUID) -> Optional[Payment]:
        result = await self.db.execute(select(Payment).where(Payment.id == payment_id))
        return result.scalars().first()

    async def get_by_razorpay_order_id(self, order_id: str) -> Optional[Payment]:
        result = await self.db.execute(select(Payment).where(Payment.razorpay_order_id == order_id))
        return result.scalars().first()

    async def get_by_booking_id(self, booking_id: UUID) -> Optional[Payment]:
        result = await self.db.execute(select(Payment).where(Payment.booking_id == booking_id))
        return result.scalars().first()

    async def create(self, payment_data: dict[str, Any] | Payment) -> Payment:
        if isinstance(payment_data, Payment):
            payment_obj = payment_data
        else:
            payment_obj = Payment(**payment_data)
        self.db.add(payment_obj)
        await self.db.commit()
        await self.db.refresh(payment_obj)
        return payment_obj

    async def update(self, payment_id: UUID, update_data: dict[str, Any]) -> Optional[Payment]:
        payment = await self.get_by_id(payment_id)
        if not payment:
            return None
        for field, value in update_data.items():
            if hasattr(payment, field) and value is not None:
                setattr(payment, field, value)
        await self.db.commit()
        await self.db.refresh(payment)
        return payment

    async def update_status(
        self,
        payment_id: UUID,
        status: PaymentStatus,
        razorpay_payment_id: Optional[str] = None,
        signature: Optional[str] = None
    ) -> Optional[Payment]:
        update_data: dict[str, Any] = {"status": status}
        if razorpay_payment_id:
            update_data["razorpay_payment_id"] = razorpay_payment_id
        if signature:
            update_data["razorpay_signature"] = signature
        return await self.update(payment_id, update_data)

    async def mark_refunded(self, payment_id: UUID, refund_id: str) -> Optional[Payment]:
        return await self.update(payment_id, {
            "status": PaymentStatus.REFUNDED,
            "refund_id": refund_id,
            "refunded_at": datetime.now(timezone.utc)
        })
