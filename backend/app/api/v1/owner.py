from fastapi import APIRouter, Depends, status, Query
from typing import Optional
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.owner import (
    OwnerDashboardResponse,
    OwnerStatusUpdateRequest
)
from app.repositories.booking_repository import BookingRepository
from app.repositories.cafe_repository import CafeRepository
from app.services.owner_service import OwnerService
from app.api.deps import require_cafe_owner
from app.models.user import User

router = APIRouter()

@router.get("/dashboard", status_code=status.HTTP_200_OK)
async def get_owner_dashboard(
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    cafe_repo = CafeRepository(db)
    service = OwnerService(booking_repo, cafe_repo)
    result = await service.get_dashboard_stats(owner_id=current_owner.id)
    return {
        "success": True,
        "data": result
    }

@router.get("/bookings", status_code=status.HTTP_200_OK)
async def get_owner_bookings(
    cafeId: Optional[UUID] = Query(None, alias="cafeId"),
    status: Optional[str] = Query(None),
    date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    cafe_repo = CafeRepository(db)
    service = OwnerService(booking_repo, cafe_repo)
    result = await service.get_owner_bookings(
        owner_id=current_owner.id,
        cafe_id=cafeId,
        status_filter=status,
        date_filter=date,
        page=page,
        limit=limit
    )
    return {
        "success": True,
        "data": result
    }

@router.patch("/bookings/{booking_id}/status", status_code=status.HTTP_200_OK)
async def update_booking_status(
    booking_id: UUID,
    payload: OwnerStatusUpdateRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    cafe_repo = CafeRepository(db)
    service = OwnerService(booking_repo, cafe_repo)
    result = await service.update_booking_status(
        booking_id=booking_id,
        owner_id=current_owner.id,
        new_status=payload.status
    )
    return {
        "success": True,
        "data": {
            "booking": result
        }
    }
