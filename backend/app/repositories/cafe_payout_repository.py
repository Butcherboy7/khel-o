from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Union
from uuid import UUID

from sqlalchemy import select, func, not_, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestException, ConflictException
from app.models.admin_audit_log import AdminAuditLog
from app.models.booking import Booking
from app.models.cafe import Cafe
from app.models.cafe_payout import CafePayout, CafePayoutStatus, PayoutDestinationType
from app.models.cafe_payout_adjustment import CafePayoutAdjustment
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
                PlatformFee.settlement_status == "settled",
                PlatformFee.excluded_reason.is_(None),
                not_(already_paid),
            )
        )

    def _pending_settlement_base_query(self, cafe_id: UUID):
        already_paid = exists().where(CafePayoutItem.platform_fee_id == PlatformFee.id)
        return (
            select(PlatformFee)
            .join(Booking, Booking.id == PlatformFee.booking_id)
            .join(Payment, Payment.booking_id == Booking.id)
            .where(
                Booking.cafe_id == cafe_id,
                Payment.status == PaymentStatus.CAPTURED,
                PlatformFee.transfer_status != "transferred",
                PlatformFee.settlement_status == "pending_settlement",
                PlatformFee.excluded_reason.is_(None),
                not_(already_paid),
            )
        )

    async def get_pending_settlement_amount(self, cafe_id: UUID) -> Decimal:
        rows = (await self.db.execute(self._pending_settlement_base_query(cafe_id))).scalars().all()
        return sum((Decimal(str(fee.owner_settlement_amount)) for fee in rows), Decimal("0"))

    async def list_cafe_ids_with_settled_balance(self) -> list[UUID]:
        """Café ids with at least one settled, unallocated fee — used by the
        weekly payout job to know which cafés to process, without doing a
        per-café Razorpay call (settlement data is already local by then)."""
        result = await self.db.execute(
            select(Booking.cafe_id)
            .join(PlatformFee, PlatformFee.booking_id == Booking.id)
            .join(Payment, Payment.booking_id == Booking.id)
            .where(
                Payment.status == PaymentStatus.CAPTURED,
                PlatformFee.transfer_status != "transferred",
                PlatformFee.settlement_status == "settled",
                PlatformFee.excluded_reason.is_(None),
                not_(exists().where(CafePayoutItem.platform_fee_id == PlatformFee.id)),
            )
            .distinct()
        )
        return [row[0] for row in result.all()]

    async def get_outstanding_fee_rows(self, cafe_id: UUID) -> list[tuple[PlatformFee, Booking]]:
        result = await self.db.execute(self._outstanding_base_query(cafe_id))
        return list(result.all())

    async def get_outstanding_amount(self, cafe_id: UUID) -> Decimal:
        rows = await self.get_outstanding_fee_rows(cafe_id)
        total = sum((Decimal(str(fee.owner_settlement_amount)) for fee, _ in rows), Decimal("0"))
        adjustments = (await self.db.execute(
            select(func.coalesce(func.sum(CafePayoutAdjustment.amount), 0)).where(
                CafePayoutAdjustment.cafe_id == cafe_id,
                CafePayoutAdjustment.payout_id.is_(None),
            )
        )).scalar()
        return total + Decimal(str(adjustments))

    async def get_outstanding_amount_for_owner_cafes(self, cafe_ids: list[UUID]) -> Decimal:
        total = Decimal("0")
        for cafe_id in cafe_ids:
            total += await self.get_outstanding_amount(cafe_id)
        return total

    async def get_unconsumed_adjustments(self, cafe_id: UUID) -> list[CafePayoutAdjustment]:
        result = await self.db.execute(
            select(CafePayoutAdjustment).where(
                CafePayoutAdjustment.cafe_id == cafe_id,
                CafePayoutAdjustment.payout_id.is_(None),
            )
        )
        return list(result.scalars().all())

    async def create_payout(
        self,
        cafe_id: UUID,
        admin_id: UUID,
        utr_reference: Optional[str] = None,
        payment_method: Optional[str] = None,
        notes: Optional[str] = None,
        audit_log_data: Optional[dict] = None,
        proof_image_url: Optional[str] = None,
        admin_note: Optional[str] = None,
        paid_at: Optional[datetime] = None,
        destination_type: Optional[str] = None,
        expected_payout_account_version: Optional[int] = None,
        status: CafePayoutStatus = CafePayoutStatus.PAID,
    ) -> CafePayout:
        """Create a CafePayout + its CafePayoutItem rows in a single transaction.

        `destination_type` ("upi" or "bank") records the method actually
        used for THIS payout — not the owner's stored preference, since an
        OwnerPayoutAccount may hold both. If not given (internal/legacy
        callers), it's inferred: "upi" if the account has a UPI, else
        "bank". The real admin-facing API always supplies it explicitly.

        `expected_payout_account_version`, when given, must match the live
        OwnerPayoutAccount.version or a ConflictException (409,
        PAYOUT_DESTINATION_STALE) is raised before any write — this is the
        safeguard against an admin paying out a destination that changed
        after they opened the payable but before they submitted. When not
        given, the check is skipped (used by internal/legacy callers that
        don't have a "version the admin last saw" to compare against).

        When `audit_log_data` is provided, the AdminAuditLog entry for this
        payout is added to the same session and committed atomically with the
        payout/items — either all three persist, or none do. Callers that
        don't need an audit trail (e.g. existing repository-level tests) can
        omit it and behavior is unchanged.

        Expected `audit_log_data` keys: admin_id, admin_email, and optionally
        action, entity_type, entity_name, reason.
        """
        import uuid as _uuid

        cafe_row = (await self.db.execute(
            select(Cafe.owner_id, Cafe.payout_on_hold, Cafe.payout_hold_reason).where(Cafe.id == cafe_id)
        )).first()
        if not cafe_row:
            raise BadRequestException("Café not found.")
        owner_id, on_hold, hold_reason = cafe_row

        if on_hold:
            raise BadRequestException(
                f"Payouts to this café are on hold: {hold_reason or 'no reason given'}."
            )

        payout_account = (await self.db.execute(
            select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == owner_id)
        )).scalars().first()
        has_upi = bool(payout_account and payout_account.upi_vpa)
        has_bank = bool(
            payout_account
            and payout_account.bank_account_number_encrypted
            and payout_account.bank_ifsc
            and payout_account.account_holder_name
        )
        if not (has_upi or has_bank):
            raise BadRequestException(
                "This café hasn't added payout details yet — ask the owner to add a UPI ID "
                "or bank account in Owner Settings before paying out."
            )

        if expected_payout_account_version is not None and payout_account.version != expected_payout_account_version:
            raise ConflictException(
                "Payout details changed since you opened this payable. Please refresh and "
                "confirm the new destination before recording this payout.",
                error_code="PAYOUT_DESTINATION_STALE",
            )

        resolved_destination_type = destination_type or ("upi" if has_upi else "bank")

        if resolved_destination_type == "upi" and not has_upi:
            raise BadRequestException(
                "This café doesn't have a UPI ID on file — choose a different destination."
            )
        if resolved_destination_type == "bank" and not has_bank:
            raise BadRequestException(
                "This café doesn't have complete bank account details on file — choose a "
                "different destination."
            )

        rows = await self.get_outstanding_fee_rows(cafe_id)
        adjustments = await self.get_unconsumed_adjustments(cafe_id)
        if not rows and not adjustments:
            raise BadRequestException("This café has no outstanding balance to pay out.")

        fee_sum = sum((Decimal(str(fee.owner_settlement_amount)) for fee, _ in rows), Decimal("0"))
        adjustment_sum = sum((Decimal(str(a.amount)) for a in adjustments), Decimal("0"))
        total = fee_sum + adjustment_sum
        if total <= 0:
            raise BadRequestException("This café has no outstanding balance to pay out.")

        payout = CafePayout(
            id=_uuid.uuid4(),
            cafe_id=cafe_id,
            amount=float(total),
            utr_reference=utr_reference,
            payment_method=payment_method,
            status=status,
            notes=notes,
            proof_image_url=proof_image_url,
            admin_note=admin_note,
            created_by_admin_id=admin_id,
            paid_at=(paid_at or datetime.now(timezone.utc)) if status == CafePayoutStatus.PAID else None,
            destination_type=PayoutDestinationType(resolved_destination_type),
            destination_upi_vpa=payout_account.upi_vpa,
            destination_bank_account_masked=payout_account.bank_account_number_masked,
            destination_bank_ifsc=payout_account.bank_ifsc,
            destination_account_holder_name=payout_account.account_holder_name,
            destination_payout_account_id=payout_account.id,
            destination_payout_account_version=payout_account.version,
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

        for adjustment in adjustments:
            adjustment.payout_id = payout.id

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

    async def run_weekly_allocation(self, admin_id: UUID) -> list[dict]:
        """Create a PENDING CafePayout batch per café with a settled,
        unallocated balance. Safe to re-run: a café already fully allocated
        (no settled+unpaid PlatformFee left) is simply skipped, and the
        per-booking CafePayoutItem.platform_fee_id unique constraint makes
        double-allocating any individual fee impossible even under a race.
        """
        results = []
        cafe_ids = await self.list_cafe_ids_with_settled_balance()
        for cafe_id in cafe_ids:
            try:
                payout = await self.create_payout(
                    cafe_id=cafe_id,
                    admin_id=admin_id,
                    status=CafePayoutStatus.PENDING,
                    audit_log_data={
                        "admin_id": admin_id,
                        "admin_email": "system@weekly-allocation",
                        "action": "cafe_payout.weekly_allocation",
                    },
                )
                results.append({"cafeId": str(cafe_id), "payoutId": str(payout.id), "amount": float(payout.amount)})
            except BadRequestException as exc:
                # No payout destination on file, or on hold — skip this café
                # this cycle; its balance simply stays unallocated and is
                # retried on the next weekly run.
                await self.db.rollback()
                results.append({"cafeId": str(cafe_id), "skipped": str(exc)})
        return results

    async def mark_paid(
        self,
        payout_id: UUID,
        utr_reference: str,
        payment_method: str,
        proof_image_url: Optional[str] = None,
        admin_note: Optional[str] = None,
    ) -> CafePayout:
        payout = await self.get_by_id(payout_id)
        if not payout:
            raise BadRequestException("Payout not found.")
        if payout.status == CafePayoutStatus.PAID:
            raise BadRequestException("This payout has already been marked as paid.")
        payout.status = CafePayoutStatus.PAID
        payout.utr_reference = utr_reference
        payout.payment_method = payment_method
        payout.paid_at = datetime.now(timezone.utc)
        if proof_image_url is not None:
            payout.proof_image_url = proof_image_url
        if admin_note is not None:
            payout.admin_note = admin_note
        await self.db.commit()
        await self.db.refresh(payout)
        return payout

    async def get_outstanding_breakdown(self, cafe_id: UUID) -> list[dict]:
        rows = await self.get_outstanding_fee_rows(cafe_id)
        adjustments = await self.get_unconsumed_adjustments(cafe_id)
        breakdown = [
            {
                "type": "booking",
                "bookingId": str(booking.id),
                "bookingReference": booking.booking_reference,
                "sessionDate": str(booking.session_date),
                "grossAmount": float(booking.total_amount),
                "ownerSettlementAmount": float(fee.owner_settlement_amount),
            }
            for fee, booking in rows
        ]
        breakdown.extend(
            {
                "type": "adjustment",
                "adjustmentId": str(a.id),
                "amount": float(a.amount),
                "reason": a.reason,
                "bookingId": str(a.booking_id),
                "createdAt": a.created_at.isoformat(),
            }
            for a in adjustments
        )
        return breakdown

    async def get_payout_destination_summary(self, cafe_id: UUID) -> Optional[dict]:
        cafe_row = (await self.db.execute(select(Cafe.owner_id).where(Cafe.id == cafe_id))).first()
        if not cafe_row:
            return None
        account = (await self.db.execute(
            select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == cafe_row.owner_id)
        )).scalars().first()
        if not account:
            return None
        return {
            "upiVpa": account.upi_vpa,
            "bankAccountNumberMasked": account.bank_account_number_masked,
            "bankIfsc": account.bank_ifsc,
            "accountHolderName": account.account_holder_name,
            "payoutAccountId": str(account.id),
            "payoutAccountVersion": account.version,
            "updatedAt": account.updated_at.isoformat(),
        }

    async def list_cafes_with_outstanding(self) -> list[dict]:
        """Cafés with money either pending settlement or available to pay
        out — i.e. anything an admin would want visibility into, even
        before it's actually payable."""
        cafes_result = await self.db.execute(select(Cafe.id, Cafe.name, Cafe.owner_id, Cafe.payout_on_hold, Cafe.payout_hold_reason))
        out = []
        for cafe_id, cafe_name, owner_id, on_hold, hold_reason in cafes_result.all():
            amount = await self.get_outstanding_amount(cafe_id)
            pending_settlement = await self.get_pending_settlement_amount(cafe_id)
            if amount > 0 or pending_settlement > 0:
                account = (await self.db.execute(
                    select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == owner_id)
                )).scalars().first()
                has_bank = bool(
                    account
                    and account.bank_account_number_encrypted
                    and account.bank_ifsc
                    and account.account_holder_name
                )
                destination_submitted = bool(account and (account.upi_vpa or has_bank))
                out.append({
                    "cafeId": str(cafe_id),
                    "cafeName": cafe_name,
                    "outstandingAmount": float(amount),
                    "pendingSettlementAmount": float(pending_settlement),
                    "payoutDestinationSubmitted": destination_submitted,
                    "upiVpa": account.upi_vpa if account else None,
                    "hasBank": has_bank,
                    "payoutOnHold": on_hold,
                    "payoutHoldReason": hold_reason,
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
