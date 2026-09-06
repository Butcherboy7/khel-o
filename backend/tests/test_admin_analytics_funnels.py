import pytest
from datetime import date, time
from uuid import uuid4
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.models.analytics_event import AnalyticsEvent
from app.core.security import get_password_hash
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_funnel_stage_counts(async_client, db_session):
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
        id=uuid4(), owner_id=owner.id, name="Funnel Café", address_line1="1 Test St",
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

    db_session.add_all([
        AnalyticsEvent(id=uuid4(), session_id="s1", event_type="search_performed", event_metadata={"resultCount": 3}),
        AnalyticsEvent(id=uuid4(), session_id="s1", event_type="venue_viewed", cafe_id=cafe.id, event_metadata={}),
        AnalyticsEvent(id=uuid4(), session_id="s1", event_type="booking_flow_started", cafe_id=cafe.id, event_metadata={"tierId": str(tier.id)}),
    ])

    booking = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today(),
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=0.0, gateway_fee=4.0, convenience_fee=0.0,
        total_amount=104.0, status=BookingStatus.COMPLETED,
    )
    db_session.add(booking)
    await db_session.commit()

    headers = auth_headers(admin)
    resp = await async_client.get("/api/v1/admin/analytics/funnels", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["searches"] >= 1
    assert data["venueViews"] >= 1
    assert data["bookingsStarted"] >= 1
    assert data["bookingsConfirmedOrCompleted"] >= 1
