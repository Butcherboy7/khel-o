from fastapi import APIRouter, Depends, status, Query, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update, func

from app.database import get_db
from app.schemas.admin import (
    CafeVerifyAdminRequest,
    UserRoleUpdateRequest,
    AdminAnalyticsResponse,
    AdminCafeDetailResponse
)
from app.schemas.review import ReviewVisibilityRequest
from app.repositories.user_repository import UserRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.booking_repository import BookingRepository
from app.repositories.promotion_repository import PromotionRepository
from app.repositories.review_repository import ReviewRepository
from app.repositories.payment_repository import PaymentRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.repositories.hardware_tier_unit_repository import HardwareTierUnitRepository
from app.services.admin_service import AdminService
from app.services.cafe_service import CafeService
from app.services.review_service import ReviewService
from app.api.deps import require_admin
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.booking import Booking
from app.models.hardware_tier import HardwareTier
from app.models.cafe_waitlist import CafeWaitlistEntry
from app.models.review import Review
from app.models.promotion import Promotion
from app.models.cafe_payout import CafePayout
from app.models.cafe_payout_adjustment import CafePayoutAdjustment
from app.models.staff_invitation import StaffInvitation
from app.models.support_ticket import SupportTicket
from app.models.analytics_event import AnalyticsEvent
from app.core.exceptions import BadRequestException, NotFoundException, ConflictException

router = APIRouter()


async def _open_bookable_capacity(cafe, tier_repo: HardwareTierRepository, tiers: list, total_seats: int) -> None:
    """Opens real booking capacity on a café that has confirmed hardware.

    Same 70%-of-seats rule used everywhere else this happens (owner's
    self-claim endpoint, the bookings-pause resume toggle,
    CafeRepository.update_verification_status) -- kept as one shared spot
    within this file since both /verify (for an already-complete
    application) and /go-live now need it.
    """
    cafe.bookable_stations = max(1, round(total_seats * 0.7))
    cafe.app_bookable_seats = cafe.bookable_stations
    ratio = cafe.bookable_stations / total_seats
    for t in tiers:
        if t.app_bookable_seats_locked:
            continue
        scaled = max(0, min(t.total_seats, round(t.total_seats * ratio)))
        if scaled == 0 and t.total_seats >= 1:
            scaled = 1
        await tier_repo.update(t.id, {"app_bookable_seats": scaled})

