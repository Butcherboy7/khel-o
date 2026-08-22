import string
import random
import math
from decimal import Decimal
from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from datetime import datetime, timezone, timedelta, date, time

from app.core.time import IST, session_end_ist
from app.config import settings
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
import logging

logger = logging.getLogger(__name__)

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

    async def _notify_owner(self, cafe_id: UUID, title: str, message: str, notification_type: str = "system", link: Optional[str] = None) -> None:
        """Best-effort in-app notification for the café owner. Never blocks the booking flow."""
        try:
            if not self.cafe_repo:
                return
            cafe = await self.cafe_repo.get_by_id(cafe_id)
            if not cafe or not cafe.owner_id:
                return
            from app.models.notification import Notification
            notif = Notification(
                id=uuid4(),
                user_id=cafe.owner_id,
                title=title,
                message=message,
                notification_type=notification_type,
                is_read=False,
                link=link
            )
            self.booking_repo.db.add(notif)
            await self.booking_repo.db.commit()
        except Exception as e:
            logger.error(f"Failed to write owner notification for cafe {cafe_id}: {e}")

    async def create_booking(self, gamer_id: UUID, booking_in: BookingCreateRequest) -> BookingResponse:
        # Validate Cafe
        cafe = None
        if self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(booking_in.cafe_id)
            if not cafe or cafe.verification_status != VerificationStatus.VERIFIED or not cafe.is_active:
                raise ValidationException(message="Café is not available for booking", error_code="CAFE_NOT_AVAILABLE")
            if cafe.is_emergency_mode:
                raise ValidationException(message="Café is currently in emergency mode and not accepting new bookings", error_code="EMERGENCY_MODE_ACTIVE")
            if cafe.bookings_paused:
                raise ValidationException(message="Café is currently not accepting new bookings", error_code="BOOKINGS_PAUSED")
            effective_stations = cafe.bookable_stations if cafe.bookable_stations > 0 else (cafe.total_seats or 10)
            if effective_stations <= 0:
                raise ValidationException(message="Café has no bookable stations available", error_code="NO_BOOKABLE_STATIONS")

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

        # Overnight sessions (end_time <= start_time, e.g. 22:30 -> 00:30) are
        # not yet supported: the capacity overlap query in
        # booking_repository.get_overlapping_bookings_count compares
        # start_time/end_time as pure wall-clock values with no date
        # component, so two overnight bookings that both wrap past midnight
        # never register as overlapping and capacity can be oversold. Until
        # that query is made date-aware, refuse the booking outright rather
        # than risk taking payment for a slot that can't be honoured.
        if end_time <= booking_in.start_time:
            raise ValidationException(
                message="This session would run past midnight, which isn't supported yet. "
                        "Please choose a start time and duration that stay within the same day.",
                error_code="OVERNIGHT_BOOKING_UNSUPPORTED"
            )

        seats_requested = getattr(booking_in, 'seats_count', 1)

        # Seat Availability Checking (with locking) - uses tier app_bookable_seats for inventory
        overlapping_count, capacity = await self.booking_repo.get_overlapping_bookings_count_with_lock(
            tier_id=tier.id,
            session_date=booking_in.session_date,
            start_time=booking_in.start_time,
            end_time=end_time,
            use_cafe_capacity=False,
            cafe_id=booking_in.cafe_id
        )

        if overlapping_count + seats_requested > capacity:
            raise ValidationException(
                message=f"Requested {seats_requested} seat(s) exceeds remaining capacity ({capacity - overlapping_count} available)",
                error_code="SLOT_OVERCAPACITY"
            )
        
        gamer_daily_seats = await self.booking_repo.get_gamer_daily_seats_count(
            gamer_id=gamer_id,
            cafe_id=booking_in.cafe_id,
            session_date=booking_in.session_date
        )
        
        if gamer_daily_seats + seats_requested > 60:
            raise ValidationException(
                message=f"Exceeded maximum cumulative booking limit of 60 seats per user per venue per day (you have {gamer_daily_seats} seats booked)",
                error_code="USER_DAILY_LIMIT_EXCEEDED"
            )

        # Financial Math (Decimal) & Promotion Application
        price_per_hour = Decimal(str(tier.price_per_hour))
        duration = Decimal(str(booking_in.duration_hours))
        base_amount = price_per_hour * duration * seats_requested

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
        # Single combined platform service fee (Razorpay's real cost + KHEL-O's
        # margin) — see Settings.RAZORPAY_COST_PERCENT / PLATFORM_MARGIN_PERCENT.
        # Stored in the `gateway_fee` column for backward compatibility; the old
        # separate flat convenience fee is retired (kept at 0, not removed from
        # the schema, so historical bookings still read correctly).
        service_fee_percent = Decimal(str(settings.RAZORPAY_COST_PERCENT)) + Decimal(str(settings.PLATFORM_MARGIN_PERCENT))
        gateway_fee = (subtotal * service_fee_percent / Decimal('100')).quantize(Decimal('0.01'))
        convenience_fee = Decimal('0.00')
        total_amount = subtotal + gateway_fee + convenience_fee

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
            "seats_count": seats_requested,
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

        # promotion_id's current_uses was already incremented inside
        # apply_promotion_to_booking, atomically under the same row lock that
        # served the max_uses check above — no separate increment here.

        return BookingResponse.model_validate(created)

    async def get_booking(self, booking_id: UUID, current_user: User) -> BookingResponse:
        booking = await self.booking_repo.get_by_id(booking_id)
        if not booking:
            raise NotFoundException(message="Booking not found", error_code="BOOKING_NOT_FOUND")

        await self._expire_if_past_due(booking)

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

        # Compute cancel policy
        from app.schemas.booking import CancelPolicy
        if booking.status in (BookingStatus.CANCELLED, BookingStatus.COMPLETED, BookingStatus.NO_SHOW):
            resp.cancel_policy = CancelPolicy(allowed=False, reason=f"Booking already {booking.status.value}")
        elif booking.status not in (BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED):
            resp.cancel_policy = CancelPolicy(allowed=False, reason=f"Booking status '{booking.status.value}' cannot be cancelled")
        else:
            start_datetime = datetime.combine(booking.session_date, booking.start_time).replace(tzinfo=IST)
            now_ist = datetime.now(IST)
            if start_datetime - now_ist < timedelta(hours=2):
                time_diff = start_datetime - now_ist
                hours_left = time_diff.total_seconds() / 3600
                resp.cancel_policy = CancelPolicy(
                    allowed=False, 
                    reason=f"Cancellation window expired (must be 2+ hours before session, currently {hours_left:.1f} hours remaining)"
                )
            else:
                resp.cancel_policy = CancelPolicy(allowed=True, reason="")

        return resp

    async def _expire_if_past_due(self, booking: Booking, grace_minutes: int = 15) -> None:
        """Self-heals a CONFIRMED booking to NO_SHOW once its session end time
        (+ grace period) has passed without a check-in. There is no background
        scheduler in this service, so this runs lazily whenever a booking is
        read — mirrors the manual confirmed->no_show transition owners can
        already trigger in owner_service.advance_status."""
        if booking.status != BookingStatus.CONFIRMED:
            return

        # NOTE: session_end_ist internally calls datetime.combine (via
        # session_start_ist in app.core.time) — a real, unpatched datetime,
        # not this module's `datetime` name. Only "now" needs to be frozen in
        # tests, so this is safe and keeps test_booking_time_validation.py's
        # `monkeypatch.setattr(booking_service_module, "datetime", ...)`
        # working exactly as before.
        session_end = session_end_ist(booking.session_date, booking.start_time, booking.end_time)
        if datetime.now(IST) < session_end + timedelta(minutes=grace_minutes):
            return

        updated = await self.booking_repo.update(booking.id, {"status": BookingStatus.NO_SHOW})
        if updated:
            booking.status = BookingStatus.NO_SHOW

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
            await self._expire_if_past_due(b)
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

        if booking.status not in (BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED, BookingStatus.FAILED):
            raise ValidationException(
                message=f"Cannot cancel booking with status '{booking.status.value}'",
                error_code="INVALID_BOOKING_STATUS"
            )

        was_confirmed = booking.status == BookingStatus.CONFIRMED
        
        # Cancellation window restriction ONLY applies to CONFIRMED (paid) bookings
        # PENDING_PAYMENT and FAILED bookings can be cancelled immediately without time restriction
        if was_confirmed:
            now_utc = datetime.now(timezone.utc)
            now_ist = datetime.now(IST)
            start_datetime = datetime.combine(booking.session_date, booking.start_time).replace(tzinfo=IST)

            if start_datetime - now_ist < timedelta(hours=2):
                raise ValidationException(
                    message="Cancellations are only allowed up to 2 hours before the session",
                    error_code="CANCELLATION_WINDOW_EXPIRED"
                )

        now_utc = datetime.now(timezone.utc)
        updated = await self.booking_repo.update(booking_id, {
            "status": BookingStatus.CANCELLED,
            "cancelled_at": now_utc,
            "cancellation_reason": reason
        })

        # Trigger refund for CONFIRMED (paid) bookings
        if was_confirmed:
            try:
                from app.services.payment_service import PaymentService
                from app.repositories.payment_repository import PaymentRepository
                
                payment_repo = PaymentRepository(self.booking_repo.db)
                payment_service = PaymentService(payment_repo, self.booking_repo)
                
                refund_result = await payment_service.process_refund(booking_id, current_user.id)
                if refund_result.get("status") == "refund_api_failed":
                    logger.error(f"Refund FAILED for cancelled booking {booking_id} — needs manual processing: {refund_result}")
                else:
                    logger.info(f"Refund initiated for booking {booking_id}: {refund_result}")
            except Exception as e:
                logger.error(f"Failed to process refund for booking {booking_id}: {e}")
                # Booking is still cancelled, but refund may need manual processing

        await self._notify_owner(
            cafe_id=booking.cafe_id,
            title="Booking cancelled",
            message=f"Booking {booking.booking_reference} for {booking.session_date} was cancelled by the customer.",
            notification_type="booking_cancelled",
            link=f"/owner/bookings?ref={booking.booking_reference}"
        )

        return BookingResponse.model_validate(updated)
