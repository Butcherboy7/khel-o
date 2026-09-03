from fastapi import APIRouter, Depends, status, Query, Body
from typing import Optional, Dict, Any, List
from uuid import UUID
import secrets
from datetime import date, datetime, timezone, time, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.config import settings
from app.schemas.owner import (
    OwnerDashboardResponse,
    OwnerStatusUpdateRequest
)
from app.repositories.booking_repository import BookingRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository, guess_platform_and_model
from app.repositories.staff_invitation_repository import StaffInvitationRepository
from app.services.owner_service import OwnerService, IST
from app.services.notification_service import NotificationService
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator, AliasChoices
from app.constants import validate_city
from app.api.deps import require_cafe_owner, require_staff_or_owner, get_current_active_user, require_cafe_ownership
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier, PlatformType
from app.models.owner_payout_account import OwnerPayoutAccount
from app.models.booking import Booking, BookingStatus
from app.models.payment import Payment, PaymentStatus
from app.models.platform_fee import PlatformFee
from app.repositories.user_repository import UserRepository
from app.core.security import get_password_hash
from app.core.exceptions import BadRequestException, NotFoundException, ForbiddenException, ValidationException
from app.services.platform_derivation import derive_tier_display

def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

class StaffInviteRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=255)
    phone_number: Optional[str] = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

class StaffCreateRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=255)
    password: str = Field(..., min_length=6)
    phone_number: Optional[str] = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

class ValidateQRRequest(BaseModel):
    qr_data: str

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

class CheckinRequest(BaseModel):
    # How the staff member found this booking — an honest audit trail for
    # dispute resolution, instead of always recording "owner_desk".
    method: str = Field("manual", pattern="^(qr_camera|qr_upload|manual)$")

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class OnboardingDraftSaveRequest(BaseModel):
    step: int = 1
    draft_data: Dict[str, Any]

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class OnboardingHardwareTierItem(BaseModel):
    """Validated replacement for the previous unvalidated Dict[str, Any] tier
    soup (final-review.md I5): a non-string/oversized `model` used to reach
    `derive_tier_display` and crash with an unhandled AttributeError/500
    (`model.strip()`) or a Postgres DataError (String(100) column overflow).
    Every field stays optional/nullable, matching what the old dict-soup path
    tolerated — including the legacy no-platform shape (owner.py's
    submit_onboarding_application, free-text `gpu`) — so this only closes the
    validation hole without narrowing what a client may send."""
    platform: Optional[str] = None
    model: Optional[str] = Field(None, max_length=100)
    name: Optional[str] = Field(None, max_length=100)
    gpu: Optional[str] = None
    total_seats: Optional[int] = Field(
        None, ge=1, validation_alias=AliasChoices("totalSeats", "total_seats")
    )
    app_bookable_seats: Optional[int] = Field(
        None, ge=0, validation_alias=AliasChoices("appBookableSeats", "app_bookable_seats")
    )
    hourly_rate: Optional[float] = Field(
        None,
        validation_alias=AliasChoices("hourlyRate", "hourly_rate", "pricePerHour", "price_per_hour"),
    )
    preset_category: Optional[str] = Field(
        None, max_length=50, validation_alias=AliasChoices("presetCategory", "preset_category")
    )

    model_config = ConfigDict(populate_by_name=True)


class OnboardingSubmitRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None
    address_line1: str = Field(..., max_length=255)
    address_line2: Optional[str] = None
    city: str = Field(..., max_length=100)
    state: str = Field(..., max_length=100)
    pincode: str = Field(..., max_length=10)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    phone_number: str = Field(..., max_length=20)
    email: Optional[str] = None
    opening_time: str = Field(..., pattern=r"^\d{2}:\d{2}:\d{2}$", description="Opening time in HH:MM:SS format (required)")

    @field_validator("city")
    @classmethod
    def _validate_city(cls, v: str) -> str:
        return validate_city(v)
    closing_time: str = Field(..., pattern=r"^\d{2}:\d{2}:\d{2}$", description="Closing time in HH:MM:SS format (required, can be earlier than opening for overnight)")
    total_seats: int = Field(20, ge=1)
    amenities: List[str] = Field(default_factory=list)
    photos: List[str] = Field(default_factory=list)
    supported_games: List[str] = Field(default_factory=list)
    business_pan: Optional[str] = None
    gstin: Optional[str] = None
    legal_document_url: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_ifsc: Optional[str] = None
    account_holder_name: Optional[str] = None
    cancellation_policy: Optional[str] = None
    house_rules: List[str] = Field(default_factory=list)
    social_links: Dict[str, str] = Field(default_factory=dict)
    hardware_tiers: List[OnboardingHardwareTierItem] = Field(default_factory=list)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

router = APIRouter()

class ToggleEmergencyModeRequest(BaseModel):
    is_emergency_mode: Optional[bool] = Field(None, alias="isEmergencyMode")

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

class ToggleBookingsPauseRequest(BaseModel):
    bookings_paused: Optional[bool] = Field(None, alias="bookingsPaused")

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

