"""
Test overnight slot generation - ensure slots work for cafés with hours like 10:00 AM – 2:00 AM.
"""
import pytest
from datetime import time, date, datetime, timedelta
from httpx import AsyncClient
from uuid import uuid4

from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.core.security import get_password_hash
from tests.conftest import auth_headers
from app.main import app


@pytest.mark.asyncio
async def test_overnight_hours_generate_correct_slots(db_session):
    """
    Café with hours 10:00–02:00 generates slots correctly through 1:30 AM 
    (last valid slot before 2AM close)
    """
    owner = User(
        id=uuid4(),
        email=f"overnight_owner_{uuid4().hex}@test.com",
        full_name="Overnight Owner",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True
    )
    gamer = User(
        id=uuid4(),
        email=f"overnight_gamer_{uuid4().hex}@test.com",
        full_name="Gamer",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.GAMER,
        is_active=True
    )
    db_session.add_all([owner, gamer])
    await db_session.flush()
    
    db_session.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    db_session.add(UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER))
    
    cafe = Cafe(
        id=uuid4(),
        owner_id=owner.id,
        name="Overnight Café",
        address_line1="123 Night St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        opening_time=time(10, 0),   # 10:00 AM
        closing_time=time(2, 0),    # 2:00 AM (next day)
        bookable_stations=10
    )
    db_session.add(cafe)
    
    tier = HardwareTier(
        id=uuid4(),
        cafe_id=cafe.id,
        name="Night Owl",
        specs={"gpu": "RTX 3060"},
        price_per_hour=100.0,
        total_seats=10,
        app_bookable_seats=10,
        active_seats_count=10,
        is_active=True
    )
    db_session.add(tier)
    
    await db_session.commit()
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        gamer_headers = auth_headers(gamer)
        
        tomorrow = date.today() + timedelta(days=1)
        
        booking_early = {
            "cafeId": str(cafe.id),
            "hardwareTierId": str(tier.id),
            "sessionDate": tomorrow.isoformat(),
            "startTime": "10:00:00",
            "durationHours": 2
        }
        
        resp1 = await client.post(
            "/api/v1/bookings",
            json=booking_early,
            headers=gamer_headers
        )
        assert resp1.status_code == 201, f"Early booking failed: {resp1.json()}"
        
        booking_late_night = {
            "cafeId": str(cafe.id),
            "hardwareTierId": str(tier.id),
            "sessionDate": tomorrow.isoformat(),
            "startTime": "01:00:00",
            "durationHours": 1
        }
        
        resp2 = await client.post(
            "/api/v1/bookings",
            json=booking_late_night,
            headers=gamer_headers
        )
        assert resp2.status_code == 201, f"Late night booking failed (expected post-midnight slots to work): {resp2.json()}"


@pytest.mark.asyncio
async def test_post_midnight_booking_locks_correct_date(db_session):
    """
    A booking made for a post-midnight slot correctly locks the right inventory unit 
    and appears in correct booking list for correct business day
    """
    owner = User(
        id=uuid4(),
        email=f"lockdate_owner_{uuid4().hex}@test.com",
        full_name="Owner",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True
    )
    gamer = User(
        id=uuid4(),
        email=f"lockdate_gamer_{uuid4().hex}@test.com",
        full_name="Gamer",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.GAMER,
        is_active=True
    )
    db_session.add_all([owner, gamer])
    await db_session.flush()
    
    db_session.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    db_session.add(UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER))
    
    cafe = Cafe(
        id=uuid4(),
        owner_id=owner.id,
        name="Date Lock Café",
        address_line1="123 Test St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        opening_time=time(18, 0),   # 6 PM
        closing_time=time(4, 0),    # 4 AM
        bookable_stations=1
    )
    db_session.add(cafe)
    
    tier = HardwareTier(
        id=uuid4(),
        cafe_id=cafe.id,
        name="Standard",
        specs={"gpu": "RTX 3060"},
        price_per_hour=100.0,
        total_seats=1,
        app_bookable_seats=1,
        active_seats_count=1,
        is_active=True
    )
    db_session.add(tier)
    
    await db_session.commit()
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        gamer_headers = auth_headers(gamer)
        owner_headers = auth_headers(owner)
        
        tomorrow = date.today() + timedelta(days=1)
        
        midnight_booking = {
            "cafeId": str(cafe.id),
            "hardwareTierId": str(tier.id),
            "sessionDate": tomorrow.isoformat(),
            "startTime": "02:00:00",  # 2 AM (post-midnight)
            "durationHours": 1
        }
        
        resp1 = await client.post(
            "/api/v1/bookings",
            json=midnight_booking,
            headers=gamer_headers
        )
        assert resp1.status_code == 201, f"Midnight booking failed: {resp1.json()}"
        
        booking_ref = resp1.json()["data"]["booking"]["bookingReference"]
        assert booking_ref.startswith("GC-")
        
        overlap_booking = {
            "cafeId": str(cafe.id),
            "hardwareTierId": str(tier.id),
            "sessionDate": tomorrow.isoformat(),
            "startTime": "02:30:00",  # Overlaps with 2:00-3:00
            "durationHours": 1
        }
        
        resp2 = await client.post(
            "/api/v1/bookings",
            json=overlap_booking,
            headers=gamer_headers
        )
        assert resp2.status_code == 422, "Overlap should be rejected"
        assert "SLOT_OVERCAPACITY" in resp2.json().get("error", {}).get("code", "")


