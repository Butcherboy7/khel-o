import string
import random
import math
from decimal import Decimal
from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from datetime import datetime, timezone, timedelta, date, time

from app.repositories.booking_repository import BookingRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.schemas.booking import BookingCreateRequest, BookingResponse, BookingCancelRequest
from app.models.booking import Booking, BookingStatus
from app.models.user import User, UserRole
from app.models.cafe import VerificationStatus
from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException

class BookingService:
    def __init__(
        self,
        booking_repo: BookingRepository,
        cafe_repo: Optional[CafeRepository] = None,
        tier_repo: Optional[HardwareTierRepository] = None
    ):
        self.booking_repo = booking_repo
        self.cafe_repo = cafe_repo
        self.tier_repo = tier_repo

    def _generate_reference(self) -> str:
        year = datetime.now(timezone.utc).year
        random_suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        return f"GC-{year}-{random_suffix}"

    async def create_booking(self, gamer_id: UUID, booking_in: BookingCreateRequest) -> BookingResponse:
        # Validate Cafe
        if self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(booking_in.cafe_id)
            if not cafe or cafe.verification_status != VerificationStatus.VERIFIED or not cafe.is_active:
                raise ValidationException(message="Café is not available for booking", error_code="CAFE_NOT_AVAILABLE")

        # Validate Hardware Tier
        if not self.tier_repo:
            raise ValidationException(message="Hardware tier repository missing", error_code="INTERNAL_ERROR")

        tier = await self.tier_repo.get_by_id(booking_in.hardware_tier_id)
        if not tier or str(tier.cafe_id) != str(booking_in.cafe_id) or not tier.is_active:
            raise ValidationException(message="Selected hardware tier is not available", error_code="TIER_NOT_AVAILABLE")

        # Task 2 — Time Validation
        now_utc = datetime.now(timezone.utc)
        start_datetime = datetime.combine(booking_in.session_date, booking_in.start_time).replace(tzinfo=timezone.utc)

        if start_datetime - now_utc < timedelta(minutes=30):
            raise ValidationException(
                message="Booking start time must be at least 30 minutes in the future",
                error_code="INVALID_START_TIME"
            )

        if booking_in.duration_hours < 0.5 or booking_in.duration_hours > 8.0:
            raise ValidationException(
                message="Duration must be between 0.5 and 8.0 hours",
                error_code="INVALID_DURATION"
            )

        end_datetime = start_datetime + timedelta(hours=booking_in.duration_hours)
        end_time = end_datetime.time()

        # Task 1 — Seat Availability Checking
        overlapping_count = await self.booking_repo.get_overlapping_bookings_count(
            tier_id=tier.id,
            session_date=booking_in.session_date,
            start_time=booking_in.start_time,
            end_time=end_time
        )

        if overlapping_count >= tier.seats_in_tier:
            raise ValidationException(
                message="This hardware tier is fully booked for the selected time slot",
                error_code="TIER_FULLY_BOOKED"
            )

        # Task 3 — Financial Math (Decimal)
        price_per_hour = Decimal(str(tier.price_per_hour))
        duration = Decimal(str(booking_in.duration_hours))
        
        base_amount = price_per_hour * duration
        discount_amount = Decimal('0.00')
        subtotal = base_amount - discount_amount
        gateway_fee = (subtotal * Decimal('0.02')).quantize(Decimal('0.01'))
        total_amount = subtotal + gateway_fee

        # Task 4 — Booking Reference Generation
        booking_ref = self._generate_reference()

        booking_dict = {
            "id": uuid4(),
            "booking_reference": booking_ref,
            "gamer_id": gamer_id,
            "cafe_id": booking_in.cafe_id,
            "hardware_tier_id": booking_in.hardware_tier_id,
            "session_date": booking_in.session_date,
            "start_time": booking_in.start_time,
            "end_time": end_time,
            "duration_hours": float(duration),
            "base_amount": float(base_amount),
            "discount_amount": float(discount_amount),
            "gateway_fee": float(gateway_fee),
            "total_amount": float(total_amount),
            "status": BookingStatus.PENDING_PAYMENT,
            "promotion_id": booking_in.promotion_id,
            "notes": booking_in.notes
        }

        created = await self.booking_repo.create(booking_dict)
        return BookingResponse.model_validate(created)

    async def get_booking(self, booking_id: UUID, current_user: User) -> BookingResponse:
        booking = await self.booking_repo.get_by_id(booking_id)
        if not booking:
            raise NotFoundException(message="Booking not found", error_code="BOOKING_NOT_FOUND")

        # Check permissions: Gamer who owns booking OR Owner of the cafe OR Admin
        is_owner = False
        if current_user.role == UserRole.ADMIN or str(booking.gamer_id) == str(current_user.id):
            is_owner = True
        elif self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(booking.cafe_id)
            if cafe and str(cafe.owner_id) == str(current_user.id):
                is_owner = True

        if not is_owner:
            raise ForbiddenException(message="You do not have permission to view this booking", error_code="FORBIDDEN")

        return BookingResponse.model_validate(booking)

    async def list_gamer_bookings(self, gamer_id: UUID, page: int = 1, limit: int = 20) -> Dict[str, Any]:
        limit = min(limit, 50)
        items, total = await self.booking_repo.get_by_gamer_id(gamer_id, page=page, limit=limit)
        total_pages = math.ceil(total / limit) if total > 0 else 0
        return {
            "items": [BookingResponse.model_validate(b) for b in items],
            "total": total,
            "page": page,
            "pageSize": limit,
            "totalPages": total_pages
        }

    async def cancel_booking(self, booking_id: UUID, current_user: User, reason: Optional[str] = None) -> BookingResponse:
        booking = await self.booking_repo.get_by_id(booking_id)
        if not booking:
            raise NotFoundException(message="Booking not found", error_code="BOOKING_NOT_FOUND")

        if str(booking.gamer_id) != str(current_user.id) and current_user.role != UserRole.ADMIN:
            raise ForbiddenException(message="You can only cancel your own booking", error_code="FORBIDDEN")

        if booking.status not in (BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED):
            raise ValidationException(
                message=f"Cannot cancel booking with status '{booking.status.value}'",
                error_code="INVALID_BOOKING_STATUS"
            )

        # Task 5 — Cancellation Window Check (2 hours)
        now_utc = datetime.now(timezone.utc)
        start_datetime = datetime.combine(booking.session_date, booking.start_time).replace(tzinfo=timezone.utc)

        if start_datetime - now_utc < timedelta(hours=2):
            raise ValidationException(
                message="Cancellations are only allowed up to 2 hours before the session",
                error_code="CANCELLATION_WINDOW_EXPIRED"
            )

        updated = await self.booking_repo.update(booking_id, {
            "status": BookingStatus.CANCELLED,
            "cancelled_at": now_utc,
            "cancellation_reason": reason
        })

        return BookingResponse.model_validate(updated)
