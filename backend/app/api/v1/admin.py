from fastapi import APIRouter, Depends, status, Query
from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.cafe import CafeVerifyRequest
from app.schemas.review import ReviewVisibilityRequest
from app.repositories.cafe_repository import CafeRepository
from app.repositories.review_repository import ReviewRepository
from app.repositories.booking_repository import BookingRepository
from app.services.cafe_service import CafeService
from app.services.review_service import ReviewService
from app.api.deps import require_admin
from app.models.user import User

router = APIRouter()

@router.get("/dashboard", status_code=status.HTTP_200_OK)
async def get_admin_dashboard(current_admin: User = Depends(require_admin)):
    return {
        "success": True,
        "data": {
            "message": "Admin Dashboard Analytics Endpoint",
            "admin": current_admin.email
        }
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

@router.patch("/cafes/{cafe_id}/verify", status_code=status.HTTP_200_OK)
async def verify_cafe(
    cafe_id: UUID,
    payload: CafeVerifyRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    repo = CafeRepository(db)
    service = CafeService(repo)
    result = await service.verify_cafe(cafe_id, current_admin.id, payload.status)
    return {
        "success": True,
        "data": {
            "cafe": result
        }
    }

# Review Moderation Endpoints
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
