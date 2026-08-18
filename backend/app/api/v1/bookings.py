from fastapi import APIRouter, Depends, status, Query
from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.booking import BookingCreateRequest, BookingCancelRequest
from app.repositories.booking_repository import BookingRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.repositories.promotion_repository import PromotionRepository
from app.services.booking_service import BookingService
from app.services.promotion_service import PromotionService
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
    promo_repo = PromotionRepository(db)
    promo_service = PromotionService(promo_repo, cafe_repo, tier_repo)

    service = BookingService(booking_repo, cafe_repo, tier_repo, promo_service=promo_service)
    result = await service.create_booking(current_gamer.id, payload)
    return {
        "success": True,
        "data": {
            "booking": result
        }
    }

@router.get("", status_code=status.HTTP_200_OK)
async def list_my_bookings(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    service = BookingService(booking_repo)
    result = await service.list_gamer_bookings(current_user.id, status_filter=status, page=page, limit=limit)
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
    cafe_repo = CafeRepository(db)
    service = BookingService(booking_repo, cafe_repo)
    reason = payload.reason if payload else None
    result = await service.cancel_booking(booking_id, current_user=current_user, reason=reason)
    return {
        "success": True,
        "data": {
            "booking": result
        }
    }

@router.get("/{booking_id}/qr-pass", status_code=status.HTTP_200_OK)
async def get_booking_qr_pass(
    booking_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    cafe_repo = CafeRepository(db)
    booking = await booking_repo.get_by_id(booking_id)
    if not booking:
        from app.core.exceptions import NotFoundException
        raise NotFoundException(message="Booking not found", error_code="BOOKING_NOT_FOUND")

    role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if str(booking.gamer_id) != str(current_user.id):
        from app.core.exceptions import ForbiddenException
        if role_val == "staff":
            from sqlalchemy import select
            from app.models.user_role import UserRoleMapping
            from app.models.user import UserRole
            stmt = select(UserRoleMapping).where(
                UserRoleMapping.user_id == current_user.id,
                UserRoleMapping.role == UserRole.STAFF,
                UserRoleMapping.cafe_id == booking.cafe_id
            )
            res = await db.execute(stmt)
            if not res.scalars().first():
                raise ForbiddenException(message="Staff members can only access bookings for their assigned café", error_code="FORBIDDEN")
        elif role_val == "cafe_owner":
            cafe = await cafe_repo.get_by_id(booking.cafe_id)
            if not cafe or str(cafe.owner_id) != str(current_user.id):
                raise ForbiddenException(message="You can only access bookings for your own café", error_code="FORBIDDEN")
        elif role_val != "admin":
            raise ForbiddenException(message="Forbidden", error_code="FORBIDDEN")

    from app.models.booking import BookingStatus
    if booking.status not in (BookingStatus.CONFIRMED, BookingStatus.COMPLETED):
        from app.core.exceptions import ForbiddenException
        raise ForbiddenException(message="QR check-in pass is only available after payment confirmation", error_code="PAYMENT_REQUIRED")

    if not booking.qr_code_url:
        from app.background.qr_generator import generate_and_save_qr_code
        qr_url = generate_and_save_qr_code(
            booking_id=str(booking.id),
            booking_reference=booking.booking_reference,
            cafe_id=str(booking.cafe_id)
        )
        booking = await booking_repo.update(booking.id, {"qr_code_url": qr_url})

    return {
        "success": True,
        "data": {
            "bookingId": str(booking.id),
            "bookingReference": booking.booking_reference,
            "qrCodeUrl": booking.qr_code_url
        }
    }
