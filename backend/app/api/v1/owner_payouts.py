from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.deps import require_cafe_owner
from app.models.user import User
from app.schemas.owner_payout import PayoutAccountCreateRequest
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
