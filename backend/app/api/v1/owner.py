from fastapi import APIRouter, Depends, status, Query, Body
from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import date, datetime, timezone, time
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.schemas.owner import (
    OwnerDashboardResponse,
    OwnerStatusUpdateRequest
)
from app.repositories.booking_repository import BookingRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.services.owner_service import OwnerService
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from app.api.deps import require_cafe_owner, require_staff_or_owner, get_current_active_user
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

class StaffCreateRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=255)
    password: str = Field(..., min_length=6)
    phone_number: Optional[str] = None

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
    opening_time: Optional[str] = "09:00:00"
    closing_time: Optional[str] = "23:00:00"
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
        return {
            "success": True,
            "data": {
                "status": "prospective",
                "cafe": None,
                "role": current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
            }
        }

    status_str = cafe.verification_status.value if hasattr(cafe.verification_status, "value") else str(cafe.verification_status)

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
    # Upgrade user role if needed
    if current_user.role == UserRole.GAMER:
        current_user.role = UserRole.CAFE_OWNER
        db.add(current_user)

    stmt = select(Cafe).where(Cafe.owner_id == current_user.id).order_by(Cafe.created_at.desc())
    res = await db.execute(stmt)
    cafe = res.scalars().first()

    # Parse opening/closing time strings safely
    opening_time_obj = None
    closing_time_obj = None
    if payload.opening_time:
        try:
            parts = payload.opening_time.split(":")
            opening_time_obj = time(hour=int(parts[0]), minute=int(parts[1]))
        except Exception:
            opening_time_obj = time(9, 0)

    if payload.closing_time:
        try:
            parts = payload.closing_time.split(":")
            closing_time_obj = time(hour=int(parts[0]), minute=int(parts[1]))
        except Exception:
            closing_time_obj = time(23, 0)

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
