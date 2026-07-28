from fastapi import APIRouter, Depends, status, Query
from typing import Optional
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.admin import (
    CafeVerifyAdminRequest,
    UserRoleUpdateRequest,
    AdminAnalyticsResponse
)
from app.schemas.review import ReviewVisibilityRequest
from app.repositories.user_repository import UserRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.booking_repository import BookingRepository
from app.repositories.promotion_repository import PromotionRepository
from app.repositories.review_repository import ReviewRepository
from app.services.admin_service import AdminService
from app.services.cafe_service import CafeService
from app.services.review_service import ReviewService
from app.api.deps import require_admin
from app.models.user import User

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
    service = CafeService(repo)
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
    cafe = await cafe_repo.get_by_id(cafe_id)
    if not cafe:
        return {"success": False, "error": {"code": "CAFE_NOT_FOUND", "message": "Café not found"}}
    owner = await user_repo.get_by_id(cafe.owner_id)
    return {
        "success": True,
        "data": {
            "cafe": cafe,
            "owner": owner
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
    updated = await cafe_repo.update_verification_status(cafe_id, payload.status, reason=payload.reason)
    return {
        "success": True,
        "data": {
            "cafe": updated
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
    return {
        "success": True,
        "data": {
            "review": result
        }
    }
