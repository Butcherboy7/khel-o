from fastapi import APIRouter, Depends, status, Query, Request
from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.schemas.cafe import CafeCreateRequest, CafeUpdateRequest
from app.schemas.hardware_tier import HardwareTierCreateRequest, HardwareTierUpdateRequest
from app.repositories.cafe_repository import CafeRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.repositories.hardware_tier_unit_repository import HardwareTierUnitRepository
from app.repositories.booking_repository import BookingRepository
from app.repositories.promotion_repository import PromotionRepository
from app.repositories.review_repository import ReviewRepository
from app.services.cafe_service import CafeService
from app.services.hardware_tier_service import HardwareTierService
from app.repositories.user_repository import UserRepository
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.hardware_tier import TierType
from app.api.deps import require_cafe_owner, get_optional_user, get_current_active_user
import uuid

limiter = None

router = APIRouter()

@router.get("", status_code=status.HTTP_200_OK)
async def list_cafes(
    city: Optional[str] = Query(None),
    query: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    minPrice: Optional[float] = Query(None, alias="minPrice"),
    maxPrice: Optional[float] = Query(None, alias="maxPrice"),
    amenities: Optional[List[str]] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db)
):
    search_query = query if query is not None else q
    repo = CafeRepository(db)
    review_repo = ReviewRepository(db)
    service = CafeService(repo, review_repo=review_repo)
    result = await service.list_cafes(
        city=city,
        query=search_query,
        min_price=minPrice,
        max_price=maxPrice,
        amenities=amenities,
        page=page,
        limit=limit
    )
    return {
        "success": True,
        "data": result
    }

@router.get("/{cafe_id}", status_code=status.HTTP_200_OK)
async def get_cafe(
    cafe_id: UUID,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db)
):
    cafe_repo = CafeRepository(db)
    tier_repo = HardwareTierRepository(db)
    promo_repo = PromotionRepository(db)
    review_repo = ReviewRepository(db)
    service = CafeService(cafe_repo, tier_repo, promo_repo, review_repo)
    result = await service.get_cafe(cafe_id, current_user=current_user)
    return {
        "success": True,
        "data": {
            "cafe": result
        }
    }

