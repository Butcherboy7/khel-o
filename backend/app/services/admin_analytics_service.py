from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.cafe import Cafe, VerificationStatus
from app.models.booking import Booking, BookingStatus
from app.models.platform_fee import PlatformFee
from app.models.hardware_tier import HardwareTier
from app.schemas.admin_analytics import ExecutiveDashboardResponse, CafePerformanceItem, SetupPerformanceItem, CityGeographyItem, RevenueBreakdownResponse


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
                .where(Booking.status.in_(counted_statuses), Booking.created_at >= cutoff)
                .group_by(Booking.gamer_id)
                .having(func.count(Booking.id) > 1)
                .subquery()
            )
        )).scalar() or 0
        distinct_gamers_row = (await self.db.execute(
            select(func.count(func.distinct(Booking.gamer_id))).where(
                Booking.status.in_(counted_statuses), Booking.created_at >= cutoff
            )
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

    async def get_cafe_performance(self) -> list[CafePerformanceItem]:
        counted = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED]

        rows = (await self.db.execute(
            select(
                Cafe.id, Cafe.name, Cafe.city,
                func.count(Booking.id).label("bookings"),
                func.sum(Booking.total_amount).label("gmv"),
            )
            .join(Booking, Booking.cafe_id == Cafe.id)
            .where(Booking.status.in_(counted))
            .group_by(Cafe.id, Cafe.name, Cafe.city)
            .order_by(func.sum(Booking.total_amount).desc())
        )).all()

        results = []
        for cafe_id, name, city, bookings, gmv in rows:
            cancellations = (await self.db.execute(
                select(func.count(Booking.id)).where(
                    Booking.cafe_id == cafe_id,
                    Booking.status.in_([BookingStatus.CANCELLED, BookingStatus.NO_SHOW]),
                )
            )).scalar() or 0

            repeat_customers = (await self.db.execute(
                select(func.count()).select_from(
                    select(Booking.gamer_id)
                    .where(Booking.cafe_id == cafe_id, Booking.status.in_(counted))
                    .group_by(Booking.gamer_id)
                    .having(func.count(Booking.id) > 1)
                    .subquery()
                )
            )).scalar() or 0

            top_game_row = (await self.db.execute(
                select(Booking.game, func.count(Booking.id).label("cnt"))
                .where(Booking.cafe_id == cafe_id, Booking.status.in_(counted), Booking.game.is_not(None))
                .group_by(Booking.game)
                .order_by(func.count(Booking.id).desc())
                .limit(1)
            )).first()
            top_game = top_game_row[0] if top_game_row else None

            results.append(CafePerformanceItem(
                cafe_id=str(cafe_id),
                cafe_name=name,
                city=city,
                bookings=bookings,
                gmv=float(gmv or 0.0),
                cancellations=cancellations,
                repeat_customers=repeat_customers,
                avg_booking_value=round(float(gmv or 0.0) / bookings, 2) if bookings else 0.0,
                top_game=top_game,
            ))
        return results

    async def get_setup_performance(self) -> list[SetupPerformanceItem]:
        counted = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED]

        rows = (await self.db.execute(
            select(
                HardwareTier.platform,
                func.count(Booking.id).label("bookings"),
                func.sum(Booking.total_amount).label("gmv"),
                func.sum(Booking.duration_hours).label("hours"),
            )
            .join(Booking, Booking.hardware_tier_id == HardwareTier.id)
            .where(Booking.status.in_(counted))
            .group_by(HardwareTier.platform)
            .order_by(func.sum(Booking.total_amount).desc())
        )).all()

        seats_by_platform = dict((await self.db.execute(
            select(HardwareTier.platform, func.sum(HardwareTier.total_seats))
            .group_by(HardwareTier.platform)
        )).all())

        return [
            SetupPerformanceItem(
                platform=(platform.value if platform else "unspecified"),
                bookings=bookings,
                gmv=float(gmv or 0.0),
                total_seats=int(seats_by_platform.get(platform, 0) or 0),
                utilization_hours=float(hours or 0.0),
            )
            for platform, bookings, gmv, hours in rows
        ]

    async def get_geography(self) -> list[CityGeographyItem]:
        counted = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED]

        cafe_counts = dict((await self.db.execute(
            select(Cafe.city, func.count(Cafe.id)).group_by(Cafe.city)
        )).all())

        booking_rows = (await self.db.execute(
            select(Cafe.city, func.count(Booking.id), func.sum(Booking.total_amount))
            .join(Booking, Booking.cafe_id == Cafe.id)
            .where(Booking.status.in_(counted))
            .group_by(Cafe.city)
        )).all()
        booking_by_city = {city: (cnt, float(gmv or 0.0)) for city, cnt, gmv in booking_rows}

        return [
            CityGeographyItem(
                city=city,
                cafe_count=count,
                bookings=booking_by_city.get(city, (0, 0.0))[0],
                gmv=booking_by_city.get(city, (0, 0.0))[1],
            )
            for city, count in cafe_counts.items()
        ]

    async def get_revenue_breakdown(self) -> RevenueBreakdownResponse:
        counted = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED]

        totals_row = (await self.db.execute(
            select(
                func.sum(Booking.total_amount),
                func.sum(PlatformFee.convenience_fee + PlatformFee.gateway_fee),
                func.sum(PlatformFee.owner_settlement_amount),
            )
            .join(PlatformFee, PlatformFee.booking_id == Booking.id)
            .where(Booking.status.in_(counted))
        )).first()
        gmv = float(totals_row[0] or 0.0)
        khel_revenue = float(totals_row[1] or 0.0)
        owner_settlements = float(totals_row[2] or 0.0)

        by_city_rows = (await self.db.execute(
            select(Cafe.city, func.sum(Booking.total_amount))
            .join(Booking, Booking.cafe_id == Cafe.id)
            .where(Booking.status.in_(counted))
            .group_by(Cafe.city)
        )).all()
        revenue_by_city = {city: float(total or 0.0) for city, total in by_city_rows}

        by_platform_rows = (await self.db.execute(
            select(HardwareTier.platform, func.sum(Booking.total_amount))
            .join(Booking, Booking.hardware_tier_id == HardwareTier.id)
            .where(Booking.status.in_(counted))
            .group_by(HardwareTier.platform)
        )).all()
        revenue_by_platform = {
            (platform.value if platform else "unspecified"): float(total or 0.0)
            for platform, total in by_platform_rows
        }

        return RevenueBreakdownResponse(
            gmv=gmv,
            khel_revenue=khel_revenue,
            owner_settlements=owner_settlements,
            revenue_by_city=revenue_by_city,
            revenue_by_platform=revenue_by_platform,
        )
