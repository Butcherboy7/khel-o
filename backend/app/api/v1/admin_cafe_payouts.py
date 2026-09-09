from typing import Optional
from uuid import UUID
from datetime import datetime, timezone
import uuid as _uuid

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.exceptions import BadRequestException, NotFoundException
from app.database import get_db
from app.models.user import User
from app.models.admin_audit_log import AdminAuditLog
from app.repositories.cafe_payout_repository import CafePayoutRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.owner_payout_repository import OwnerPayoutRepository

router = APIRouter()


class CafePayoutCreateRequest(BaseModel):
    utrReference: str
    paymentMethod: str
    notes: Optional[str] = None


class PayoutVerifyRequest(BaseModel):
    utrReference: str
    verifiedName: str


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
    return {"success": True, "data": {"bookings": bookings}}


@router.post("/{cafe_id}/verify-payout", status_code=status.HTTP_200_OK)
async def verify_cafe_payout_destination(
    cafe_id: UUID,
    payload: PayoutVerifyRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Records the ₹1 test transfer's outcome. The admin's UPI app shows the
    recipient's registered name before the transfer is confirmed — recording
    that name here is the actual verification; there is no third-party
    validation call. Flips the destination to "verified", which is what
    CafePayoutRepository.create_payout checks before allowing a real payout."""
    cafe = await CafeRepository(db).get_by_id(cafe_id)
    if not cafe:
        raise NotFoundException("Café not found")

    payout_repo = OwnerPayoutRepository(db)
    account = await payout_repo.get_by_owner_id(cafe.owner_id)
    if not account or not account.upi_vpa:
        raise BadRequestException("This café hasn't submitted payout details yet.")
    if account.payout_verification_status == "verified":
        raise BadRequestException("This café's payout destination is already verified.")

    account.payout_verification_status = "verified"
    account.verified_name = payload.verifiedName
    account.verified_at = datetime.now(timezone.utc)
    account.verified_by_admin_id = current_admin.id
    account.test_transfer_ref = payload.utrReference

    db.add(AdminAuditLog(
        id=_uuid.uuid4(),
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="payout_verified",
        entity_type="owner_payout_account",
        entity_id=str(account.id),
        entity_name=cafe.name,
        reason=f"Test transfer {payload.utrReference} confirmed recipient name: {payload.verifiedName}",
    ))

    await db.commit()
    await db.refresh(account)

    return {
        "success": True,
        "data": {
            "payoutVerificationStatus": account.payout_verification_status,
            "verifiedName": account.verified_name,
            "verifiedAt": account.verified_at.isoformat(),
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
            notes=payload.notes,
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
