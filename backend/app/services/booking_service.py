import string
import random
import math
from decimal import Decimal
from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from datetime import datetime, timezone, timedelta, date, time

# KHEL-O is an India-only platform. All customer-submitted booking times
# are in IST (UTC+5:30). We interpret them as IST for validation.
IST = timezone(timedelta(hours=5, minutes=30))

from app.repositories.booking_repository import BookingRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.services.promotion_service import PromotionService
from app.schemas.booking import BookingCreateRequest, BookingResponse, BookingCancelRequest
from app.models.booking import Booking, BookingStatus
from app.models.user import User, UserRole
from app.models.cafe import VerificationStatus
from app.models.platform_fee import PlatformFee
from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException

class BookingService:
    def __init__(
        self,
        booking_repo: BookingRepository,
        cafe_repo: Optional[CafeRepository] = None,
        tier_repo: Optional[HardwareTierRepository] = None,
        promo_service: Optional[PromotionService] = None
    ):
        self.booking_repo = booking_repo
        self.cafe_repo = cafe_repo
        self.tier_repo = tier_repo
        self.promo_service = promo_service

    def _generate_reference(self) -> str:
        year = datetime.now(timezone.utc).year
        random_suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        return f"GC-{year}-{random_suffix}"

    async def create_booking(self, gamer_id: UUID, booking_in: BookingCreateRequest) -> BookingResponse:
        # Validate Cafe
        cafe = None
        if self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(booking_in.cafe_id)
            if not cafe or cafe.verification_status in (VerificationStatus.REJECTED, VerificationStatus.SUSPENDED) or not cafe.is_active:
                raise ValidationException(message="Café is not available for booking", error_code="CAFE_NOT_AVAILABLE")
            if cafe.is_emergency_mode:
                raise ValidationException(message="Café is currently in emergency mode and not accepting new bookings", error_code="EMERGENCY_MODE_ACTIVE")

        # Validate Hardware Tier
        if not self.tier_repo:
            raise ValidationException(message="Hardware tier repository missing", error_code="INTERNAL_ERROR")

        tier = await self.tier_repo.get_by_id(booking_in.hardware_tier_id)
        if not tier or str(tier.cafe_id) != str(booking_in.cafe_id) or not tier.is_active:
            raise ValidationException(message="Selected hardware tier is not available", error_code="TIER_NOT_AVAILABLE")

        # Time Validation — all submitted times are IST (UTC+5:30)
        now_ist = datetime.now(IST)
        start_datetime = datetime.combine(booking_in.session_date, booking_in.start_time).replace(tzinfo=IST)

        if start_datetime - now_ist < timedelta(minutes=30):
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

        # Seat Availability Checking (with locking)
        overlapping_count, app_bookable_seats = await self.booking_repo.get_overlapping_bookings_count_with_lock(
            tier_id=tier.id,
            session_date=booking_in.session_date,
            start_time=booking_in.start_time,
            end_time=end_time
        )

        if overlapping_count >= app_bookable_seats:
            raise ValidationException(
                message="This hardware tier is fully booked for the selected time slot",
                error_code="TIER_FULLY_BOOKED"
            )

        # Financial Math (Decimal) & Promotion Application
        price_per_hour = Decimal(str(tier.price_per_hour))
        duration = Decimal(str(booking_in.duration_hours))
        base_amount = price_per_hour * duration

        discount_amount = Decimal('0.00')
        if booking_in.promotion_id:
            if not self.promo_service:
                raise ValidationException(message="Promotion service missing", error_code="INTERNAL_ERROR")
            discount_amount = await self.promo_service.apply_promotion_to_booking(
                promotion_id=booking_in.promotion_id,
                cafe_id=booking_in.cafe_id,
                tier_id=booking_in.hardware_tier_id,
                base_amount=base_amount
            )

        subtotal = base_amount - discount_amount
        gateway_fee = (subtotal * Decimal('0.02')).quantize(Decimal('0.01'))
        convenience_fee = Decimal('10.00')
        total_amount = subtotal + gateway_fee + convenience_fee

        # Unverified Café Cap Check
        if cafe and cafe.verification_status != VerificationStatus.VERIFIED:
            if cafe.booking_cap_count >= 15:
                raise ValidationException(
                    message="Booking cap reached for this unverified café.",
                    error_code="UNVERIFIED_CAFE_CAP_REACHED"
                )
            if float(cafe.booking_cap_total) + float(total_amount) > 5000.00:
                raise ValidationException(
                    message="Booking total amount cap reached for this unverified café.",
                    error_code="UNVERIFIED_CAFE_CAP_REACHED"
                )

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
            "convenience_fee": float(convenience_fee),
            "total_amount": float(total_amount),
            "status": BookingStatus.PENDING_PAYMENT,
            "promotion_id": booking_in.promotion_id,
            "notes": booking_in.notes
        }

        created = await self.booking_repo.create(booking_dict)

        # Create Platform Fee record
        platform_fee_dict = {
            "id": uuid4(),
            "booking_id": created.id,
            "convenience_fee": float(convenience_fee),
            "gateway_fee": float(gateway_fee),
            "tds_amount": 0.00,
            "owner_settlement_amount": float(subtotal)
        }
        fee_obj = PlatformFee(**platform_fee_dict)
        self.booking_repo.db.add(fee_obj)
        await self.booking_repo.db.commit()

        # Update unverified café caps if applicable
        if cafe:
            cafe.booking_cap_count += 1
            cafe.booking_cap_total = float(cafe.booking_cap_total) + float(total_amount)
            self.booking_repo.db.add(cafe)
            await self.booking_repo.db.commit()

        # Atomic increment of promotion current_uses after booking is saved
        if booking_in.promotion_id and self.promo_service:
            await self.promo_service.increment_promotion_uses(booking_in.promotion_id)

        return BookingResponse.model_validate(created)

    async def get_booking(self, booking_id: UUID, current_user: User) -> BookingResponse:
        booking = await self.booking_repo.get_by_id(booking_id)
        if not booking:
            raise NotFoundException(message="Booking not found", error_code="BOOKING_NOT_FOUND")

        is_owner = False
        if current_user.role == UserRole.ADMIN or str(booking.gamer_id) == str(current_user.id):
            is_owner = True
        elif self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(booking.cafe_id)
            if cafe and str(cafe.owner_id) == str(current_user.id):
                is_owner = True

        if not is_owner:
            raise ForbiddenException(message="You do not have permission to view this booking", error_code="FORBIDDEN")

        # Auto-generate QR code for confirmed bookings if missing
        if booking.status in (BookingStatus.CONFIRMED, BookingStatus.COMPLETED) and not booking.qr_code_url:
            from app.background.qr_generator import generate_and_save_qr_code
            qr_url = generate_and_save_qr_code(
                booking_id=str(booking.id),
                booking_reference=booking.booking_reference,
                cafe_id=str(booking.cafe_id)
            )
            booking = await self.booking_repo.update(booking.id, {"qr_code_url": qr_url})

        resp = BookingResponse.model_validate(booking)
        if booking.status not in (BookingStatus.CONFIRMED, BookingStatus.COMPLETED):
            resp.qr_code_url = None

        if self.cafe_repo:
            cafe_obj = await self.cafe_repo.get_by_id(booking.cafe_id)
            if cafe_obj:
                resp.cafe_name = cafe_obj.name
                resp.cafe_address = cafe_obj.address_line1
        if self.tier_repo:
            tier_obj = await self.tier_repo.get_by_id(booking.hardware_tier_id)
            if tier_obj:
                resp.tier_name = tier_obj.name

        return resp

    async def list_gamer_bookings(
        self,
        gamer_id: UUID,
        status_filter: Optional[str] = None,
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        limit = min(limit, 50)
        items_tuples, total = await self.booking_repo.get_by_gamer_id(
            gamer_id, status_filter=status_filter, page=page, limit=limit
        )
        total_pages = math.ceil(total / limit) if total > 0 else 0

        responses = []
        for b, c_name, c_addr, t_name in items_tuples:
            res = BookingResponse.model_validate(b)
            res.cafe_name = c_name
            res.cafe_address = c_addr
            res.tier_name = t_name
            responses.append(res)

        return {
            "items": responses,
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

        now_utc = datetime.now(timezone.utc)
        now_ist = datetime.now(IST)
        start_datetime = datetime.combine(booking.session_date, booking.start_time).replace(tzinfo=IST)

        if start_datetime - now_ist < timedelta(hours=2):
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
