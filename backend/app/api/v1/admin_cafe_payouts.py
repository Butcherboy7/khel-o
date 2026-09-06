from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.exceptions import BadRequestException
from app.database import get_db
from app.models.user import User
from app.repositories.cafe_payout_repository import CafePayoutRepository
from app.repositories.cafe_repository import CafeRepository

router = APIRouter()


class CafePayoutCreateRequest(BaseModel):
    utrReference: str
    paymentMethod: str
    notes: Optional[str] = None


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
