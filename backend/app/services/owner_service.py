import math
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timezone, date, time

from app.repositories.booking_repository import BookingRepository
from app.repositories.cafe_repository import CafeRepository
from app.schemas.owner import (
    OwnerDashboardResponse,
    OwnerBookingItemResponse,
    OwnerBookingListResponse,
    OwnerStatusUpdateRequest
)
from app.schemas.booking import BookingResponse
from app.models.booking import Booking, BookingStatus
from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException

class OwnerService:
    def __init__(self, booking_repo: BookingRepository, cafe_repo: CafeRepository):
        self.booking_repo = booking_repo
        self.cafe_repo = cafe_repo

    async def get_dashboard_stats(self, owner_id: UUID) -> OwnerDashboardResponse:
        owner_cafes = await self.cafe_repo.get_by_owner_id(owner_id)
        if not owner_cafes:
            return OwnerDashboardResponse(
                total_cafes=0,
                total_bookings_this_month=0,
                revenue_this_month=0.0,
                upcoming_bookings_today=0,
                occupancy_rate_this_week=0.0,
                most_popular_tier=None
            )

        cafe_ids = [c.id for c in owner_cafes]

        total_cafes = len(owner_cafes)
        total_bookings = await self.booking_repo.count_bookings_this_month(cafe_ids)
        revenue = await self.booking_repo.sum_revenue_this_month(cafe_ids)
        upcoming_today = await self.booking_repo.count_upcoming_today(cafe_ids)

        booked_hours = await self.booking_repo.get_booked_hours_this_week(cafe_ids)
        possible_hours = await self.booking_repo.get_total_possible_hours_this_week(cafe_ids)
        occupancy_rate = round((booked_hours / possible_hours) * 100, 2) if possible_hours > 0 else 0.0

        most_popular_tier = await self.booking_repo.get_most_popular_tier_this_month(cafe_ids)

        return OwnerDashboardResponse(
            total_cafes=total_cafes,
            total_bookings_this_month=total_bookings,
            revenue_this_month=revenue,
            upcoming_bookings_today=upcoming_today,
            occupancy_rate_this_week=occupancy_rate,
            most_popular_tier=most_popular_tier
        )

    async def get_owner_bookings(
        self,
        owner_id: UUID,
        cafe_id: Optional[UUID] = None,
        status_filter: Optional[str] = None,
        date_filter: Optional[date] = None,
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        limit = min(limit, 50)
        owner_cafes = await self.cafe_repo.get_by_owner_id(owner_id)
        if not owner_cafes:
            return {
                "items": [],
                "total": 0,
                "page": page,
                "pageSize": limit,
                "totalPages": 0
            }

        cafe_ids = [c.id for c in owner_cafes]

        if cafe_id and cafe_id not in cafe_ids:
            raise ForbiddenException(message="You can only view bookings for your own café", error_code="FORBIDDEN")

        items_tuples, total = await self.booking_repo.get_owner_bookings_joined(
            cafe_ids=cafe_ids,
            cafe_id_filter=cafe_id,
            status_filter=status_filter,
            date_filter=date_filter,
            page=page,
            limit=limit
        )

        item_responses: List[OwnerBookingItemResponse] = []
        for booking, gamer_name, tier_name, cafe_name in items_tuples:
            booking_dict = BookingResponse.model_validate(booking).model_dump()
            booking_dict["gamer_name"] = gamer_name
            booking_dict["tier_name"] = tier_name
            booking_dict["cafe_name"] = cafe_name
            item_responses.append(OwnerBookingItemResponse.model_validate(booking_dict))

        total_pages = math.ceil(total / limit) if total > 0 else 0
        return {
            "items": item_responses,
            "total": total,
            "page": page,
            "pageSize": limit,
            "totalPages": total_pages
        }

    async def update_booking_status(
        self,
        booking_id: UUID,
        owner_id: UUID,
        new_status: str
    ) -> BookingResponse:
        if new_status not in ("completed", "no_show"):
            raise ValidationException(
                message="Target status must be 'completed' or 'no_show'",
                error_code="INVALID_BOOKING_STATUS"
            )

        booking = await self.booking_repo.get_by_id(booking_id)
        if not booking:
            raise NotFoundException(message="Booking not found", error_code="BOOKING_NOT_FOUND")

        cafe = await self.cafe_repo.get_by_id(booking.cafe_id)
        if not cafe or str(cafe.owner_id) != str(owner_id):
            raise ForbiddenException(message="You can only update bookings for your own café", error_code="FORBIDDEN")

        # State machine check: must transition FROM confirmed TO completed or no_show
        if booking.status != BookingStatus.CONFIRMED:
            raise ValidationException(
                message=f"Cannot update status from '{booking.status.value}' to '{new_status}'",
                error_code="INVALID_BOOKING_STATUS"
            )

        now_utc = datetime.now(timezone.utc)
        session_start = datetime.combine(booking.session_date, booking.start_time).replace(tzinfo=timezone.utc)
        session_end = datetime.combine(booking.session_date, booking.end_time).replace(tzinfo=timezone.utc)

        if new_status == "completed":
            if session_end > now_utc:
                raise ValidationException(
                    message="Cannot mark session as completed before the session ends",
                    error_code="SESSION_NOT_ENDED"
                )
            target_enum = BookingStatus.COMPLETED
        else: # no_show
            if session_start > now_utc:
                raise ValidationException(
                    message="Cannot mark session as no-show before the session starts",
                    error_code="SESSION_NOT_STARTED"
                )
            target_enum = BookingStatus.NO_SHOW

        updated = await self.booking_repo.update(booking_id, {"status": target_enum})
        return BookingResponse.model_validate(updated)

    async def checkin_booking(self, booking_id: UUID, owner_id: UUID) -> BookingResponse:
        booking = await self.booking_repo.get_by_id(booking_id)
        if not booking:
            raise NotFoundException(message="Booking not found", error_code="BOOKING_NOT_FOUND")

        cafe = await self.cafe_repo.get_by_id(booking.cafe_id)
        if not cafe or str(cafe.owner_id) != str(owner_id):
            raise ForbiddenException(message="You can only check in bookings for your own café", error_code="FORBIDDEN")

        if booking.status != BookingStatus.CONFIRMED:
            raise ValidationException(
                message=f"Cannot check in booking in status '{booking.status.value}'",
                error_code="INVALID_BOOKING_STATUS"
            )

        now_utc = datetime.now(timezone.utc)
        today = now_utc.date()
        
        # Verify it is scheduled for today
        if booking.session_date != today:
            raise ValidationException(
                message=f"Booking is scheduled for {booking.session_date}, not today ({today})",
                error_code="INVALID_CHECKIN_DATE"
            )

        session_start = datetime.combine(booking.session_date, booking.start_time).replace(tzinfo=timezone.utc)
        
        # Allow check-in from 15 minutes before session to 30 minutes after session starts
        if now_utc < (session_start - timedelta(minutes=15)):
            raise ValidationException(
                message="Check-in window has not opened yet (starts 15 minutes before session)",
                error_code="CHECKIN_WINDOW_NOT_OPEN"
            )
        if now_utc > (session_start + timedelta(minutes=30)):
            raise ValidationException(
                message="Check-in window has expired (expired 30 minutes after session start)",
                error_code="CHECKIN_WINDOW_EXPIRED"
            )

        updated = await self.booking_repo.update(booking_id, {
            "actual_start_time": now_utc,
            "checkin_method": "qr_scan"
        })
        return BookingResponse.model_validate(updated)

    async def emergency_close_day(self, owner_id: UUID, cafe_id: UUID, closure_date: date) -> List[BookingResponse]:
        cafe = await self.cafe_repo.get_by_id(cafe_id)
        if not cafe or str(cafe.owner_id) != str(owner_id):
            raise ForbiddenException(message="You can only close your own café", error_code="FORBIDDEN")

        # Fetch all future/active bookings for that day
        stmt = select(Booking).where(
            Booking.cafe_id == cafe_id,
            Booking.session_date == closure_date,
            Booking.status.in_([BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED])
        )
        res = await self.booking_repo.db.execute(stmt)
        bookings_to_cancel = res.scalars().all()

        cancelled_bookings = []
        now_utc = datetime.now(timezone.utc)
        for b in bookings_to_cancel:
            updated = await self.booking_repo.update(b.id, {
                "status": BookingStatus.CANCELLED,
                "cancelled_at": now_utc,
                "cancellation_reason": "Emergency café closure"
            })
            cancelled_bookings.append(BookingResponse.model_validate(updated))

        return cancelled_bookings