# --- PLATFORM ANALYTICS ---
@router.get("/analytics", status_code=status.HTTP_200_OK)
async def get_admin_analytics(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    result = await service.get_platform_analytics()
    return {
        "success": True,
        "data": result
    }

@router.get("/action-items", status_code=status.HTTP_200_OK)
async def get_admin_action_items(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Aggregated 'needs attention' counts — failed transfers, failed refunds,
    stuck payments, open support tickets, pending owner KYC — surfaced in one
    place instead of requiring a separate check across four different pages."""
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    result = await service.get_action_items()
    return {
        "success": True,
        "data": result
    }

@router.get("/dashboard", status_code=status.HTTP_200_OK)
async def get_admin_dashboard(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    return await get_admin_analytics(current_admin, db)

# --- CAFÉ MANAGEMENT ---
@router.get("/cafes", status_code=status.HTTP_200_OK)
async def list_all_cafes_admin(
    verificationStatus: Optional[str] = Query(None, alias="verificationStatus"),
    city: Optional[str] = Query(None),
    isActive: Optional[bool] = Query(None, alias="isActive"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    result = await service.list_cafes(
        verification_status=verificationStatus,
        city=city,
        is_active=isActive,
        page=page,
        limit=limit
    )
    return {
        "success": True,
        "data": result
    }

@router.get("/cafes/pending", status_code=status.HTTP_200_OK)
async def list_pending_cafes(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    repo = CafeRepository(db)
    user_repo = UserRepository(db)
    tier_repo = HardwareTierRepository(db)
    unit_repo = HardwareTierUnitRepository(db)
    service = CafeService(repo, tier_repo=tier_repo, user_repo=user_repo, unit_repo=unit_repo)
    result = await service.get_pending_cafes(page=page, limit=limit)
    return {
        "success": True,
        "data": result
    }

@router.get("/cafes/{cafe_id}", status_code=status.HTTP_200_OK)
async def get_cafe_admin_detail(
    cafe_id: UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    cafe_repo = CafeRepository(db)
    user_repo = UserRepository(db)
    tier_repo = HardwareTierRepository(db)
    unit_repo = HardwareTierUnitRepository(db)
    service = CafeService(cafe_repo, tier_repo=tier_repo, user_repo=user_repo, unit_repo=unit_repo)
    cafe = await cafe_repo.get_by_id(cafe_id)
    if not cafe:
        return {"success": False, "error": {"code": "CAFE_NOT_FOUND", "message": "Café not found"}}
    cafe_resp = await service._build_cafe_response(cafe, response_cls=AdminCafeDetailResponse)
    return {
        "success": True,
        "data": {
            "cafe": cafe_resp,
            "owner": cafe_resp.owner
        }
    }

@router.patch("/cafes/{cafe_id}/verify", status_code=status.HTTP_200_OK)
async def verify_cafe(
    cafe_id: UUID,
    payload: CafeVerifyAdminRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    cafe_repo = CafeRepository(db)
    user_repo = UserRepository(db)
    
    cafe = await cafe_repo.get_by_id(cafe_id)
    if not cafe:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Cafe not found")
    
    is_active = (payload.status == "verified")
    update_fields = {"verification_status": payload.status, "is_active": is_active}
    if payload.reason is not None:
        update_fields["rejection_reason"] = payload.reason

    for field, value in update_fields.items():
        if hasattr(cafe, field):
            setattr(cafe, field, value)

    # A café that already has bookable_stations (e.g. a suspended-then-
    # reactivated live café going through /verify again) is left alone so
    # re-verifying never un-launches it.
    if payload.status == "verified" and cafe.bookable_stations == 0:
        tier_repo = HardwareTierRepository(db)
        tiers = await tier_repo.get_by_cafe_id(cafe.id)
        total_seats = sum(t.total_seats for t in tiers) if tiers else 0
        if total_seats > 0:
            # Owner already did full onboarding -- real hardware with real
            # seats is on file, so there's nothing left to wait for. Approval
            # IS the go-live moment; don't make the admin click twice.
            cafe.is_lead_listing = False
            await _open_bookable_capacity(cafe, tier_repo, tiers, total_seats)
        else:
            # No hardware on file yet (a bare-bones/outreach application, e.g.
            # KHEL-O created the account with whatever info was available
            # before the real owner took over). Publish as a "Booking Soon"
            # listing rather than a bookable café that can never return a
            # slot. Admin flips this off via /go-live once the owner has
            # added real hardware.
            cafe.is_lead_listing = True

    if payload.status == "verified":
        from app.models.user_role import UserRoleMapping
        import uuid
        
        # Upgrade owner primary role to CAFE_OWNER so authentication token refreshes automatically
        owner_user = await user_repo.get_by_id(cafe.owner_id)
        if owner_user:
            owner_user.role = UserRole.CAFE_OWNER

        stmt_check_gamer = select(UserRoleMapping).where(
            UserRoleMapping.user_id == cafe.owner_id,
            UserRoleMapping.role == UserRole.GAMER,
            UserRoleMapping.cafe_id.is_(None)
        )
        res_gamer = await db.execute(stmt_check_gamer)
        if not res_gamer.scalars().first():
            db.add(UserRoleMapping(
                id=uuid.uuid4(),
                user_id=cafe.owner_id,
                role=UserRole.GAMER,
                cafe_id=None
            ))
        
        stmt_check_owner = select(UserRoleMapping).where(
            UserRoleMapping.user_id == cafe.owner_id,
            UserRoleMapping.role == UserRole.CAFE_OWNER,
            UserRoleMapping.cafe_id.is_(None)
        )
        res_owner = await db.execute(stmt_check_owner)
        if not res_owner.scalars().first():
            db.add(UserRoleMapping(
                id=uuid.uuid4(),
                user_id=cafe.owner_id,
                role=UserRole.CAFE_OWNER,
                cafe_id=None
            ))
    
    await db.commit()
    await db.refresh(cafe)

    audit_service = AdminService(
        db=db,
        user_repo=user_repo,
        cafe_repo=cafe_repo,
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    await audit_service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action=f"cafe.{payload.status}",
        entity_type="cafe",
        entity_id=str(cafe_id),
        entity_name=cafe.name,
        reason=payload.reason,
    )

    return {
        "success": True,
        "data": {
            "cafe": cafe
        }
    }

# --- USER MANAGEMENT ---
@router.get("/users", status_code=status.HTTP_200_OK)
async def list_users_admin(
    role: Optional[str] = Query(None),
    isActive: Optional[bool] = Query(None, alias="isActive"),
    email: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    result = await service.list_users(
        role=role,
        is_active=isActive,
        email_search=email,
        page=page,
        limit=limit
    )
    return {
        "success": True,
        "data": result
    }

@router.get("/users/{user_id}", status_code=status.HTTP_200_OK)
async def get_user_admin(
    user_id: UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    user = await service.get_user(user_id)
    return {
        "success": True,
        "data": {
            "user": user
        }
    }

@router.patch("/users/{user_id}/deactivate", status_code=status.HTTP_200_OK)
async def deactivate_user_admin(
    user_id: UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    updated = await service.deactivate_user(user_id)
    await service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="user.deactivate",
        entity_type="user",
        entity_id=str(user_id),
    )
    return {
        "success": True,
        "data": {
            "user": updated
        }
    }

@router.patch("/users/{user_id}/activate", status_code=status.HTTP_200_OK)
async def activate_user_admin(
    user_id: UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    updated = await service.activate_user(user_id)
    await service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="user.activate",
        entity_type="user",
        entity_id=str(user_id),
    )
    return {
        "success": True,
        "data": {
            "user": updated
        }
    }

@router.patch("/users/{user_id}/role", status_code=status.HTTP_200_OK)
async def change_user_role_admin(
    user_id: UUID,
    payload: UserRoleUpdateRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    updated = await service.change_user_role(user_id, payload.role)
    await service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action=f"user.role_change.{payload.role}",
        entity_type="user",
        entity_id=str(user_id),
        entity_name=updated.email,
    )
    return {
        "success": True,
        "data": {
            "user": updated
        }
    }


class UserPasswordResetRequest(BaseModel):
    # Mandatory, unlike most admin actions' optional `reason` — this
    # mutates login credentials, so the audit trail must always explain why.
    reason: str = Field(min_length=1, max_length=500)


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_200_OK)
async def reset_user_password_admin(
    user_id: UUID,
    payload: UserPasswordResetRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """For an account locked out of the normal self-serve reset flow (no
    accessible inbox at its current email — e.g. an onboarding placeholder
    account). Generates a fresh password and returns it once in this
    response; it is never logged or stored anywhere in plaintext. The admin
    is expected to log in with it immediately and either change the
    account's email (then trigger a normal forgot-password email to the
    real address) or hand it off through a secure out-of-band channel."""
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    updated, temporary_password = await service.reset_user_password(user_id)
    await service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="user.password_reset",
        entity_type="user",
        entity_id=str(user_id),
        entity_name=updated.email,
        reason=payload.reason,
    )
    return {
        "success": True,
        "data": {
            "user": updated,
            "temporaryPassword": temporary_password,
        }
    }

# --- BOOKING OVERSIGHT ---
@router.get("/bookings", status_code=status.HTTP_200_OK)
async def list_all_bookings_admin(
    cafeId: Optional[UUID] = Query(None, alias="cafeId"),
    gamerId: Optional[UUID] = Query(None, alias="gamerId"),
    status: Optional[str] = Query(None),
    dateFrom: Optional[date] = Query(None, alias="dateFrom"),
    dateTo: Optional[date] = Query(None, alias="dateTo"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    result = await service.list_all_bookings(
        cafe_id=cafeId,
        gamer_id=gamerId,
        status=status,
        date_from=dateFrom,
        date_to=dateTo,
        page=page,
        limit=limit
    )
    return {
        "success": True,
        "data": result
    }

@router.get("/bookings/{booking_id}", status_code=status.HTTP_200_OK)
async def get_booking_admin_detail(
    booking_id: UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    result = await service.get_booking_detail(booking_id)
    return {
        "success": True,
        "data": result
    }

class BookingForceCancelRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=200)

@router.patch("/bookings/{booking_id}/force-cancel", status_code=status.HTTP_200_OK)
async def force_cancel_booking_admin(
    booking_id: UUID,
    payload: BookingForceCancelRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Cancel a stuck/disputed booking regardless of the normal cancellation window. Does not trigger a refund — use the refund endpoint separately if money needs to move."""
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    result = await service.force_cancel_booking(booking_id, payload.reason)
    await service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="booking.force_cancel",
        entity_type="booking",
        entity_id=str(booking_id),
        entity_name=result.get("bookingReference"),
        reason=payload.reason,
    )
    return {"success": True, "data": result}

class BookingRefundRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=200)

@router.post("/bookings/{booking_id}/refund", status_code=status.HTTP_200_OK)
async def refund_booking_admin(
    booking_id: UUID,
    payload: BookingRefundRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin-initiated refund, independent of the customer-facing cancellation flow.

    Goes through the same PaymentService.process_refund() path used by cancellations —
    it calls the real Razorpay refund API when RAZORPAY_KEY_ID/SECRET are configured, and
    otherwise records a `pending_manual_refund` entry. No behavior change is needed when
    live keys are added later; this endpoint already exercises the same code path.
    """
    from app.services.payment_service import PaymentService
    payment_service = PaymentService(
        payment_repo=PaymentRepository(db),
        booking_repo=BookingRepository(db),
        db_session=db
    )
    result = await payment_service.process_refund(booking_id, admin_id=current_admin.id)

    admin_service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    await admin_service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="payment.refund",
        entity_type="booking",
        entity_id=str(booking_id),
        reason=payload.reason,
    )
    return {"success": True, "data": result}

class BookingReleaseRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=200)

@router.patch("/bookings/{booking_id}/release", status_code=status.HTTP_200_OK)
async def release_pending_booking_admin(
    booking_id: UUID,
    payload: BookingReleaseRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin override of the owner's "Release Slot" action — same safety
    rules apply (see owner.py's _release_pending_booking): only a
    PENDING_PAYMENT booking can be released, never deleted, and a late
    Razorpay confirmation for the same payment is refunded rather than
    silently confirming an already-released slot."""
    from app.api.v1.owner import _release_pending_booking
    result = await _release_pending_booking(booking_id, payload.reason, current_admin, db, is_admin=True)

    admin_service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    await admin_service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="booking.release",
        entity_type="booking",
        entity_id=str(booking_id),
        reason=result["data"]["booking"]["releaseReason"],
    )
    return result

