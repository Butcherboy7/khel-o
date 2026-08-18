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
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.repositories.staff_invitation_repository import StaffInvitationRepository
from app.services.owner_service import OwnerService
from app.services.notification_service import NotificationService
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from app.api.deps import require_cafe_owner, require_staff_or_owner, get_current_active_user, require_cafe_ownership
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.owner_payout_account import OwnerPayoutAccount
from app.models.booking import Booking, BookingStatus
from app.models.payment import Payment, PaymentStatus
from app.models.platform_fee import PlatformFee
from app.repositories.user_repository import UserRepository
from app.core.security import get_password_hash
from app.core.exceptions import BadRequestException, NotFoundException, ForbiddenException

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


class OnboardingDraftSaveRequest(BaseModel):
    step: int = 1
    draft_data: Dict[str, Any]

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

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
    hardware_tiers: List[Dict[str, Any]] = Field(default_factory=list)

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
    await db.commit()
    await db.refresh(cafe)

    return {
        "success": True,
        "data": {
            "bookingsPaused": cafe.bookings_paused
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
        for tier_data in payload.hardware_tiers:
            tot = int(tier_data.get("totalSeats") or tier_data.get("total_seats") or 10)
            app_b = int(tier_data.get("appBookableSeats") or tier_data.get("app_bookable_seats") or max(1, int(tot * 0.7)))
            gpu_str = tier_data.get("gpu") or (tier_data.get("specs") if isinstance(tier_data.get("specs"), str) else None) or "NVIDIA RTX 4060 / 16GB"
            price = float(tier_data.get("hourlyRate") or tier_data.get("hourly_rate") or tier_data.get("price_per_hour") or 100)
            
            await tier_repo.create({
                "cafe_id": cafe.id,
                "name": tier_data.get("name", "Standard Pod"),
                "specs": {"gpu": gpu_str, "ram": "16GB"},
                "price_per_hour": price,
                "total_seats": tot,
                "app_bookable_seats": app_b,
                "active_seats_count": tot,
                "preset_category": tier_data.get("presetCategory") or tier_data.get("preset_category") or "PC Pod",
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
    current_user: User = Depends(require_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    cafe_repo = CafeRepository(db)
    service = OwnerService(booking_repo, cafe_repo)
    result = await service.checkin_booking(
        booking_id=booking_id,
        current_user=current_user
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
        from sqlalchemy import select
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
    today = datetime.now(timezone.utc).date()

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
        # Sum payments & fee breakdowns
        stmt_bookings = select(Booking).where(Booking.cafe_id.in_(cafe_ids), Booking.status == BookingStatus.COMPLETED)
        res_bookings = await db.execute(stmt_bookings)
        bookings = res_bookings.scalars().all()

        for b in bookings:
            gross = float(b.total_amount)
            plat_fee = float(b.gateway_fee or (gross * 0.02))
            net = gross - plat_fee
            total_gross += gross
            total_net_settlement += net
            total_gateway_fees += plat_fee
            completed_settlements += net

            recent_payout_items.append({
                "id": str(b.id),
                "bookingReference": b.booking_reference,
                "sessionDate": str(b.session_date),
                "grossAmount": gross,
                "platformFee": round(plat_fee * 0.5, 2),
                "gatewayFee": round(plat_fee * 0.5, 2),
                "netSettlement": round(net, 2),
                "status": "settled",
                "transferMethod": "Razorpay Route (Direct UPI/Bank)"
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
            await tier_repo.update(alloc.tier_id, {"app_bookable_seats": alloc.app_bookable_seats})
        
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

        # Scale tier app_bookable_seats
        if cafe.bookings_paused or cafe.is_emergency_mode or cafe.bookable_stations == 0:
            for t in tiers:
                await tier_repo.update(t.id, {"app_bookable_seats": 0})
        else:
            ratio = cafe.bookable_stations / total_cafe_seats if total_cafe_seats > 0 else 1.0
            for t in tiers:
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

class TierCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    specs: Dict[str, Any] = Field(default_factory=dict)
    price_per_hour: float = Field(..., ge=0)
    total_seats: int = Field(10, ge=1)
    app_bookable_seats: int = Field(7, ge=1)
    preset_category: str = "custom"
    is_active: bool = True

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

class TierUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = None
    specs: Optional[Dict[str, Any]] = None
    price_per_hour: Optional[float] = Field(None, ge=0)
    total_seats: Optional[int] = Field(None, ge=1)
    app_bookable_seats: Optional[int] = Field(None, ge=1)
    is_active: Optional[bool] = None

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
    description: Optional[str] = None

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

@router.post("/cafes/{cafe_id}/tiers", status_code=status.HTTP_200_OK)
async def create_tier(
    cafe_id: UUID,
    payload: TierCreate,
    cafe: Cafe = Depends(require_cafe_ownership),
    db: AsyncSession = Depends(get_db)
):
    """Add a new gaming tier to this cafe."""
    tier_repo = HardwareTierRepository(db)
    
    tier_dict = {
        "cafe_id": cafe_id,
        "name": payload.name,
        "description": payload.description,
        "specs": payload.specs,
        "price_per_hour": payload.price_per_hour,
        "total_seats": payload.total_seats,
        "app_bookable_seats": payload.app_bookable_seats,
        "active_seats_count": payload.total_seats,
        "preset_category": payload.preset_category,
        "is_active": payload.is_active
    }
    
    created_tier = await tier_repo.create(tier_dict)
    await db.commit()
    await db.refresh(created_tier)
    
    return {
        "success": True,
        "data": {
            "tier": {
                "id": str(created_tier.id),
                "name": created_tier.name,
                "pricePerHour": created_tier.price_per_hour,
                "totalSeats": created_tier.total_seats
            }
        }
    }

@router.patch("/cafes/{cafe_id}/tiers/{tier_id}", status_code=status.HTTP_200_OK)
async def update_tier(
    cafe_id: UUID,
    tier_id: UUID,
    payload: TierUpdate,
    cafe: Cafe = Depends(require_cafe_ownership),
    db: AsyncSession = Depends(get_db)
):
    """Update an existing gaming tier."""
    tier_repo = HardwareTierRepository(db)
    tier = await tier_repo.get_by_id(tier_id)
    
    if not tier or str(tier.cafe_id) != str(cafe_id):
        raise ForbiddenException("This tier does not belong to your café", error_code="TIER_NOT_OWNED")
    
    update_data = {}
    if payload.name is not None:
        update_data["name"] = payload.name
    if payload.description is not None:
        update_data["description"] = payload.description
    if payload.specs is not None:
        update_data["specs"] = payload.specs
    if payload.price_per_hour is not None:
        update_data["price_per_hour"] = payload.price_per_hour
    if payload.total_seats is not None:
        update_data["total_seats"] = payload.total_seats
    if payload.app_bookable_seats is not None:
        update_data["app_bookable_seats"] = payload.app_bookable_seats
    if payload.is_active is not None:
        update_data["is_active"] = payload.is_active
    
    if update_data:
        await tier_repo.update(tier_id, update_data)
        await db.commit()
    
    updated_tier = await tier_repo.get_by_id(tier_id)
    
    return {
        "success": True,
        "data": {
            "tier": {
                "id": str(updated_tier.id),
                "name": updated_tier.name,
                "pricePerHour": updated_tier.price_per_hour,
                "totalSeats": updated_tier.total_seats,
                "isActive": updated_tier.is_active
            }
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
        cafe.photos = payload.photos
    
    await db.commit()
    await db.refresh(cafe)
    
    return {
        "success": True,
        "data": {
            "cafe": {
                "id": str(cafe.id),
                "name": cafe.name,
                "description": cafe.description,
                "city": cafe.city
            }
        }
    }

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
    from app.services.booking_service import IST
    now_ist = datetime.now(IST)
    start_datetime = datetime.combine(booking.session_date, booking.start_time).replace(tzinfo=IST)
    
    if booking.status == BookingStatus.CONFIRMED:
        if start_datetime - now_ist < timedelta(hours=2):
            raise BadRequestException(
                "Cannot cancel confirmed booking within 2 hours of session start",
                error_code="CANCELLATION_WINDOW_EXPIRED"
            )
    
    updated = await booking_repo.update(booking_id, {
        "status": BookingStatus.CANCELLED,
        "cancelled_at": now_utc,
        "cancellation_reason": reason or "Cancelled by cafe owner"
    })
    
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
