"""W-01: owner analytics must report real, DB-backed, owner-correct numbers.

See docs/LAUNCH_QA_PLAN.md Phase 3 (W-01).

The frontend analytics page is fully API-bound — every metric it renders comes
from GET /owner/analytics and it shows honest empty states when there is no
data. So "no dummy data" is a claim about *this endpoint*, and these tests
pin it down:

1. Money shown to the owner is the owner's money (settlement), never the
   customer's gross — the same F-1 class of bug already fixed for the
   dashboard in booking_repository.py.
2. Occupancy covers the hours a session actually occupies, not just the hour
   it starts in.
3. The "last 7 days" window is 7 IST days, per app/core/time.py.
4. Nothing is fabricated for a café with no bookings.
"""
import pytest
from datetime import datetime, time, timedelta
from uuid import uuid4

from app.models.booking import Booking, BookingStatus
from app.models.payment import Payment, PaymentStatus
from app.models.platform_fee import PlatformFee
from app.core.time import IST, now_ist
from tests.conftest import auth_headers
from tests.test_launch_invariants import (
    _make_owner_and_cafe,
    _make_gamer,
    _booking_with_fee,
    FEE_PCT,
)


def _paid(booking):
    """A captured Payment row — analytics inner-joins Payment, so a booking
    without one is invisible to it."""
    return Payment(
        id=uuid4(), booking_id=booking.id,
        razorpay_order_id=f"order_{uuid4().hex[:12]}",
        razorpay_payment_id=f"pay_{uuid4().hex[:12]}",
        amount=float(booking.total_amount), currency="INR",
        status=PaymentStatus.CAPTURED,
    )


def _span_booking(cafe, tier, gamer_id, session_date, start_h, end_h,
                  seats=1, base=100.0, game=None):
    """A booking that spans several hours, so occupancy math is observable."""
    duration = (end_h - start_h) % 24
    gw = round(base * FEE_PCT / 100, 2)
    b = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}",
        gamer_id=gamer_id, cafe_id=cafe.id, hardware_tier_id=tier.id,
        session_date=session_date, start_time=time(start_h, 0),
        end_time=time(end_h % 24, 0), duration_hours=float(duration),
        seats_count=seats, base_amount=base, discount_amount=0.0,
        gateway_fee=gw, total_amount=base + gw, convenience_fee=0.0,
        status=BookingStatus.COMPLETED, game=game,
    )
    fee = PlatformFee(
        id=uuid4(), booking_id=b.id, convenience_fee=0.0, gateway_fee=gw,
        fee_percentage_applied=FEE_PCT, tds_amount=0.0,
        owner_settlement_amount=base,
    )
    return b, fee


async def _analytics(async_client, owner):
    res = await async_client.get("/api/v1/owner/analytics", headers=auth_headers(owner))
    assert res.status_code == 200, res.text
    return res.json()["data"]


# ------------------------------------------------- W-01a money correctness

@pytest.mark.asyncio
async def test_tier_revenue_is_owner_settlement_not_customer_gross(
    db_session, async_client
):
    """Revenue by Hardware Tier is an owner-facing earnings figure.

    A ₹100 session at 4% costs the customer ₹104 and earns the café ₹100.
    KHELO's ₹4 must not appear as café revenue — this is F-1, which was fixed
    for the dashboard but not for analytics.
    """
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "wan_tier")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    b, fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.COMPLETED, today, base=100.0)
    db_session.add_all([b, fee, _paid(b)])
    await db_session.commit()

    data = await _analytics(async_client, owner)
    assert len(data["tierRevenue"]) == 1
    assert data["tierRevenue"][0]["revenue"] == 100.0, (
        "analytics reported the customer's gross (₹104) as the café's revenue; "
        "the café only ever receives the ₹100 settlement"
    )


@pytest.mark.asyncio
async def test_revenue_trend_is_owner_settlement_not_customer_gross(
    db_session, async_client
):
    """The 7-day trend chart is the same owner-facing figure as the tier bars."""
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "wan_trend")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    b, fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.COMPLETED, today, base=200.0)
    db_session.add_all([b, fee, _paid(b)])
    await db_session.commit()

    data = await _analytics(async_client, owner)
    total = sum(p["revenue"] for p in data["revenueTrend"])
    assert total == 200.0, (
        f"revenue trend summed to {total}, expected the ₹200 settlement — "
        "KHELO's platform fee is being drawn as café revenue"
    )


@pytest.mark.asyncio
async def test_analytics_revenue_agrees_with_dashboard_earnings(
    db_session, async_client
):
    """Two owner-facing screens must not disagree about the same money.

    booking_repository was fixed to report settlement; if analytics still
    reports gross, the owner sees two different numbers for one booking and
    has every reason to dispute their payout.
    """
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "wan_agree")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    b, fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.COMPLETED, today, base=100.0)
    db_session.add_all([b, fee, _paid(b)])
    await db_session.commit()

    analytics = await _analytics(async_client, owner)
    res = await async_client.get("/api/v1/owner/dashboard", headers=auth_headers(owner))
    assert res.status_code == 200, res.text
    dashboard = res.json()["data"]

    trend_total = sum(p["revenue"] for p in analytics["revenueTrend"])
    assert trend_total == float(dashboard["revenueToday"]), (
        f"analytics says {trend_total}, dashboard says {dashboard['revenueToday']} "
        "for the same single booking"
    )


