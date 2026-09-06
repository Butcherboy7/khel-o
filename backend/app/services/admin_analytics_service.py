from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.cafe import Cafe, VerificationStatus
from app.models.booking import Booking, BookingStatus
from app.models.platform_fee import PlatformFee
from app.schemas.admin_analytics import ExecutiveDashboardResponse


class AdminAnalyticsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_executive_dashboard(self, period_days: int = 30) -> ExecutiveDashboardResponse:
        cutoff = datetime.now(timezone.utc) - timedelta(days=period_days)

        total_users = (await self.db.execute(select(func.count(User.id)))).scalar() or 0
        total_cafes = (await self.db.execute(select(func.count(Cafe.id)))).scalar() or 0
        active_cafes = (await self.db.execute(
            select(func.count(Cafe.id)).where(Cafe.verification_status == VerificationStatus.VERIFIED, Cafe.is_active == True)
        )).scalar() or 0
        new_users = (await self.db.execute(
            select(func.count(User.id)).where(User.created_at >= cutoff)
        )).scalar() or 0
        new_cafes = (await self.db.execute(
            select(func.count(Cafe.id)).where(Cafe.created_at >= cutoff)
        )).scalar() or 0

        counted_statuses = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED]
        period_bookings_row = (await self.db.execute(
            select(func.count(Booking.id), func.sum(Booking.total_amount))
            .where(Booking.status.in_(counted_statuses), Booking.created_at >= cutoff)
        )).first()
        bookings_this_period = period_bookings_row[0] or 0
        gmv = float(period_bookings_row[1] or 0.0)

        khel_revenue_row = (await self.db.execute(
            select(func.sum(PlatformFee.convenience_fee + PlatformFee.gateway_fee))
            .join(Booking, Booking.id == PlatformFee.booking_id)
            .where(Booking.status.in_(counted_statuses), Booking.created_at >= cutoff)
        )).scalar()
        khel_revenue = float(khel_revenue_row or 0.0)

        avg_booking_value = gmv / bookings_this_period if bookings_this_period else 0.0

        total_period_bookings = (await self.db.execute(
            select(func.count(Booking.id)).where(Booking.created_at >= cutoff)
        )).scalar() or 0
        cancelled_row = (await self.db.execute(
            select(func.count(Booking.id)).where(
                Booking.status.in_([BookingStatus.CANCELLED, BookingStatus.NO_SHOW]),
                Booking.created_at >= cutoff,
            )
        )).scalar() or 0
        cancellation_rate = (cancelled_row / total_period_bookings * 100) if total_period_bookings else 0.0

        repeat_gamers_row = (await self.db.execute(
            select(func.count())
            .select_from(
                select(Booking.gamer_id)
                .where(Booking.status.in_(counted_statuses))
                .group_by(Booking.gamer_id)
                .having(func.count(Booking.id) > 1)
                .subquery()
            )
        )).scalar() or 0
        distinct_gamers_row = (await self.db.execute(
            select(func.count(func.distinct(Booking.gamer_id))).where(Booking.status.in_(counted_statuses))
        )).scalar() or 0
        repeat_booking_rate = (repeat_gamers_row / distinct_gamers_row * 100) if distinct_gamers_row else 0.0

        return ExecutiveDashboardResponse(
            total_users=total_users,
            total_cafes=total_cafes,
            active_cafes=active_cafes,
            new_users_this_period=new_users,
            new_cafes_this_period=new_cafes,
            bookings_this_period=bookings_this_period,
            gmv=gmv,
            khel_revenue=khel_revenue,
            avg_booking_value=round(avg_booking_value, 2),
            cancellation_rate=round(cancellation_rate, 2),
            repeat_booking_rate=round(repeat_booking_rate, 2),
            period_days=period_days,
        )
