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
    def __init__(self, review_repo: ReviewRepository, booking_repo: BookingRepository, cafe_repo=None):
        self.review_repo = review_repo
        self.booking_repo = booking_repo
        self.cafe_repo = cafe_repo

    @staticmethod
    def _to_response(review: Review, gamer_name: str) -> ReviewResponse:
        return ReviewResponse.model_validate({
            "id": review.id,
            "cafe_id": review.cafe_id,
            "gamer_id": review.gamer_id,
            "booking_id": review.booking_id,
            "rating": review.rating,
            "comment": review.comment,
            "is_visible": review.is_visible,
            "owner_reply": review.owner_reply,
            "owner_replied_at": review.owner_replied_at,
            "gamer_name": gamer_name,
            "created_at": review.created_at,
            "updated_at": review.updated_at
        })

    async def submit_review(self, gamer_id: UUID, user_full_name: str, review_in: ReviewCreateRequest) -> ReviewResponse:
        cafe_id = review_in.cafe_id
        booking_id = review_in.booking_id

        if booking_id:
            booking = await self.booking_repo.get_by_id(booking_id)
            if booking:
                cafe_id = booking.cafe_id
                if str(booking.gamer_id) != str(gamer_id):
                    raise ForbiddenException(message="You can only review your own bookings", error_code="FORBIDDEN")
                existing = await self.review_repo.get_by_booking_id(booking_id)
                if existing:
                    raise ConflictException(message="You have already reviewed this session", error_code="REVIEW_ALREADY_EXISTS")

        if not cafe_id and not booking_id:
            raise ValidationException(message="Either cafe_id or booking_id is required", error_code="INVALID_REVIEW_REQUEST")

        if review_in.rating < 1 or review_in.rating > 5:
            raise ValidationException(
                message="Rating must be between 1 and 5",
                error_code="INVALID_RATING"
            )

        review_dict = {
            "id": uuid4(),
            "cafe_id": cafe_id,
            "gamer_id": gamer_id,
            "booking_id": booking_id or uuid4(),
            "rating": review_in.rating,
            "comment": review_in.comment,
            "is_visible": True
        }

        created = await self.review_repo.create(review_dict)
        first_name = user_full_name.split()[0] if user_full_name else "Gamer"
        return self._to_response(created, first_name)

    async def get_cafe_reviews(self, cafe_id: UUID, page: int = 1, limit: int = 20) -> Dict[str, Any]:
        limit = min(limit, 50)
        items_tuples, total = await self.review_repo.get_by_cafe_id(
            cafe_id=cafe_id,
            page=page,
            limit=limit,
            include_hidden=False
        )

        item_responses: List[ReviewResponse] = [self._to_response(review, first_name) for review, first_name in items_tuples]

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

        item_responses: List[ReviewResponse] = [self._to_response(review, first_name) for review, first_name in items_tuples]

        total_pages = math.ceil(total / limit) if total > 0 else 0
        return {
            "items": item_responses,
            "total": total,
            "page": page,
            "pageSize": limit,
            "totalPages": total_pages
        }

    async def _first_name_for_review(self, review: Review) -> str:
        items_tuples, _ = await self.review_repo.get_by_cafe_id(
            cafe_id=review.cafe_id,
            page=1,
            limit=100,
            include_hidden=True
        )
        for r, fn in items_tuples:
            if r.id == review.id:
                return fn
        return "Gamer"

    async def toggle_review_visibility(self, review_id: UUID, is_visible: bool) -> ReviewResponse:
        updated = await self.review_repo.toggle_visibility(review_id, is_visible)
        if not updated:
            raise NotFoundException(message="Review not found", error_code="REVIEW_NOT_FOUND")
        first_name = await self._first_name_for_review(updated)
        return self._to_response(updated, first_name)

    async def reply_to_review(self, review_id: UUID, owner_id: UUID, reply: str) -> ReviewResponse:
        """Let a café owner post a public reply to a review on their own café."""
        review = await self.review_repo.get_by_id(review_id)
        if not review:
            raise NotFoundException(message="Review not found", error_code="REVIEW_NOT_FOUND")

        if self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(review.cafe_id)
            if not cafe or str(cafe.owner_id) != str(owner_id):
                raise ForbiddenException(message="You can only reply to reviews on your own café", error_code="FORBIDDEN")

        updated = await self.review_repo.set_owner_reply(review_id, reply)
        first_name = await self._first_name_for_review(updated)
        return self._to_response(updated, first_name)
