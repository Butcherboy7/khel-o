from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Union
from uuid import UUID

from sqlalchemy import select, func, not_, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestException
from app.models.admin_audit_log import AdminAuditLog
from app.models.booking import Booking
from app.models.cafe import Cafe
from app.models.cafe_payout import CafePayout, CafePayoutStatus
from app.models.cafe_payout_item import CafePayoutItem
from app.models.owner_payout_account import OwnerPayoutAccount
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
                # A booking already auto-settled to the café via Razorpay Route
                # must never also show as an outstanding manual-payout balance
                # (Route is currently disabled, so this is a no-op today, but
                # keeps the admin and owner "pending settlement" views agreeing
                # once Route is re-enabled).
                PlatformFee.transfer_status != "transferred",
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
        audit_log_data: Optional[dict] = None,
        proof_image_url: Optional[str] = None,
        admin_note: Optional[str] = None,
        paid_at: Optional[datetime] = None,
    ) -> CafePayout:
        """Create a CafePayout + its CafePayoutItem rows in a single transaction.

        When `audit_log_data` is provided, the AdminAuditLog entry for this
        payout is added to the same session and committed atomically with the
        payout/items — either all three persist, or none do. Callers that
        don't need an audit trail (e.g. existing repository-level tests) can
        omit it and behavior is unchanged.

        Expected `audit_log_data` keys: admin_id, admin_email, and optionally
        action, entity_type, entity_name, reason.
        """
        import uuid as _uuid

        cafe_owner_row = (await self.db.execute(
            select(Cafe.owner_id).where(Cafe.id == cafe_id)
        )).first()
        if not cafe_owner_row:
            raise BadRequestException("Café not found.")
        owner_id = cafe_owner_row[0]

        verification_status = (await self.db.execute(
            select(OwnerPayoutAccount.payout_verification_status).where(OwnerPayoutAccount.owner_id == owner_id)
        )).scalar()
        if verification_status != "verified":
            raise BadRequestException(
                "This café's payout destination hasn't been verified yet. "
                "Send a ₹1 test transfer and record the result before paying out."
            )

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
            proof_image_url=proof_image_url,
            admin_note=admin_note,
            created_by_admin_id=admin_id,
            paid_at=paid_at or datetime.now(timezone.utc),
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

        if audit_log_data is not None:
            self.db.add(AdminAuditLog(
                id=_uuid.uuid4(),
                admin_id=audit_log_data["admin_id"],
                admin_email=audit_log_data["admin_email"],
                action=audit_log_data.get("action", "cafe_payout.create"),
                entity_type=audit_log_data.get("entity_type", "cafe_payout"),
                entity_id=str(payout.id),
                entity_name=audit_log_data.get("entity_name"),
                reason=audit_log_data.get("reason"),
            ))

        await self.db.commit()
        await self.db.refresh(payout)
        return payout

    async def get_outstanding_breakdown(self, cafe_id: UUID) -> list[dict]:
        rows = await self.get_outstanding_fee_rows(cafe_id)
        return [
            {
                "bookingId": str(booking.id),
                "bookingReference": booking.booking_reference,
                "sessionDate": str(booking.session_date),
                "grossAmount": float(booking.total_amount),
                "ownerSettlementAmount": float(fee.owner_settlement_amount),
            }
            for fee, booking in rows
        ]

    async def list_cafes_with_outstanding(self) -> list[dict]:
        cafes_result = await self.db.execute(select(Cafe.id, Cafe.name, Cafe.owner_id))
        out = []
        for cafe_id, cafe_name, owner_id in cafes_result.all():
            amount = await self.get_outstanding_amount(cafe_id)
            if amount > 0:
                verification_status = (await self.db.execute(
                    select(OwnerPayoutAccount.payout_verification_status).where(OwnerPayoutAccount.owner_id == owner_id)
                )).scalar() or "unverified"
                out.append({
                    "cafeId": str(cafe_id),
                    "cafeName": cafe_name,
                    "outstandingAmount": float(amount),
                    "payoutVerificationStatus": verification_status,
                })
        return out

    async def list_payouts(
        self,
        cafe_id: Optional[Union[UUID, list[UUID]]] = None,
        status: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict:
        limit = min(limit, 50)
        stmt = select(CafePayout)
        if cafe_id is not None:
            if isinstance(cafe_id, (list, tuple, set)):
                stmt = stmt.where(CafePayout.cafe_id.in_(cafe_id))
            else:
                stmt = stmt.where(CafePayout.cafe_id == cafe_id)
        if status:
            stmt = stmt.where(CafePayout.status == status)
        stmt = stmt.order_by(CafePayout.created_at.desc())

        total = (await self.db.execute(
            select(func.count()).select_from(stmt.subquery())
        )).scalar() or 0

        offset = (page - 1) * limit
        rows = (await self.db.execute(stmt.offset(offset).limit(limit))).scalars().all()

        items = [
            {
                "id": str(p.id),
                "cafeId": str(p.cafe_id),
                "amount": float(p.amount),
                "utrReference": p.utr_reference,
                "paymentMethod": p.payment_method,
                "status": p.status.value if hasattr(p.status, "value") else str(p.status),
                "notes": p.notes,
                "proofImageUrl": p.proof_image_url,
                "adminNote": p.admin_note,
                "paidAt": p.paid_at.isoformat() if p.paid_at else None,
                "createdAt": p.created_at.isoformat(),
            }
            for p in rows
        ]
        return {"items": items, "total": total, "page": page, "pageSize": limit}
