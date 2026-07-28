import math
from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4

from app.repositories.review_repository import ReviewRepository
from app.repositories.booking_repository import BookingRepository
from app.schemas.review import ReviewCreateRequest, ReviewResponse, ReviewListResponse
from app.models.review import Review
from app.models.booking import BookingStatus
from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException, ConflictException

class ReviewService:
    def __init__(self, review_repo: ReviewRepository, booking_repo: BookingRepository):
        self.review_repo = review_repo
        self.booking_repo = booking_repo

    async def submit_review(self, gamer_id: UUID, user_full_name: str, review_in: ReviewCreateRequest) -> ReviewResponse:
        booking = await self.booking_repo.get_by_id(review_in.booking_id)
        if not booking:
            raise NotFoundException(message="Booking not found", error_code="BOOKING_NOT_FOUND")

        if str(booking.gamer_id) != str(gamer_id):
            raise ForbiddenException(message="You can only review your own bookings", error_code="FORBIDDEN")

        if booking.status != BookingStatus.COMPLETED:
            raise ValidationException(
                message="You can only review a completed session",
                error_code="REVIEW_NOT_ALLOWED"
            )

        existing = await self.review_repo.get_by_booking_id(review_in.booking_id)
        if existing:
            raise ConflictException(
                message="You have already reviewed this session",
                error_code="REVIEW_ALREADY_EXISTS"
            )

        if review_in.rating < 1 or review_in.rating > 5:
            raise ValidationException(
                message="Rating must be between 1 and 5",
                error_code="INVALID_RATING"
            )

        review_dict = {
            "id": uuid4(),
            "cafe_id": booking.cafe_id,
            "gamer_id": gamer_id,
            "booking_id": booking.id,
            "rating": review_in.rating,
            "comment": review_in.comment,
            "is_visible": True
        }

        created = await self.review_repo.create(review_dict)
        first_name = user_full_name.split()[0] if user_full_name else "Gamer"

        resp_dict = {
            "id": created.id,
            "cafe_id": created.cafe_id,
            "gamer_id": created.gamer_id,
            "booking_id": created.booking_id,
            "rating": created.rating,
            "comment": created.comment,
            "is_visible": created.is_visible,
            "gamer_name": first_name,
            "created_at": created.created_at,
            "updated_at": created.updated_at
        }
        return ReviewResponse.model_validate(resp_dict)

    async def get_cafe_reviews(self, cafe_id: UUID, page: int = 1, limit: int = 20) -> Dict[str, Any]:
        limit = min(limit, 50)
        items_tuples, total = await self.review_repo.get_by_cafe_id(
            cafe_id=cafe_id,
            page=page,
            limit=limit,
            include_hidden=False
        )

        item_responses: List[ReviewResponse] = []
        for review, first_name in items_tuples:
            resp_dict = {
                "id": review.id,
                "cafe_id": review.cafe_id,
                "gamer_id": review.gamer_id,
                "booking_id": review.booking_id,
                "rating": review.rating,
                "comment": review.comment,
                "is_visible": review.is_visible,
                "gamer_name": first_name,
                "created_at": review.created_at,
                "updated_at": review.updated_at
            }
            item_responses.append(ReviewResponse.model_validate(resp_dict))

        total_pages = math.ceil(total / limit) if total > 0 else 0
        return {
            "items": item_responses,
            "total": total,
            "page": page,
            "pageSize": limit,
            "totalPages": total_pages
        }

    async def get_admin_reviews(self, cafe_id: Optional[UUID] = None, page: int = 1, limit: int = 20) -> Dict[str, Any]:
        limit = min(limit, 50)
        items_tuples, total = await self.review_repo.get_all_admin(
            cafe_id=cafe_id,
            page=page,
            limit=limit
        )

        item_responses: List[ReviewResponse] = []
        for review, first_name in items_tuples:
            resp_dict = {
                "id": review.id,
                "cafe_id": review.cafe_id,
                "gamer_id": review.gamer_id,
                "booking_id": review.booking_id,
                "rating": review.rating,
                "comment": review.comment,
                "is_visible": review.is_visible,
                "gamer_name": first_name,
                "created_at": review.created_at,
                "updated_at": review.updated_at
            }
            item_responses.append(ReviewResponse.model_validate(resp_dict))

        total_pages = math.ceil(total / limit) if total > 0 else 0
        return {
            "items": item_responses,
            "total": total,
            "page": page,
            "pageSize": limit,
            "totalPages": total_pages
        }

    async def toggle_review_visibility(self, review_id: UUID, is_visible: bool) -> ReviewResponse:
        updated = await self.review_repo.toggle_visibility(review_id, is_visible)
        if not updated:
            raise NotFoundException(message="Review not found", error_code="REVIEW_NOT_FOUND")

        items_tuples, _ = await self.review_repo.get_by_cafe_id(
            cafe_id=updated.cafe_id,
            page=1,
            limit=100,
            include_hidden=True
        )
        first_name = "Gamer"
        for r, fn in items_tuples:
            if r.id == updated.id:
                first_name = fn
                break

        resp_dict = {
            "id": updated.id,
            "cafe_id": updated.cafe_id,
            "gamer_id": updated.gamer_id,
            "booking_id": updated.booking_id,
            "rating": updated.rating,
            "comment": updated.comment,
            "is_visible": updated.is_visible,
            "gamer_name": first_name,
            "created_at": updated.created_at,
            "updated_at": updated.updated_at
        }
        return ReviewResponse.model_validate(resp_dict)
