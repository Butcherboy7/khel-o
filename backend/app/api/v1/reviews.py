from fastapi import APIRouter, Depends, status, Query
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.review import ReviewCreateRequest, ReviewResponse
from app.repositories.review_repository import ReviewRepository
from app.repositories.booking_repository import BookingRepository
from app.services.review_service import ReviewService
from app.api.deps import require_gamer, get_current_user
from app.models.user import User

router = APIRouter()

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_review(
    payload: ReviewCreateRequest,
    current_user: User = Depends(require_gamer),
    db: AsyncSession = Depends(get_db)
):
    review_repo = ReviewRepository(db)
    booking_repo = BookingRepository(db)
    service = ReviewService(review_repo, booking_repo)
    result = await service.submit_review(current_user.id, current_user.full_name, payload)
    return {
        "success": True,
        "data": {
            "review": result
        }
    }

@router.get("/cafe/{cafe_id}", status_code=status.HTTP_200_OK)
async def get_cafe_reviews(
    cafe_id: UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db)
):
    review_repo = ReviewRepository(db)
    booking_repo = BookingRepository(db)
    service = ReviewService(review_repo, booking_repo)
    result = await service.get_cafe_reviews(cafe_id, page=page, limit=limit)
    return {
        "success": True,
        "data": result
    }