# --- PROMOTION OVERSIGHT ---
@router.get("/promotions", status_code=status.HTTP_200_OK)
async def list_promotions_admin(
    cafeId: Optional[UUID] = Query(None, alias="cafeId"),
    isActive: Optional[bool] = Query(None, alias="isActive"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    result = await service.list_promotions(cafe_id=cafeId, is_active=isActive, page=page, limit=limit)
    return {
        "success": True,
        "data": result
    }

@router.patch("/promotions/{promotion_id}/deactivate", status_code=status.HTTP_200_OK)
async def deactivate_promotion_admin(
    promotion_id: UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    updated = await service.deactivate_promotion(promotion_id)
    await service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="promotion.deactivate",
        entity_type="promotion",
        entity_id=str(promotion_id),
    )
    return {
        "success": True,
        "data": {
            "promotion": updated
        }
    }

# --- REVIEW MODERATION ---
@router.get("/reviews", status_code=status.HTTP_200_OK)
async def list_all_reviews_admin(
    cafeId: Optional[UUID] = Query(None, alias="cafeId"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    review_repo = ReviewRepository(db)
    booking_repo = BookingRepository(db)
    service = ReviewService(review_repo, booking_repo)
    result = await service.get_admin_reviews(cafe_id=cafeId, page=page, limit=limit)
    return {
        "success": True,
        "data": result
    }

@router.patch("/reviews/{review_id}/visibility", status_code=status.HTTP_200_OK)
async def toggle_review_visibility(
    review_id: UUID,
    payload: ReviewVisibilityRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    review_repo = ReviewRepository(db)
    booking_repo = BookingRepository(db)
    service = ReviewService(review_repo, booking_repo)
    result = await service.toggle_review_visibility(review_id, payload.is_visible)

    audit_service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=booking_repo,
        promo_repo=PromotionRepository(db)
    )
    await audit_service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="review.hide" if not payload.is_visible else "review.restore",
        entity_type="review",
        entity_id=str(review_id),
    )

    return {
        "success": True,
        "data": {
            "review": result
        }
    }

# --- CAFÉ SUSPENSION / ACTIVATION ---

class CafeDeleteRequest(BaseModel):
    # Typed confirmation, not just a click -- this is the one admin action in
    # this file with no undo. Checked server-side (not just as a UI gate) so
    # a stray/scripted call can't wipe a café by id alone.
    confirm_name: str = Field(..., min_length=1)


@router.delete("/cafes/{cafe_id}", status_code=status.HTTP_200_OK)
async def delete_cafe(
    cafe_id: UUID,
    payload: CafeDeleteRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Permanently delete a café that never took a real booking.

    For cleaning up test/duplicate listings, not for anything with real
    activity -- a café with ANY booking (any status, including cancelled) is
    refused outright, no override. That is the actual safety boundary here;
    everything else about this café is just data hanging off it. Suspend is
    the tool for a café that has real history and needs to come down.
    """
    cafe_repo = CafeRepository(db)
    cafe = await cafe_repo.get_by_id(cafe_id)
    if not cafe:
        raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")

    if payload.confirm_name != cafe.name:
        raise BadRequestException(
            message="Café name didn't match. Nothing was deleted.",
            error_code="DELETE_CONFIRMATION_MISMATCH",
        )

    booking_count = (await db.execute(
        select(func.count()).select_from(Booking).where(Booking.cafe_id == cafe_id)
    )).scalar() or 0
    if booking_count > 0:
        raise ConflictException(
            message=f"This café has {booking_count} booking(s) on record and cannot be permanently deleted. Suspend it instead.",
            error_code="CAFE_HAS_BOOKINGS",
        )

    cafe_name = cafe.name

    # Dependents with their own FK chain (hardware_tier_units -> hardware_tiers,
    # cafe_payout_items -> cafe_payouts) are already ON DELETE CASCADE at the
    # DB level, so deleting the parent row here is enough for those two.
    await db.execute(delete(HardwareTier).where(HardwareTier.cafe_id == cafe_id))
    await db.execute(delete(CafeWaitlistEntry).where(CafeWaitlistEntry.cafe_id == cafe_id))
    await db.execute(delete(Review).where(Review.cafe_id == cafe_id))
    await db.execute(delete(Promotion).where(Promotion.cafe_id == cafe_id))
    await db.execute(delete(CafePayoutAdjustment).where(CafePayoutAdjustment.cafe_id == cafe_id))
    await db.execute(delete(CafePayout).where(CafePayout.cafe_id == cafe_id))
    await db.execute(delete(StaffInvitation).where(StaffInvitation.venue_id == cafe_id))
    await db.execute(delete(UserRoleMapping).where(UserRoleMapping.cafe_id == cafe_id))
    # Nullable references: detach rather than delete, so support/analytics
    # history survives the café that generated it.
    await db.execute(update(SupportTicket).where(SupportTicket.cafe_id == cafe_id).values(cafe_id=None))
    await db.execute(update(AnalyticsEvent).where(AnalyticsEvent.cafe_id == cafe_id).values(cafe_id=None))

    await db.execute(delete(Cafe).where(Cafe.id == cafe_id))
    await db.commit()

    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=cafe_repo,
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db),
    )
    await service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="cafe.delete",
        entity_type="cafe",
        entity_id=str(cafe_id),
        entity_name=cafe_name,
    )

    return {"success": True, "data": {"id": str(cafe_id), "name": cafe_name, "deleted": True}}


class CafeSuspendRequest(BaseModel):
    reason: str = Field(..., min_length=10, description="Reason for suspension (min 10 chars)")

@router.patch("/cafes/{cafe_id}/suspend", status_code=status.HTTP_200_OK)
async def suspend_cafe(
    cafe_id: UUID,
    payload: CafeSuspendRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Suspend a café — sets status=suspended, is_active=False, records reason."""
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db),
    )
    result = await service.suspend_cafe(cafe_id, payload.reason)
    await service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="cafe.suspend",
        entity_type="cafe",
        entity_id=str(cafe_id),
        reason=payload.reason,
    )
    from app.services.notification_service import NotificationService
    await NotificationService().send_cafe_suspended(db, cafe_id, payload.reason)
    return {"success": True, "data": result}


@router.patch("/cafes/{cafe_id}/reactivate", status_code=status.HTTP_200_OK)
async def reactivate_cafe(
    cafe_id: UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Reactivate a suspended/rejected café — sets status=verified, is_active=True."""
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db),
    )
    result = await service.reactivate_cafe(cafe_id)
    await service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="cafe.reactivate",
        entity_type="cafe",
        entity_id=str(cafe_id),
    )
    return {"success": True, "data": result}


@router.patch("/cafes/{cafe_id}/go-live", status_code=status.HTTP_200_OK)
async def go_live_cafe(
    cafe_id: UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Flip an approved "Booking Soon" café to fully bookable.

    Mirrors /owner/cafe/claim's capacity-opening logic (same 70%-of-seats
    rule), but is admin-triggered rather than owner self-service: this is the
    "Approved != Live" gate for an owner-submitted application, not the
    research-listed-café claim flow that endpoint covers. Requires the café
    to already be an approved (verified) listing and to have real hardware
    tiers with seats -- otherwise "Go Live" would publish a bookable café
    that can never return a slot.
    """
    cafe_repo = CafeRepository(db)
    cafe = await cafe_repo.get_by_id(cafe_id)
    if not cafe:
        raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")

    if cafe.verification_status != VerificationStatus.VERIFIED:
        raise BadRequestException(
            message="Approve this café's application before going live.",
            error_code="GO_LIVE_REQUIRES_APPROVAL",
        )

    # Idempotent: a double-click must not re-scale seats an admin/owner has
    # since tuned down by hand.
    if not cafe.is_lead_listing:
        return {
            "success": True,
            "data": {"isLeadListing": False, "bookableStations": cafe.bookable_stations, "alreadyLive": True},
        }

    tier_repo = HardwareTierRepository(db)
    tiers = await tier_repo.get_by_cafe_id(cafe.id)
    total_seats = sum(t.total_seats for t in tiers) if tiers else 0
    if total_seats <= 0:
        raise BadRequestException(
            message="Add stations and their hourly rate before going live.",
            error_code="GO_LIVE_REQUIRES_HARDWARE",
        )

    cafe.is_lead_listing = False

    if cafe.bookable_stations == 0:
        await _open_bookable_capacity(cafe, tier_repo, tiers, total_seats)

    await db.commit()
    await db.refresh(cafe)

    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db),
    )
    await service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="cafe.go_live",
        entity_type="cafe",
        entity_id=str(cafe_id),
        entity_name=cafe.name,
    )

    return {
        "success": True,
        "data": {"isLeadListing": cafe.is_lead_listing, "bookableStations": cafe.bookable_stations, "alreadyLive": False},
    }


