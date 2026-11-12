from fastapi import APIRouter, BackgroundTasks, Depends, status, Query, Request
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
from app.api.deps import require_cafe_owner, require_staff_or_owner, get_optional_user, get_current_active_user
import uuid

limiter = None

router = APIRouter()

@router.get("", status_code=status.HTTP_200_OK)
async def list_cafes(
    background: BackgroundTasks,
    city: Optional[str] = Query(None),
    query: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    minPrice: Optional[float] = Query(None, alias="minPrice"),
    maxPrice: Optional[float] = Query(None, alias="maxPrice"),
    amenities: Optional[List[str]] = Query(None),
    activityKind: Optional[str] = Query(None, alias="activityKind"),
    activity: Optional[str] = Query(None),
    style: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db)
):
    search_query = query if query is not None else q
    repo = CafeRepository(db)
    review_repo = ReviewRepository(db)
    service = CafeService(repo, promo_repo=PromotionRepository(db), review_repo=review_repo)
    result = await service.list_cafes(
        city=city,
        query=search_query,
        min_price=minPrice,
        max_price=maxPrice,
        amenities=amenities,
        activity_kind=activityKind,
        activity=activity,
        style=style,
        page=page,
        limit=limit
    )
    # "3 free now" on each bookable card: the same count as the café page.
    from app.models.cafe import Cafe
    from app.services.live_seats import live_seats_for_cafes
    ids = [i.id for i in result["items"] if not i.is_lead_listing]
    if ids:
        cafes = (await db.execute(select(Cafe).where(Cafe.id.in_(ids)))).scalars().all()
        live = await live_seats_for_cafes(db, list(cafes))
        by_id = {c.id: c for c in cafes}
        for item in result["items"]:
            info = live.get(item.id)
            if info is None or not info["openNow"]:
                continue
            free = sum(t["freeNow"] for t in info["tiers"])
            cap = by_id[item.id].bookable_stations
            item.free_now = min(free, cap) if cap is not None and cap >= 0 else free
    await _with_photo_colors(db, background, [item.photos for item in result["items"]])
    return {
        "success": True,
        "data": result
    }


async def _with_photo_colors(db: AsyncSession, background: Optional[BackgroundTasks], photo_lists) -> None:
    """Each photo gets its main colour (the app paints it while the photo
    loads); photos without one yet are worked out after the response."""
    from app.services.photo_colors import attach_colors, fill_in_background
    try:
        missing = await attach_colors(db, photo_lists)
    except Exception:  # a colour is a nicety: never fail the page for it
        return
    if missing and background is not None:
        background.add_task(fill_in_background, missing)


@router.get("/activities", status_code=status.HTTP_200_OK)
async def list_activities(
    city: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """What can be played in a city, gaming first — drives the explore filters."""
    return {"success": True, "data": await CafeRepository(db).activity_counts(city)}


@router.get("/taxonomy", status_code=status.HTTP_200_OK)
async def get_taxonomy():
    """Category -> Activity -> Style -> Attributes tree (static, cacheable)."""
    from app.core import taxonomy
    return {"success": True, "data": taxonomy.public_tree()}


@router.get("/slug/{slug}", status_code=status.HTTP_200_OK)
async def get_cafe_by_slug(
    slug: str,
    background: BackgroundTasks,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db)
):
    from app.core.exceptions import NotFoundException
    cafe = await CafeRepository(db).get_by_slug(slug)
    if not cafe:
        raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
    # Same visibility rules and payload as lookup by id.
    return await get_cafe(cafe.id, background=background, current_user=current_user, db=db)


@router.get("/{cafe_id}", status_code=status.HTTP_200_OK)
async def get_cafe(
    cafe_id: UUID,
    background: BackgroundTasks,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db)
):
    cafe_repo = CafeRepository(db)
    tier_repo = HardwareTierRepository(db)
    promo_repo = PromotionRepository(db)
    review_repo = ReviewRepository(db)
    service = CafeService(cafe_repo, tier_repo, promo_repo, review_repo)
    result = await service.get_cafe(cafe_id, current_user=current_user)
    await _with_photo_colors(db, background, [getattr(result, "photos", None)])
    return {
        "success": True,
        "data": {
            "cafe": result
        }
    }

