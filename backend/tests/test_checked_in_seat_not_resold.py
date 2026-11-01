"""Regression: a checked-in (or active) booking keeps its seat until the session
ends. Before the fix the capacity check only counted CONFIRMED and fresh
PENDING_PAYMENT, so the moment a player was checked in their seat looked free
for the rest of the session and could be sold to someone else."""
from datetime import date, time, timedelta
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal
from app.main import app
from app.models.booking import Booking, BookingStatus
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.repositories.booking_repository import BookingRepository

DAY = date.today() + timedelta(days=2)


async def _one_seat_cafe_with_booking(status: BookingStatus):
    async with AsyncSessionLocal() as db:
        owner = User(id=uuid4(), email=f"ci_own_{uuid4().hex[:8]}@test.com", full_name="Owner",
                     password_hash=get_password_hash("x12345678"), role=UserRole.CAFE_OWNER, is_active=True)
        first = User(id=uuid4(), email=f"ci_a_{uuid4().hex[:8]}@test.com", full_name="Player A",
                     password_hash=get_password_hash("x12345678"), role=UserRole.GAMER, is_active=True)
        second = User(id=uuid4(), email=f"ci_b_{uuid4().hex[:8]}@test.com", full_name="Player B",
                      password_hash=get_password_hash("x12345678"), role=UserRole.GAMER, is_active=True)
        db.add_all([owner, first, second])
        await db.flush()
        db.add_all([UserRoleMapping(id=uuid4(), user_id=u.id, role=u.role) for u in (owner, first, second)])
        cafe = Cafe(id=uuid4(), owner_id=owner.id, name=f"One Seat {uuid4().hex[:5]}", address_line1="1 St",
                    city="Hyderabad", state="Telangana", pincode="500072", phone_number="+919000000001",
                    verification_status=VerificationStatus.VERIFIED, is_active=True,
                    opening_time=time(0, 0), closing_time=time(23, 59), bookable_stations=1)
        db.add(cafe)
        tier = HardwareTier(id=uuid4(), cafe_id=cafe.id, name="PS5", specs={}, price_per_hour=150.0,
                            total_seats=1, app_bookable_seats=1, active_seats_count=1, is_active=True)
        db.add(tier)
        db.add(Booking(
            id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=first.id,
            cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=DAY,
            start_time=time(18, 0), end_time=time(21, 0), duration_hours=3.0,
            base_amount=450, discount_amount=0, gateway_fee=0, total_amount=450, convenience_fee=0,
            status=status,
        ))
        await db.commit()
        return cafe.id, tier.id, second


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [BookingStatus.CHECKED_IN, BookingStatus.ACTIVE, BookingStatus.CONFIRMED])
async def test_held_seat_counts_toward_capacity(status):
    _cafe_id, tier_id, _ = await _one_seat_cafe_with_booking(status)
    async with AsyncSessionLocal() as db:
        taken = await BookingRepository(db).get_overlapping_bookings_count(tier_id, DAY, time(19, 0), time(20, 0))
    assert taken == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [BookingStatus.CHECKED_IN, BookingStatus.ACTIVE])
async def test_checked_in_seat_cannot_be_sold_twice(status):
    cafe_id, tier_id, second = await _one_seat_cafe_with_booking(status)
    body = {"cafeId": str(cafe_id), "hardwareTierId": str(tier_id), "sessionDate": str(DAY),
            "startTime": "19:00:00", "durationHours": 1.0, "seatsCount": 1}
    headers = {"Authorization": f"Bearer {create_access_token(subject=str(second.id), role='gamer')}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        res = await c.post("/api/v1/bookings", json=body, headers=headers)
        assert res.status_code == 422, res.text
        assert res.json()["error"]["code"] == "SLOT_OVERCAPACITY"
        # The public availability view agrees the seat is taken.
        slots = await c.get(f"/api/v1/cafes/{cafe_id}/availability", params={"tier_id": str(tier_id), "date": str(DAY)})
        assert slots.status_code == 200, slots.text
        assert "18:00:00" in slots.text


@pytest.mark.asyncio
async def test_finished_session_frees_the_seat():
    cafe_id, tier_id, second = await _one_seat_cafe_with_booking(BookingStatus.COMPLETED)
    body = {"cafeId": str(cafe_id), "hardwareTierId": str(tier_id), "sessionDate": str(DAY),
            "startTime": "19:00:00", "durationHours": 1.0, "seatsCount": 1}
    headers = {"Authorization": f"Bearer {create_access_token(subject=str(second.id), role='gamer')}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        res = await c.post("/api/v1/bookings", json=body, headers=headers)
    assert res.status_code == 201, res.text