class CafeDescriptionUpdateRequest(BaseModel):
    description: str = Field(..., max_length=5000)

@router.patch("/cafes/{cafe_id}/description", status_code=status.HTTP_200_OK)
async def update_cafe_description_admin(
    cafe_id: UUID,
    payload: CafeDescriptionUpdateRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin edit of a café's description — e.g. correcting a misleading or
    policy-violating listing without waiting on the owner."""
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db),
    )
    result = await service.update_cafe_description(cafe_id, payload.description)
    await service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="cafe.update_description",
        entity_type="cafe",
        entity_id=str(cafe_id),
    )
    return {"success": True, "data": result}


class CafePauseBookingsRequest(BaseModel):
    paused: bool

@router.patch("/cafes/{cafe_id}/pause-bookings", status_code=status.HTTP_200_OK)
async def set_cafe_bookings_paused(
    cafe_id: UUID,
    payload: CafePauseBookingsRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Toggle online bookings on/off for a café without fully suspending it."""
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db),
    )
    result = await service.set_cafe_bookings_paused(cafe_id, payload.paused)
    await service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="cafe.pause_bookings" if payload.paused else "cafe.resume_bookings",
        entity_type="cafe",
        entity_id=str(cafe_id),
    )
    return {"success": True, "data": result}


# --- PAYMENT OVERSIGHT ---

