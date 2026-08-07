from fastapi import APIRouter, Depends, status, Query
from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.schemas.cafe import CafeCreateRequest, CafeUpdateRequest
from app.schemas.hardware_tier import HardwareTierCreateRequest, HardwareTierUpdateRequest
from app.repositories.cafe_repository import CafeRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.repositories.promotion_repository import PromotionRepository
from app.repositories.review_repository import ReviewRepository
from app.services.cafe_service import CafeService
from app.services.hardware_tier_service import HardwareTierService
from app.repositories.user_repository import UserRepository
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.api.deps import require_cafe_owner, get_optional_user, get_current_active_user
import uuid

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
    cafe_id: UUID,
    tier_id: UUID = Query(...),
    session_date: str = Query(..., alias="date"),
    db: AsyncSession = Depends(get_db)
):
    from datetime import datetime as dt
    from sqlalchemy import select
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

    stmt = select(Booking).where(
        Booking.hardware_tier_id == tier_id,
        Booking.session_date == parsed_date,
        Booking.status.in_([BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED])
    )
    res = await db.execute(stmt)
    active_bookings = res.scalars().all()

    booked_slots = []
    for b in active_bookings:
        booked_slots.append({
            "startTime": b.start_time.strftime("%H:%M:%S"),
            "endTime": b.end_time.strftime("%H:%M:%S")
        })

    return {
        "success": True,
        "data": {
            "appBookableSeats": tier.app_bookable_seats or tier.total_seats or 10,
            "bookedSlots": booked_slots
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
    service = HardwareTierService(tier_repo, cafe_repo)
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
    service = HardwareTierService(tier_repo, cafe_repo)
    result = await service.update_hardware_tier(tier_id, current_owner.id, payload)
    return {
        "success": True,
        "data": {
            "hardwareTier": result
        }
    }
