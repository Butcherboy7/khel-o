from fastapi import APIRouter, Depends, status, Query
from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.booking import BookingCreateRequest, BookingCancelRequest
from app.repositories.booking_repository import BookingRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.services.booking_service import BookingService
from app.api.deps import require_gamer, get_current_active_user
from app.models.user import User

router = APIRouter()

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_booking(
    payload: BookingCreateRequest,
    current_gamer: User = Depends(require_gamer),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    cafe_repo = CafeRepository(db)
    tier_repo = HardwareTierRepository(db)
    service = BookingService(booking_repo, cafe_repo, tier_repo)
    result = await service.create_booking(current_gamer.id, payload)
    return {
        "success": True,
        "data": {
            "booking": result
        }
    }

@router.get("", status_code=status.HTTP_200_OK)
async def list_my_bookings(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    service = BookingService(booking_repo)
    result = await service.list_gamer_bookings(current_user.id, page=page, limit=limit)
    return {
        "success": True,
        "data": result
    }

@router.get("/{booking_id}", status_code=status.HTTP_200_OK)
async def get_booking(
    booking_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    cafe_repo = CafeRepository(db)
    service = BookingService(booking_repo, cafe_repo)
    result = await service.get_booking(booking_id, current_user=current_user)
    return {
        "success": True,
        "data": {
            "booking": result
        }
    }

@router.post("/{booking_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_booking(
    booking_id: UUID,
    payload: Optional[BookingCancelRequest] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    service = BookingService(booking_repo)
    reason = payload.reason if payload else None
    result = await service.cancel_booking(booking_id, current_user=current_user, reason=reason)
    return {
        "success": True,
        "data": {
            "booking": result
        }
    }