@router.get("/payments", status_code=status.HTTP_200_OK)
async def list_all_payments(
    status: Optional[str] = Query(None, description="Filter by payment status: created|captured|failed|refunded"),
    cafeId: Optional[UUID] = Query(None, alias="cafeId"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """List all platform payments with booking + gamer + café context."""
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db),
    )
    result = await service.list_payments(
        status=status,
        cafe_id=cafeId,
        page=page,
        limit=limit,
    )
    return {"success": True, "data": result}


# --- STAFF OVERSIGHT ---

@router.get("/staff", status_code=status.HTTP_200_OK)
async def list_staff_admin(
    cafeId: Optional[UUID] = Query(None, alias="cafeId"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """List all active staff members and pending invitations, optionally filtered by café."""
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db),
    )
    result = await service.list_staff(cafe_id=cafeId, page=page, limit=limit)
    return {"success": True, "data": result}


class RevokeStaffRequest(BaseModel):
    cafe_id: UUID = Field(..., alias="cafeId")

    model_config = {"populate_by_name": True}


@router.delete("/staff/{user_id}/revoke", status_code=status.HTTP_200_OK)
async def revoke_staff_access(
    user_id: UUID,
    payload: RevokeStaffRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Revoke a staff member's access to a specific café."""
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db),
    )
    result = await service.revoke_staff(user_id=user_id, cafe_id=payload.cafe_id)
    # Write audit log
    await service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="staff.revoke",
        entity_type="staff",
        entity_id=str(user_id),
        reason=f"Revoked from cafe {payload.cafe_id}",
    )
    return {"success": True, "data": result}


