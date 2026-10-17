"""How many app-bookable stations are free right now (IST), per tier.

Counts only KHEL-O bookings, so it is "free to book now", not a claim about
walk-ins. Closed, paused or lead-listing cafés report 0 free. Shared by the
café page's live strip and the explore card's "3 free now".
"""
from datetime import timedelta
from typing import Dict, List
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import now_ist
from app.models.booking import Booking, BookingStatus
from app.models.cafe import Cafe
from app.models.hardware_tier import HardwareTier


def _is_closed(cafe: Cafe, t) -> bool:
    closed = bool(cafe.bookings_paused or cafe.is_emergency_mode or cafe.is_lead_listing or cafe.bookable_stations == 0)
    if cafe.opening_time and cafe.closing_time and not closed:
        o, c = cafe.opening_time, cafe.closing_time
        closed = not (o <= t < c) if o < c else not (t >= o or t < c)
    return closed


async def live_seats_for_cafes(db: AsyncSession, cafes: List[Cafe]) -> Dict[UUID, dict]:
    """cafe_id -> {"openNow": bool, "tiers": [{tierId, bookable, freeNow}]}."""
    if not cafes:
        return {}
    tiers = (await db.execute(
        select(HardwareTier).where(
            HardwareTier.cafe_id.in_([c.id for c in cafes]),
            HardwareTier.is_active == True,  # noqa: E712
        )
    )).scalars().all()

    now = now_ist()
    today, t = now.date(), now.time().replace(tzinfo=None)

    rows = (await db.execute(
        select(Booking.hardware_tier_id, Booking.session_date, Booking.start_time, Booking.end_time, Booking.seats_count).where(
            Booking.hardware_tier_id.in_([x.id for x in tiers] or [None]),
            Booking.session_date.in_([today, today - timedelta(days=1)]),
            Booking.status.in_([BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED,
                                BookingStatus.CHECKED_IN, BookingStatus.ACTIVE]),
        )
    )).all()
    busy: dict = {}
    for tier_id, day, start, end, seats in rows:
        overnight = end <= start
        covers = (
            (day == today and start <= t and (overnight or t < end))
            or (day != today and overnight and t < end)
        )
        if covers:
            busy[tier_id] = busy.get(tier_id, 0) + (seats or 1)

    out: Dict[UUID, dict] = {}
    for cafe in cafes:
        closed = _is_closed(cafe, t)
        rows_out = []
        for x in tiers:
            if x.cafe_id != cafe.id:
                continue
            bookable = x.app_bookable_seats or 0
            if cafe.bookable_stations is not None and cafe.bookable_stations >= 0:
                bookable = min(bookable, cafe.bookable_stations)
            rows_out.append({
                "tierId": str(x.id),
                "bookable": bookable,
                "freeNow": 0 if closed else max(0, bookable - busy.get(x.id, 0)),
            })
        out[cafe.id] = {"openNow": not closed, "tiers": rows_out}
    return out
