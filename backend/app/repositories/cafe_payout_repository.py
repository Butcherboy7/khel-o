from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import select, func, not_, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestException
from app.models.booking import Booking
from app.models.cafe_payout import CafePayout, CafePayoutStatus
from app.models.cafe_payout_item import CafePayoutItem
from app.models.payment import Payment, PaymentStatus
from app.models.platform_fee import PlatformFee
from app.repositories.base import BaseRepository


class CafePayoutRepository(BaseRepository[CafePayout]):
    def __init__(self, db: AsyncSession):
        super().__init__(CafePayout, db)

    def _outstanding_base_query(self, cafe_id: UUID):
        already_paid = exists().where(CafePayoutItem.platform_fee_id == PlatformFee.id)
        return (
            select(PlatformFee, Booking)
            .join(Booking, Booking.id == PlatformFee.booking_id)
            .join(Payment, Payment.booking_id == Booking.id)
            .where(
                Booking.cafe_id == cafe_id,
                Payment.status == PaymentStatus.CAPTURED,
                not_(already_paid),
            )
        )

    async def get_outstanding_fee_rows(self, cafe_id: UUID) -> list[tuple[PlatformFee, Booking]]:
        result = await self.db.execute(self._outstanding_base_query(cafe_id))
        return list(result.all())

    async def get_outstanding_amount(self, cafe_id: UUID) -> Decimal:
        rows = await self.get_outstanding_fee_rows(cafe_id)
        total = sum((Decimal(str(fee.owner_settlement_amount)) for fee, _ in rows), Decimal("0"))
        return total

    async def create_payout(
        self,
        cafe_id: UUID,
        admin_id: UUID,
        utr_reference: str,
        payment_method: str,
        notes: Optional[str] = None,
    ) -> CafePayout:
        from datetime import datetime, timezone
        import uuid as _uuid

        rows = await self.get_outstanding_fee_rows(cafe_id)
        if not rows:
            raise BadRequestException("This café has no outstanding balance to pay out.")

        total = sum((Decimal(str(fee.owner_settlement_amount)) for fee, _ in rows), Decimal("0"))

        payout = CafePayout(
            id=_uuid.uuid4(),
            cafe_id=cafe_id,
            amount=float(total),
            utr_reference=utr_reference,
            payment_method=payment_method,
            status=CafePayoutStatus.PAID,
            notes=notes,
            created_by_admin_id=admin_id,
            paid_at=datetime.now(timezone.utc),
        )
        self.db.add(payout)
        await self.db.flush()

        for fee, booking in rows:
            self.db.add(CafePayoutItem(
                id=_uuid.uuid4(),
                payout_id=payout.id,
                platform_fee_id=fee.id,
                booking_id=booking.id,
                amount_allocated=fee.owner_settlement_amount,
            ))

        await self.db.commit()
        await self.db.refresh(payout)
        return payout
