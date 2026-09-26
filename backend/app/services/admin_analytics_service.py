from datetime import date, datetime, timezone, timedelta
from collections import Counter
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.cafe import Cafe, VerificationStatus
from app.models.booking import Booking, BookingStatus
from app.models.platform_fee import PlatformFee
from app.models.hardware_tier import HardwareTier
from app.models.analytics_event import AnalyticsEvent
from app.models.campaign import Campaign
from app.schemas.admin_analytics import ExecutiveDashboardResponse, CafePerformanceItem, SetupPerformanceItem, CityGeographyItem, RevenueBreakdownResponse, MarketplaceHealthResponse, AttributionItem, FunnelResponse, CampaignItem, CampaignStatsResponse, TrafficResponse, TrafficTotals, TrafficBucket, TopPageItem, ShareReportResponse, ShareTotals, ShareChannelItem, ShareCafeItem

IST = timezone(timedelta(hours=5, minutes=30))


def _bucket_start(d: date, granularity: str) -> date:
    if granularity == "week":
        return d - timedelta(days=d.weekday())
    if granularity == "month":
        return d.replace(day=1)
    return d


def _shift_bucket(d: date, granularity: str, n: int) -> date:
    """Move a bucket start n buckets forward (n<0 = back)."""
    if granularity == "day":
        return d + timedelta(days=n)
    if granularity == "week":
        return d + timedelta(weeks=n)
    months = d.year * 12 + (d.month - 1) + n
    return date(months // 12, months % 12 + 1, 1)


def _ist_midnight_utc(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=IST).astimezone(timezone.utc)


def _ist_date(ts: datetime) -> date:
    # SQLite hands back naive datetimes; everything is stored as UTC.
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(IST).date()


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

        gmv = float((await self.db.execute(
            select(func.sum(Booking.total_amount)).where(Booking.status.in_(counted))
        )).scalar() or 0.0)

        totals_row = (await self.db.execute(
            select(
                func.sum(PlatformFee.convenience_fee + PlatformFee.gateway_fee),
                func.sum(PlatformFee.owner_settlement_amount),
            )
            .join(Booking, Booking.id == PlatformFee.booking_id)
            .where(Booking.status.in_(counted))
        )).first()
        khel_revenue = float(totals_row[0] or 0.0)
        owner_settlements = float(totals_row[1] or 0.0)

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

    async def get_marketplace_health(self) -> MarketplaceHealthResponse:
        status_rows = (await self.db.execute(
            select(Booking.status, func.count(Booking.id)).group_by(Booking.status)
        )).all()
        by_status = {status: count for status, count in status_rows}
        total_bookings = sum(by_status.values())

        search_rows = (await self.db.execute(
            select(AnalyticsEvent.event_metadata).where(AnalyticsEvent.event_type == "search_performed")
        )).all()
        total_searches = len(search_rows)
        searches_with_no_results = sum(1 for (meta,) in search_rows if (meta or {}).get("resultCount") == 0)

        return MarketplaceHealthResponse(
            total_bookings=total_bookings,
            completed_count=by_status.get(BookingStatus.COMPLETED, 0),
            cancelled_count=by_status.get(BookingStatus.CANCELLED, 0),
            no_show_count=by_status.get(BookingStatus.NO_SHOW, 0),
            failed_count=by_status.get(BookingStatus.FAILED, 0),
            total_searches=total_searches,
            searches_with_no_results=searches_with_no_results,
        )

    async def get_marketing_attribution(self) -> list[AttributionItem]:
        counted = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED]

        user_rows = (await self.db.execute(
            select(User.acquisition_source, func.count(User.id))
            .where(User.acquisition_source.is_not(None))
            .group_by(User.acquisition_source)
        )).all()
        users_by_source = {source: count for source, count in user_rows}

        booking_rows = (await self.db.execute(
            select(User.acquisition_source, func.count(Booking.id), func.sum(Booking.total_amount))
            .join(Booking, Booking.gamer_id == User.id)
            .where(User.acquisition_source.is_not(None), Booking.status.in_(counted))
            .group_by(User.acquisition_source)
        )).all()
        bookings_by_source = {source: (cnt, float(gmv or 0.0)) for source, cnt, gmv in booking_rows}

        return [
            AttributionItem(
                source=source,
                users=count,
                bookings=bookings_by_source.get(source, (0, 0.0))[0],
                gmv=bookings_by_source.get(source, (0, 0.0))[1],
            )
            for source, count in users_by_source.items()
        ]

    async def get_campaigns(self) -> list[CampaignItem]:
        rows = (await self.db.execute(select(Campaign).order_by(Campaign.created_at.desc()))).scalars().all()
        return [
            CampaignItem(id=c.id, name=c.name, source=c.source, medium=c.medium, landing_page=c.landing_page)
            for c in rows
        ]

    async def get_campaign_stats(self, campaign_id: str) -> CampaignStatsResponse:
        counted = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED]
        campaign_filter = AnalyticsEvent.event_metadata["campaignId"].as_string() == campaign_id

        visits = (await self.db.execute(
            select(func.count(AnalyticsEvent.id)).where(
                AnalyticsEvent.event_type == "campaign_landing_view", campaign_filter
            )
        )).scalar() or 0

        unique_visitors = (await self.db.execute(
            select(func.count(func.distinct(AnalyticsEvent.session_id))).where(
                AnalyticsEvent.event_type == "campaign_landing_view", campaign_filter
            )
        )).scalar() or 0

        cta_clicks = (await self.db.execute(
            select(func.count(AnalyticsEvent.id)).where(
                AnalyticsEvent.event_type == "campaign_cta_click", campaign_filter
            )
        )).scalar() or 0

        instagram_clicks = (await self.db.execute(
            select(func.count(AnalyticsEvent.id)).where(
                AnalyticsEvent.event_type == "campaign_instagram_click", campaign_filter
            )
        )).scalar() or 0

        signups = (await self.db.execute(
            select(func.count(User.id)).where(User.acquisition_campaign == campaign_id)
        )).scalar() or 0

        booking_row = (await self.db.execute(
            select(func.count(Booking.id), func.sum(Booking.total_amount))
            .join(User, Booking.gamer_id == User.id)
            .where(User.acquisition_campaign == campaign_id, Booking.status.in_(counted))
        )).one()
        bookings, revenue = booking_row[0] or 0, float(booking_row[1] or 0.0)

        return CampaignStatsResponse(
            campaign_id=campaign_id,
            visits=visits,
            unique_visitors=unique_visitors,
            returning_visitors=max(visits - unique_visitors, 0),
            cta_clicks=cta_clicks,
            instagram_clicks=instagram_clicks,
            signups=signups,
            bookings=bookings,
            revenue=revenue,
        )

    async def get_funnel(self) -> FunnelResponse:
        counted = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED]

        event_counts = dict((await self.db.execute(
            select(AnalyticsEvent.event_type, func.count(AnalyticsEvent.id)).group_by(AnalyticsEvent.event_type)
        )).all())

        bookings_confirmed = (await self.db.execute(
            select(func.count(Booking.id)).where(Booking.status.in_(counted))
        )).scalar() or 0

        return FunnelResponse(
            searches=event_counts.get("search_performed", 0),
            venue_views=event_counts.get("venue_viewed", 0),
            bookings_started=event_counts.get("booking_flow_started", 0),
            bookings_confirmed_or_completed=bookings_confirmed,
        )

    async def get_traffic(self, granularity: str, periods: int, end: date | None = None) -> TrafficResponse:
        """Visitors / page views / active users / signups / bookings per IST day, week or month.

        The range is the `periods` buckets ending with the one containing `end`
        (today in IST by default); `previous_totals` covers the same number of
        buckets immediately before it, for period-over-period comparison.
        """
        end = end or datetime.now(IST).date()
        last = _bucket_start(end, granularity)
        buckets = [_shift_bucket(last, granularity, i - periods + 1) for i in range(periods)]
        range_start, range_end = buckets[0], _shift_bucket(last, granularity, 1)
        prev_start = _shift_bucket(range_start, granularity, -periods)
        window = (_ist_midnight_utc(prev_start), _ist_midnight_utc(range_end))

        def bucket_of(ts: datetime) -> date | None:
            d = _ist_date(ts)
            if d < prev_start or d >= range_end:
                return None
            return _bucket_start(d, granularity) if d >= range_start else prev_start

        views = (await self.db.execute(
            select(AnalyticsEvent.session_id, AnalyticsEvent.created_at, AnalyticsEvent.event_metadata)
            .where(AnalyticsEvent.event_type == "page_view", AnalyticsEvent.created_at >= window[0], AnalyticsEvent.created_at < window[1])
        )).all()
        active = (await self.db.execute(
            select(AnalyticsEvent.user_id, AnalyticsEvent.created_at)
            .where(AnalyticsEvent.user_id.is_not(None), AnalyticsEvent.created_at >= window[0], AnalyticsEvent.created_at < window[1])
        )).all()
        signups = (await self.db.execute(
            select(User.created_at).where(User.created_at >= window[0], User.created_at < window[1])
        )).scalars().all()
        bookings = (await self.db.execute(
            select(Booking.created_at).where(
                Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.COMPLETED]),
                Booking.created_at >= window[0], Booking.created_at < window[1],
            )
        )).scalars().all()

        # Keyed by bucket start; prev_start (always before buckets[0]) collects the
        # whole previous period in one key.
        keys = [prev_start, *buckets]
        sessions = {k: set() for k in keys}
        users = {k: set() for k in keys}
        page_views, signup_n, booking_n = Counter(), Counter(), Counter()
        paths: Counter[str] = Counter()
        range_sessions: set[str] = set()
        range_users: set = set()

        for session_id, ts, meta in views:
            k = bucket_of(ts)
            if k is None:
                continue
            sessions[k].add(session_id)
            page_views[k] += 1
            if k != prev_start:
                range_sessions.add(session_id)
                paths[str((meta or {}).get("path") or "/")] += 1
        for user_id, ts in active:
            k = bucket_of(ts)
            if k is None:
                continue
            users[k].add(user_id)
            if k != prev_start:
                range_users.add(user_id)
        for ts in signups:
            if (k := bucket_of(ts)) is not None:
                signup_n[k] += 1
        for ts in bookings:
            if (k := bucket_of(ts)) is not None:
                booking_n[k] += 1

        series = [
            TrafficBucket(
                bucket=b.isoformat(),
                visitors=len(sessions[b]),
                page_views=page_views[b],
                active_users=len(users[b]),
                signups=signup_n[b],
                bookings=booking_n[b],
            )
            for b in buckets
        ]
        return TrafficResponse(
            granularity=granularity,
            start=range_start.isoformat(),
            end=(range_end - timedelta(days=1)).isoformat(),
            totals=TrafficTotals(
                visitors=len(range_sessions),
                page_views=sum(s.page_views for s in series),
                active_users=len(range_users),
                signups=sum(s.signups for s in series),
                bookings=sum(s.bookings for s in series),
            ),
            previous_totals=TrafficTotals(
                visitors=len(sessions[prev_start]),
                page_views=page_views[prev_start],
                active_users=len(users[prev_start]),
                signups=signup_n[prev_start],
                bookings=booking_n[prev_start],
            ),
            series=series,
            top_pages=[TopPageItem(path=p, views=n) for p, n in paths.most_common(10)],
        )

    async def get_share_report(self, start: date, end: date) -> ShareReportResponse:
        """Shares made (share_created), links opened (share_opened, matched to the
        share by its `sid`), and signups/bookings from people whose first touch
        was a shared link (acquisition_source='share'; campaign = café slug)."""
        window = (_ist_midnight_utc(start), _ist_midnight_utc(start + timedelta(days=(end - start).days + 1)))
        in_window = lambda col: (col >= window[0], col < window[1])  # noqa: E731

        events = (await self.db.execute(
            select(AnalyticsEvent.event_type, AnalyticsEvent.cafe_id, AnalyticsEvent.event_metadata)
            .where(AnalyticsEvent.event_type.in_(["share_created", "share_opened"]), *in_window(AnalyticsEvent.created_at))
        )).all()

        channel = lambda meta: str((meta or {}).get("channel") or "other")  # noqa: E731
        sid_cafe: dict[str, object] = {}
        channels: dict[str, Counter] = {}
        cafes: dict[object, Counter] = {}

        for kind, cafe_id, meta in events:
            if kind == "share_created":
                channels.setdefault(channel(meta), Counter())["shares"] += 1
                if cafe_id:
                    sid_cafe[str((meta or {}).get("sid"))] = cafe_id
                    cafes.setdefault(cafe_id, Counter())["shares"] += 1
        for kind, _, meta in events:
            if kind == "share_opened":
                channels.setdefault(channel(meta), Counter())["opens"] += 1
                cafe_id = sid_cafe.get(str((meta or {}).get("sid")))
                if cafe_id:
                    cafes.setdefault(cafe_id, Counter())["opens"] += 1

        # Campaign is the café slug (café page shares) or its id (booking-pass
        # shares, which only know the id) — map both back to the café.
        slug_to_cafe = {}
        for cid, slug in (await self.db.execute(select(Cafe.id, Cafe.slug))).all():
            slug_to_cafe[str(cid)] = cid
            if slug:
                slug_to_cafe[slug] = cid
        signups = (await self.db.execute(
            select(User.id, User.acquisition_medium, User.acquisition_campaign)
            .where(User.acquisition_source == "share", *in_window(User.created_at))
        )).all()
        user_bookings = dict((await self.db.execute(
            select(Booking.gamer_id, func.count(Booking.id))
            .where(
                Booking.gamer_id.in_([u.id for u in signups] or [None]),
                Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.COMPLETED]),
                *in_window(Booking.created_at),
            )
            .group_by(Booking.gamer_id)
        )).all())

        for user_id, medium, campaign in signups:
            n = user_bookings.get(user_id, 0)
            ch = channels.setdefault(str(medium or "other"), Counter())
            ch["signups"] += 1
            ch["bookings"] += n
            cafe_id = slug_to_cafe.get(campaign)
            if cafe_id:
                cafes.setdefault(cafe_id, Counter())["signups"] += 1
                cafes[cafe_id]["bookings"] += n

        names = dict((await self.db.execute(
            select(Cafe.id, Cafe.name).where(Cafe.id.in_(list(cafes) or [None]))
        )).all())
        pick = lambda c: {k: c[k] for k in ("shares", "opens", "signups", "bookings")}  # noqa: E731
        by_channel = sorted(
            (ShareChannelItem(channel=k, **pick(c)) for k, c in channels.items()),
            key=lambda i: (-i.shares, -i.opens),
        )
        by_cafe = sorted(
            (ShareCafeItem(cafe_id=str(k), cafe_name=names.get(k, "Unknown café"), **pick(c)) for k, c in cafes.items()),
            key=lambda i: (-i.shares, -i.opens),
        )
        return ShareReportResponse(
            start=start.isoformat(),
            end=end.isoformat(),
            totals=ShareTotals(
                shares=sum(i.shares for i in by_channel),
                opens=sum(i.opens for i in by_channel),
                signups=len(signups),
                bookings=sum(user_bookings.values()),
            ),
            by_channel=by_channel,
            by_cafe=by_cafe,
        )
