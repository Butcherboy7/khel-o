import logging
from typing import Literal, Optional
from uuid import UUID
from datetime import datetime
import uuid as _uuid

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.exceptions import BadRequestException, ConflictException, NotFoundException
from app.database import get_db
from app.models.user import User
from app.models.admin_audit_log import AdminAuditLog
from app.models.owner_payout_account import OwnerPayoutAccount
from app.api.v1.owner import PhotoPresignRequest
from app.repositories.cafe_payout_repository import CafePayoutRepository
from app.repositories.cafe_repository import CafeRepository

router = APIRouter()
logger = logging.getLogger(__name__)


class CafePayoutCreateRequest(BaseModel):
    utrReference: str
    paymentMethod: str
    destinationType: Literal["upi", "bank"]
    expectedPayoutAccountVersion: int
    confirmedPaymentMade: Literal[True]
    notes: Optional[str] = None
    proofImageUrl: Optional[str] = None
    adminNote: Optional[str] = None
    paidAt: Optional[datetime] = None


class CafePayoutHoldRequest(BaseModel):
    onHold: bool
    reason: Optional[str] = None


class MarkPayoutPaidRequest(BaseModel):
    utrReference: str
    paymentMethod: str
    proofImageUrl: Optional[str] = None
    adminNote: Optional[str] = None


