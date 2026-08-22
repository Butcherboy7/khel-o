from fastapi import APIRouter, Depends, status, Query, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

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
from app.services.admin_service import AdminService
from app.services.cafe_service import CafeService
from app.services.review_service import ReviewService
from app.api.deps import require_admin
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping

router = APIRouter()

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
    service = CafeService(repo, user_repo=user_repo)
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
    service = CafeService(cafe_repo, user_repo=user_repo)
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
        "support_email": payload.support_email,
        "maintenance_mode": payload.maintenance_mode,
        "maintenance_message": payload.maintenance_message,
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

# --- OWNER PAYOUT OVERSIGHT (Razorpay Route linked accounts) ---

@router.get("/payouts", status_code=status.HTTP_200_OK)
async def list_owner_payouts_admin(
    kycStatus: Optional[str] = Query(None, alias="kycStatus", description="pending|submitted|activated|suspended|rejected"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """List every café owner's Razorpay Route linked-account status, so an admin can
    see who hasn't submitted payout details, whose KYC is stuck, and whose transfers
    are failing — none of which was visible anywhere before this endpoint."""
    service = AdminService(
        db=db,
        user_repo=UserRepository(db),
        cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db),
        promo_repo=PromotionRepository(db)
    )
    result = await service.list_owner_payouts(kyc_status=kycStatus, page=page, limit=limit)
    return {"success": True, "data": result}
