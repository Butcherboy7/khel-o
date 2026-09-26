import uuid
from datetime import time, timedelta

import pytest

from app.core.security import get_password_hash
from app.core.time import now_ist
from app.models.booking import Booking, BookingStatus
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.user import User, UserRole


async def _setup(db, **cafe_kw):
    owner = User(id=uuid.uuid4(), email=f"o_{uuid.uuid4().hex[:8]}@t.com", password_hash=get_password_hash("x12345678"),
                 full_name="O", role=UserRole.CAFE_OWNER, is_active=True)
    gamer = User(id=uuid.uuid4(), email=f"g_{uuid.uuid4().hex[:8]}@t.com", password_hash=get_password_hash("x12345678"),
                 full_name="G", role=UserRole.GAMER, is_active=True)
    db.add_all([owner, gamer])
    await db.flush()
    cafe = Cafe(id=uuid.uuid4(), owner_id=owner.id, name="Live Cafe", address_line1="1", city="Hyderabad",
                state="Telangana", pincode="500001", phone_number=f"+9190{uuid.uuid4().hex[:8]}",
                verification_status=VerificationStatus.VERIFIED, is_active=True,
                opening_time=time(0, 0), closing_time=time(23, 59, 59), bookable_stations=10, **cafe_kw)
    db.add(cafe)
    await db.flush()
    tier = HardwareTier(id=uuid.uuid4(), cafe_id=cafe.id, name="PS5", total_seats=4, app_bookable_seats=4,
                        price_per_hour=120, tier_type="gaming")
    db.add(tier)
    await db.flush()
    now = now_ist()
    start = (now - timedelta(minutes=30)).time().replace(microsecond=0)
    end = (now + timedelta(minutes=30)).time().replace(microsecond=0)
    if start < end:  # skip the booking right around midnight
        db.add(Booking(id=uuid.uuid4(), booking_reference=f"GC-{uuid.uuid4().hex[:6]}", gamer_id=gamer.id,
                       cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=now.date(), start_time=start,
                       end_time=end, duration_hours=1.0, base_amount=120, total_amount=120,
                       seats_count=1, status=BookingStatus.CONFIRMED))
    await db.commit()
    return cafe, tier, start < end


@pytest.mark.asyncio
async def test_live_counts_bookings_covering_now(async_client, db_session):
    cafe, tier, booked = await _setup(db_session)
    r = await async_client.get(f"/api/v1/cafes/{cafe.id}/live")
    assert r.status_code == 200
    t = r.json()["data"]["tiers"][0]
    assert t["tierId"] == str(tier.id) and t["bookable"] == 4
    assert t["freeNow"] == (3 if booked else 4)


@pytest.mark.asyncio
async def test_live_reports_zero_free_for_lead_listing(async_client, db_session):
    cafe, _, _ = await _setup(db_session, is_lead_listing=True)
    data = (await async_client.get(f"/api/v1/cafes/{cafe.id}/live")).json()["data"]
    assert data["openNow"] is False and data["tiers"][0]["freeNow"] == 0
