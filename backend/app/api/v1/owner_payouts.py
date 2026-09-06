from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.deps import require_cafe_owner
from app.models.cafe import Cafe
from app.models.user import User
from app.schemas.owner_payout import PayoutAccountCreateRequest
from app.repositories.cafe_payout_repository import CafePayoutRepository
from app.repositories.owner_payout_repository import OwnerPayoutRepository
from app.services.owner_payout_service import OwnerPayoutService

router = APIRouter()

@router.get("/status", status_code=status.HTTP_200_OK)
async def get_payout_status(
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    repo = OwnerPayoutRepository(db)
    service = OwnerPayoutService(repo)
    result = await service.get_payout_status(owner_id=current_owner.id)
    return {
        "success": True,
        "data": {
            "payoutAccount": result
        }
    }

@router.get("/cafe-payouts", status_code=status.HTTP_200_OK)
async def get_owner_cafe_payouts(
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db),
):
    cafe_stmt = (
        select(Cafe)
        .where(Cafe.owner_id == current_owner.id)
        .order_by(Cafe.created_at.desc())
    )
    cafe = (await db.execute(cafe_stmt)).scalars().first()

    if not cafe:
        return {"success": True, "data": {"outstandingAmount": 0.0, "history": []}}

    repo = CafePayoutRepository(db)
    outstanding = await repo.get_outstanding_amount(cafe.id)
    history = await repo.list_payouts(cafe_id=cafe.id)

    return {
        "success": True,
        "data": {
            "outstandingAmount": float(outstanding),
            "history": history["items"],
        },
    }

@router.post("/setup", status_code=status.HTTP_200_OK)
async def setup_payout(
    payload: PayoutAccountCreateRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    repo = OwnerPayoutRepository(db)
    service = OwnerPayoutService(repo)
    result = await service.submit_payout_details(
        owner_id=current_owner.id,
        payload=payload,
        owner_email=current_owner.email
    )
    return {
        "success": True,
        "data": {
            "payoutAccount": result
        }
    }
