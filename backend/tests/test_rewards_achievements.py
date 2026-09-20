import pytest
from datetime import date, time
from uuid import uuid4
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.core.security import get_password_hash
from tests.conftest import auth_headers


async def _make_cafe(db_session, owner):
    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name=f"Rewards Café {uuid4().hex[:6]}", address_line1="1 Test St",
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
    return cafe, tier


def _booking(gamer, cafe, tier, **overrides):
    defaults = dict(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date(2026, 1, 5),
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0, seats_count=1,
        base_amount=100.0, discount_amount=0.0, gateway_fee=4.0, convenience_fee=0.0,
        total_amount=104.0, status=BookingStatus.COMPLETED,
    )
    defaults.update(overrides)
    return Booking(**defaults)


@pytest.mark.asyncio
async def test_rewards_unlocks_new_milestone_achievements(async_client, db_session):
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

    cafe_a, tier_a = await _make_cafe(db_session, owner)
    cafe_b, tier_b = await _make_cafe(db_session, owner)
    cafe_c, tier_c = await _make_cafe(db_session, owner)

    db_session.add_all([
        # Early Bird: session before 9 AM
        _booking(gamer, cafe_a, tier_a, start_time=time(7, 0), end_time=time(8, 0)),
        # Marathon Gamer: 4+ hour session
        _booking(gamer, cafe_a, tier_a, start_time=time(12, 0), end_time=time(16, 0), duration_hours=4.0),
        # Squad Up: 3+ seats
        _booking(gamer, cafe_b, tier_b, seats_count=3),
        # Café Explorer: bookings across 3 distinct cafés (this one is the 3rd distinct café)
        _booking(gamer, cafe_c, tier_c),
    ])
    await db_session.commit()

    headers = auth_headers(gamer)
    resp = await async_client.get("/api/v1/rewards", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]

    by_id = {a["id"]: a for a in data["achievements"]}
    assert by_id["early_bird"]["isUnlocked"] is True
    assert by_id["marathon_gamer"]["isUnlocked"] is True
    assert by_id["squad_up"]["isUnlocked"] is True
    assert by_id["cafe_explorer"]["isUnlocked"] is True

    # xp should include the four new bonuses on top of the 4*100 completed-booking base
    assert data["xp"] == 4 * 100 + 150 + 300 + 200 + 400


@pytest.mark.asyncio
async def test_rewards_new_achievements_locked_with_no_qualifying_bookings(async_client, db_session):
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

    cafe, tier = await _make_cafe(db_session, owner)
    # A single, ordinary, short, solo, mid-day booking at one café — none of
    # the new milestones should fire.
    db_session.add(_booking(gamer, cafe, tier, start_time=time(14, 0), end_time=time(15, 0)))
    await db_session.commit()

    headers = auth_headers(gamer)
    resp = await async_client.get("/api/v1/rewards", headers=headers)
    assert resp.status_code == 200
    by_id = {a["id"]: a for a in resp.json()["data"]["achievements"]}

    assert by_id["early_bird"]["isUnlocked"] is False
    assert by_id["marathon_gamer"]["isUnlocked"] is False
    assert by_id["squad_up"]["isUnlocked"] is False
    assert by_id["cafe_explorer"]["isUnlocked"] is False