@router.get("/{cafe_id}/live", status_code=status.HTTP_200_OK)
async def get_cafe_live(cafe_id: UUID, db: AsyncSession = Depends(get_db)):
    """How many app-bookable stations per tier are free right now (IST).

    Counts only KHEL-O bookings, so it is "free to book now", not a claim
    about walk-ins. Closed, paused or lead-listing cafés report 0 free.
    """
    from app.core.exceptions import NotFoundException
    from app.services.live_seats import live_seats_for_cafes

    cafe = await CafeRepository(db).get_by_id(cafe_id)
    if not cafe:
        raise NotFoundException(message="Cafe not found", error_code="CAFE_NOT_FOUND")
    live = (await live_seats_for_cafes(db, [cafe]))[cafe.id]
    return {"success": True, "data": live}


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
            # Checked-in seats stay taken until the session ends.
            Booking.status.in_([BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED,
                                BookingStatus.CHECKED_IN, BookingStatus.ACTIVE]),
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

    # Seats kept for a launch drop show as booked during the drop's hours.
    from app.services import drop_service as dsvc
    for ds, de, n, _title in await dsvc.dedicated_windows(db, tier_id, parsed_date):
        booked_slots.append({"startTime": f"{ds // 60:02d}:{ds % 60:02d}:00", "endTime": f"{de // 60:02d}:{de % 60:02d}:00", "seatsCount": n})

    app_bookable_seats = tier.app_bookable_seats or tier.total_seats or 10

    # A broken machine (owner-set, any kind of setup: a snooker table, or "PC 7")
    # takes one seat out of what customers can book. Gaming setups only have such
    # rows while something is broken, so the COUNT is almost always 0 and is one
    # indexed lookup on tier_id.
    unit_repo = HardwareTierUnitRepository(db)
    maintenance_count = await unit_repo.count_in_maintenance(tier_id)
    app_bookable_seats = max(0, app_bookable_seats - maintenance_count)

    cafe_repo = CafeRepository(db)
    cafe_obj = await cafe_repo.get_by_id(cafe_id)
    if cafe_obj:
        if cafe_obj.bookable_stations is not None and cafe_obj.bookable_stations >= 0:
            app_bookable_seats = min(app_bookable_seats, cafe_obj.bookable_stations)
        # is_lead_listing: KHEL-O listed this café from research and the venue
        # has not agreed to take bookings, so it must never offer a slot even
        # if research confirmed real tiers for it.
        if (cafe_obj.bookings_paused or cafe_obj.is_emergency_mode
                or cafe_obj.bookable_stations == 0 or cafe_obj.is_lead_listing):
            app_bookable_seats = 0

    return {
        "success": True,
        "data": {
            "appBookableSeats": app_bookable_seats,
            "remainingSeats": app_bookable_seats,
            "bookedSlots": booked_slots,
            "keptForDrops": [
                {"title": d.title, "slug": d.slug, "game": d.game, "seats": d.daily_seats or 0,
                 "startTime": d.daily_start_time.strftime("%H:%M"), "endTime": d.daily_end_time.strftime("%H:%M")}
                for d in await dsvc.dedicated_drops(db, tier_id, parsed_date)
            ],
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
    service = HardwareTierService(tier_repo, promo_repo=promo_repo, unit_repo=HardwareTierUnitRepository(db))
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



async def _check_can_work_this_cafe(db: AsyncSession, user: User, cafe) -> None:
    """The café's owner, a staff member of THIS café, or an admin. Staff are the
    people at the desk when a machine breaks, so they may mark it broken or fixed
    (nothing else about a setup)."""
    from app.core.exceptions import ForbiddenException
    from app.api.deps import get_user_roles
    if cafe and str(cafe.owner_id) == str(user.id):
        return
    roles = await get_user_roles(user.id, db)
    if "admin" in roles:
        return
    if "staff" in roles:
        res = await db.execute(
            select(UserRoleMapping).where(
                UserRoleMapping.user_id == user.id,
                UserRoleMapping.role == UserRole.STAFF,
                UserRoleMapping.cafe_id == cafe.id,
            )
        )
        if res.scalars().first():
            return
    raise ForbiddenException(message="You can only manage your own café", error_code="FORBIDDEN")


@router.get("/{cafe_id}/tiers/{tier_id}/units", status_code=status.HTTP_200_OK)
async def list_tier_units(
    cafe_id: UUID,
    tier_id: UUID,
    current_owner: User = Depends(require_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    from app.core.exceptions import NotFoundException, ForbiddenException

    tier_repo = HardwareTierRepository(db)
    tier = await tier_repo.get_by_id(tier_id)
    if not tier or str(tier.cafe_id) != str(cafe_id):
        raise NotFoundException(message="Hardware tier not found", error_code="TIER_NOT_FOUND")

    cafe_repo = CafeRepository(db)
    cafe = await cafe_repo.get_by_id(cafe_id)
    if not cafe:
        raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
    await _check_can_work_this_cafe(db, current_owner, cafe)

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


class BrokenMachineRequest(BaseModel):
    label: str


@router.post("/{cafe_id}/tiers/{tier_id}/broken", status_code=status.HTTP_201_CREATED)
async def mark_machine_broken(
    cafe_id: UUID,
    tier_id: UUID,
    payload: BrokenMachineRequest,
    current_owner: User = Depends(require_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    """Owner says "PC 7 is broken". Only the name the owner types is kept (they
    know which machine it is); customers never see it, they just see one fewer
    machine bookable. Refused if a booking already made would no longer fit."""
    from app.models.hardware_tier_unit import HardwareTierUnit, UnitStatus
    from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException

    label = (payload.label or "").strip()
    if not label or len(label) > 50:
        raise ValidationException(message="Type which machine it is, like PC 7 (up to 50 letters)", error_code="INVALID_LABEL")

    cafe = await CafeRepository(db).get_by_id(cafe_id)
    if not cafe:
        raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
    await _check_can_work_this_cafe(db, current_owner, cafe)
    tier_repo = HardwareTierRepository(db)
    tier = await tier_repo.get_by_id_with_lock(tier_id)
    if not tier or str(tier.cafe_id) != str(cafe_id):
        raise NotFoundException(message="Setup not found", error_code="TIER_NOT_FOUND")
    if tier.tier_type == TierType.ACTIVITY:
        raise ValidationException(message="Use the table list for activities", error_code="USE_UNIT_LIST")

    unit_repo = HardwareTierUnitRepository(db)
    existing = await unit_repo.list_by_tier(tier_id)
    if any(u.label.strip().lower() == label.lower() for u in existing):
        raise ValidationException(message=f"{label} is already marked broken", error_code="ALREADY_BROKEN")
    broken_now = await unit_repo.count_in_maintenance(tier_id)
    if broken_now + 1 > (tier.total_seats or 0):
        raise ValidationException(message="That's more broken machines than this setup has", error_code="TOO_MANY_BROKEN")

    new_capacity = max(0, tier.app_bookable_seats - (broken_now + 1))
    conflict = await BookingRepository(db).find_first_capacity_conflict(tier_id, new_capacity=new_capacity)
    if conflict:
        raise ValidationException(
            message=f"{label} is needed for booking {conflict.booking_reference} on {conflict.session_date:%a %d %b}. Call that customer first, or mark it broken after their booking.",
            error_code="MAINTENANCE_CAPACITY_CONFLICT"
        )

    unit = HardwareTierUnit(tier_id=tier_id, label=label, status=UnitStatus.MAINTENANCE.value)
    db.add(unit)
    await db.commit()
    await db.refresh(unit)
    return {"success": True, "data": {"unit": {"id": str(unit.id), "label": unit.label, "status": unit.status}}}


@router.delete("/{cafe_id}/tiers/{tier_id}/broken/{unit_id}", status_code=status.HTTP_200_OK)
async def mark_machine_fixed(
    cafe_id: UUID,
    tier_id: UUID,
    unit_id: UUID,
    current_owner: User = Depends(require_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    """"PC 7 is fixed": the row is removed, so the machine counts as bookable
    again. Putting a machine back never needs a capacity check."""
    from app.core.exceptions import NotFoundException, ForbiddenException

    cafe = await CafeRepository(db).get_by_id(cafe_id)
    if not cafe:
        raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
    await _check_can_work_this_cafe(db, current_owner, cafe)
    tier = await HardwareTierRepository(db).get_by_id_with_lock(tier_id)
    if not tier or str(tier.cafe_id) != str(cafe_id):
        raise NotFoundException(message="Setup not found", error_code="TIER_NOT_FOUND")
    unit_repo = HardwareTierUnitRepository(db)
    unit = await unit_repo.get_by_id(unit_id)
    if not unit or str(unit.tier_id) != str(tier_id) or tier.tier_type == TierType.ACTIVITY:
        raise NotFoundException(message="That machine isn't marked broken", error_code="UNIT_NOT_FOUND")
    await db.delete(unit)
    await db.commit()
    return {"success": True, "data": {"fixed": unit.label}}