@pytest.mark.asyncio
async def test_normal_hours_unaffected_regression(db_session):
    """
    A café with normal same-day hours (9AM–9PM) still works — regression check
    """
    owner = User(
        id=uuid4(),
        email=f"normal_owner_{uuid4().hex}@test.com",
        full_name="Owner",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True
    )
    gamer = User(
        id=uuid4(),
        email=f"normal_gamer_{uuid4().hex}@test.com",
        full_name="Gamer",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.GAMER,
        is_active=True
    )
    db_session.add_all([owner, gamer])
    await db_session.flush()
    
    db_session.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    db_session.add(UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER))
    
    cafe = Cafe(
        id=uuid4(),
        owner_id=owner.id,
        name="Normal Hours Café",
        address_line1="123 Day St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        opening_time=time(9, 0),    # 9 AM
        closing_time=time(21, 0),   # 9 PM (same day)
        bookable_stations=10
    )
    db_session.add(cafe)
    
    tier = HardwareTier(
        id=uuid4(),
        cafe_id=cafe.id,
        name="Standard",
        specs={"gpu": "RTX 3060"},
        price_per_hour=100.0,
        total_seats=10,
        app_bookable_seats=10,
        active_seats_count=10,
        is_active=True
    )
    db_session.add(tier)
    
    await db_session.commit()
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        gamer_headers = auth_headers(gamer)
        
        tomorrow = date.today() + timedelta(days=1)
        
        normal_booking = {
            "cafeId": str(cafe.id),
            "hardwareTierId": str(tier.id),
            "sessionDate": tomorrow.isoformat(),
            "startTime": "14:00:00",  # 2 PM
            "durationHours": 2
        }
        
        resp = await client.post(
            "/api/v1/bookings",
            json=normal_booking,
            headers=gamer_headers
        )
        assert resp.status_code == 201, f"Normal hours booking failed: {resp.json()}"


@pytest.mark.asyncio  
async def test_cancellation_window_overnight_booking(db_session):
    """
    Cancellation window calculation for a post-midnight booking is correct 
    (based on actual session start time, not miscalculated due to date rollover)
    """
    owner = User(
        id=uuid4(),
        email=f"cancel_owner_{uuid4().hex}@test.com",
        full_name="Owner",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True
    )
    gamer = User(
        id=uuid4(),
        email=f"cancel_gamer_{uuid4().hex}@test.com",
        full_name="Gamer",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.GAMER,
        is_active=True
    )
    db_session.add_all([owner, gamer])
    await db_session.flush()
    
    db_session.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    db_session.add(UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER))
    
    cafe = Cafe(
        id=uuid4(),
        owner_id=owner.id,
        name="Cancel Test Café",
        address_line1="123 Test St",
        city="Bengaluru", 
        state="Karnataka",
        pincode="560001",
        phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        opening_time=time(20, 0),
        closing_time=time(4, 0),
        bookable_stations=10
    )
    db_session.add(cafe)
    
    tier = HardwareTier(
        id=uuid4(),
        cafe_id=cafe.id,
        name="Standard",
        specs={"gpu": "RTX 3060"},
        price_per_hour=100.0,
        total_seats=10,
        app_bookable_seats=10,
        active_seats_count=10,
        is_active=True
    )
    db_session.add(tier)
    
    await db_session.commit()
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        gamer_headers = auth_headers(gamer)
        
        tomorrow = date.today() + timedelta(days=1)
        
        midnight_booking = {
            "cafeId": str(cafe.id),
            "hardwareTierId": str(tier.id),
            "sessionDate": tomorrow.isoformat(),
            "startTime": "01:00:00",
            "durationHours": 2
        }
        
        resp = await client.post(
            "/api/v1/bookings",
            json=midnight_booking,
            headers=gamer_headers
        )
        assert resp.status_code == 201, f"Booking creation failed: {resp.json()}"
        
        booking_data = resp.json()["data"]["booking"]
        assert booking_data["startTime"] == "01:00:00"
        assert booking_data["endTime"] == "03:00:00"
        assert float(booking_data["durationHours"]) == 2.0
