import math
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timezone, timedelta, date, time

# KHEL-O is an India-only platform. session_date/start_time/end_time are
# stored as IST wall-clock values (see booking_service.py) - must be
# interpreted as IST here too, not UTC, or every auto-transition and
# no-show check runs 5.5 hours off from the real session time.
IST = timezone(timedelta(hours=5, minutes=30))

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
from app.models.user import User, UserRole
from app.models.cafe import Cafe
from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException

class OwnerService:
    def __init__(self, booking_repo: BookingRepository, cafe_repo: CafeRepository):
        self.booking_repo = booking_repo
        self.cafe_repo = cafe_repo

    async def get_dashboard_stats(self, owner_id: UUID) -> OwnerDashboardResponse:
        owner_cafes = await self.cafe_repo.get_by_owner_id(owner_id)
        if not owner_cafes:
            from app.models.user_role import UserRoleMapping
            from sqlalchemy import select
            stmt_staff = select(Cafe).join(
                UserRoleMapping, UserRoleMapping.cafe_id == Cafe.id
            ).where(
                UserRoleMapping.user_id == owner_id,
                UserRoleMapping.role == UserRole.STAFF
            )
            res_staff = await self.booking_repo.db.execute(stmt_staff)
            owner_cafes = list(res_staff.scalars().all())

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
            booking = await self.auto_transition_booking(booking)
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

    async def auto_transition_booking(self, booking: Booking) -> Booking:
        """Lazy-write status transitions based on current time."""
        now_utc = datetime.now(timezone.utc)
        session_start = datetime.combine(booking.session_date, booking.start_time).replace(tzinfo=timezone.utc)
        session_end = datetime.combine(booking.session_date, booking.end_time).replace(tzinfo=timezone.utc)
        
        if booking.status == BookingStatus.CONFIRMED:
            if now_utc >= session_end:
                updated = await self.booking_repo.update(booking.id, {"status": BookingStatus.NO_SHOW})
                return updated or booking
        elif booking.status == BookingStatus.CHECKED_IN:
            if now_utc >= session_start:
                updated = await self.booking_repo.update(booking.id, {"status": BookingStatus.ACTIVE})
                return updated or booking
        elif booking.status == BookingStatus.ACTIVE:
            if now_utc >= session_end:
                updated = await self.booking_repo.update(booking.id, {"status": BookingStatus.COMPLETED})
                return updated or booking
        return booking

    async def update_booking_status(
        self,
        booking_id: UUID,
        current_user: User,
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

        await self._validate_user_cafe_access(current_user, booking.cafe_id)

        # State machine check: can mark completed/no_show from confirmed, checked_in, or active
        if booking.status not in (BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.ACTIVE):
            raise ValidationException(
                message=f"Cannot update status from '{booking.status.value}' to '{new_status}'",
                error_code="INVALID_BOOKING_STATUS"
            )

        now_utc = datetime.now(timezone.utc)
        session_start = datetime.combine(booking.session_date, booking.start_time).replace(tzinfo=timezone.utc)

        if new_status == "completed":
            target_enum = BookingStatus.COMPLETED
            update_dict = {"status": target_enum, "actual_end_time": now_utc}
        else: # no_show
            if session_start > now_utc:
                raise ValidationException(
                    message="Cannot mark session as no-show before the session starts",
                    error_code="SESSION_NOT_STARTED"
                )
            target_enum = BookingStatus.NO_SHOW
            update_dict = {"status": target_enum}

        updated = await self.booking_repo.update(booking_id, update_dict)
        return BookingResponse.model_validate(updated)

    async def _validate_user_cafe_access(self, user: User, cafe_id: UUID):
        role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
        cafe = await self.cafe_repo.get_by_id(cafe_id)
        if not cafe:
            raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")

        if role_val == "staff":
            from sqlalchemy import select
            from app.models.user_role import UserRoleMapping
            from app.models.user import UserRole
            stmt = select(UserRoleMapping).where(
                UserRoleMapping.user_id == user.id,
                UserRoleMapping.role == UserRole.STAFF,
                UserRoleMapping.cafe_id == cafe_id
            )
            res = await self.booking_repo.db.execute(stmt)
            if not res.scalars().first():
                raise ForbiddenException(message="Staff members can only access bookings for their assigned café", error_code="FORBIDDEN")
        elif role_val in ("cafe_owner", "owner"):
            if str(cafe.owner_id) != str(user.id):
                raise ForbiddenException(message="You can only manage bookings for your own café", error_code="FORBIDDEN")
        elif role_val != "admin":
            raise ForbiddenException(message="Forbidden", error_code="FORBIDDEN")

        return cafe

    async def checkin_booking(self, booking_id: UUID, current_user: User) -> BookingResponse:
        booking = await self.booking_repo.get_by_id(booking_id)
        if not booking:
            raise NotFoundException(message="Booking not found", error_code="BOOKING_NOT_FOUND")

        await self._validate_user_cafe_access(current_user, booking.cafe_id)

        # Allow check-in for confirmed and already checked-in bookings
        if booking.status not in (BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN):
            raise ValidationException(
                message=f"Cannot check in booking in status '{booking.status.value}'",
                error_code="INVALID_BOOKING_STATUS"
            )

        now_utc = datetime.now(timezone.utc)
        update_fields: dict = {
            "status": BookingStatus.CHECKED_IN,
            "checked_in_by": current_user.id,
            "checked_in_at": now_utc,
            "actual_start_time": now_utc,
            "checkin_method": "owner_desk"
        }

        updated = await self.booking_repo.update(booking_id, update_fields)
        if updated:
            updated = await self.auto_transition_booking(updated)

        # Notify the owner when a staff member (not the owner themself) performs the check-in
        if current_user.role == UserRole.STAFF:
            try:
                cafe = await self.cafe_repo.get_by_id(booking.cafe_id)
                if cafe and cafe.owner_id:
                    from app.models.notification import Notification
                    import uuid as _uuid
                    notif = Notification(
                        id=_uuid.uuid4(),
                        user_id=cafe.owner_id,
                        title="Customer checked in",
                        message=f"{current_user.full_name or 'Staff'} checked in booking {booking.booking_reference}.",
                        notification_type="system",
                        is_read=False,
                        link=f"/owner/bookings?ref={booking.booking_reference}"
                    )
                    self.booking_repo.db.add(notif)
                    await self.booking_repo.db.commit()
            except Exception:
                pass

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
            was_confirmed = b.status == BookingStatus.CONFIRMED
            updated = await self.booking_repo.update(b.id, {
                "status": BookingStatus.CANCELLED,
                "cancelled_at": now_utc,
                "cancellation_reason": "Emergency café closure"
            })
            cancelled_bookings.append(BookingResponse.model_validate(updated))

            # Café-initiated cancellations always refund in full, regardless of
            # timing — unlike a gamer's own cancellation there's no 2-hour cutoff
            # here, since the gamer didn't choose to cancel.
            if was_confirmed:
                try:
                    from app.services.payment_service import PaymentService
                    from app.repositories.payment_repository import PaymentRepository

                    payment_repo = PaymentRepository(self.booking_repo.db)
                    payment_service = PaymentService(payment_repo, self.booking_repo)
                    await payment_service.process_refund(b.id, owner_id)
                except Exception as e:
                    from app.core.logging import logger
                    logger.error(f"Failed to process refund for emergency-cancelled booking {b.id}: {e}")

        return cancelled_bookings