@router.get("/outstanding", status_code=status.HTTP_200_OK)
async def list_outstanding_cafe_payouts(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = CafePayoutRepository(db)
    cafes = await repo.list_cafes_with_outstanding()
    return {"success": True, "data": {"cafes": cafes}}


@router.get("/{cafe_id}/breakdown", status_code=status.HTTP_200_OK)
async def get_cafe_payout_breakdown(
    cafe_id: UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = CafePayoutRepository(db)
    bookings = await repo.get_outstanding_breakdown(cafe_id)
    destination = await repo.get_payout_destination_summary(cafe_id)
    return {"success": True, "data": {"bookings": bookings, "destination": destination}}


@router.post("/{cafe_id}/reveal-destination", status_code=status.HTTP_200_OK)
async def reveal_cafe_payout_destination(
    cafe_id: UUID,
    response: Response,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Decrypts the owner's bank account number just for this response, for
    the admin to actually type into their banking app during a manual
    transfer. Masked display everywhere else is unchanged — this is the
    one explicit, audited, non-cacheable exception. The decrypted value
    must never be logged."""
    cafe = await CafeRepository(db).get_by_id(cafe_id)
    if not cafe:
        raise NotFoundException("Café not found")

    account = (await db.execute(
        select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == cafe.owner_id)
    )).scalars().first()
    if not account:
        raise NotFoundException("This café has no payout details on file")

    from app.core.payout_encryption import decrypt_bank_account_number
    bank_account_number = None
    if account.bank_account_number_encrypted:
        try:
            bank_account_number = decrypt_bank_account_number(account.bank_account_number_encrypted)
        except Exception:
            logger.error(
                "Failed to decrypt bank account number for payout account %s",
                account.id,
                exc_info=True,
            )
            raise BadRequestException(
                "Could not decrypt this café's bank account details. Contact engineering "
                "before attempting a bank payout for this café."
            )

    db.add(AdminAuditLog(
        id=_uuid.uuid4(),
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="payout_destination.revealed",
        entity_type="owner_payout_account",
        entity_id=str(account.id),
        entity_name=cafe.name,
        reason=None,
    ))
    await db.commit()

    response.headers["Cache-Control"] = "no-store"
    return {
        "success": True,
        "data": {
            "upiVpa": account.upi_vpa,
            "bankAccountNumber": bank_account_number,
            "bankIfsc": account.bank_ifsc,
            "accountHolderName": account.account_holder_name,
            "payoutAccountId": str(account.id),
            "payoutAccountVersion": account.version,
        },
    }


@router.post("/{cafe_id}/proof-upload-url", status_code=status.HTTP_200_OK)
async def presign_payout_proof_upload(
    cafe_id: UUID,
    payload: PhotoPresignRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    cafe = await CafeRepository(db).get_by_id(cafe_id)
    if not cafe:
        raise NotFoundException("Café not found")
    from app.services.storage_service import create_presigned_upload
    result = create_presigned_upload(cafe.id, payload.content_type)
    return {"success": True, "data": result}


@router.patch("/{cafe_id}/hold", status_code=status.HTTP_200_OK)
async def set_cafe_payout_hold(
    cafe_id: UUID,
    payload: CafePayoutHoldRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    cafe = await CafeRepository(db).get_by_id(cafe_id)
    if not cafe:
        raise NotFoundException("Café not found")

    cafe.payout_on_hold = payload.onHold
    cafe.payout_hold_reason = payload.reason if payload.onHold else None

    db.add(AdminAuditLog(
        id=_uuid.uuid4(),
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="cafe_payout.hold" if payload.onHold else "cafe_payout.release_hold",
        entity_type="cafe",
        entity_id=str(cafe_id),
        entity_name=cafe.name,
        reason=payload.reason,
    ))

    await db.commit()
    await db.refresh(cafe)

    return {
        "success": True,
        "data": {
            "cafeId": str(cafe.id),
            "payoutOnHold": cafe.payout_on_hold,
            "payoutHoldReason": cafe.payout_hold_reason,
        },
    }


@router.post("/{cafe_id}", status_code=status.HTTP_201_CREATED)
async def create_cafe_payout(
    cafe_id: UUID,
    payload: CafePayoutCreateRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    cafe = await CafeRepository(db).get_by_id(cafe_id)

    repo = CafePayoutRepository(db)
    try:
        # The audit log entry is built and committed inside create_payout,
        # atomically with the CafePayout/CafePayoutItem rows: either all of
        # it persists, or none of it does (mirrors AdminService.write_audit_log's
        # field shape since AdminService's constructor mandates repositories
        # — user_repo, cafe_repo, booking_repo, promo_repo — irrelevant here).
        payout = await repo.create_payout(
            cafe_id=cafe_id,
            admin_id=current_admin.id,
            utr_reference=payload.utrReference,
            payment_method=payload.paymentMethod,
            destination_type=payload.destinationType,
            expected_payout_account_version=payload.expectedPayoutAccountVersion,
            notes=payload.notes,
            proof_image_url=payload.proofImageUrl,
            admin_note=payload.adminNote,
            paid_at=payload.paidAt,
            audit_log_data={
                "admin_id": current_admin.id,
                "admin_email": current_admin.email,
                "action": "cafe_payout.create",
                "entity_type": "cafe_payout",
                "entity_name": cafe.name if cafe else None,
                "reason": payload.notes,
            },
        )
    except IntegrityError:
        # Two concurrent requests racing to pay out the same café: the loser
        # hits the platform_fee_id unique constraint. The money stays safe
        # (constraint already prevented double-pay) — surface a clean 400
        # instead of an opaque 500, and roll back so the session isn't left
        # in an aborted state.
        await db.rollback()
        raise BadRequestException("This café's balance was just paid out by another request.")

    return {
        "success": True,
        "data": {
            "payout": {
                "id": str(payout.id),
                "cafeId": str(payout.cafe_id),
                "amount": float(payout.amount),
                "utrReference": payout.utr_reference,
                "paymentMethod": payout.payment_method,
                "status": payout.status.value,
                "proofImageUrl": payout.proof_image_url,
                "adminNote": payout.admin_note,
                "paidAt": payout.paid_at.isoformat() if payout.paid_at else None,
            }
        },
    }


@router.post("/reconcile-settlements", status_code=status.HTTP_200_OK)
async def reconcile_settlements(
    settlementDate: Optional[str] = Query(None, description="YYYY-MM-DD, defaults to today (IST-agnostic UTC date)"),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Polls the Razorpay settlement recon API for one date and marks any
    matching PlatformFee rows settled. This is the daily reconciliation
    fallback for when the settlement.processed webhook is missed — intended
    to be called once a day by an external scheduler (cron/GH Actions). Safe
    to call repeatedly for the same date; already-settled rows are no-ops."""
    from app.services.settlement_service import SettlementService
    from datetime import date as _date, datetime as _datetime, timezone as _timezone

    target = _date.fromisoformat(settlementDate) if settlementDate else _datetime.now(_timezone.utc).date()
    result = await SettlementService(db).reconcile_date(target)
    return {"success": True, "data": result}


@router.post("/run-weekly", status_code=status.HTTP_200_OK)
async def run_weekly_payout_allocation(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Creates a PENDING CafePayout batch (with items) per café that has a
    settled, unallocated balance. Does not move money — an admin still
    records the actual bank transfer via mark-paid. Intended to be called
    once a week by an external scheduler; safe to re-run (see
    CafePayoutRepository.run_weekly_allocation)."""
    repo = CafePayoutRepository(db)
    results = await repo.run_weekly_allocation(admin_id=current_admin.id)
    return {"success": True, "data": {"cafes": results}}


@router.patch("/payouts/{payout_id}/mark-paid", status_code=status.HTTP_200_OK)
async def mark_cafe_payout_paid(
    payout_id: UUID,
    payload: MarkPayoutPaidRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = CafePayoutRepository(db)
    payout = await repo.mark_paid(
        payout_id=payout_id,
        utr_reference=payload.utrReference,
        payment_method=payload.paymentMethod,
        proof_image_url=payload.proofImageUrl,
        admin_note=payload.adminNote,
    )
    db.add(AdminAuditLog(
        id=_uuid.uuid4(),
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="cafe_payout.mark_paid",
        entity_type="cafe_payout",
        entity_id=str(payout.id),
        reason=payload.adminNote,
    ))
    await db.commit()

    return {
        "success": True,
        "data": {
            "payout": {
                "id": str(payout.id),
                "status": payout.status.value,
                "utrReference": payout.utr_reference,
                "paidAt": payout.paid_at.isoformat() if payout.paid_at else None,
            }
        },
    }


@router.get("", status_code=status.HTTP_200_OK)
async def list_cafe_payouts(
    cafeId: Optional[UUID] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = CafePayoutRepository(db)
    result = await repo.list_payouts(cafe_id=cafeId, status=status_filter, page=page, limit=limit)
    return {"success": True, "data": result}
