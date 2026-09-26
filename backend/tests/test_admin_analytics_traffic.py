import pytest
from datetime import datetime, timezone, date, time
from uuid import uuid4
from sqlalchemy import select

from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.models.analytics_event import AnalyticsEvent
from app.core.security import get_password_hash
from tests.conftest import auth_headers

# All fixtures live in 2020 and every request pins `end`, so rows created by
# other tests "now" can never leak into these buckets.
URL = "/api/v1/admin/analytics/traffic"


def _utc(y, m, d, hh=12, mm=0):
    return datetime(y, m, d, hh, mm, tzinfo=timezone.utc)


def _user(role=UserRole.GAMER, created_at=None):
    return User(
        id=uuid4(), email=f"{role.value}_{uuid4().hex[:8]}@test.com", full_name="T",
        password_hash=get_password_hash("testpass123"), role=role, is_active=True,
        created_at=created_at or datetime.now(timezone.utc),
    )


def _page_view(session, path, at, user_id=None):
    return AnalyticsEvent(
        id=uuid4(), session_id=session, user_id=user_id, event_type="page_view",
        event_metadata={"path": path}, created_at=at,
    )


async def _admin(db_session):
    admin = _user(UserRole.ADMIN)
    db_session.add(admin)
    await db_session.commit()
    return auth_headers(admin)


