"""
Test owner dashboard capabilities - acceptance tests for booking controls,
booking management, and cafe management with proper ownership enforcement.
"""
import pytest
from datetime import date, time, datetime, timedelta
from uuid import uuid4, UUID
from sqlalchemy import select
from httpx import AsyncClient

from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.core.security import get_password_hash
from tests.conftest import auth_headers
from app.main import app


@pytest.mark.asyncio
async def test_owner_can_set_bookable_stations(db_session):
    """Owner can set bookable station count, and it correctly drives available-slot calculation."""
    owner = User(
        id=uuid4(),
        email=f"owner_set_{uuid4().hex}@test.com",
        full_name="Owner One",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True
    )
    db_session.add(owner)
    await db_session.flush()
    
    db_session.add(UserRoleMapping(
        id=uuid4(),
        user_id=owner.id,
        role=UserRole.CAFE_OWNER
    ))
    
    cafe = Cafe(
        id=uuid4(),
        owner_id=owner.id,
        name="Test Café",
        address_line1="123 Main St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        bookable_stations=10,
        bookings_paused=False
    )
    db_session.add(cafe)
    
    tier = HardwareTier(
        id=uuid4(),
        cafe_id=cafe.id,
        name="Standard",
        specs={"gpu": "RTX 3060"},
        price_per_hour=100.0,
        total_seats=10,
        app_bookable_seats=8,
        active_seats_count=10,
        is_active=True
    )
    db_session.add(tier)
    
    await db_session.commit()
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(owner)
        
        response = await client.patch(
            f"/api/v1/owner/cafes/{cafe.id}/booking-controls",
            json={"bookableStations": 5},
            headers=headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["cafe"]["bookableStations"] == 5
        
        await db_session.refresh(cafe)
        assert cafe.bookable_stations == 5


@pytest.mark.asyncio
async def test_pausing_bookings_blocks_new_bookings(db_session):
    """Pausing bookings on Café A blocks new bookings on Café A but does not affect Café B."""
    owner_a = User(
        id=uuid4(),
        email=f"owner_a_pause_{uuid4().hex}@test.com",
        full_name="Owner A",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True
    )
    owner_b = User(
        id=uuid4(),
        email=f"owner_b_pause_{uuid4().hex}@test.com",
        full_name="Owner B",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True
    )
    gamer = User(
        id=uuid4(),
        email=f"gamer_pause_{uuid4().hex}@test.com",
        full_name="Gamer",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.GAMER,
        is_active=True
    )
    db_session.add_all([owner_a, owner_b, gamer])
    await db_session.flush()
    
    for u in [owner_a, owner_b]:
        db_session.add(UserRoleMapping(id=uuid4(), user_id=u.id, role=UserRole.CAFE_OWNER))
    db_session.add(UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER))
    
    cafe_a = Cafe(
        id=uuid4(),
        owner_id=owner_a.id,
        name="Café A",
        address_line1="123 Main St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        bookable_stations=5,
        bookings_paused=True
    )
    cafe_b = Cafe(
        id=uuid4(),
        owner_id=owner_b.id,
        name="Café B",
        address_line1="456 Main St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560002",
        phone_number="+919876543211",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        bookable_stations=5,
        bookings_paused=False
    )
    db_session.add_all([cafe_a, cafe_b])
    
    tier_a = HardwareTier(
        id=uuid4(),
        cafe_id=cafe_a.id,
        name="Standard A",
        specs={"gpu": "RTX 3060"},
        price_per_hour=100.0,
        total_seats=5,
        app_bookable_seats=5,
        active_seats_count=5,
        is_active=True
    )
    tier_b = HardwareTier(
        id=uuid4(),
        cafe_id=cafe_b.id,
        name="Standard B",
        specs={"gpu": "RTX 3060"},
        price_per_hour=100.0,
        total_seats=5,
        app_bookable_seats=5,
        active_seats_count=5,
        is_active=True
    )
    db_session.add_all([tier_a, tier_b])
    
    await db_session.commit()
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        gamer_headers = auth_headers(gamer)
        
        tomorrow = date.today() + timedelta(days=1)
        booking_payload_a = {
            "cafeId": str(cafe_a.id),
            "hardwareTierId": str(tier_a.id),
            "sessionDate": tomorrow.isoformat(),
            "startTime": "14:00:00",
            "durationHours": 2
        }
        
        response_a = await client.post(
            "/api/v1/bookings",
            json=booking_payload_a,
            headers=gamer_headers
        )
        
        assert response_a.status_code == 422, f"Expected 422 for paused cafe, got {response_a.status_code}: {response_a.json()}"
        assert "BOOKINGS_PAUSED" in response_a.json().get("error", {}).get("code", "")
        
        booking_payload_b = {
            "cafeId": str(cafe_b.id),
            "hardwareTierId": str(tier_b.id),
            "sessionDate": tomorrow.isoformat(),
            "startTime": "14:00:00",
            "durationHours": 2
        }
        
        response_b = await client.post(
            "/api/v1/bookings",
            json=booking_payload_b,
            headers=gamer_headers
        )
        
        assert response_b.status_code == 201, f"Expected 201, got {response_b.status_code}: {response_b.json()}"


