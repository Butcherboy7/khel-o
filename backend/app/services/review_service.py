from typing import List
from uuid import UUID
from app.repositories.review_repository import ReviewRepository
from app.repositories.booking_repository import BookingRepository
from app.schemas.review import ReviewCreate, ReviewResponse
from app.models.review import Review
from app.core.exceptions import NotFoundException, ConflictException

class ReviewService:
    def __init__(self, review_repo: ReviewRepository, booking_repo: BookingRepository):
        self.review_repo = review_repo
        self.booking_repo = booking_repo

    async def create_review(self, gamer_id: UUID, review_in: ReviewCreate) -> ReviewResponse:
        booking = await self.booking_repo.get_by_id(review_in.booking_id)
        if not booking:
            raise NotFoundException(message="Booking not found", error_code="BOOKING_NOT_FOUND")

        if booking.gamer_id != gamer_id:
            raise ConflictException(message="Cannot review a booking that does not belong to you", error_code="UNAUTHORIZED_REVIEW")

        review = Review(
            cafe_id=booking.cafe_id,
            gamer_id=gamer_id,
            booking_id=booking.id,
            rating=review_in.rating,
            comment=review_in.comment,
            is_visible=True
        )
        created = await self.review_repo.create(review)
        return ReviewResponse.model_validate(created)

    async def list_cafe_reviews(self, cafe_id: UUID) -> List[ReviewResponse]:
        reviews = await self.review_repo.get_by_cafe(cafe_id)
        return [ReviewResponse.model_validate(r) for r in reviews]
