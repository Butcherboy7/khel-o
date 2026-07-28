from fastapi import APIRouter, Depends, status
from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.review import ReviewCreate, ReviewResponse
from app.repositories.review_repository import ReviewRepository
from app.repositories.booking_repository import BookingRepository
from app.services.review_service import ReviewService
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter()

@router.post("", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_review(
    payload: ReviewCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    review_repo = ReviewRepository(db)
    booking_repo = BookingRepository(db)
    service = ReviewService(review_repo, booking_repo)
    return await service.create_review(current_user.id, payload)

@router.get("/cafe/{cafe_id}", response_model=List[ReviewResponse])
async def list_cafe_reviews(cafe_id: UUID, db: AsyncSession = Depends(get_db)):
    review_repo = ReviewRepository(db)
    booking_repo = BookingRepository(db)
    service = ReviewService(review_repo, booking_repo)
    return await service.list_cafe_reviews(cafe_id)
