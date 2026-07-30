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
from pydantic import BaseModel, EmailStr, Field
from app.api.deps import require_cafe_owner, require_staff_or_owner
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.core.security import get_password_hash
from app.core.exceptions import BadRequestException

class StaffCreateRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=255)
    password: str = Field(..., min_length=6)
    phone_number: Optional[str] = None

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
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    cafe_repo = CafeRepository(db)
    service = OwnerService(booking_repo, cafe_repo)
    result = await service.get_owner_bookings(
        owner_id=current_user.id,
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
    current_user: User = Depends(require_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    cafe_repo = CafeRepository(db)
    service = OwnerService(booking_repo, cafe_repo)
    result = await service.update_booking_status(
        booking_id=booking_id,
        owner_id=current_user.id,
        new_status=payload.status
    )
    return {
        "success": True,
        "data": {
            "booking": result
        }
    }

@router.post("/bookings/{booking_id}/checkin", status_code=status.HTTP_200_OK)
async def checkin_booking(
    booking_id: UUID,
    current_user: User = Depends(require_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    cafe_repo = CafeRepository(db)
    service = OwnerService(booking_repo, cafe_repo)
    result = await service.checkin_booking(
        booking_id=booking_id,
        owner_id=current_user.id
    )
    return {
        "success": True,
        "data": {
            "booking": result
        }
    }

@router.post("/cafes/{cafe_id}/emergency-close", status_code=status.HTTP_200_OK)
async def emergency_close_cafe(
    cafe_id: UUID,
    close_date: date = Query(..., alias="date"),
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    cafe_repo = CafeRepository(db)
    service = OwnerService(booking_repo, cafe_repo)
    cancelled_bookings = await service.emergency_close_day(
        owner_id=current_owner.id,
        cafe_id=cafe_id,
        closure_date=close_date
    )
    return {
        "success": True,
        "data": {
            "cancelledBookings": cancelled_bookings
        }
    }

# --- STAFF MANAGEMENT ---
@router.post("/staff", status_code=status.HTTP_201_CREATED)
async def create_staff_user(
    payload: StaffCreateRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    user_repo = UserRepository(db)
    existing = await user_repo.get_by_email(payload.email)
    if existing:
        raise BadRequestException("A user with this email address already exists.")

    staff_user = await user_repo.create({
        "email": payload.email,
        "password_hash": get_password_hash(payload.password),
        "full_name": payload.full_name,
        "phone_number": payload.phone_number,
        "role": UserRole.STAFF,
        "is_active": True,
    })
    return {
        "success": True,
        "data": {
            "staff": staff_user
        }
    }

@router.get("/staff", status_code=status.HTTP_200_OK)
async def list_staff_users(
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    user_repo = UserRepository(db)
    staff_members, _ = await user_repo.get_all_admin(role="staff", limit=50)
    return {
        "success": True,
        "data": {
            "staff": staff_members
        }
    }
