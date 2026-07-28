import uuid
from datetime import datetime, time, timedelta, timezone
from uuid import UUID
from typing import List
from app.repositories.booking_repository import BookingRepository
from app.schemas.booking import BookingCreate, BookingResponse
from app.models.booking import Booking, BookingStatus
from app.core.exceptions import BookingException, NotFoundException

class BookingService:
    def __init__(self, booking_repo: BookingRepository):
        self.booking_repo = booking_repo

    async def create_booking(self, gamer_id: UUID, booking_in: BookingCreate) -> BookingResponse:
        booking_ref = f"GC-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        
        # Simple calculations
        base_amount = 120.0 * booking_in.duration_hours
        discount_amount = 0.0
        gateway_fee = base_amount * 0.02 # 2% pass-through
        total_amount = base_amount - discount_amount + gateway_fee
        
        start_dt = datetime.combine(booking_in.session_date, booking_in.start_time)
        end_dt = start_dt + timedelta(hours=booking_in.duration_hours)

        booking = Booking(
            booking_reference=booking_ref,
            gamer_id=gamer_id,
            cafe_id=booking_in.cafe_id,
            hardware_tier_id=booking_in.hardware_tier_id,
            session_date=booking_in.session_date,
            start_time=booking_in.start_time,
            end_time=end_dt.time(),
            duration_hours=booking_in.duration_hours,
            base_amount=base_amount,
            discount_amount=discount_amount,
            gateway_fee=gateway_fee,
            total_amount=total_amount,
            status=BookingStatus.PENDING_PAYMENT,
            promotion_id=booking_in.promotion_id,
            notes=booking_in.notes,
        )
        created = await self.booking_repo.create(booking)
        return BookingResponse.model_validate(created)

    async def get_booking(self, booking_id: UUID) -> BookingResponse:
        booking = await self.booking_repo.get_by_id(booking_id)
        if not booking:
            raise NotFoundException(message="Booking not found", error_code="BOOKING_NOT_FOUND")
        return BookingResponse.model_validate(booking)

    async def list_gamer_bookings(self, gamer_id: UUID) -> List[BookingResponse]:
        bookings = await self.booking_repo.get_by_gamer(gamer_id)
        return [BookingResponse.model_validate(b) for b in bookings]