# ------------------------------------------------- W-01b occupancy accuracy

@pytest.mark.asyncio
async def test_occupancy_covers_every_hour_the_session_occupies(
    db_session, async_client
):
    """A seat booked 18:00-21:00 is occupied at 19:00 and 20:00 too.

    Bucketing only by start hour reports start-time popularity while the UI
    labels it "occupancy" / "Peak Occupancy" — a café fully booked 18:00-21:00
    would show "No booking activity" for 19:00 and 20:00.
    """
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "wan_occ")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    b, fee = _span_booking(cafe, tier, gamer.id, today, 18, 21, seats=5)
    db_session.add_all([b, fee, _paid(b)])
    await db_session.commit()

    data = await _analytics(async_client, owner)
    hours = {h["hour"]: h["occupancy"] for h in data["busyHours"]}

    for label in ("18:00 - 19:00", "19:00 - 20:00", "20:00 - 21:00"):
        assert label in hours, f"{label} is inside the session but reported no activity"
    assert "21:00 - 22:00" not in hours, "the session had ended by 21:00"
    # 5 of the tier's 10 seats, for all three hours.
    assert hours["19:00 - 20:00"] == 50


@pytest.mark.asyncio
async def test_occupancy_handles_overnight_sessions(db_session, async_client):
    """A 22:00-02:00 session rolls past midnight; those hours still count."""
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "wan_night")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    b, fee = _span_booking(cafe, tier, gamer.id, today, 22, 2, seats=2)
    db_session.add_all([b, fee, _paid(b)])
    await db_session.commit()

    data = await _analytics(async_client, owner)
    hours = {h["hour"] for h in data["busyHours"]}
    for label in ("22:00 - 23:00", "23:00 - 00:00", "00:00 - 01:00", "01:00 - 02:00"):
        assert label in hours, f"overnight hour {label} was dropped"


# ------------------------------------------------- W-01c trend window is IST

@pytest.mark.asyncio
async def test_revenue_trend_window_is_seven_ist_days(
    db_session, async_client, monkeypatch
):
    """app/core/time.py: session_date is IST and "must be interpreted as IST,
    never as UTC". Anchoring the window on UTC shifts the whole chart back a
    day during the 5.5h each night that IST is a date ahead of UTC.

    The clock is frozen at 02:00 IST on 2026-03-15 — which is still
    2026-03-14 in UTC — so this reproduces deterministically instead of only
    when the suite happens to run late in the UTC day.
    """
    frozen_ist = datetime(2026, 3, 15, 2, 0, tzinfo=IST)
    session_day = frozen_ist.date()

    class _FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return frozen_ist.astimezone(tz) if tz else frozen_ist.replace(tzinfo=None)

    monkeypatch.setattr("app.api.v1.owner.datetime", _FrozenDatetime)

    owner, cafe, tier = await _make_owner_and_cafe(db_session, "wan_win")
    gamer = await _make_gamer(db_session)

    b, fee = _booking_with_fee(
        cafe, tier, gamer.id, BookingStatus.COMPLETED, session_day, base=100.0
    )
    db_session.add_all([b, fee, _paid(b)])
    await db_session.commit()

    data = await _analytics(async_client, owner)
    dates = [p["date"] for p in data["revenueTrend"]]
    assert len(dates) == 7
    assert dates[-1] == session_day.isoformat(), (
        f"trend ends at {dates[-1]}, but 'today' in IST is {session_day.isoformat()} "
        "— the window is anchored on UTC"
    )
    assert dates[0] == (session_day - timedelta(days=6)).isoformat()
    assert sum(p["revenue"] for p in data["revenueTrend"]) == 100.0, (
        "a session booked at 02:00 IST fell outside its own 7-day window"
    )


# ------------------------------------------------- W-01d nothing fabricated

@pytest.mark.asyncio
async def test_new_cafe_gets_zeros_not_invented_numbers(db_session, async_client):
    """An owner with no bookings must see empty/zero, never sample data."""
    owner, _, _ = await _make_owner_and_cafe(db_session, "wan_empty")

    data = await _analytics(async_client, owner)
    assert data["tierRevenue"] == []
    assert data["busyHours"] == []
    assert data["topGames"] == []
    assert data["returningCustomerRate"] == 0
    assert data["averageDurationHours"] == 0
    assert data["peakOccupancyPercent"] == 0


@pytest.mark.asyncio
async def test_top_games_empty_when_no_booking_records_a_game(
    db_session, async_client
):
    """`game` is nullable. With no game recorded the panel must stay empty
    rather than inventing popular titles."""
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "wan_games")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    b, fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.COMPLETED, today)
    db_session.add_all([b, fee, _paid(b)])
    await db_session.commit()

    data = await _analytics(async_client, owner)
    assert data["topGames"] == []


@pytest.mark.asyncio
async def test_refunded_booking_leaves_analytics(db_session, async_client):
    """Regression guard: a refunded session is neither revenue nor demand."""
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "wan_refund")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    b, fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.COMPLETED, today, base=100.0)
    payment = _paid(b)
    payment.status = PaymentStatus.REFUNDED
    db_session.add_all([b, fee, payment])
    await db_session.commit()

    data = await _analytics(async_client, owner)
    assert data["tierRevenue"] == []
    assert sum(p["revenue"] for p in data["revenueTrend"]) == 0
