import pytest
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.models.platform_fee import PlatformFee
from app.core.security import get_password_hash
from tests.conftest import auth_headers


async def _make_admin(db_session) -> User:
    admin = User(
        id=uuid4(), email=f"admin_{uuid4().hex[:8]}@test.com", full_name="Admin",
        password_hash=get_password_hash("testpass123"), role=UserRole.ADMIN, is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()
    return admin


@pytest.mark.asyncio
async def test_executive_dashboard_totals(async_client, db_session):
    admin = await _make_admin(db_session)

    owner = User(
        id=uuid4(), email=f"owner_{uuid4().hex[:8]}@test.com", full_name="Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    gamer = User(
        id=uuid4(), email=f"gamer_{uuid4().hex[:8]}@test.com", full_name="Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    db_session.add_all([owner, gamer])
    await db_session.flush()

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Exec Test Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db_session.add(cafe)
    await db_session.flush()

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Standard", specs={}, price_per_hour=100.0,
        total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db_session.add(tier)
    await db_session.flush()

    booking = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today(),
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=0.0, gateway_fee=4.0, convenience_fee=0.0,
        total_amount=104.0, status=BookingStatus.COMPLETED,
    )
    db_session.add(booking)
    await db_session.flush()

    db_session.add(PlatformFee(
        id=uuid4(), booking_id=booking.id, convenience_fee=0.0, gateway_fee=4.0,
        tds_amount=0.0, owner_settlement_amount=100.0,
    ))
    await db_session.commit()

    headers = auth_headers(admin)
    resp = await async_client.get("/api/v1/admin/analytics/executive", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["totalUsers"] >= 2
    assert data["totalCafes"] >= 1
    assert data["gmv"] >= 104.0
    assert data["khelRevenue"] >= 4.0


@pytest.mark.asyncio
async def test_repeat_booking_rate_respects_period_days(async_client, db_session):
    """repeat_booking_rate must only consider bookings within the requested
    period — a repeat-booking pair that happened long before the period
    window must not count towards either the repeat-gamer numerator or the
    distinct-gamer denominator."""
    admin = await _make_admin(db_session)

    owner = User(
        id=uuid4(), email=f"owner_{uuid4().hex[:8]}@test.com", full_name="Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    repeat_gamer = User(
        id=uuid4(), email=f"repeat_{uuid4().hex[:8]}@test.com", full_name="Repeat Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    single_gamer = User(
        id=uuid4(), email=f"single_{uuid4().hex[:8]}@test.com", full_name="Single Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    old_only_gamer = User(
        id=uuid4(), email=f"old_{uuid4().hex[:8]}@test.com", full_name="Old-Only Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    db_session.add_all([owner, repeat_gamer, single_gamer, old_only_gamer])
    await db_session.flush()

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Repeat Rate Test Café", address_line1="2 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543211",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db_session.add(cafe)
    await db_session.flush()

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Standard", specs={}, price_per_hour=100.0,
        total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db_session.add(tier)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    in_period_created_at = now - timedelta(days=1)
    # Outside the 30-day narrow window but inside the 365-day (max allowed)
    # wide window used below.
    out_of_period_created_at = now - timedelta(days=100)

    def _make_booking(gamer_id, created_at):
        return Booking(
            id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer_id,
            cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today(),
            start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
            base_amount=100.0, discount_amount=0.0, gateway_fee=4.0, convenience_fee=0.0,
            total_amount=104.0, status=BookingStatus.COMPLETED, created_at=created_at,
        )

    # repeat_gamer: 2 bookings inside the period -> counts as a repeat gamer.
    db_session.add(_make_booking(repeat_gamer.id, in_period_created_at))
    db_session.add(_make_booking(repeat_gamer.id, in_period_created_at))
    # single_gamer: 1 booking inside the period -> counts towards distinct
    # gamers but not repeat gamers.
    db_session.add(_make_booking(single_gamer.id, in_period_created_at))
    # old_only_gamer: 2 bookings, outside the 30-day period but inside the
    # 365-day one -> would look like a repeat gamer at period=30 if the
    # query ignored `created_at`, but must only count when the requested
    # period actually covers it.
    db_session.add(_make_booking(old_only_gamer.id, out_of_period_created_at))
    db_session.add(_make_booking(old_only_gamer.id, out_of_period_created_at))
    await db_session.commit()

    headers = auth_headers(admin)

    # Narrow window: excludes old_only_gamer's bookings (100 days old).
    resp_narrow = await async_client.get(
        "/api/v1/admin/analytics/executive", params={"periodDays": 30}, headers=headers
    )
    assert resp_narrow.status_code == 200
    rate_narrow = resp_narrow.json()["data"]["repeatBookingRate"]

    # Wide window (365 days, the API's max): also includes old_only_gamer's
    # 2 bookings, which are themselves a repeat pair (num+1, denom+1) on top
    # of whatever the narrow window already counted.
    resp_wide = await async_client.get(
        "/api/v1/admin/analytics/executive", params={"periodDays": 365}, headers=headers
    )
    assert resp_wide.status_code == 200
    rate_wide = resp_wide.json()["data"]["repeatBookingRate"]

    # All bookings created by earlier tests in this session happened "just
    # now" (within seconds), so they fall inside BOTH the 30-day and the
    # 365-day windows identically — the only booking pair that differs
    # between the two calls is old_only_gamer's, which sits 100 days back.
    # Adding a repeat gamer (num+1, denom+1) to any existing average that is
    # below 100% strictly increases that average, so if the period filter is
    # correctly applied to the repeat/distinct gamer queries, rate_wide must
    # be strictly greater than rate_narrow. Before the fix, both queries
    # ignored `created_at` entirely, so rate_narrow == rate_wide regardless
    # of periodDays — this assertion is what catches that regression.
    assert rate_wide > rate_narrow