@router.get("/{cafe_id}/availability", status_code=status.HTTP_200_OK)
async def get_cafe_availability(
    request: Request,
    cafe_id: UUID,
    tier_id: UUID = Query(...),
    session_date: str = Query(..., alias="date"),
    db: AsyncSession = Depends(get_db)
):
    from datetime import datetime as dt, timedelta, timezone
    from app.models.booking import Booking, BookingStatus
    from app.core.exceptions import NotFoundException

    tier_repo = HardwareTierRepository(db)
    tier = await tier_repo.get_by_id(tier_id)
    if not tier:
        raise NotFoundException(message="Hardware tier not found", error_code="TIER_NOT_FOUND")

    try:
        parsed_date = dt.strptime(session_date, "%Y-%m-%d").date()
    except ValueError:
        parsed_date = dt.now().date()

    payment_window_cutoff = dt.now(timezone.utc) - timedelta(minutes=15)
    stmt = (
        select(Booking.start_time, Booking.end_time, Booking.seats_count)
        .where(
            Booking.hardware_tier_id == tier_id,
            Booking.session_date == parsed_date,
            Booking.status.in_([BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED]),
        )
    )
    res = await db.execute(stmt)
    booking_rows = res.all()

    booked_slots = []
    for b in booking_rows:
        booked_slots.append({
            "startTime": b.start_time.strftime("%H:%M:%S"),
            "endTime": b.end_time.strftime("%H:%M:%S"),
            "seatsCount": b.seats_count or 1
        })

    app_bookable_seats = tier.app_bookable_seats or tier.total_seats or 10

    # Gaming tiers never get hardware_tier_units rows (units only exist for
    # individual-unit activities), so count_in_maintenance would always
    # return 0 for them — skip the query outright on this hot, per-search
    # path rather than pay for a COUNT that can never matter.
    if tier.tier_type == TierType.ACTIVITY:
        unit_repo = HardwareTierUnitRepository(db)
        maintenance_count = await unit_repo.count_in_maintenance(tier_id)
        app_bookable_seats = max(0, app_bookable_seats - maintenance_count)

    cafe_repo = CafeRepository(db)
    cafe_obj = await cafe_repo.get_by_id(cafe_id)
    if cafe_obj:
        if cafe_obj.bookable_stations is not None and cafe_obj.bookable_stations >= 0:
            app_bookable_seats = min(app_bookable_seats, cafe_obj.bookable_stations)
        if cafe_obj.bookings_paused or cafe_obj.is_emergency_mode or cafe_obj.bookable_stations == 0:
            app_bookable_seats = 0

    return {
        "success": True,
        "data": {
            "appBookableSeats": app_bookable_seats,
            "remainingSeats": app_bookable_seats,
            "bookedSlots": booked_slots,
            "bookingsPaused": cafe_obj.bookings_paused if cafe_obj else False,
            "isEmergencyMode": cafe_obj.is_emergency_mode if cafe_obj else False,
        }
    }

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_cafe(
    payload: CafeCreateRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    repo = CafeRepository(db)
    user_repo = UserRepository(db)
    service = CafeService(repo)
    
    stmt_check_gamer = select(UserRoleMapping).where(
        UserRoleMapping.user_id == current_user.id,
        UserRoleMapping.role == UserRole.GAMER,
        UserRoleMapping.cafe_id.is_(None)
    )
    res_gamer = await db.execute(stmt_check_gamer)
    if not res_gamer.scalars().first():
        db.add(UserRoleMapping(
            id=uuid.uuid4(),
            user_id=current_user.id,
            role=UserRole.GAMER,
            cafe_id=None
        ))
    
    stmt_check_owner = select(UserRoleMapping).where(
        UserRoleMapping.user_id == current_user.id,
        UserRoleMapping.role == UserRole.CAFE_OWNER,
        UserRoleMapping.cafe_id.is_(None)
    )
    res_owner = await db.execute(stmt_check_owner)
    if not res_owner.scalars().first():
        db.add(UserRoleMapping(
            id=uuid.uuid4(),
            user_id=current_user.id,
            role=UserRole.CAFE_OWNER,
            cafe_id=None
        ))
    
    result = await service.create_cafe(current_user.id, payload)
    
    await db.commit()
    
    return {
        "success": True,
        "data": {
            "cafe": result
        }
    }

@router.patch("/{cafe_id}", status_code=status.HTTP_200_OK)
async def update_cafe(
    cafe_id: UUID,
    payload: CafeUpdateRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    repo = CafeRepository(db)
    service = CafeService(repo)
    result = await service.update_cafe(cafe_id, current_owner.id, payload)
    return {
        "success": True,
        "data": {
            "cafe": result
        }
    }

# Hardware Tiers under Cafe
@router.post("/{cafe_id}/tiers", status_code=status.HTTP_201_CREATED)
async def add_hardware_tier(
    cafe_id: UUID,
    payload: HardwareTierCreateRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    cafe_repo = CafeRepository(db)
    tier_repo = HardwareTierRepository(db)
    unit_repo = HardwareTierUnitRepository(db)
    booking_repo = BookingRepository(db)
    service = HardwareTierService(tier_repo, cafe_repo, unit_repo=unit_repo, booking_repo=booking_repo)
    result = await service.add_hardware_tier(cafe_id, current_owner.id, payload)
    return {
        "success": True,
        "data": {
            "hardwareTier": result
        }
    }

@router.get("/{cafe_id}/tiers", status_code=status.HTTP_200_OK)
async def list_hardware_tiers(cafe_id: UUID, db: AsyncSession = Depends(get_db)):
    tier_repo = HardwareTierRepository(db)
    promo_repo = PromotionRepository(db)
    service = HardwareTierService(tier_repo, promo_repo=promo_repo)
    result = await service.get_cafe_tiers(cafe_id)
    return {
        "success": True,
        "data": {
            "tiers": result
        }
    }

@router.patch("/{cafe_id}/tiers/{tier_id}", status_code=status.HTTP_200_OK)
async def update_hardware_tier(
    cafe_id: UUID,
    tier_id: UUID,
    payload: HardwareTierUpdateRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    cafe_repo = CafeRepository(db)
    tier_repo = HardwareTierRepository(db)
    unit_repo = HardwareTierUnitRepository(db)
    booking_repo = BookingRepository(db)
    service = HardwareTierService(tier_repo, cafe_repo, unit_repo=unit_repo, booking_repo=booking_repo)
    result = await service.update_hardware_tier(tier_id, current_owner.id, payload)
    return {
        "success": True,
        "data": {
            "hardwareTier": result
        }
    }


@router.get("/{cafe_id}/tiers/{tier_id}/units", status_code=status.HTTP_200_OK)
async def list_tier_units(
    cafe_id: UUID,
    tier_id: UUID,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    from app.core.exceptions import NotFoundException, ForbiddenException

    tier_repo = HardwareTierRepository(db)
    tier = await tier_repo.get_by_id(tier_id)
    if not tier or str(tier.cafe_id) != str(cafe_id):
        raise NotFoundException(message="Hardware tier not found", error_code="TIER_NOT_FOUND")

    cafe_repo = CafeRepository(db)
    cafe = await cafe_repo.get_by_id(cafe_id)
    if not cafe or str(cafe.owner_id) != str(current_owner.id):
        raise ForbiddenException(message="You can only manage your own café's activities", error_code="FORBIDDEN")

    unit_repo = HardwareTierUnitRepository(db)
    units = await unit_repo.list_by_tier(tier_id)
    return {
        "success": True,
        "data": {
            "units": [
                {"id": str(u.id), "label": u.label, "status": u.status}
                for u in units
            ]
        }
    }


class TierUnitStatusUpdateRequest(BaseModel):
    status: str  # 'available' | 'maintenance'


@router.patch("/{cafe_id}/tiers/{tier_id}/units/{unit_id}", status_code=status.HTTP_200_OK)
async def update_tier_unit_status(
    cafe_id: UUID,
    tier_id: UUID,
    unit_id: UUID,
    payload: TierUnitStatusUpdateRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    from app.models.hardware_tier_unit import UnitStatus
    from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException

    tier_repo = HardwareTierRepository(db)
    # M2: lock the tier row up front so this whole check-then-write sequence
    # (capacity check + unit status write) is serialized per tier, the same
    # way booking creation locks the tier via
    # BookingRepository.get_overlapping_bookings_count_with_lock.
    tier = await tier_repo.get_by_id_with_lock(tier_id)
    if not tier or str(tier.cafe_id) != str(cafe_id):
        raise NotFoundException(message="Hardware tier not found", error_code="TIER_NOT_FOUND")

    cafe_repo = CafeRepository(db)
    cafe = await cafe_repo.get_by_id(cafe_id)
    if not cafe or str(cafe.owner_id) != str(current_owner.id):
        raise ForbiddenException(message="You can only manage your own café's activities", error_code="FORBIDDEN")

    try:
        status_enum = UnitStatus(payload.status)
    except ValueError:
        raise ValidationException(message="status must be 'available' or 'maintenance'", error_code="INVALID_UNIT_STATUS")

    unit_repo = HardwareTierUnitRepository(db)

    # C1: validate the unit actually belongs to this tier BEFORE running the
    # capacity check or writing anything — otherwise an owner can PATCH a
    # unit ID belonging to another café's tier (every guard above only
    # validates tier_id/cafe_id ownership, not unit_id ownership) and mutate
    # it, with the capacity-safety check silently computed against the
    # wrong tier's capacity.
    unit = await unit_repo.get_by_id(unit_id)
    if not unit or str(unit.tier_id) != str(tier_id):
        raise NotFoundException(message="Unit not found", error_code="UNIT_NOT_FOUND")

    # Requirement 3: going INTO maintenance must never oversell a future
    # booking. Coming back to 'available' only ever increases capacity, so
    # it's always safe and skips this check.
    if status_enum == UnitStatus.MAINTENANCE:
        booking_repo = BookingRepository(db)
        maintenance_count = await unit_repo.count_in_maintenance(tier_id)
        # M3: if this unit is already in maintenance (e.g. a duplicate/
        # retried request), it's already included in maintenance_count —
        # don't double-count it by adding 1 again.
        already_in_maintenance = unit.status == UnitStatus.MAINTENANCE.value
        effective_maintenance_count = maintenance_count if already_in_maintenance else maintenance_count + 1
        new_capacity = max(0, tier.app_bookable_seats - effective_maintenance_count)
        conflict = await booking_repo.find_first_capacity_conflict(tier_id, new_capacity=new_capacity)
        if conflict:
            raise ValidationException(
                message=f"Can't set this to maintenance — {conflict.booking_reference} on {conflict.session_date} needs the capacity. Schedule maintenance after that booking instead.",
                error_code="MAINTENANCE_CAPACITY_CONFLICT"
            )

    # `unit` above already proved this row exists and belongs to tier_id —
    # apply_status writes on that same loaded object instead of set_status's
    # unit_id-based re-SELECT, and there's nothing left to re-validate.
    updated_unit = await unit_repo.apply_status(unit, status_enum)

    return {
        "success": True,
        "data": {"unit": {"id": str(updated_unit.id), "label": updated_unit.label, "status": updated_unit.status}}
    }