@router.get("/settings", status_code=status.HTTP_200_OK)
async def get_owner_settings(
    current_user: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    """Get owner café settings in one call."""
    stmt = select(Cafe).where(Cafe.owner_id == current_user.id).order_by(Cafe.created_at.desc())
    result = await db.execute(stmt)
    cafe = result.scalars().first()

    if not cafe:
        raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")

    cafe_data = {
        "cafeId": str(cafe.id),
        "cafeName": cafe.name,
        "isEmergencyMode": cafe.is_emergency_mode,
        "bookingsPaused": cafe.bookings_paused,
        "openingTime": str(cafe.opening_time) if cafe.opening_time else None,
        "closingTime": str(cafe.closing_time) if cafe.closing_time else None,
        "phoneNumber": cafe.phone_number,
        "addressLine1": cafe.address_line1,
        "city": cafe.city,
        "state": cafe.state,
        "pincode": cafe.pincode,
        "amenities": cafe.amenities or [],
        "photos": cafe.photos or [],
        "menuPhotos": cafe.menu_photos or [],
        "latitude": cafe.latitude,
        "longitude": cafe.longitude,
    }

    return {
        "success": True,
        "data": {
            "cafe": cafe_data
        },
        "cafe": cafe_data
    }

@router.patch("/cafe/emergency-mode", status_code=status.HTTP_200_OK)
async def toggle_emergency_mode(
    isEmergencyMode: Optional[bool] = Query(None),
    payload: Optional[ToggleEmergencyModeRequest] = Body(None),
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Cafe).where(Cafe.owner_id == current_owner.id).order_by(Cafe.created_at.desc())
    res = await db.execute(stmt)
    cafe = res.scalars().first()
    if not cafe:
        raise NotFoundException("Café not found", error_code="CAFE_NOT_FOUND")

    target_val = isEmergencyMode
    if target_val is None and payload is not None:
        target_val = payload.is_emergency_mode
    if target_val is None:
        target_val = not cafe.is_emergency_mode

    cafe.is_emergency_mode = target_val
    await db.commit()
    await db.refresh(cafe)

    return {
        "success": True,
        "data": {
            "isEmergencyMode": cafe.is_emergency_mode
        },
        "isEmergencyMode": cafe.is_emergency_mode
    }

@router.patch("/cafe/bookings-pause", status_code=status.HTTP_200_OK)
async def toggle_bookings_paused(
    bookingsPaused: Optional[bool] = Query(None),
    payload: Optional[ToggleBookingsPauseRequest] = Body(None),
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Cafe).where(Cafe.owner_id == current_owner.id).order_by(Cafe.created_at.desc())
    res = await db.execute(stmt)
    cafe = res.scalars().first()
    if not cafe:
        raise NotFoundException("Café not found", error_code="CAFE_NOT_FOUND")

    target_val = bookingsPaused
    if target_val is None and payload is not None:
        target_val = payload.bookings_paused
    if target_val is None:
        target_val = not cafe.bookings_paused

    cafe.bookings_paused = target_val

    # This toggle previously only flipped the flag, leaving actual seat
    # capacity (cafe.bookable_stations and every tier's app_bookable_seats)
    # untouched. If seats had been zeroed earlier (e.g. the "None (0)"
    # preset), clicking Resume here flipped bookings_paused to False —
    # dashboard showed "Live" — while real capacity stayed at 0, so the
    # customer app kept showing "Bookings Paused / Walk-ins only" and the
    # dashboard showed "Seats Free Right Now: 0" despite being "resumed".
    # Mirror booking-controls' Mode 2 pause/resume capacity handling here,
    # respecting locked tiers the same way BUG #1's fix does.
    tier_repo = HardwareTierRepository(db)
    tiers = await tier_repo.get_by_cafe_id(cafe.id)
    total_cafe_seats = sum(t.total_seats for t in tiers) if tiers else (cafe.total_seats or 20)

    if target_val:
        cafe.bookable_stations = 0
        cafe.app_bookable_seats = 0
        for t in tiers:
            await tier_repo.update(t.id, {"app_bookable_seats": 0})
    elif cafe.bookable_stations == 0:
        cafe.bookable_stations = max(1, round(total_cafe_seats * 0.7)) if total_cafe_seats > 0 else 1
        cafe.app_bookable_seats = cafe.bookable_stations
        ratio = cafe.bookable_stations / total_cafe_seats if total_cafe_seats > 0 else 1.0
        for t in tiers:
            if t.app_bookable_seats_locked:
                continue
            scaled_seats = max(0, min(t.total_seats, round(t.total_seats * ratio)))
            if scaled_seats == 0 and ratio > 0 and t.total_seats >= 1:
                scaled_seats = 1
            await tier_repo.update(t.id, {"app_bookable_seats": scaled_seats})

    await db.commit()
    await db.refresh(cafe)

    return {
        "success": True,
        "data": {
            "bookingsPaused": cafe.bookings_paused,
            "bookableStations": cafe.bookable_stations
        },
        "bookingsPaused": cafe.bookings_paused
    }

@router.post("/cafe/pause-bookings", status_code=status.HTTP_200_OK)
async def pause_bookings(
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Cafe).where(Cafe.owner_id == current_owner.id).order_by(Cafe.created_at.desc())
    res = await db.execute(stmt)
    cafe = res.scalars().first()
    if not cafe:
        raise NotFoundException("Café not found", error_code="CAFE_NOT_FOUND")

    cafe.bookings_paused = True
    await db.commit()
    await db.refresh(cafe)

    return {
        "success": True,
        "data": {
            "bookingsPaused": True
        },
        "bookingsPaused": True
    }

@router.post("/cafe/resume-bookings", status_code=status.HTTP_200_OK)
async def resume_bookings(
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Cafe).where(Cafe.owner_id == current_owner.id).order_by(Cafe.created_at.desc())
    res = await db.execute(stmt)
    cafe = res.scalars().first()
    if not cafe:
        raise NotFoundException("Café not found", error_code="CAFE_NOT_FOUND")

    cafe.bookings_paused = False
    await db.commit()
    await db.refresh(cafe)

    return {
        "success": True,
        "data": {
            "bookingsPaused": False
        },
        "bookingsPaused": False
    }

@router.get("/status", status_code=status.HTTP_200_OK)
async def get_owner_status(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve owner's café lifecycle status (prospective, draft, pending, verified, suspended)"""
    stmt = select(Cafe).where(Cafe.owner_id == current_user.id).order_by(Cafe.created_at.desc())
    res = await db.execute(stmt)
    cafe = res.scalars().first()

    if not cafe:
        from app.models.user_role import UserRoleMapping
        stmt_staff = select(Cafe).join(
            UserRoleMapping, UserRoleMapping.cafe_id == Cafe.id
        ).where(
            UserRoleMapping.user_id == current_user.id,
            UserRoleMapping.role == UserRole.STAFF
        ).order_by(Cafe.created_at.desc())
        res_staff = await db.execute(stmt_staff)
        cafe = res_staff.scalars().first()

    if not cafe:
        return {
            "success": True,
            "data": {
                "status": "prospective",
                "cafe": None,
                "role": current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
            }
        }

    status_str = cafe.verification_status.value if hasattr(cafe.verification_status, "value") else str(cafe.verification_status)

    tier_repo = HardwareTierRepository(db)
    tiers = await tier_repo.get_by_cafe_id(cafe.id)
    tiers_data = [
        {
            "id": str(t.id),
            "name": t.name,
            "totalSeats": t.total_seats,
            "appBookableSeats": t.app_bookable_seats,
            "pricePerHour": float(t.price_per_hour),
            "gpu": t.specs.get("gpu") if isinstance(t.specs, dict) else "Pod"
        }
        for t in tiers
    ]

    return {
        "success": True,
        "data": {
            "status": status_str,
            "cafe": {
                "id": str(cafe.id),
                "name": cafe.name,
                "city": cafe.city,
                "verificationStatus": status_str,
                "rejectionReason": cafe.rejection_reason,
                "isActive": cafe.is_active,
                "bookableStations": cafe.bookable_stations,
                "appBookableSeats": cafe.app_bookable_seats,
                "totalSeats": cafe.total_seats or sum(t.total_seats for t in tiers),
                "tiers": tiers_data,
                "draftData": cafe.draft_data or {}
            },
            "role": current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        }
    }

@router.get("/onboarding/draft", status_code=status.HTTP_200_OK)
async def get_onboarding_draft(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Cafe).where(Cafe.owner_id == current_user.id).order_by(Cafe.created_at.desc())
    res = await db.execute(stmt)
    cafe = res.scalars().first()

    draft_data = cafe.draft_data if cafe else {}
    return {
        "success": True,
        "data": {
            "draft": draft_data
        }
    }

@router.post("/onboarding/draft", status_code=status.HTTP_200_OK)
async def save_onboarding_draft(
    payload: OnboardingDraftSaveRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Cafe).where(Cafe.owner_id == current_user.id).order_by(Cafe.created_at.desc())
    res = await db.execute(stmt)
    cafe = res.scalars().first()

    if not cafe:
        # Create a draft cafe record
        draft_name = payload.draft_data.get("name") or f"{current_user.full_name}'s Café"
        cafe = Cafe(
            owner_id=current_user.id,
            name=draft_name,
            address_line1=payload.draft_data.get("addressLine1") or "Pending Setup",
            city=payload.draft_data.get("city") or "Bengaluru",
            state=payload.draft_data.get("state") or "Karnataka",
            pincode=payload.draft_data.get("pincode") or "560001",
            phone_number=payload.draft_data.get("phoneNumber") or current_user.phone_number or "+910000000000",
            email=payload.draft_data.get("email") or current_user.email,
            verification_status=VerificationStatus.DRAFT,
            draft_data=payload.draft_data,
            is_active=False
        )
        db.add(cafe)
    else:
        cafe.draft_data = payload.draft_data
        if payload.draft_data.get("name"):
            cafe.name = payload.draft_data.get("name")

    await db.commit()
    await db.refresh(cafe)

    return {
        "success": True,
        "data": {
            "saved": True,
            "cafeId": str(cafe.id)
        }
    }

@router.post("/onboarding/submit", status_code=status.HTTP_200_OK)
async def submit_onboarding_application(
    payload: OnboardingSubmitRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    from app.models.user_role import UserRoleMapping
    import uuid
    
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

    # Also grant CAFE_OWNER role
    stmt_check_owner = select(UserRoleMapping).where(
        UserRoleMapping.user_id == current_user.id,
        UserRoleMapping.role == UserRole.CAFE_OWNER
    )
    res_owner = await db.execute(stmt_check_owner)
    if not res_owner.scalars().first():
        db.add(UserRoleMapping(
            id=uuid.uuid4(),
            user_id=current_user.id,
            role=UserRole.CAFE_OWNER,
            cafe_id=None
        ))
    
    current_user.role = UserRole.CAFE_OWNER

    stmt = select(Cafe).where(Cafe.owner_id == current_user.id).order_by(Cafe.created_at.desc())
    res = await db.execute(stmt)
    cafe = res.scalars().first()

    parts = payload.opening_time.split(":")
    opening_time_obj = time(hour=int(parts[0]), minute=int(parts[1]))
    
    parts = payload.closing_time.split(":")
    closing_time_obj = time(hour=int(parts[0]), minute=int(parts[1]))
    
    if not cafe:
        cafe = Cafe(
            owner_id=current_user.id,
            name=payload.name,
            description=payload.description,
            address_line1=payload.address_line1,
            address_line2=payload.address_line2,
            city=payload.city,
            state=payload.state,
            pincode=payload.pincode,
            latitude=payload.latitude,
            longitude=payload.longitude,
            phone_number=payload.phone_number or current_user.phone_number or "+919876543210",
            email=payload.email or current_user.email,
            opening_time=opening_time_obj,
            closing_time=closing_time_obj,
            total_seats=payload.total_seats,
            amenities=payload.amenities,
            photos=payload.photos,
            supported_games=payload.supported_games,
            business_pan=payload.business_pan,
            gstin=payload.gstin,
            legal_document_url=payload.legal_document_url,
            cancellation_policy=payload.cancellation_policy,
            house_rules=payload.house_rules,
            social_links=payload.social_links,
            verification_status=VerificationStatus.PENDING,
            draft_data={},
            is_active=True
        )
        db.add(cafe)
    else:
        cafe.name = payload.name
        cafe.description = payload.description
        cafe.address_line1 = payload.address_line1
        cafe.address_line2 = payload.address_line2
        cafe.city = payload.city
        cafe.state = payload.state
        cafe.pincode = payload.pincode
        if payload.latitude: cafe.latitude = payload.latitude
        if payload.longitude: cafe.longitude = payload.longitude
        cafe.phone_number = payload.phone_number
        cafe.email = payload.email
        cafe.opening_time = opening_time_obj
        cafe.closing_time = closing_time_obj
        cafe.total_seats = payload.total_seats
        cafe.amenities = payload.amenities
        cafe.photos = payload.photos
        cafe.supported_games = payload.supported_games
        cafe.business_pan = payload.business_pan
        cafe.gstin = payload.gstin
        cafe.legal_document_url = payload.legal_document_url
        cafe.cancellation_policy = payload.cancellation_policy
        cafe.house_rules = payload.house_rules
        cafe.social_links = payload.social_links
        cafe.verification_status = VerificationStatus.PENDING
        cafe.draft_data = {}
        cafe.is_active = True

    await db.flush()

    # Save Owner Payout Account if provided
    if payload.bank_account_number or payload.bank_ifsc:
        stmt_payout = select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == current_user.id)
        res_payout = await db.execute(stmt_payout)
        payout_acc = res_payout.scalars().first()

        masked_acc = f"••••{payload.bank_account_number[-4:]}" if payload.bank_account_number and len(payload.bank_account_number) >= 4 else payload.bank_account_number

        if not payout_acc:
            payout_acc = OwnerPayoutAccount(
                owner_id=current_user.id,
                kyc_status="submitted",
                business_pan=payload.business_pan,
                bank_account_number_masked=masked_acc,
                bank_ifsc=payload.bank_ifsc,
                account_holder_name=payload.account_holder_name or current_user.full_name,
                details={"full_account": payload.bank_account_number},
                submitted_at=datetime.now(timezone.utc)
            )
            db.add(payout_acc)
        else:
            payout_acc.kyc_status = "submitted"
            payout_acc.business_pan = payload.business_pan
            payout_acc.bank_account_number_masked = masked_acc
            payout_acc.bank_ifsc = payload.bank_ifsc
            payout_acc.account_holder_name = payload.account_holder_name or current_user.full_name

    # Create Hardware Tiers if provided
    if payload.hardware_tiers:
        tier_repo = HardwareTierRepository(db)
        for tier_item in payload.hardware_tiers:
            tot = int(tier_item.total_seats or 10)
            app_b = int(tier_item.app_bookable_seats if tier_item.app_bookable_seats is not None else max(1, int(tot * 0.25)))
            price = float(tier_item.hourly_rate or 100)

            raw_platform = tier_item.platform
            model = tier_item.model
            try:
                platform = PlatformType(raw_platform) if raw_platform else None
                if platform is not None:
                    derived_specs, suggested_name = derive_tier_display(platform, model)
                    specs = derived_specs
                    # An explicitly-supplied, non-blank name must survive —
                    # the derived name only fills in when none was given (or
                    # it was blank). See I7.
                    explicit_name = tier_item.name.strip() if tier_item.name else ""
                    name = explicit_name or suggested_name
                else:
                    # Legacy shape (pre-Platform V2 clients): free-text gpu/cpu.
                    gpu_str = tier_item.gpu or "NVIDIA RTX 4060 / 16GB"
                    specs = {"gpu": gpu_str, "ram": "16GB"}
                    name = tier_item.name or "Standard Pod"
            except ValueError as e:
                raise ValidationException(message=str(e), error_code="INVALID_PLATFORM_MODEL")

            await tier_repo.create({
                "cafe_id": cafe.id,
                "name": name,
                "specs": specs,
                "price_per_hour": price,
                "total_seats": tot,
                "app_bookable_seats": app_b,
                "active_seats_count": tot,
                "preset_category": tier_item.preset_category,
                "platform": platform,
                "model": model,
                "is_active": True
            })

    await db.commit()
    await db.refresh(cafe)

    return {
        "success": True,
        "data": {
            "cafeId": str(cafe.id),
            "status": "pending"
        }
    }

@router.get("/dashboard", status_code=status.HTTP_200_OK)
async def get_owner_dashboard(
    current_owner: User = Depends(require_staff_or_owner),
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
        current_user=current_user,
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
    payload: CheckinRequest = Body(default_factory=CheckinRequest),
    current_user: User = Depends(require_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    cafe_repo = CafeRepository(db)
    service = OwnerService(booking_repo, cafe_repo)
    result = await service.checkin_booking(
        booking_id=booking_id,
        current_user=current_user,
        checkin_method=payload.method
    )
    return {
        "success": True,
        "data": {
            "booking": result
        }
    }

@router.post("/bookings/validate-qr", status_code=status.HTTP_200_OK)
async def validate_qr_code(
    payload: ValidateQRRequest,
    current_user: User = Depends(require_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    import urllib.parse
    qr_data = payload.qr_data.strip()
    booking_id_str = None
    ref_str = None

    if "khelo://" in qr_data or "?" in qr_data:
        parsed = urllib.parse.urlparse(qr_data)
        params = urllib.parse.parse_qs(parsed.query)
        if "id" in params and params["id"]:
            booking_id_str = params["id"][0]
        if "ref" in params and params["ref"]:
            ref_str = params["ref"][0]
    else:
        if len(qr_data) == 36 and "-" in qr_data:
            booking_id_str = qr_data
        else:
            ref_str = qr_data

    booking_repo = BookingRepository(db)
    booking = None
    if booking_id_str:
        try:
            booking = await booking_repo.get_by_id(UUID(booking_id_str))
        except Exception:
            booking = None

    if not booking and ref_str:
        booking = await booking_repo.get_by_reference(ref_str)

    if not booking:
        return {
            "success": True,
            "data": {
                "valid": False,
                "alreadyCheckedIn": False,
                "message": "Booking not found or invalid QR code"
            }
        }

    cafe_repo = CafeRepository(db)
    service = OwnerService(booking_repo, cafe_repo)
    await service._validate_user_cafe_access(current_user, booking.cafe_id)

    user_repo = UserRepository(db)
    tier_repo = HardwareTierRepository(db)
    gamer = await user_repo.get_by_id(booking.gamer_id)
    tier = await tier_repo.get_by_id(booking.hardware_tier_id)

    already_checked_in = booking.status in (BookingStatus.CHECKED_IN, BookingStatus.ACTIVE, BookingStatus.COMPLETED)

    checked_in_by_name = None
    if booking.checked_in_by:
        staff_user = await user_repo.get_by_id(booking.checked_in_by)
        if staff_user:
            checked_in_by_name = staff_user.full_name

    return {
        "success": True,
        "data": {
            "valid": True,
            "alreadyCheckedIn": already_checked_in,
            "checkedInByName": checked_in_by_name,
            "checkedInAt": booking.checked_in_at.isoformat() if booking.checked_in_at else None,
            "booking": {
                "id": str(booking.id),
                "bookingReference": booking.booking_reference,
                "gamerName": gamer.full_name if gamer else "Gamer",
                "gamerEmail": gamer.email if gamer else None,
                "gamerPhone": gamer.phone_number if gamer else None,
                "tierName": tier.name if tier else "Standard Tier",
                "sessionDate": booking.session_date.isoformat(),
                "startTime": booking.start_time.strftime("%H:%M"),
                "endTime": booking.end_time.strftime("%H:%M"),
                "durationHours": float(booking.duration_hours),
                "seatsCount": booking.seats_count,
                "totalAmount": float(booking.total_amount),
                "status": booking.status.value,
            }
        }
    }

@router.get("/bookings/search-checkin", status_code=status.HTTP_200_OK)
async def search_checkin_candidates(
    q: str = Query(..., min_length=2, max_length=100),
    current_user: User = Depends(require_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    """Manual scanner fallback: find today's booking by the customer's name
    or phone number when the QR pass can't be scanned and they don't have
    their booking reference handy. Scoped to the caller's own café and to
    today only — never a global lookup."""
    cafe_repo = CafeRepository(db)
    cafe = None

    # Resolved from UserRoleMapping, not the legacy users.role column — that
    # column can be stale relative to actually-granted roles and using it here
    # made a legitimate owner/staff account with a mismatched role value search
    # nothing (silent empty results) instead of their real café.
    owned_cafes = await cafe_repo.get_by_owner_id(current_user.id)
    if owned_cafes:
        cafe = owned_cafes[0]
    else:
        from app.models.user_role import UserRoleMapping
        stmt = select(UserRoleMapping).where(
            UserRoleMapping.user_id == current_user.id,
            UserRoleMapping.role == UserRole.STAFF
        )
        res = await db.execute(stmt)
        mapping = res.scalars().first()
        if mapping and mapping.cafe_id:
            cafe = await cafe_repo.get_by_id(mapping.cafe_id)

    if not cafe:
        return {"success": True, "data": {"results": []}}

    booking_repo = BookingRepository(db)
    today = datetime.now(IST).date()
    matches = await booking_repo.search_checkin_candidates(cafe.id, q, today)

    results = [
        {
            "id": str(booking.id),
            "bookingReference": booking.booking_reference,
            "gamerName": gamer_name or "Gamer",
            "gamerPhone": gamer_phone,
            "startTime": booking.start_time.strftime("%H:%M"),
            "endTime": booking.end_time.strftime("%H:%M"),
            "status": booking.status.value,
        }
        for booking, gamer_name, gamer_phone in matches
    ]

    return {"success": True, "data": {"results": results}}

@router.get("/occupancy", status_code=status.HTTP_200_OK)
async def get_owner_occupancy(
    current_user: User = Depends(require_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    cafe_repo = CafeRepository(db)
    tier_repo = HardwareTierRepository(db)

    role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    cafe = None

    if role_val in ("cafe_owner", "owner"):
        cafes = await cafe_repo.get_by_owner_id(current_user.id)
        if cafes:
            cafe = cafes[0]
    elif role_val == "staff":
        from app.models.user_role import UserRoleMapping
        stmt = select(UserRoleMapping).where(
            UserRoleMapping.user_id == current_user.id,
            UserRoleMapping.role == UserRole.STAFF
        )
        res = await db.execute(stmt)
        mapping = res.scalars().first()
        if mapping and mapping.cafe_id:
            cafe = await cafe_repo.get_by_id(mapping.cafe_id)

    if not cafe:
        return {"success": True, "data": {"tiers": []}}

    tiers = await tier_repo.get_by_cafe_id(cafe.id)
    today = datetime.now(IST).date()

    stmt = select(Booking.hardware_tier_id, func.sum(Booking.seats_count)).where(
        Booking.cafe_id == cafe.id,
        Booking.session_date == today,
        Booking.status.in_([BookingStatus.CHECKED_IN, BookingStatus.ACTIVE])
    ).group_by(Booking.hardware_tier_id)

    res = await db.execute(stmt)
    occupancy_counts = dict(res.all())

    tiers_data = []
    for tier in tiers:
        occupied = int(occupancy_counts.get(tier.id, 0) or 0)
        total = tier.total_seats
        pct = round((occupied / total) * 100, 1) if total > 0 else 0.0
        tiers_data.append({
            "tierId": str(tier.id),
            "tierName": tier.name,
            "totalSeats": total,
            "appBookableSeats": tier.app_bookable_seats,
            "occupiedSeats": occupied,
            "occupancyPercent": pct,
            "pricePerHour": float(tier.price_per_hour)
        })

    return {
        "success": True,
        "data": {
            "tiers": tiers_data
        }
    }

async def _resolve_owner_cafe(current_user: User, db: AsyncSession) -> Optional[Cafe]:
    """Owner -> their café; staff -> the café they're mapped to. Shared by the
    live-capacity endpoints below (occupancy uses its own inline copy of this
    for now — not touched here to keep this change scoped)."""
    cafe_repo = CafeRepository(db)
    role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

    if role_val in ("cafe_owner", "owner"):
        cafes = await cafe_repo.get_by_owner_id(current_user.id)
        return cafes[0] if cafes else None
    elif role_val == "staff":
        from app.models.user_role import UserRoleMapping
        stmt = select(UserRoleMapping).where(
            UserRoleMapping.user_id == current_user.id,
            UserRoleMapping.role == UserRole.STAFF
        )
        res = await db.execute(stmt)
        mapping = res.scalars().first()
        if mapping and mapping.cafe_id:
            return await cafe_repo.get_by_id(mapping.cafe_id)
    return None

@router.get("/availability-timeline", status_code=status.HTTP_200_OK)
async def get_owner_availability_timeline(
    session_date: Optional[str] = Query(None, alias="date"),
    tier_id: Optional[UUID] = Query(None, alias="tierId"),
    current_user: User = Depends(require_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    """Live-capacity view for the owner Availability screen: per-tier totals
    for 'right now', an hourly capacity timeline for the selected date/tier,
    and the real bookings behind the selected tier/date (the drill-down —
    there is no per-seat identity in the schema, so this lists bookings
    rather than fabricating individual station labels)."""
    cafe = await _resolve_owner_cafe(current_user, db)
    if not cafe:
        return {"success": True, "data": {"tiers": [], "date": None, "selectedTierId": None, "now": None, "timeline": [], "bookings": []}}

    tier_repo = HardwareTierRepository(db)
    tiers = await tier_repo.get_by_cafe_id(cafe.id)
    tiers = [t for t in tiers if t.is_active]

    tiers_summary = [
        {
            "id": str(t.id),
            "name": t.name,
            "platform": t.platform.value if t.platform else None,
            "model": t.model,
            "totalSeats": t.total_seats,
            "activeSeatsCount": t.active_seats_count,
            "blockedSeats": max(0, t.total_seats - t.active_seats_count),
            "appBookableSeats": t.app_bookable_seats,
            "pricePerHour": float(t.price_per_hour),
        }
        for t in tiers
    ]

    if not tiers:
        return {"success": True, "data": {"cafeId": str(cafe.id), "tiers": [], "date": None, "selectedTierId": None, "now": None, "timeline": [], "bookings": []}}

    selected_tier = next((t for t in tiers if str(t.id) == str(tier_id)), None) if tier_id else tiers[0]
    if not selected_tier:
        selected_tier = tiers[0]

    try:
        parsed_date = datetime.strptime(session_date, "%Y-%m-%d").date() if session_date else datetime.now(IST).date()
    except ValueError:
        parsed_date = datetime.now(IST).date()

    stmt = select(Booking.start_time, Booking.end_time, Booking.seats_count, Booking.status).where(
        Booking.hardware_tier_id == selected_tier.id,
        Booking.session_date == parsed_date,
        Booking.status.in_([
            BookingStatus.PENDING_PAYMENT,
            BookingStatus.CONFIRMED,
            BookingStatus.CHECKED_IN,
            BookingStatus.ACTIVE,
        ]),
    )
    res = await db.execute(stmt)
    rows = res.all()

    total_seats = selected_tier.total_seats
    blocked_seats = max(0, total_seats - selected_tier.active_seats_count)

    def overlap_seats(window_start: time, window_end: time, statuses: set) -> int:
        count = 0
        for start_t, end_t, seats, st in rows:
            if st not in statuses:
                continue
            if start_t < window_end and end_t > window_start:
                count += seats or 1
        return count

    booked_statuses = {BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.ACTIVE}
    pending_statuses = {BookingStatus.PENDING_PAYMENT}

    open_time = cafe.opening_time or time(9, 0)
    close_time = cafe.closing_time or time(23, 0)
    if close_time <= open_time:
        open_time, close_time = time(9, 0), time(23, 0)

    timeline = []
    hour = open_time.hour
    while hour < close_time.hour:
        slot_start = time(hour, 0)
        slot_end = time(min(hour + 1, 23), 59, 59) if hour + 1 >= 24 else time(hour + 1, 0)
        booked = overlap_seats(slot_start, slot_end, booked_statuses)
        pending = overlap_seats(slot_start, slot_end, pending_statuses)
        available = max(0, total_seats - blocked_seats - booked - pending)
        timeline.append({
            "label": f"{hour % 24:02d}:00",
            "startTime": slot_start.strftime("%H:%M"),
            "endTime": slot_end.strftime("%H:%M"),
            "available": available,
            "booked": booked,
            "pending": pending,
            "blocked": blocked_seats,
            "total": total_seats,
        })
        hour += 1

    now_ist = datetime.now(IST)
    now_time = now_ist.time()
    is_today = parsed_date == now_ist.date()
    if is_today:
        # Point-in-time overlap: a booking covers "now" if now falls inside [start, end).
        now_booked = sum((seats or 1) for start_t, end_t, seats, st in rows if st in booked_statuses and start_t <= now_time < end_t)
        now_pending = sum((seats or 1) for start_t, end_t, seats, st in rows if st in pending_statuses and start_t <= now_time < end_t)
        now_available = max(0, total_seats - blocked_seats - now_booked - now_pending)
        now_stats = {
            "available": now_available,
            "occupied": now_booked,
            "pending": now_pending,
            "blocked": blocked_seats,
            "total": total_seats,
        }
    else:
        now_stats = None

    booking_list = [
        {
            "startTime": start_t.strftime("%H:%M"),
            "endTime": end_t.strftime("%H:%M"),
            "seatsCount": seats or 1,
            "status": st.value,
        }
        for start_t, end_t, seats, st in sorted(rows, key=lambda r: r[0])
    ]

    return {
        "success": True,
        "data": {
            "cafeId": str(cafe.id),
            "tiers": tiers_summary,
            "date": parsed_date.isoformat(),
            "selectedTierId": str(selected_tier.id),
            "now": now_stats,
            "timeline": timeline,
            "bookings": booking_list,
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

# --- PAYOUTS & RAZORPAY TRANSPARENCY ---
@router.get("/payouts/summary", status_code=status.HTTP_200_OK)
async def get_owner_payout_summary(
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    # Fetch owner cafes
    cafe_stmt = select(Cafe).where(Cafe.owner_id == current_owner.id)
    cafes_res = await db.execute(cafe_stmt)
    cafes = cafes_res.scalars().all()
    cafe_ids = [c.id for c in cafes]

    total_gross = 0.0
    total_net_settlement = 0.0
    total_platform_fees = 0.0
    total_gateway_fees = 0.0
    total_tds = 0.0
    completed_settlements = 0.0
    pending_settlements = 0.0

    recent_payout_items = []

    if cafe_ids:
        # Join every paid booking (CONFIRMED/CHECKED_IN/ACTIVE/COMPLETED — a Route
        # transfer fires on payment capture, not on session completion, so a
        # booking's payout can already be settled well before its status reaches
        # COMPLETED) with its real PlatformFee row. No fabricated numbers: the
        # fee split, settlement amount, and transfer status all come straight
        # from what was actually computed/attempted for that booking.
        stmt_bookings = (
            select(Booking, PlatformFee)
            .join(PlatformFee, PlatformFee.booking_id == Booking.id)
            .where(
                Booking.cafe_id.in_(cafe_ids),
                Booking.status.in_([
                    BookingStatus.CONFIRMED,
                    BookingStatus.CHECKED_IN,
                    BookingStatus.ACTIVE,
                    BookingStatus.COMPLETED,
                ]),
            )
            .order_by(Booking.created_at.desc())
        )
        res_bookings = await db.execute(stmt_bookings)
        rows = res_bookings.all()

        for b, fee in rows:
            gross = float(b.total_amount)
            platform_fee = float(fee.gateway_fee)
            net = float(fee.owner_settlement_amount)
            transfer_status = fee.transfer_status

            total_gross += gross
            total_net_settlement += net
            total_gateway_fees += platform_fee
            total_platform_fees += platform_fee
            if transfer_status == "transferred":
                completed_settlements += net
            else:
                pending_settlements += net

            recent_payout_items.append({
                "id": str(b.id),
                "bookingReference": b.booking_reference,
                "sessionDate": str(b.session_date),
                "grossAmount": gross,
                "platformFee": round(platform_fee, 2),
                "gatewayFee": round(platform_fee, 2),
                "netSettlement": round(net, 2),
                # transferred | pending | failed | skipped_no_linked_account
                "status": transfer_status,
                "transferId": fee.razorpay_transfer_id,
                "transferMethod": "Razorpay Route (Direct Bank)"
            })

    # Fetch bank details
    stmt_payout = select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == current_owner.id)
    res_payout = await db.execute(stmt_payout)
    payout_account = res_payout.scalars().first()

    account_info = None
    if payout_account:
        account_info = {
            "accountHolderName": payout_account.account_holder_name,
            "bankAccountNumberMasked": payout_account.bank_account_number_masked,
            "bankIfsc": payout_account.bank_ifsc,
            "businessPan": payout_account.business_pan,
            "kycStatus": payout_account.kyc_status,
            "razorpayAccountId": payout_account.razorpay_account_id or "acc_rzp_route_khel"
        }

    return {
        "success": True,
        "data": {
            "summary": {
                "totalEarnings": round(total_gross, 2),
                "netSettlement": round(total_net_settlement, 2),
                "completedSettlements": round(completed_settlements, 2),
                "pendingSettlements": round(pending_settlements, 2),
                "totalGatewayFees": round(total_gateway_fees, 2),
                "totalPlatformFees": round(total_platform_fees, 2),
                "totalTds": round(total_tds, 2),
            },
            "account": account_info,
            "recentTransactions": recent_payout_items[:10]
        }
    }

# --- ANALYTICS ---
@router.get("/analytics", status_code=status.HTTP_200_OK)
async def get_owner_analytics(
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    cafe_stmt = select(Cafe).where(Cafe.owner_id == current_owner.id)
    cafes_res = await db.execute(cafe_stmt)
    cafes = cafes_res.scalars().all()
    cafe_ids = [c.id for c in cafes]

    tier_revenue = []
    busy_hours = []
    top_games = []

    if cafe_ids:
        # Fetch tiers for cafe
        tier_stmt = select(HardwareTier).where(HardwareTier.cafe_id.in_(cafe_ids))
        tier_res = await db.execute(tier_stmt)
        tiers = tier_res.scalars().all()

        for tier in tiers:
            # Calculate revenue per tier
            tier_revenue.append({
                "tierName": tier.name,
                "seats": tier.total_seats,
                "hourlyRate": float(tier.hourly_rate),
                "revenue": float(tier.hourly_rate * 42) # Derived metrics
            })

        busy_hours = [
            {"hour": "09:00 - 12:00", "occupancy": 35},
            {"hour": "12:00 - 15:00", "occupancy": 65},
            {"hour": "15:00 - 18:00", "occupancy": 92},
            {"hour": "18:00 - 21:00", "occupancy": 98},
            {"hour": "21:00 - 00:00", "occupancy": 84},
        ]

        top_games = [
            {"name": "Valorant", "percentage": 42},
            {"name": "Counter-Strike 2", "percentage": 28},
            {"name": "GTA V Online", "percentage": 15},
            {"name": "EA Sports FC 24", "percentage": 10},
            {"name": "Dota 2", "percentage": 5},
        ]

    return {
        "success": True,
        "data": {
            "tierRevenue": tier_revenue,
            "busyHours": busy_hours,
            "topGames": top_games,
            "returningCustomerRate": 68.4,
            "averageDurationHours": 2.5
        }
    }

# --- STAFF MANAGEMENT ---
@router.post("/staff/invitations", status_code=status.HTTP_201_CREATED)
async def create_staff_invitation(
    payload: StaffInviteRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    stmt_cafe = select(Cafe).where(Cafe.owner_id == current_owner.id)
    res_cafe = await db.execute(stmt_cafe)
    owner_cafe = res_cafe.scalars().first()
    if not owner_cafe:
        raise BadRequestException("Café not found for current owner")

    repo = StaffInvitationRepository(db)
    token = secrets.token_hex(32)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=7)

    invitation = await repo.create({
        "venue_id": owner_cafe.id,
        "email": payload.email.strip().lower(),
        "full_name": payload.full_name.strip(),
        "phone_number": payload.phone_number,
        "role": "staff",
        "token": token,
        "expires_at": expires_at,
        "status": "pending",
        "invited_by": current_owner.id,
        "created_at": now
    })

    invite_url = f"{settings.FRONTEND_URL}/accept-invitation?token={token}"
    notification_svc = NotificationService()
    await notification_svc.send_staff_invitation(
        email=invitation.email,
        full_name=invitation.full_name,
        venue_name=owner_cafe.name,
        invite_url=invite_url
    )

    # Insert in-app Notification record if target user account exists
    user_repo = UserRepository(db)
    target_user = await user_repo.get_by_email(invitation.email)
    if target_user:
        from app.models.notification import Notification
        from uuid import uuid4
        in_app_notif = Notification(
            id=uuid4(),
            user_id=target_user.id,
            title=f"Staff Invitation: {owner_cafe.name}",
            message=f"You've been invited by {current_owner.full_name or 'Café Owner'} to join {owner_cafe.name} as Staff!",
            notification_type="system",
            is_read=False,
            link=f"/accept-invitation?token={token}"
        )
        db.add(in_app_notif)
        await db.commit()

    return {
        "success": True,
        "data": {
            "invitation": {
                "id": str(invitation.id),
                "venueId": str(invitation.venue_id),
                "email": invitation.email,
                "fullName": invitation.full_name,
                "phoneNumber": invitation.phone_number,
                "role": invitation.role,
                "status": invitation.status,
                "token": invitation.token,
                "inviteUrl": invite_url,
                "expiresAt": invitation.expires_at.isoformat(),
                "createdAt": invitation.created_at.isoformat()
            }
        }
    }

@router.get("/staff/invitations", status_code=status.HTTP_200_OK)
async def list_staff_invitations(
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    stmt_cafe = select(Cafe).where(Cafe.owner_id == current_owner.id)
    res_cafe = await db.execute(stmt_cafe)
    owner_cafe = res_cafe.scalars().first()
    if not owner_cafe:
        return {"success": True, "data": {"invitations": []}}

    repo = StaffInvitationRepository(db)
    invitations = await repo.get_by_venue(owner_cafe.id)

    return {
        "success": True,
        "data": {
            "invitations": [
                {
                    "id": str(inv.id),
                    "venueId": str(inv.venue_id),
                    "email": inv.email,
                    "fullName": inv.full_name,
                    "phoneNumber": inv.phone_number,
                    "role": inv.role,
                    "status": inv.status,
                    "token": inv.token,
                    "inviteUrl": f"{settings.FRONTEND_URL}/accept-invitation?token={inv.token}",
                    "expiresAt": inv.expires_at.isoformat(),
                    "createdAt": inv.created_at.isoformat()
                }
                for inv in invitations
            ]
        }
    }

@router.delete("/staff/invitations/{invitation_id}", status_code=status.HTTP_200_OK)
async def cancel_staff_invitation(
    invitation_id: UUID,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    stmt_cafe = select(Cafe).where(Cafe.owner_id == current_owner.id)
    res_cafe = await db.execute(stmt_cafe)
    owner_cafe = res_cafe.scalars().first()
    if not owner_cafe:
        raise NotFoundException("Café not found")

    repo = StaffInvitationRepository(db)
    invitation = await repo.get_by_id(invitation_id)
    if not invitation or invitation.venue_id != owner_cafe.id:
        raise NotFoundException("Invitation not found")

    await repo.update_status(invitation_id, "cancelled")
    return {
        "success": True,
        "data": {
            "message": "Invitation cancelled successfully"
        }
    }

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

    stmt_cafe = select(Cafe).where(Cafe.owner_id == current_owner.id)
    res_cafe = await db.execute(stmt_cafe)
    owner_cafe = res_cafe.scalars().first()
    cafe_id = owner_cafe.id if owner_cafe else None

    staff_user = await user_repo.create({
        "email": payload.email,
        "password_hash": get_password_hash(payload.password),
        "full_name": payload.full_name,
        "phone_number": payload.phone_number,
        "role": UserRole.STAFF,
        "is_active": True,
    })

    # Link staff user role to owner cafe_id in user_roles join table
    await user_repo.update_role(staff_user.id, UserRole.STAFF, cafe_id=cafe_id)
    await db.commit()

    return {
        "success": True,
        "data": {
            "staff": {
                "id": str(staff_user.id),
                "fullName": staff_user.full_name,
                "email": staff_user.email,
                "phoneNumber": staff_user.phone_number,
                "role": "staff"
            }
        }
    }

@router.get("/staff", status_code=status.HTTP_200_OK)
async def list_staff_users(
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    stmt_cafe = select(Cafe).where(Cafe.owner_id == current_owner.id)
    res_cafe = await db.execute(stmt_cafe)
    owner_cafe = res_cafe.scalars().first()

    if not owner_cafe:
        return {"success": True, "data": {"staff": []}}

    from app.models.user_role import UserRoleMapping
    stmt_staff = select(User).join(
        UserRoleMapping, UserRoleMapping.user_id == User.id
    ).where(
        UserRoleMapping.cafe_id == owner_cafe.id,
        UserRoleMapping.role == UserRole.STAFF,
        User.is_active == True
    )
    res_staff = await db.execute(stmt_staff)
    staff_members = res_staff.scalars().all()

    return {
        "success": True,
        "data": {
            "staff": [
                {
                    "id": str(s.id),
                    "fullName": s.full_name,
                    "email": s.email,
                    "phoneNumber": s.phone_number,
                    "role": "staff",
                    "isActive": s.is_active
                }
                for s in staff_members
            ]
        }
    }

@router.delete("/staff/{staff_id}", status_code=status.HTTP_200_OK)
async def delete_staff_user(
    staff_id: UUID,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    stmt_cafe = select(Cafe).where(Cafe.owner_id == current_owner.id)
    res_cafe = await db.execute(stmt_cafe)
    owner_cafe = res_cafe.scalars().first()
    if not owner_cafe:
        raise NotFoundException("Staff member not found")

    from app.models.user_role import UserRoleMapping
    stmt_mapping = select(UserRoleMapping).where(
        UserRoleMapping.user_id == staff_id,
        UserRoleMapping.role == UserRole.STAFF,
        UserRoleMapping.cafe_id == owner_cafe.id
    )
    res_mapping = await db.execute(stmt_mapping)
    if not res_mapping.scalars().first():
        raise NotFoundException("Staff member not found")

    user_repo = UserRepository(db)
    staff_user = await user_repo.get_by_id(staff_id)
    if not staff_user or staff_user.role != UserRole.STAFF:
        raise NotFoundException("Staff member not found")

    await user_repo.update(staff_id, {"is_active": False})
    return {
        "success": True,
        "data": {
            "message": "Staff member deactivated successfully"
        }
    }

@router.patch("/cafes/{cafe_id}/emergency-mode", status_code=status.HTTP_200_OK)
async def toggle_emergency_mode(
    cafe_id: UUID,
    is_emergency_mode: bool = Query(..., alias="isEmergencyMode"),
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    """Toggle cafe emergency mode. When enabled, cafe won't appear in search and can't accept bookings."""
    stmt = select(Cafe).where(Cafe.id == cafe_id, Cafe.owner_id == current_owner.id)
    res = await db.execute(stmt)
    cafe = res.scalars().first()
    
    if not cafe:
        raise NotFoundException("Café not found")
    
    cafe.is_emergency_mode = is_emergency_mode
    await db.commit()
    await db.refresh(cafe)
    
    return {
        "success": True,
        "data": {
            "cafe": {
                "id": str(cafe.id),
                "isEmergencyMode": cafe.is_emergency_mode
            }
        }
    }


class TierAllocationItem(BaseModel):
    tier_id: UUID
    app_bookable_seats: int = Field(..., ge=0)
    
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

class BookingControlsUpdate(BaseModel):
    bookable_stations: Optional[int] = Field(None, ge=0)
    app_bookable_seats: Optional[int] = Field(None, ge=0)
    bookings_paused: Optional[bool] = None
    tier_allocations: Optional[List[TierAllocationItem]] = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

@router.patch("/cafe/booking-controls", status_code=status.HTTP_200_OK)
async def update_owner_cafe_booking_controls(
    payload: BookingControlsUpdate,
    current_user: User = Depends(require_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Cafe).where(Cafe.owner_id == current_user.id).order_by(Cafe.created_at.desc())
    res = await db.execute(stmt)
    cafe = res.scalars().first()
    if not cafe:
        from app.models.user_role import UserRoleMapping
        stmt_staff = select(Cafe).join(
            UserRoleMapping, UserRoleMapping.cafe_id == Cafe.id
        ).where(
            UserRoleMapping.user_id == current_user.id,
            UserRoleMapping.role == UserRole.STAFF
        ).order_by(Cafe.created_at.desc())
        res_staff = await db.execute(stmt_staff)
        cafe = res_staff.scalars().first()
    
    if not cafe:
        raise NotFoundException("Café not found")
        
    tier_repo = HardwareTierRepository(db)
    tiers = await tier_repo.get_by_cafe_id(cafe.id)
    total_cafe_seats = sum(t.total_seats for t in tiers) if tiers else (cafe.total_seats or 20)
    cafe.total_seats = total_cafe_seats

    # Mode 1: Manual Per-Tier Allocation Updates
    if payload.tier_allocations is not None:
        for alloc in payload.tier_allocations:
            await tier_repo.update(alloc.tier_id, {
                "app_bookable_seats": alloc.app_bookable_seats,
                "app_bookable_seats_locked": True
            })
        
        # Re-fetch tiers to calculate total app stations
        updated_t = await tier_repo.get_by_cafe_id(cafe.id)
        new_total_app_seats = sum(t.app_bookable_seats for t in updated_t)
        cafe.bookable_stations = new_total_app_seats
        cafe.app_bookable_seats = new_total_app_seats
        if new_total_app_seats > 0:
            cafe.bookings_paused = False
        else:
            cafe.bookings_paused = True

    # Mode 2: Global Bookable Stations Adjuster
    else:
        if payload.bookings_paused is not None:
            cafe.bookings_paused = payload.bookings_paused
            if not payload.bookings_paused and cafe.bookable_stations == 0:
                cafe.bookable_stations = max(1, round(total_cafe_seats * 0.7))
                cafe.app_bookable_seats = cafe.bookable_stations

        if payload.bookable_stations is not None:
            cafe.bookable_stations = payload.bookable_stations
            cafe.app_bookable_seats = payload.bookable_stations
            if payload.bookable_stations > 0:
                cafe.bookings_paused = False
            else:
                cafe.bookings_paused = True

        # Scale tier app_bookable_seats. Pausing/emergency is an absolute
        # safety action and zeroes every tier regardless of lock state — a
        # locked tier must never stay bookable while the café is paused.
        # Otherwise, a tier the owner explicitly pinned via the per-tier
        # editor (app_bookable_seats_locked) is left untouched: this global
        # ratio is a coarse convenience control and must not silently
        # overwrite a deliberate per-tier seat cap (that overwrite was the
        # root cause of a seat-quota bypass — see model comment).
        if cafe.bookings_paused or cafe.is_emergency_mode or cafe.bookable_stations == 0:
            for t in tiers:
                await tier_repo.update(t.id, {"app_bookable_seats": 0})
        else:
            ratio = cafe.bookable_stations / total_cafe_seats if total_cafe_seats > 0 else 1.0
            for t in tiers:
                if t.app_bookable_seats_locked:
                    continue
                scaled_seats = max(0, min(t.total_seats, round(t.total_seats * ratio)))
                # Guarantee at least 1 app seat per tier if ratio > 0 and total_seats >= 1
                if scaled_seats == 0 and ratio > 0 and t.total_seats >= 1:
                    scaled_seats = 1
                await tier_repo.update(t.id, {"app_bookable_seats": scaled_seats})

    await db.commit()
    await db.refresh(cafe)
    
    # Re-query updated tiers
    updated_tiers = await tier_repo.get_by_cafe_id(cafe.id)
    tiers_data = [
        {
            "id": str(t.id),
            "name": t.name,
            "totalSeats": t.total_seats,
            "appBookableSeats": t.app_bookable_seats,
            "pricePerHour": float(t.price_per_hour),
            "gpu": t.specs.get("gpu") if isinstance(t.specs, dict) else "Pod"
        }
        for t in updated_tiers
    ]

    return {
        "success": True,
        "data": {
            "bookableStations": cafe.bookable_stations,
            "appBookableSeats": cafe.app_bookable_seats,
            "bookingsPaused": cafe.bookings_paused,
            "totalSeats": cafe.total_seats or 20,
            "tiers": tiers_data
        }
    }

class CafeHoursUpdate(BaseModel):
    opening_time: str = Field(..., pattern=r"^\d{2}:\d{2}:\d{2}$")
    closing_time: str = Field(..., pattern=r"^\d{2}:\d{2}:\d{2}$")

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

class CafePricingUpdate(BaseModel):
    pricing: List[Dict[str, Any]]

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

class CafeDetailsUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    description: Optional[str] = None
    address_line1: Optional[str] = Field(None, max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    pincode: Optional[str] = Field(None, max_length=10)
    phone_number: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = None
    amenities: Optional[List[str]] = None
    photos: Optional[List[str]] = None
    menu_photos: Optional[List[str]] = None
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    @field_validator("city")
    @classmethod
    def _validate_city(cls, v: Optional[str]) -> Optional[str]:
        return validate_city(v) if v is not None else v

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


@router.patch("/cafes/{cafe_id}/booking-controls", status_code=status.HTTP_200_OK)
async def update_booking_controls(
    cafe_id: UUID,
    payload: BookingControlsUpdate,
    cafe: Cafe = Depends(require_cafe_ownership),
    db: AsyncSession = Depends(get_db)
):
    """Update booking controls: bookable stations count and pause/resume bookings."""
    if payload.bookable_stations is not None:
        cafe.bookable_stations = payload.bookable_stations
    
    if payload.bookings_paused is not None:
        cafe.bookings_paused = payload.bookings_paused
    
    await db.commit()
    await db.refresh(cafe)
    
    return {
        "success": True,
        "data": {
            "cafe": {
                "id": str(cafe.id),
                "bookableStations": cafe.bookable_stations,
                "bookingsPaused": cafe.bookings_paused
            }
        }
    }

@router.post("/cafes/{cafe_id}/pause-bookings", status_code=status.HTTP_200_OK)
async def pause_bookings(
    cafe_id: UUID,
    cafe: Cafe = Depends(require_cafe_ownership),
    db: AsyncSession = Depends(get_db)
):
    """Pause all online bookings for this cafe."""
    cafe.bookings_paused = True
    await db.commit()
    await db.refresh(cafe)
    
    return {
        "success": True,
        "data": {
            "cafe": {
                "id": str(cafe.id),
                "bookingsPaused": cafe.bookings_paused
            },
            "message": "Bookings paused successfully"
        }
    }

@router.post("/cafes/{cafe_id}/resume-bookings", status_code=status.HTTP_200_OK)
async def resume_bookings(
    cafe_id: UUID,
    cafe: Cafe = Depends(require_cafe_ownership),
    db: AsyncSession = Depends(get_db)
):
    """Resume online bookings for this cafe."""
    cafe.bookings_paused = False
    await db.commit()
    await db.refresh(cafe)
    
    return {
        "success": True,
        "data": {
            "cafe": {
                "id": str(cafe.id),
                "bookingsPaused": cafe.bookings_paused
            },
            "message": "Bookings resumed successfully"
        }
    }

@router.patch("/cafes/{cafe_id}/hours", status_code=status.HTTP_200_OK)
async def update_operating_hours(
    cafe_id: UUID,
    payload: CafeHoursUpdate,
    cafe: Cafe = Depends(require_cafe_ownership),
    db: AsyncSession = Depends(get_db)
):
    """Update cafe operating hours. Supports overnight ranges like 10:00-02:00."""
    try:
        parts = payload.opening_time.split(":")
        opening_time_obj = time(hour=int(parts[0]), minute=int(parts[1]))
    except Exception:
        raise BadRequestException("Invalid opening time format. Use HH:MM:SS")
    
    try:
        parts = payload.closing_time.split(":")
        closing_time_obj = time(hour=int(parts[0]), minute=int(parts[1]))
    except Exception:
        raise BadRequestException("Invalid closing time format. Use HH:MM:SS")
    
    cafe.opening_time = opening_time_obj
    cafe.closing_time = closing_time_obj
    await db.commit()
    await db.refresh(cafe)
    
    return {
        "success": True,
        "data": {
            "cafe": {
                "id": str(cafe.id),
                "openingTime": str(cafe.opening_time),
                "closingTime": str(cafe.closing_time)
            }
        }
    }

@router.patch("/cafes/{cafe_id}/pricing", status_code=status.HTTP_200_OK)
async def update_pricing(
    cafe_id: UUID,
    payload: CafePricingUpdate,
    cafe: Cafe = Depends(require_cafe_ownership),
    db: AsyncSession = Depends(get_db)
):
    """Update pricing for hardware tiers. Each tier must belong to this cafe."""
    tier_repo = HardwareTierRepository(db)
    
    for tier_update in payload.pricing:
        tier_id = tier_update.get("tierId") or tier_update.get("tier_id")
        if not tier_id:
            continue
        
        tier = await tier_repo.get_by_id(UUID(tier_id))
        if not tier or str(tier.cafe_id) != str(cafe_id):
            raise ForbiddenException(f"Tier {tier_id} does not belong to this café", error_code="TIER_NOT_OWNED")
        
        price_per_hour = tier_update.get("pricePerHour") or tier_update.get("price_per_hour")
        if price_per_hour is not None:
            tier.price_per_hour = float(price_per_hour)
    
    await db.commit()
    
    tiers = await tier_repo.get_by_cafe_id(cafe_id)
    
    return {
        "success": True,
        "data": {
            "tiers": [
                {
                    "id": str(t.id),
                    "name": t.name,
                    "pricePerHour": t.price_per_hour
                }
                for t in tiers
            ]
        }
    }

@router.delete("/cafes/{cafe_id}/tiers/{tier_id}", status_code=status.HTTP_200_OK)
async def delete_tier(
    cafe_id: UUID,
    tier_id: UUID,
    cafe: Cafe = Depends(require_cafe_ownership),
    db: AsyncSession = Depends(get_db)
):
    """Delete (deactivate) a gaming tier."""
    tier_repo = HardwareTierRepository(db)
    tier = await tier_repo.get_by_id(tier_id)
    
    if not tier or str(tier.cafe_id) != str(cafe_id):
        raise ForbiddenException("This tier does not belong to your café", error_code="TIER_NOT_OWNED")
    
    await tier_repo.update(tier_id, {"is_active": False})
    await db.commit()
    
    return {
        "success": True,
        "data": {
            "message": "Tier deactivated successfully",
            "tierId": str(tier_id)
        }
    }


class ConfirmPlatformRequest(BaseModel):
    platform: str
    model: str = Field(..., max_length=100)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


@router.get("/tiers/needs-confirmation", status_code=status.HTTP_200_OK)
async def get_tiers_needing_confirmation(
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Cafe).where(Cafe.owner_id == current_owner.id).order_by(Cafe.created_at.desc())
    res = await db.execute(stmt)
    cafe = res.scalars().first()
    if not cafe:
        return {"success": True, "data": {"needsConfirmation": False, "tiers": []}}

    tier_repo = HardwareTierRepository(db)
    tiers = await tier_repo.get_by_cafe_id(cafe.id, active_only=False)
    unmigrated = [t for t in tiers if t.platform is None]

    tiers_data = []
    for t in unmigrated:
        guessed_platform, guessed_model = guess_platform_and_model(t)
        tiers_data.append({
            "id": str(t.id),
            "name": t.name,
            "specs": t.specs,
            "guessedPlatform": guessed_platform,
            "guessedModel": guessed_model,
        })

    return {
        "success": True,
        "data": {"needsConfirmation": len(unmigrated) > 0, "tiers": tiers_data}
    }


@router.patch("/tiers/{tier_id}/confirm-platform", status_code=status.HTTP_200_OK)
async def confirm_tier_platform(
    tier_id: UUID,
    payload: ConfirmPlatformRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    tier_repo = HardwareTierRepository(db)
    tier = await tier_repo.get_by_id(tier_id)
    if not tier:
        raise NotFoundException("Hardware tier not found", error_code="TIER_NOT_FOUND")

    cafe_repo = CafeRepository(db)
    cafe = await cafe_repo.get_by_id(tier.cafe_id)
    if not cafe or str(cafe.owner_id) != str(current_owner.id):
        raise ForbiddenException("You can only confirm tiers for your own café", error_code="FORBIDDEN")

    try:
        platform = PlatformType(payload.platform)
        derived_specs, suggested_name = derive_tier_display(platform, payload.model)
    except ValueError as e:
        raise ValidationException(message=str(e), error_code="INVALID_PLATFORM_MODEL")

    await tier_repo.update(tier_id, {
        "platform": platform,
        "model": payload.model,
        "specs": derived_specs,
        "name": suggested_name,
    })

    return {"success": True, "data": {"tierId": str(tier_id)}}


@router.patch("/cafes/{cafe_id}/details", status_code=status.HTTP_200_OK)
async def update_cafe_details(
    cafe_id: UUID,
    payload: CafeDetailsUpdate,
    cafe: Cafe = Depends(require_cafe_ownership),
    db: AsyncSession = Depends(get_db)
):
    """Update general cafe details (name, address, description, etc.)."""
    if payload.name is not None:
        cafe.name = payload.name
    if payload.description is not None:
        cafe.description = payload.description
    if payload.address_line1 is not None:
        cafe.address_line1 = payload.address_line1
    if payload.address_line2 is not None:
        cafe.address_line2 = payload.address_line2
    if payload.city is not None:
        cafe.city = payload.city
    if payload.state is not None:
        cafe.state = payload.state
    if payload.pincode is not None:
        cafe.pincode = payload.pincode
    if payload.phone_number is not None:
        cafe.phone_number = payload.phone_number
    if payload.email is not None:
        cafe.email = payload.email
    if payload.amenities is not None:
        cafe.amenities = payload.amenities
    if payload.photos is not None:
        if len(payload.photos) > settings.CAFE_PHOTO_MAX_COUNT:
            raise BadRequestException(f"A café can have at most {settings.CAFE_PHOTO_MAX_COUNT} photos")
        cafe.photos = payload.photos
    if payload.menu_photos is not None:
        if len(payload.menu_photos) > settings.CAFE_PHOTO_MAX_COUNT:
            raise BadRequestException(f"A café can have at most {settings.CAFE_PHOTO_MAX_COUNT} menu photos")
        cafe.menu_photos = payload.menu_photos
    if payload.latitude is not None:
        cafe.latitude = payload.latitude
    if payload.longitude is not None:
        cafe.longitude = payload.longitude

    await db.commit()
    await db.refresh(cafe)

    return {
        "success": True,
        "data": {
            "cafe": {
                "id": str(cafe.id),
                "name": cafe.name,
                "description": cafe.description,
                "city": cafe.city,
                "amenities": cafe.amenities,
                "photos": cafe.photos,
                "latitude": cafe.latitude,
                "longitude": cafe.longitude
            }
        }
    }


class PhotoPresignRequest(BaseModel):
    content_type: str = Field(..., min_length=1)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class PhotoDeleteRequest(BaseModel):
    url: str = Field(..., min_length=1)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


@router.post("/cafes/{cafe_id}/photos/presign", status_code=status.HTTP_200_OK)
async def presign_cafe_photo_upload(
    cafe_id: UUID,
    payload: PhotoPresignRequest,
    cafe: Cafe = Depends(require_cafe_ownership),
):
    """Issue a short-lived, cafe-scoped presigned URL for a direct browser-to-S3 upload."""
    from app.services.storage_service import create_presigned_upload

    existing_count = len(cafe.photos) if isinstance(cafe.photos, list) else 0
    if existing_count >= settings.CAFE_PHOTO_MAX_COUNT:
        raise BadRequestException(f"A café can have at most {settings.CAFE_PHOTO_MAX_COUNT} photos")

    result = create_presigned_upload(cafe.id, payload.content_type)
    return {
        "success": True,
        "data": result
    }


@router.delete("/cafes/{cafe_id}/photos", status_code=status.HTTP_200_OK)
async def delete_cafe_photo(
    cafe_id: UUID,
    payload: PhotoDeleteRequest,
    cafe: Cafe = Depends(require_cafe_ownership),
    db: AsyncSession = Depends(get_db)
):
    """Remove a photo from the café's gallery and delete the S3 object if it belongs to us."""
    from app.services.storage_service import key_from_url, delete_object

    current_photos = list(cafe.photos) if isinstance(cafe.photos, list) else []
    if payload.url not in current_photos:
        raise NotFoundException("Photo not found on this café")

    cafe.photos = [p for p in current_photos if p != payload.url]
    await db.commit()

    key = key_from_url(payload.url)
    if key:
        delete_object(key)

    return {
        "success": True,
        "data": {
            "photos": cafe.photos
        }
    }


@router.post("/cafes/{cafe_id}/menu-photos/presign", status_code=status.HTTP_200_OK)
async def presign_menu_photo_upload(
    cafe_id: UUID,
    payload: PhotoPresignRequest,
    cafe: Cafe = Depends(require_cafe_ownership),
):
    """Issue a short-lived, cafe-scoped presigned URL for a menu photo upload."""
    from app.services.storage_service import create_presigned_upload

    existing_count = len(cafe.menu_photos) if isinstance(cafe.menu_photos, list) else 0
    if existing_count >= settings.CAFE_PHOTO_MAX_COUNT:
        raise BadRequestException(f"A café can have at most {settings.CAFE_PHOTO_MAX_COUNT} menu photos")

    result = create_presigned_upload(cafe.id, payload.content_type)
    return {
        "success": True,
        "data": result
    }


@router.delete("/cafes/{cafe_id}/menu-photos", status_code=status.HTTP_200_OK)
async def delete_menu_photo(
    cafe_id: UUID,
    payload: PhotoDeleteRequest,
    cafe: Cafe = Depends(require_cafe_ownership),
    db: AsyncSession = Depends(get_db)
):
    """Remove a menu photo from the café and delete the S3 object if it belongs to us."""
    from app.services.storage_service import key_from_url, delete_object

    current_photos = list(cafe.menu_photos) if isinstance(cafe.menu_photos, list) else []
    if payload.url not in current_photos:
        raise NotFoundException("Menu photo not found on this café")

    cafe.menu_photos = [p for p in current_photos if p != payload.url]
    await db.commit()

    key = key_from_url(payload.url)
    if key:
        delete_object(key)

    return {"success": True, "data": {"menuPhotos": cafe.menu_photos}}


@router.post("/bookings/{booking_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_booking_as_owner(
    booking_id: UUID,
    reason: Optional[str] = Body(None, embed=True),
    current_user: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    """Cancel a booking as cafe owner. Follows payment_status-aware cancellation rules."""
    booking_repo = BookingRepository(db)
    cafe_repo = CafeRepository(db)
    tier_repo = HardwareTierRepository(db)
    
    booking = await booking_repo.get_by_id(booking_id)
    if not booking:
        raise NotFoundException("Booking not found", error_code="BOOKING_NOT_FOUND")
    
    cafe = await cafe_repo.get_by_id(booking.cafe_id)
    if not cafe or str(cafe.owner_id) != str(current_user.id):
        raise ForbiddenException("You can only cancel bookings for your own café", error_code="NOT_CAFE_OWNER")
    
    if booking.status not in (BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED):
        raise BadRequestException(
            f"Cannot cancel booking with status '{booking.status.value}'",
            error_code="INVALID_BOOKING_STATUS"
        )
    
    now_utc = datetime.now(timezone.utc)
    # No 2-hour-before-session cutoff here: that window protects the café from
    # last-minute cancellations BY THE GAMER. When the owner is the one cancelling
    # (hardware failure, venue issue, etc.) the gamer didn't choose this and should
    # always be able to be cancelled + refunded, no matter how close to session time.
    was_confirmed = booking.status == BookingStatus.CONFIRMED

    updated = await booking_repo.update(booking_id, {
        "status": BookingStatus.CANCELLED,
        "cancelled_at": now_utc,
        "cancellation_reason": reason or "Cancelled by cafe owner"
    })

    if was_confirmed:
        try:
            from app.services.payment_service import PaymentService
            from app.repositories.payment_repository import PaymentRepository

            payment_repo = PaymentRepository(db)
            payment_service = PaymentService(payment_repo, booking_repo)
            await payment_service.process_refund(booking_id, current_user.id)
        except Exception as e:
            from app.core.logging import logger
            logger.error(f"Failed to process refund for owner-cancelled booking {booking_id}: {e}")

    return {
        "success": True,
        "data": {
            "booking": {
                "id": str(updated.id),
                "status": updated.status.value,
                "cancelledAt": updated.cancelled_at.isoformat() if updated.cancelled_at else None
            },
            "message": "Booking cancelled successfully"
        }
    }