@pytest.mark.asyncio
async def test_daily_buckets_count_visitors_page_views_and_signups(async_client, db_session):
    headers = await _admin(db_session)
    sess_a, sess_b = f"a-{uuid4().hex}", f"b-{uuid4().hex}"
    db_session.add_all([
        _page_view(sess_a, "/", _utc(2020, 3, 14)),
        _page_view(sess_a, "/cafes", _utc(2020, 3, 14)),
        _page_view(sess_b, "/", _utc(2020, 3, 14)),
        _page_view(sess_a, "/", _utc(2020, 3, 15)),
        _user(created_at=_utc(2020, 3, 15)),
    ])
    await db_session.commit()

    resp = await async_client.get(URL, params={"granularity": "day", "periods": 2, "end": "2020-03-15"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]

    assert [b["bucket"] for b in data["series"]] == ["2020-03-14", "2020-03-15"]
    day14, day15 = data["series"]
    assert (day14["visitors"], day14["pageViews"], day14["signups"]) == (2, 3, 0)
    assert (day15["visitors"], day15["pageViews"], day15["signups"]) == (1, 1, 1)
    # Range totals dedupe visitors across buckets: sess_a on both days is one visitor.
    assert data["totals"]["visitors"] == 2
    assert data["totals"]["pageViews"] == 4
    assert data["topPages"][0] == {"path": "/", "views": 3}


@pytest.mark.asyncio
async def test_buckets_use_ist_not_utc(async_client, db_session):
    headers = await _admin(db_session)
    # 2020-04-10 20:00 UTC is 2020-04-11 01:30 IST — must land on the 11th.
    db_session.add(_page_view(f"ist-{uuid4().hex}", "/", _utc(2020, 4, 10, 20, 0)))
    await db_session.commit()

    resp = await async_client.get(URL, params={"granularity": "day", "periods": 2, "end": "2020-04-11"}, headers=headers)
    series = resp.json()["data"]["series"]
    assert series[0]["pageViews"] == 0
    assert series[1]["pageViews"] == 1


@pytest.mark.asyncio
async def test_weekly_and_monthly_buckets_start_on_monday_and_first(async_client, db_session):
    headers = await _admin(db_session)
    db_session.add_all([
        _page_view(f"w-{uuid4().hex}", "/", _utc(2020, 5, 4)),   # Monday
        _page_view(f"w-{uuid4().hex}", "/", _utc(2020, 5, 10)),  # Sunday, same week
    ])
    await db_session.commit()

    weekly = (await async_client.get(URL, params={"granularity": "week", "periods": 1, "end": "2020-05-10"}, headers=headers)).json()["data"]
    assert weekly["series"] == [weekly["series"][0]]
    assert weekly["series"][0]["bucket"] == "2020-05-04"
    assert weekly["series"][0]["visitors"] == 2

    monthly = (await async_client.get(URL, params={"granularity": "month", "periods": 1, "end": "2020-05-20"}, headers=headers)).json()["data"]
    assert monthly["series"][0]["bucket"] == "2020-05-01"
    assert monthly["series"][0]["visitors"] == 2


@pytest.mark.asyncio
async def test_active_users_and_previous_period(async_client, db_session):
    headers = await _admin(db_session)
    gamer = _user(created_at=_utc(2019, 1, 1))
    db_session.add(gamer)
    await db_session.commit()
    db_session.add_all([
        _page_view(f"p-{uuid4().hex}", "/", _utc(2020, 6, 8)),                 # previous period
        _page_view(f"c-{uuid4().hex}", "/", _utc(2020, 6, 9), user_id=gamer.id),
        _page_view(f"c-{uuid4().hex}", "/", _utc(2020, 6, 9), user_id=gamer.id),
    ])
    await db_session.commit()

    data = (await async_client.get(URL, params={"granularity": "day", "periods": 1, "end": "2020-06-09"}, headers=headers)).json()["data"]
    assert data["totals"]["activeUsers"] == 1
    assert data["totals"]["visitors"] == 2
    assert data["previousTotals"]["visitors"] == 1
    assert data["previousTotals"]["activeUsers"] == 0


@pytest.mark.asyncio
async def test_counts_only_confirmed_or_completed_bookings(async_client, db_session):
    headers = await _admin(db_session)
    owner, gamer = _user(UserRole.CAFE_OWNER), _user()
    db_session.add_all([owner, gamer])
    await db_session.commit()
    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Traffic Café", address_line1="1 St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db_session.add(cafe)
    await db_session.flush()
    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Std", specs={}, price_per_hour=100.0,
        total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db_session.add(tier)
    await db_session.flush()

    def booking(status):
        return Booking(
            id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
            cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date(2020, 7, 1),
            start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
            base_amount=100.0, discount_amount=0.0, gateway_fee=4.0, convenience_fee=0.0,
            total_amount=104.0, status=status, created_at=_utc(2020, 7, 1),
        )

    db_session.add_all([booking(BookingStatus.CONFIRMED), booking(BookingStatus.COMPLETED), booking(BookingStatus.FAILED)])
    await db_session.commit()

    data = (await async_client.get(URL, params={"granularity": "day", "periods": 1, "end": "2020-07-01"}, headers=headers)).json()["data"]
    assert data["totals"]["bookings"] == 2


@pytest.mark.asyncio
async def test_traffic_requires_admin(async_client, db_session):
    gamer = _user()
    db_session.add(gamer)
    await db_session.commit()
    resp = await async_client.get(URL, headers=auth_headers(gamer))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_page_view_event_links_signed_in_user_and_drops_admin_paths(async_client, db_session):
    gamer = _user()
    db_session.add(gamer)
    await db_session.commit()
    sess = f"pv-{uuid4().hex}"

    resp = await async_client.post(
        "/api/v1/analytics/events",
        json={"sessionId": sess, "eventType": "page_view", "metadata": {"path": "/cafes"}},
        headers=auth_headers(gamer),
    )
    assert resp.status_code == 204
    resp = await async_client.post(
        "/api/v1/analytics/events",
        json={"sessionId": sess, "eventType": "page_view", "metadata": {"path": "/admin/users"}},
    )
    assert resp.status_code == 204

    rows = (await db_session.execute(select(AnalyticsEvent).where(AnalyticsEvent.session_id == sess))).scalars().all()
    assert len(rows) == 1
    assert rows[0].user_id == gamer.id
    assert rows[0].event_metadata["path"] == "/cafes"
