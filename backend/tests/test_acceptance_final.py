"""
Acceptance tests for role permission preservation - FINAL EVIDENCE.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from uuid import uuid4
from datetime import datetime, timedelta

from app.main import app
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.core.security import get_password_hash, create_access_token
from app.database import AsyncSessionLocal


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest_asyncio.fixture  
async def db():
    async with AsyncSessionLocal() as session:
        yield session


def auth_headers(user, is_admin=False):
    """Generate auth headers for a user in tests."""
    role = "admin" if is_admin else user.role.value
    token = create_access_token(subject=str(user.id), role=role)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_1_approved_owner_can_still_book(client, db):
    """ACCEPTANCE TEST 1: User with gamer role approved as cafe_owner can still create booking."""
    test_id = uuid4().hex[:8]
    
    gamer = User(
        id=uuid4(),
        email=f"gamer_{test_id}@test.com",
        full_name="Gamer User",
        password_hash=get_password_hash("password"),
        role=UserRole.GAMER,
        is_active=True
    )
    db.add(gamer)
    
    gamer_role = UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER, cafe_id=None)
    db.add(gamer_role)
    
    owner = User(
        id=uuid4(),
        email=f"owner_{test_id}@test.com",
        full_name="Cafe Owner",
        password_hash=get_password_hash("password"),
        role=UserRole.CAFE_OWNER,
        is_active=True
    )
    db.add(owner)
    
    owner_gamer_role = UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.GAMER, cafe_id=None)
    owner_owner_role = UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER, cafe_id=None)
    db.add_all([owner_gamer_role, owner_owner_role])
    
    admin = User(
        id=uuid4(),
        email=f"admin_{test_id}@test.com",
        full_name="Admin",
        password_hash=get_password_hash("password"),
        role=UserRole.ADMIN,
        is_active=True
    )
    db.add(admin)
    
    admin_role = UserRoleMapping(id=uuid4(), user_id=admin.id, role=UserRole.ADMIN, cafe_id=None)
    db.add(admin_role)
    
    cafe1 = Cafe(
        id=uuid4(),
        owner_id=owner.id,
        name="Owner Cafe",
        city="Mumbai",
        state="Maharashtra",
        address_line1="Test",
        pincode="400001",
        phone_number=f"+9199999{test_id[:6]}",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        bookable_stations=10
    )
    db.add(cafe1)
    
    tier1 = HardwareTier(
        id=uuid4(), cafe_id=cafe1.id, name="Standard",
        specs={"gpu": "RTX 3060"}, price_per_hour=100.0,
        total_seats=10, app_bookable_seats=7, active_seats_count=10,
        preset_category="gaming", is_active=True
    )
    db.add(tier1)
    
    cafe2 = Cafe(
        id=uuid4(),
        owner_id=gamer.id,
        name="Gamer Cafe",
        city="Delhi",
        state="Delhi",
        address_line1="Test",
        pincode="110001",
        phone_number=f"+9188888{test_id[:6]}",
        verification_status=VerificationStatus.PENDING,
        is_active=False,
        bookable_stations=10
    )
    db.add(cafe2)
    
    await db.commit()
    
    # Approve the user's cafe
    approval_resp = await client.patch(
        f"/api/v1/admin/cafes/{cafe2.id}/verify",
        json={"status": "verified"},
        headers=auth_headers(admin, is_admin=True)
    )
    
    assert approval_resp.status_code == 200, f"Approval failed: {approval_resp.status_code}"
    
    # Verify dual roles
    stmt = select(UserRoleMapping).where(UserRoleMapping.user_id == gamer.id)
    result = await db.execute(stmt)
    roles = result.scalars().all()
    role_values = [r.role.value for r in roles]
    
    assert "gamer" in role_values, f"Gamer role missing: {role_values}"
    assert "cafe_owner" in role_values, f"Cafe_owner role missing: {role_values}"
    
    # Try to create booking
    future_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
    booking_data = {
        "cafeId": str(cafe1.id),
        "hardwareTierId": str(tier1.id),
        "sessionDate": future_date,
        "startTime": "10:00",
        "durationHours": 2,
        "seatsCount": 1
    }
    
    booking_resp = await client.post(
        "/api/v1/bookings",
        json=booking_data,
        headers=auth_headers(gamer)
    )
    
    assert booking_resp.status_code == 201, \
        f"Booking failed: {booking_resp.status_code} - {booking_resp.text}"


@pytest.mark.asyncio
async def test_2_dual_roles_after_approval(client, db):
    """ACCEPTANCE TEST 2: user_roles contains both gamer AND cafe_owner after approval."""
    test_id = uuid4().hex[:8]
    
    gamer = User(
        id=uuid4(),
        email=f"dual_{test_id}@test.com",
        full_name="Dual Role User",
        password_hash=get_password_hash("password"),
        role=UserRole.GAMER,
        is_active=True
    )
    db.add(gamer)
    gamer_role = UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER, cafe_id=None)
    db.add(gamer_role)
    
    cafe = Cafe(
        id=uuid4(),
        owner_id=gamer.id,
        name="Test Cafe",
        city="Bangalore",
        state="Karnataka",
        address_line1="Test",
        pincode="560001",
        phone_number=f"+9177777{test_id[:6]}",
        verification_status=VerificationStatus.PENDING,
        is_active=False
    )
    db.add(cafe)
    
    admin = User(
        id=uuid4(),
        email=f"admin2_{test_id}@test.com",
        full_name="Admin",
        password_hash=get_password_hash("password"),
        role=UserRole.ADMIN,
        is_active=True
    )
    db.add(admin)
    admin_role = UserRoleMapping(id=uuid4(), user_id=admin.id, role=UserRole.ADMIN, cafe_id=None)
    db.add(admin_role)
    
    await db.commit()
    
    # Approve
    approval_resp = await client.patch(
        f"/api/v1/admin/cafes/{cafe.id}/verify",
        json={"status": "verified"},
        headers=auth_headers(admin, is_admin=True)
    )
    
    assert approval_resp.status_code == 200
    
    # Check roles
    stmt = select(UserRoleMapping).where(UserRoleMapping.user_id == gamer.id)
    result = await db.execute(stmt)
    roles = result.scalars().all()
    role_values = [r.role.value for r in roles]
    
    assert "gamer" in role_values, f"Missing gamer: {role_values}"
    assert "cafe_owner" in role_values, f"Missing cafe_owner: {role_values}"


@pytest.mark.asyncio
async def test_3_direct_cafe_creation_dual_roles(client, db):
    """ACCEPTANCE TEST 3: Direct cafe creation (POST /cafes) also results in dual roles."""
    test_id = uuid4().hex[:8]
    
    gamer = User(
        id=uuid4(),
        email=f"direct_{test_id}@test.com",
        full_name="Direct Creator",
        password_hash=get_password_hash("password"),
        role=UserRole.GAMER,
        is_active=True
    )
    db.add(gamer)
    gamer_role = UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER, cafe_id=None)
    db.add(gamer_role)
    
    await db.commit()
    
    cafe_data = {
        "name": "My New Cafe",
        "addressLine1": "123 Test St",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "pincode": "600001",
        "phoneNumber": f"+9166666{test_id[:6]}",
        "totalSeats": 20
    }
    
    create_resp = await client.post(
        "/api/v1/cafes",
        json=cafe_data,
        headers=auth_headers(gamer)
    )
    
    assert create_resp.status_code == 201, f"Create failed: {create_resp.status_code}"
    
    # Check roles
    stmt = select(UserRoleMapping).where(UserRoleMapping.user_id == gamer.id)
    result = await db.execute(stmt)
    roles = result.scalars().all()
    role_values = [r.role.value for r in roles]
    
    assert "gamer" in role_values
    assert "cafe_owner" in role_values


@pytest.mark.asyncio
async def test_4_owner_endpoint_access_200(client, db):
    """ACCEPTANCE TEST 4: Freshly granted user can call owner-only endpoint and gets 200."""
    test_id = uuid4().hex[:8]
    
    gamer = User(
        id=uuid4(),
        email=f"owner_access_{test_id}@test.com",
        full_name="Owner Access Test",
        password_hash=get_password_hash("password"),
        role=UserRole.GAMER,
        is_active=True
    )
    db.add(gamer)
    gamer_role = UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER, cafe_id=None)
    db.add(gamer_role)
    
    cafe = Cafe(
        id=uuid4(),
        owner_id=gamer.id,
        name="Owner Test Cafe",
        city="Hyderabad",
        state="Telangana",
        address_line1="Test",
        pincode="500001",
        phone_number=f"+9155555{test_id[:6]}",
        verification_status=VerificationStatus.PENDING,
        is_active=False
    )
    db.add(cafe)
    
    admin = User(
        id=uuid4(),
        email=f"admin3_{test_id}@test.com",
        full_name="Admin",
        password_hash=get_password_hash("password"),
        role=UserRole.ADMIN,
        is_active=True
    )
    db.add(admin)
    admin_role = UserRoleMapping(id=uuid4(), user_id=admin.id, role=UserRole.ADMIN, cafe_id=None)
    db.add(admin_role)
    
    await db.commit()
    
    # Approve
    approval_resp = await client.patch(
        f"/api/v1/admin/cafes/{cafe.id}/verify",
        json={"status": "verified"},
        headers=auth_headers(admin, is_admin=True)
    )
    assert approval_resp.status_code == 200
    
    # Try owner endpoint - add hardware tier
    tier_data = {
        "name": "Premium",
        "specs": {"gpu": "RTX 4080"},
        "pricePerHour": 200.0,
        "totalSeats": 8,
        "appBookableSeats": 6,
        "presetCategory": "premium"
    }
    
    tier_resp = await client.post(
        f"/api/v1/cafes/{cafe.id}/tiers",
        json=tier_data,
        headers=auth_headers(gamer)
    )
    
    assert tier_resp.status_code == 201, \
        f"Owner endpoint failed: {tier_resp.status_code} - {tier_resp.text}"
