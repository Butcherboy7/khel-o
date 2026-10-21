"""The booking pass shows the setup's own name, not a placeholder."""
import uuid
from datetime import date, time, timedelta

import pytest

from app.models.booking import Booking, BookingStatus
from app.models.hardware_tier import HardwareTier
from app.models.user import UserRole
from tests.conftest import auth_headers, create_test_user
from tests.test_lead_listings import _make_cafe


@pytest.mark.asyncio
async def test_booking_detail_includes_cafe_and_setup_name(async_client, db_session):
    cafe = await _make_cafe(db_session, "Pass Test Café")
    tier = HardwareTier(
        id=uuid.uuid4(), cafe_id=cafe.id, name="RTX 4060 Esports Squads", total_seats=4,
        app_bookable_seats=4, reserved_walkin_seats=0, active_seats_count=4, price_per_hour=89.0, is_active=True,
    )
    db_session.add(tier)
    gamer = await create_test_user(db_session, role=UserRole.GAMER)
    booking = Booking(
        id=uuid.uuid4(), booking_reference=f"GC-TEST-{uuid.uuid4().hex[:6]}", gamer_id=gamer.id, cafe_id=cafe.id,
        hardware_tier_id=tier.id, session_date=date.today() + timedelta(days=1), start_time=time(14, 0),
        end_time=time(15, 0), duration_hours=1.0, base_amount=89.0, total_amount=89.0, status=BookingStatus.CONFIRMED,
    )
    db_session.add(booking)
    await db_session.commit()

    res = await async_client.get(f"/api/v1/bookings/{booking.id}", headers=auth_headers(gamer))
    assert res.status_code == 200
    data = res.json()["data"]["booking"]
    assert data["cafeName"] == "Pass Test Café"
    assert data["tierName"] == "RTX 4060 Esports Squads"