# --- AUDIT LOG ---

@router.get("/audit-log", status_code=status.HTTP_200_OK)
async def get_audit_log(
    entityType: Optional[str] = Query(None, alias="entityType"),
    action: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Return paginated admin action audit log, newest first."""
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db),
    )
    result = await service.list_audit_logs(
        entity_type=entityType,
        action=action,
        page=page,
        limit=limit,
    )
    return {"success": True, "data": result}


# --- SUPPORT TICKETS ---

from app.repositories.support_ticket_repository import SupportTicketRepository
from app.services.support_ticket_service import SupportTicketService
from app.schemas.support import SupportTicketUpdateRequest

@router.get("/support/tickets", status_code=status.HTTP_200_OK)
async def list_support_tickets_admin(
    status_: Optional[str] = Query(None, alias="status"),
    category: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    service = SupportTicketService(SupportTicketRepository(db))
    result = await service.list_all_tickets(status=status_, category=category, page=page, limit=limit)
    return {"success": True, "data": result}

@router.get("/support/tickets/{ticket_id}", status_code=status.HTTP_200_OK)
async def get_support_ticket_admin(
    ticket_id: UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    from app.schemas.support import SupportTicketResponse
    service = SupportTicketService(SupportTicketRepository(db))
    ticket = await service.get_ticket(ticket_id)
    return {"success": True, "data": {"ticket": SupportTicketResponse.model_validate(ticket)}}

@router.patch("/support/tickets/{ticket_id}", status_code=status.HTTP_200_OK)
async def update_support_ticket_admin(
    ticket_id: UUID,
    payload: SupportTicketUpdateRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Triage a support ticket: change status, priority, or leave internal notes."""
    ticket_service = SupportTicketService(SupportTicketRepository(db))
    updated = await ticket_service.update_ticket(
        ticket_id,
        resolved_by=current_admin.id,
        status=payload.status,
        priority=payload.priority,
        admin_notes=payload.admin_notes,
    )

    admin_service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db),
    )
    await admin_service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action=f"support_ticket.update{'.' + payload.status if payload.status else ''}",
        entity_type="support_ticket",
        entity_id=str(ticket_id),
    )
    return {"success": True, "data": {"ticket": updated}}


