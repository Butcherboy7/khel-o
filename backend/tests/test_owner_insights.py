"""Owner Insights (GET /owner/analytics -> data.insights): period earnings
against the period before, the weekday x hour grid, new vs returning
customers, and earnings per seat — all from paid, non-refunded bookings."""
from datetime import timedelta
from uuid import uuid4

import pytest

from app.core.time import now_ist
from app.models.analytics_event import AnalyticsEvent
from tests.conftest import auth_headers
from tests.test_launch_invariants import _make_gamer, _make_owner_and_cafe
from tests.test_launch_invariants_analytics import _paid, _span_booking


async def _insights(async_client, owner, days=30):
    res = await async_client.get(f"/api/v1/owner/analytics?days={days}", headers=auth_headers(owner))
    assert res.status_code == 200, res.text
    return res.json()["data"]["insights"]


@pytest.mark.asyncio
async def test_insights_period_numbers(db_session, async_client):
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "insights")
    regular = await _make_gamer(db_session)
    newbie = await _make_gamer(db_session)
    today = now_ist().date()
    owner_h = auth_headers(owner)
    cafe_id = cafe.id

    rows = []
    # Regular: first came 40 days ago (previous period), then three times this week.
    rows.append(_span_booking(cafe, tier, regular.id, today - timedelta(days=40), 18, 20, base=200.0))
    for d in (0, 1, 2):
        rows.append(_span_booking(cafe, tier, regular.id, today - timedelta(days=d), 18, 21, seats=5, base=300.0))
    # A brand-new player, twice this period.
    for d in (3, 4):
        rows.append(_span_booking(cafe, tier, newbie.id, today - timedelta(days=d), 14, 15, base=100.0))
    for b, fee in rows:
        db_session.add_all([b, fee, _paid(b)])
    # Two people looked at the café page, one started booking.
    for sid, kind in (("s1", "venue_viewed"), ("s2", "venue_viewed"), ("s2", "booking_flow_started"), ("s2", "venue_viewed")):
        db_session.add(AnalyticsEvent(id=uuid4(), session_id=f"ins-{sid}-{cafe_id}", event_type=kind, cafe_id=cafe_id, event_metadata={}))
    await db_session.commit()

    res = await async_client.get("/api/v1/owner/analytics?days=30", headers=owner_h)
    data = res.json()["data"]
    ins = data["insights"]
    # The legacy all-time fields are untouched.
    assert "busyHours" in data and "revenueTrend" in data

    assert ins["days"] == 30 and ins["enoughData"] is True
    assert ins["earnings"]["total"] == 1100.0
    assert ins["earnings"]["previous"] == 200.0
    assert ins["earnings"]["bookings"] == 5
    assert ins["earnings"]["hoursPlayed"] == 3 * 3 * 5 + 2
    assert len(ins["trend"]) == 30 and ins["trend"][-1]["revenue"] == 300.0

    assert ins["customers"] == {
        "total": 2, "new": 1, "returning": 1,
        "regulars": [{"name": "Gamer", "visits": 3}, {"name": "Gamer", "visits": 2}],
    }
    assert ins["funnel"]["pageVisitors"] == 2 and ins["funnel"]["startedBooking"] == 1

    # Café is open 09:00-23:00: 14 hourly rows, 7 weekday columns.
    week = ins["week"]
    assert week["hours"][0] == 9 and week["hours"][-1] == 22 and len(week["grid"]) == 7
    assert week["busiest"]["startHour"] == 18 and week["busiest"]["endHour"] == 21
    assert 0 < week["averageFull"] < 100

    [station] = ins["stations"]
    assert station["perSeat"] == 110.0 and station["bookings"] == 5

    # Seven days: only the last five bookings' worth, compared to days 7-13.
    week_only = await _insights(async_client, owner, days=7)
    assert week_only["earnings"]["total"] == 1100.0 and week_only["earnings"]["previous"] == 0
    ninety = await _insights(async_client, owner, days=90)
    assert len(ninety["trend"]) == 13
    assert ninety["earnings"]["total"] == 1300.0


@pytest.mark.asyncio
async def test_insights_quiet_cafe_says_not_enough_data(db_session, async_client):
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "insights_quiet")
    gamer = await _make_gamer(db_session)
    b, fee = _span_booking(cafe, tier, gamer.id, now_ist().date(), 18, 19)
    db_session.add_all([b, fee, _paid(b)])
    await db_session.commit()

    ins = await _insights(async_client, owner)
    assert ins["enoughData"] is False
    assert ins["week"]["busiest"] is None and ins["week"]["quietest"] is None
    assert ins["earnings"]["bookings"] == 1


@pytest.mark.asyncio
async def test_insights_rejects_silly_periods(db_session, async_client):
    owner, _, _ = await _make_owner_and_cafe(db_session, "insights_days")
    await db_session.commit()
    res = await async_client.get("/api/v1/owner/analytics?days=365", headers=auth_headers(owner))
    assert res.status_code == 422
