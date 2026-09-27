"""Owner Insights: the numbers behind the café-owner Insights page.

Everything is scoped to a period (the last N days, IST) and written so a
non-technical owner can act on it: what they earned against the period
before, when the café is full or empty, who keeps coming back, how many
people who saw the café page went on to book, and which stations earn the
most per seat. The caller passes in the paid, non-refunded bookings it has
already loaded so money figures match the rest of /owner/analytics.
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Iterable

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import IST
from app.models.analytics_event import AnalyticsEvent
from app.models.booking import Booking
from app.models.cafe import Cafe
from app.models.hardware_tier import HardwareTier
from app.models.review import Review
from app.models.user import User

# Below this many bookings in the period, patterns are noise; the page says so
# instead of pointing at a "busiest time" made of two bookings.
MIN_BOOKINGS_FOR_PATTERNS = 5
BLOCK_HOURS = 3
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _hours_touched(b: Booking) -> list[int]:
    spans = max(1, math.ceil(float(b.duration_hours)))
    return [(b.start_time.hour + i) % 24 for i in range(spans)]


def _open_hours(cafe_hours: list[tuple[time | None, time | None]], bookings: Iterable[Booking]) -> list[int]:
    """Hours of the day to chart, in order, e.g. [10, 11, ..., 23, 0, 1].

    Opening hours when the café has set them (overnight wraps), otherwise the
    span of hours it has actually had players in.
    """
    for open_t, close_t in cafe_hours:
        if open_t is not None and close_t is not None:
            start, end = open_t.hour, close_t.hour + (1 if close_t.minute else 0)
            n = (end - start) % 24 or 24
            return [(start + i) % 24 for i in range(n)]
    used = sorted({h for b in bookings for h in _hours_touched(b)})
    if not used:
        return []
    # Pick the ordering that starts after the longest quiet gap, so a café
    # open 14:00-02:00 charts as 14..23, 0, 1 rather than 0, 1, 14..23.
    gaps = [((used[(i + 1) % len(used)] - used[i]) % 24, i) for i in range(len(used))]
    _, last = max(gaps)
    start = used[(last + 1) % len(used)]
    end = used[last]
    n = (end - start) % 24 + 1
    return [(start + i) % 24 for i in range(n)]


def _aware(dt: datetime) -> datetime:
    # SQLite (tests) hands back naive UTC; Postgres hands back aware.
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _short_name(full_name: str | None) -> str:
    parts = (full_name or "").split()
    if not parts:
        return "Player"
    return parts[0] if len(parts) == 1 else f"{parts[0]} {parts[-1][0]}."


async def build_insights(
    db: AsyncSession,
    cafe_ids: list,
    tiers: list[HardwareTier],
    bookings: list[Booking],
    settlement: dict,
    days: int,
) -> dict[str, Any]:
    today = datetime.now(IST).date()
    start = today - timedelta(days=days - 1)
    prev_start = start - timedelta(days=days)
    in_period = [b for b in bookings if start <= b.session_date <= today]
    in_prev = [b for b in bookings if prev_start <= b.session_date < start]

    def money(bs: list[Booking]) -> float:
        return round(sum(settlement[b.id] for b in bs), 2)

    earned = money(in_period)
    hours_played = round(sum(float(b.duration_hours) * b.seats_count for b in in_period), 1)
    earnings = {
        "total": earned,
        "previous": money(in_prev),
        "bookings": len(in_period),
        "previousBookings": len(in_prev),
        "hoursPlayed": hours_played,
        "avgPerBooking": round(earned / len(in_period), 2) if in_period else 0.0,
    }

    # --- Trend: daily up to a month, weekly beyond that ---
    trend: list[dict] = []
    if days <= 31:
        by_day = {start + timedelta(days=i): [0.0, 0] for i in range(days)}
        for b in in_period:
            by_day[b.session_date][0] += settlement[b.id]
            by_day[b.session_date][1] += 1
        trend = [{"date": d.isoformat(), "revenue": round(v[0], 2), "bookings": v[1]} for d, v in by_day.items()]
    else:
        # Week-long buckets starting on the period's first day.
        buckets = [[start + timedelta(days=7 * i), 0.0, 0] for i in range(math.ceil(days / 7))]
        for b in in_period:
            bucket = buckets[(b.session_date - start).days // 7]
            bucket[1] += settlement[b.id]
            bucket[2] += 1
        trend = [{"date": d.isoformat(), "revenue": round(r, 2), "bookings": n} for d, r, n in buckets]

    # --- When players come: weekday x hour, % of seats in use ---
    cafes = (await db.execute(select(Cafe.opening_time, Cafe.closing_time).where(Cafe.id.in_(cafe_ids)))).all()
    hours = _open_hours([tuple(r) for r in cafes], bookings)
    total_seats = sum(t.total_seats for t in tiers) or 0
    weekday_count = Counter((start + timedelta(days=i)).weekday() for i in range(days))
    seat_hours: dict[tuple[int, int], float] = defaultdict(float)
    for b in in_period:
        for h in _hours_touched(b):
            # An overnight hour belongs to the calendar day it falls on.
            wd = (b.session_date + timedelta(days=1 if h < b.start_time.hour else 0)).weekday()
            seat_hours[(wd, h)] += b.seats_count

    def pct(wd: int, h: int) -> int:
        cap = total_seats * weekday_count[wd]
        return min(round(seat_hours[(wd, h)] / cap * 100), 100) if cap else 0

    grid = [[pct(wd, h) for h in hours] for wd in range(7)]
    busiest = quietest = None
    enough = len(in_period) >= MIN_BOOKINGS_FOR_PATTERNS and total_seats > 0
    if enough and len(hours) >= BLOCK_HOURS:
        blocks = []
        for wd in range(7):
            for i in range(len(hours) - BLOCK_HOURS + 1):
                avg = sum(grid[wd][i:i + BLOCK_HOURS]) / BLOCK_HOURS
                blocks.append((avg, wd, hours[i], (hours[i + BLOCK_HOURS - 1] + 1) % 24))
        top = max(blocks, key=lambda x: x[0])
        low = min(blocks, key=lambda x: x[0])
        busiest = {"day": DAY_NAMES[top[1]], "startHour": top[2], "endHour": top[3], "percent": round(top[0])}
        quietest = {"day": DAY_NAMES[low[1]], "startHour": low[2], "endHour": low[3], "percent": round(low[0])}
    avg_full = 0
    if total_seats and hours:
        used = sum(seat_hours[(wd, h)] for wd in range(7) for h in hours)
        avg_full = min(round(used / (total_seats * len(hours) * days) * 100), 100)
    week = {"hours": hours, "grid": grid, "busiest": busiest, "quietest": quietest, "averageFull": avg_full}

    # --- Customers: new vs returning, regulars ---
    first_booking: dict[Any, date] = {}
    for b in bookings:
        if b.gamer_id not in first_booking or b.session_date < first_booking[b.gamer_id]:
            first_booking[b.gamer_id] = b.session_date
    visits = Counter(b.gamer_id for b in in_period)
    new = sum(1 for g in visits if first_booking[g] >= start)
    regular_ids = [g for g, n in visits.most_common(5) if n >= 2]
    names = {}
    if regular_ids:
        names = dict((await db.execute(select(User.id, User.full_name).where(User.id.in_(regular_ids)))).all())
    customers = {
        "total": len(visits),
        "new": new,
        "returning": len(visits) - new,
        "regulars": [{"name": _short_name(names.get(g)), "visits": visits[g]} for g in regular_ids],
    }

    # --- From seeing the café page to paying ---
    start_utc = datetime.combine(start, time.min, tzinfo=IST)

    async def sessions(event_type: str) -> int:
        return (await db.execute(
            select(func.count(distinct(AnalyticsEvent.session_id))).where(
                AnalyticsEvent.cafe_id.in_(cafe_ids),
                AnalyticsEvent.event_type == event_type,
                AnalyticsEvent.created_at >= start_utc,
            )
        )).scalar() or 0

    funnel = {
        "pageVisitors": await sessions("venue_viewed"),
        "startedBooking": await sessions("booking_flow_started"),
        "paid": sum(1 for b in bookings if b.created_at and _aware(b.created_at) >= start_utc),
    }

    # --- Stations: earnings per seat and how full each type gets ---
    per_tier: dict[Any, dict] = {}
    open_seat_hours_per_seat = len(hours) * days if hours else 0
    for t in tiers:
        per_tier[t.id] = {"tierName": t.name, "seats": t.total_seats, "revenue": 0.0, "bookings": 0, "_used": 0.0}
    for b in in_period:
        row = per_tier.get(b.hardware_tier_id)
        if row:
            row["revenue"] += settlement[b.id]
            row["bookings"] += 1
            row["_used"] += float(b.duration_hours) * b.seats_count
    stations = []
    for row in per_tier.values():
        cap = row["seats"] * open_seat_hours_per_seat
        stations.append({
            "tierName": row["tierName"],
            "seats": row["seats"],
            "revenue": round(row["revenue"], 2),
            "bookings": row["bookings"],
            "perSeat": round(row["revenue"] / row["seats"], 2) if row["seats"] else 0.0,
            "percentFull": min(round(row["_used"] / cap * 100), 100) if cap else 0,
        })
    stations.sort(key=lambda s: s["perSeat"], reverse=True)

    # --- Reviews ---
    avg, count = (await db.execute(
        select(func.avg(Review.rating), func.count(Review.id)).where(Review.cafe_id.in_(cafe_ids))
    )).one()
    new_reviews = (await db.execute(
        select(func.count(Review.id)).where(Review.cafe_id.in_(cafe_ids), Review.created_at >= start_utc)
    )).scalar() or 0
    reviews = {"average": round(float(avg), 1) if avg else None, "count": count or 0, "newInPeriod": new_reviews}

    return {
        "days": days,
        "from": start.isoformat(),
        "to": today.isoformat(),
        "enoughData": enough,
        "earnings": earnings,
        "trend": trend,
        "week": week,
        "customers": customers,
        "funnel": funnel,
        "stations": stations,
        "reviews": reviews,
    }