# --- PLATFORM SETTINGS ---

from app.repositories.platform_settings_repository import PlatformSettingsRepository
from app.schemas.support import PlatformSettingsResponse, PlatformSettingsUpdateRequest

@router.get("/settings", status_code=status.HTTP_200_OK)
async def get_platform_settings_admin(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    settings_repo = PlatformSettingsRepository(db)
    settings = await settings_repo.get_or_create()
    return {"success": True, "data": {"settings": PlatformSettingsResponse.model_validate(settings)}}

@router.patch("/settings", status_code=status.HTTP_200_OK)
async def update_platform_settings_admin(
    payload: PlatformSettingsUpdateRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    settings_repo = PlatformSettingsRepository(db)
    updated = await settings_repo.update({
        "commission_percentage": payload.commission_percentage,
        "platform_fee_percentage": payload.platform_fee_percentage,
        "support_email": payload.support_email,
        "maintenance_mode": payload.maintenance_mode,
        "maintenance_message": payload.maintenance_message,
        "reviews_require_booking": payload.reviews_require_booking,
        "updated_by": current_admin.id,
    })

    admin_service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db),
    )
    await admin_service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="platform_settings.update",
        entity_type="platform_settings",
        entity_id=str(updated.id),
    )
    return {"success": True, "data": {"settings": PlatformSettingsResponse.model_validate(updated)}}


# --- CAFÉ DEMAND (WAITLIST OUTREACH) ---
from app.repositories.waitlist_repository import WaitlistRepository


@router.get("/leads/demand", status_code=status.HTTP_200_OK)
async def get_lead_demand(
    minCount: int = Query(1, ge=1, alias="minCount"),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Per-café 'Notify me' demand, ranked highest first, for the outreach
    team: which unlisted/lead cafés have the most player demand, and the
    contact details of everyone who left one — the pitch data and the
    reach-out list in one place."""
    repo = WaitlistRepository(db)
    summary = await repo.demand_summary(min_count=minCount)
    return {"success": True, "data": {"leads": summary}}


class WaitlistGoalUpdateRequest(BaseModel):
    waitlist_goal: int = Field(..., ge=1, le=100000, alias="waitlistGoal")

    model_config = ConfigDict(populate_by_name=True)


@router.patch("/cafes/{cafe_id}/waitlist-goal", status_code=status.HTTP_200_OK)
async def update_cafe_waitlist_goal(
    cafe_id: UUID,
    payload: WaitlistGoalUpdateRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Tune the 'X / goal requested' target shown to visitors — outreach sets
    this lower once they're already mid-conversation with a café owner, so
    the on-site counter doesn't look further away than it actually is."""
    cafe_repo = CafeRepository(db)
    cafe = await cafe_repo.get_by_id(cafe_id)
    if not cafe:
        return {"success": False, "error": {"code": "CAFE_NOT_FOUND", "message": "Café not found"}}

    cafe.waitlist_goal = payload.waitlist_goal
    await db.commit()

    return {"success": True, "data": {"cafeId": str(cafe.id), "waitlistGoal": cafe.waitlist_goal}}
