import pytest
from datetime import date, time
from uuid import uuid4
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier, PlatformType
from app.models.booking import Booking, BookingStatus
from app.core.security import get_password_hash
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_setup_performance_groups_by_platform(async_client, db_session):
    admin = User(
        id=uuid4(), email=f"admin_{uuid4().hex[:8]}@test.com", full_name="Admin",
        password_hash=get_password_hash("testpass123"), role=UserRole.ADMIN, is_active=True,
    )
    owner = User(
        id=uuid4(), email=f"owner_{uuid4().hex[:8]}@test.com", full_name="Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    gamer = User(
        id=uuid4(), email=f"gamer_{uuid4().hex[:8]}@test.com", full_name="Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    db_session.add_all([admin, owner, gamer])
    await db_session.commit()

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Setup Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db_session.add(cafe)
    await db_session.flush()

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="PS5 Slot", specs={}, price_per_hour=150.0,
        total_seats=4, app_bookable_seats=4, active_seats_count=4, is_active=True,
        platform=PlatformType.PLAYSTATION,
    )
    db_session.add(tier)
    await db_session.flush()

    booking = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today(),
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=150.0, discount_amount=0.0, gateway_fee=6.0, convenience_fee=0.0,
        total_amount=156.0, status=BookingStatus.COMPLETED,
    )
    db_session.add(booking)
    await db_session.commit()

    headers = auth_headers(admin)
    resp = await async_client.get("/api/v1/admin/analytics/setups", headers=headers)
    assert resp.status_code == 200
    items = resp.json()["data"]
    ps5 = next(i for i in items if i["platform"] == "playstation")
    assert ps5["bookings"] == 1
    assert ps5["gmv"] == 156.0