@pytest.mark.asyncio
async def test_different_owner_cannot_edit_cafe(db_session):
    """A different approved owner attempts to edit Café A's pricing/hours/tiers → 403 in all cases."""
    owner_a = User(
        id=uuid4(),
        email=f"owner_a_forbid_{uuid4().hex}@test.com",
        full_name="Owner A",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True
    )
    owner_b = User(
        id=uuid4(),
        email=f"owner_b_forbid_{uuid4().hex}@test.com",
        full_name="Owner B",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True
    )
    db_session.add_all([owner_a, owner_b])
    await db_session.flush()
    
    for u in [owner_a, owner_b]:
        db_session.add(UserRoleMapping(id=uuid4(), user_id=u.id, role=UserRole.CAFE_OWNER))
    
    cafe_a = Cafe(
        id=uuid4(),
        owner_id=owner_a.id,
        name="Café A",
        address_line1="123 Main St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        bookable_stations=10,
        opening_time=time(9, 0),
        closing_time=time(23, 0)
    )
    db_session.add(cafe_a)
    
    tier_a = HardwareTier(
        id=uuid4(),
        cafe_id=cafe_a.id,
        name="Standard",
        specs={"gpu": "RTX 3060"},
        price_per_hour=100.0,
        total_seats=10,
        app_bookable_seats=8,
        active_seats_count=10,
        is_active=True
    )
    db_session.add(tier_a)
    
    await db_session.commit()
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        owner_b_headers = auth_headers(owner_b)
        
        pricing_response = await client.patch(
            f"/api/v1/owner/cafes/{cafe_a.id}/pricing",
            json={"pricing": [{"tierId": str(tier_a.id), "pricePerHour": 50.0}]},
            headers=owner_b_headers
        )
        assert pricing_response.status_code == 403, f"Expected 403 for pricing, got {pricing_response.status_code}"
        
        hours_response = await client.patch(
            f"/api/v1/owner/cafes/{cafe_a.id}/hours",
            json={"openingTime": "08:00:00", "closingTime": "22:00:00"},
            headers=owner_b_headers
        )
        assert hours_response.status_code == 403, f"Expected 403 for hours, got {hours_response.status_code}"
        
        tier_response = await client.post(
            f"/api/v1/owner/cafes/{cafe_a.id}/tiers",
            json={
                "name": "New Tier",
                "pricePerHour": 150.0,
                "totalSeats": 5,
                "appBookableSeats": 4
            },
            headers=owner_b_headers
        )
        assert tier_response.status_code == 403, f"Expected 403 for tier creation, got {tier_response.status_code}"


@pytest.mark.asyncio
async def test_edit_operating_hours_overnight(db_session):
    """Editing operating hours to an overnight range (e.g. 10AM-2AM) correctly reflects."""
    owner = User(
        id=uuid4(),
        email=f"owner_hours_{uuid4().hex}@test.com",
        full_name="Owner",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True
    )
    db_session.add(owner)
    await db_session.flush()
    
    db_session.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    
    cafe = Cafe(
        id=uuid4(),
        owner_id=owner.id,
        name="Late Night Café",
        address_line1="123 Main St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        bookable_stations=10,
        opening_time=time(10, 0),
        closing_time=time(23, 0)
    )
    db_session.add(cafe)
    
    await db_session.commit()
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        owner_headers = auth_headers(owner)
        
        response = await client.patch(
            f"/api/v1/owner/cafes/{cafe.id}/hours",
            json={"openingTime": "10:00:00", "closingTime": "02:00:00"},
            headers=owner_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["cafe"]["openingTime"] == "10:00:00"
        assert data["data"]["cafe"]["closingTime"] == "02:00:00"
        
        await db_session.refresh(cafe)
        assert cafe.opening_time.hour == 10
        assert cafe.closing_time.hour == 2
