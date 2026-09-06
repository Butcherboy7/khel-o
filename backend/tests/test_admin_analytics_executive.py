import pytest
from datetime import date, time, timedelta
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
