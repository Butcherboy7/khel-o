import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from app.main import app
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.booking import Booking, BookingStatus
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal
from tests.conftest import create_test_user
import uuid
from datetime import date, time

@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

@pytest.mark.asyncio
async def test_gamer_cannot_access_owner_dashboard(async_client: AsyncClient):
    """Verify that a user with gamer role cannot access owner dashboard endpoint."""
    async with AsyncSessionLocal() as db:
        gamer = await create_test_user(db, role=UserRole.GAMER)
        await db.commit()
        
        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}
        
        response = await async_client.get("/api/v1/owner/dashboard", headers=headers)
        assert response.status_code == 403

@pytest.mark.asyncio
async def test_suspended_cafe_cannot_be_self_reactivated(async_client: AsyncClient):
    """Verify that a suspended cafe owner cannot self-reactivate a suspended cafe via PATCH endpoint."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid.uuid4(),
            email=f"suspended_owner_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Suspended Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)
        await db.commit()

        cafe = Cafe(
            id=uuid.uuid4(),
            owner_id=owner.id,
            name="Suspended Arena",
            address_line1="123 Test St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000000",
            verification_status=VerificationStatus.SUSPENDED,
            is_active=False
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        # Attempt to patch is_active=True on suspended cafe
        response = await async_client.patch(f"/api/v1/cafes/{cafe.id}", json={"isActive": True}, headers=headers)
        # Verify it returns forbidden or bad request error
        assert response.status_code in [400, 403]

@pytest.mark.asyncio
async def test_checkin_fails_for_unpaid_booking(async_client: AsyncClient):
    """Verify that checking in a booking in PENDING_PAYMENT status fails."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid.uuid4(),
            email=f"checkin_owner_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Checkin Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        gamer = User(
            id=uuid.uuid4(),
            email=f"checkin_gamer_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Checkin Gamer",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add_all([owner, gamer])
        await db.commit()

        cafe = Cafe(
            id=uuid.uuid4(),
            owner_id=owner.id,
            name="Checkin Arena",
            address_line1="456 Test St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000001",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True
        )
        db.add(cafe)
        await db.commit()

        booking = Booking(
            id=uuid.uuid4(),
            booking_reference=f"BK-{uuid.uuid4().hex[:8].upper()}",
            gamer_id=gamer.id,
            cafe_id=cafe.id,
            hardware_tier_id=uuid.uuid4(),
            session_date=date.today(),
            start_time=time(10, 0),
            end_time=time(12, 0),
            duration_hours=2.0,
            base_amount=200.0,
            total_amount=200.0,
            status=BookingStatus.PENDING_PAYMENT
        )
        db.add(booking)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        # Attempt to check in unpaid booking
        response = await async_client.post(f"/api/v1/owner/bookings/{booking.id}/checkin", headers=headers)
        assert response.status_code in [400, 422]

@pytest.mark.asyncio
async def test_suspended_cafe_cannot_add_hardware_tier(async_client: AsyncClient):
    """Verify that a suspended cafe owner cannot add hardware tiers."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid.uuid4(),
            email=f"tier_suspended_owner_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Tier Suspended Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)
        await db.commit()

        cafe = Cafe(
            id=uuid.uuid4(),
            owner_id=owner.id,
            name="Tier Suspended Arena",
            address_line1="789 Test St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000002",
            verification_status=VerificationStatus.SUSPENDED,
            is_active=False
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Blocked Tier",
            "description": "Suspended tier",
            "specs": {"gpu": "RTX 4090", "ram": "32GB", "monitor": "240Hz"},
            "totalSeats": 10,
            "appBookableSeats": 8,
            "pricePerHour": 150.0
        }

        response = await async_client.post(f"/api/v1/cafes/{cafe.id}/tiers", json=payload, headers=headers)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "CAFE_SUSPENDED"

@pytest.mark.asyncio
async def test_emergency_mode_blocks_booking_creation_and_availability_search(async_client: AsyncClient):
    """Verify emergency mode blocks booking creation and excludes cafe from search results."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid.uuid4(),
            email=f"emerg_owner_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Emergency Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        gamer = User(
            id=uuid.uuid4(),
            email=f"emerg_gamer_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Emergency Gamer",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add_all([owner, gamer])
        await db.commit()

        cafe = Cafe(
            id=uuid.uuid4(),
            owner_id=owner.id,
            name="Emergency Arena",
            address_line1="999 Emerg St",
            city="EmergencyCity",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000099",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
            is_emergency_mode=True
        )
        db.add(cafe)
        await db.commit()

        gamer_token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        gamer_headers = {"Authorization": f"Bearer {gamer_token}"}

        # 1. Search cafes should exclude emergency cafe
        search_res = await async_client.get(f"/api/v1/cafes?city=EmergencyCity", headers=gamer_headers)
        assert search_res.status_code == 200
        items = search_res.json()["data"]["items"]
        assert len(items) == 0

        # 2. Attempting to create booking returns 400 EMERGENCY_MODE_ACTIVE
        from app.models.hardware_tier import HardwareTier
        tier = HardwareTier(
            id=uuid.uuid4(),
            cafe_id=cafe.id,
            name="Emerg Tier",
            total_seats=10,
            app_bookable_seats=10,
            price_per_hour=100.0,
            is_active=True
        )
        db.add(tier)
        await db.commit()

        booking_payload = {
            "cafeId": str(cafe.id),
            "hardwareTierId": str(tier.id),
            "sessionDate": (date.today()).isoformat(),
            "startTime": "18:00:00",
            "durationHours": 2.0
        }
        create_res = await async_client.post("/api/v1/bookings", json=booking_payload, headers=gamer_headers)
        assert create_res.status_code == 422
        assert create_res.json()["error"]["code"] == "EMERGENCY_MODE_ACTIVE"

@pytest.mark.asyncio
async def test_booking_cancellation_success(async_client: AsyncClient):
    """Verify that canceling a booking in the future succeeds without NameError / 500 error."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"cancel_gamer_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Cancel Gamer",
            role=UserRole.GAMER,
            is_active=True
        )
        owner = User(
            id=uuid.uuid4(),
            email=f"cancel_owner_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Cancel Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add_all([gamer, owner])
        await db.commit()

        cafe = Cafe(
            id=uuid.uuid4(),
            owner_id=owner.id,
            name="Cancel Arena",
            address_line1="123 Cancel St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000088",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True
        )
        db.add(cafe)
        await db.commit()

        from app.models.hardware_tier import HardwareTier
        tier = HardwareTier(
            id=uuid.uuid4(),
            cafe_id=cafe.id,
            name="Cancel Tier",
            total_seats=5,
            app_bookable_seats=5,
            price_per_hour=100.0,
            is_active=True
        )
        db.add(tier)
        await db.commit()

        from datetime import timedelta
        future_date = date.today() + timedelta(days=2)

        booking = Booking(
            id=uuid.uuid4(),
            booking_reference=f"GC-2026-{uuid.uuid4().hex[:6].upper()}",
            gamer_id=gamer.id,
            cafe_id=cafe.id,
            hardware_tier_id=tier.id,
            session_date=future_date,
            start_time=time(14, 0, 0),
            end_time=time(16, 0, 0),
            duration_hours=2.0,
            base_amount=200.0,
            total_amount=200.0,
            status=BookingStatus.CONFIRMED
        )
        db.add(booking)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        cancel_res = await async_client.post(f"/api/v1/bookings/{booking.id}/cancel", json={"reason": "Plans changed"}, headers=headers)
        assert cancel_res.status_code == 200
        res_data = cancel_res.json()["data"]["booking"]
        assert res_data["status"] == "cancelled"

@pytest.mark.asyncio
async def test_pending_cafe_cannot_accept_bookings(async_client: AsyncClient):
    """Verify that a café with PENDING verification_status cannot accept bookings at all."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid.uuid4(),
            email=f"pending_owner_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Pending Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        gamer = User(
            id=uuid.uuid4(),
            email=f"pending_gamer_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Pending Gamer",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add_all([owner, gamer])
        await db.commit()

        cafe = Cafe(
            id=uuid.uuid4(),
            owner_id=owner.id,
            name="Pending Arena",
            address_line1="123 Pending St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000099",
            verification_status=VerificationStatus.PENDING,
            is_active=True
        )
        db.add(cafe)
        await db.commit()

        from app.models.hardware_tier import HardwareTier
        tier = HardwareTier(
            id=uuid.uuid4(),
            cafe_id=cafe.id,
            name="Pending Tier",
            total_seats=10,
            app_bookable_seats=10,
            price_per_hour=100.0,
            is_active=True
        )
        db.add(tier)
        await db.commit()

        gamer_token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        gamer_headers = {"Authorization": f"Bearer {gamer_token}"}

        from datetime import timedelta
        future_date = date.today() + timedelta(days=2)

        booking_payload = {
            "cafeId": str(cafe.id),
            "hardwareTierId": str(tier.id),
            "sessionDate": future_date.isoformat(),
            "startTime": "18:00:00",
            "durationHours": 2.0
        }
        create_res = await async_client.post("/api/v1/bookings", json=booking_payload, headers=gamer_headers)
        assert create_res.status_code == 422
        assert create_res.json()["error"]["code"] == "CAFE_NOT_AVAILABLE"


@pytest.mark.asyncio
async def test_admin_approve_pending_cafe(async_client: AsyncClient):
    """Verify admin can approve a pending cafe, changing its verification_status to VERIFIED."""
    async with AsyncSessionLocal() as db:
        admin = User(
            id=uuid.uuid4(),
            email=f"admin_approve_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Admin Approve",
            role=UserRole.ADMIN,
            is_active=True
        )
        owner = User(
            id=uuid.uuid4(),
            email=f"owner_approve_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Owner Approve",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add_all([admin, owner])
        await db.commit()

        cafe = Cafe(
            id=uuid.uuid4(),
            owner_id=owner.id,
            name="Pending Approve Arena",
            address_line1="123 Pending St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000099",
            verification_status=VerificationStatus.PENDING,
            is_active=False
        )
        db.add(cafe)
        await db.commit()

        admin_token = create_access_token(subject=str(admin.id), role=admin.role.value)
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Admin approves via PATCH endpoint
        approve_res = await async_client.patch(
            f"/api/v1/admin/cafes/{cafe.id}/verify",
            json={"status": "verified"},
            headers=admin_headers
        )
        assert approve_res.status_code == 200
        data = approve_res.json()["data"]["cafe"]
        assert data["verification_status"] == "verified"

        # Verify owner has CAFE_OWNER role in user_roles (new auth system)
        from app.models.user_role import UserRoleMapping
        stmt = select(UserRoleMapping).where(UserRoleMapping.user_id == owner.id)
        result = await db.execute(stmt)
        roles = result.scalars().all()
        role_values = [r.role.value for r in roles]
        assert "cafe_owner" in role_values


@pytest.mark.asyncio
async def test_owner_status_reflects_after_onboarding_submit(async_client: AsyncClient):
    """Verify owner status endpoint returns 'pending' after onboarding submission."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"owner_status_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Owner Status",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        gamer_token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        gamer_headers = {"Authorization": f"Bearer {gamer_token}"}

        # 1. Before onboarding: status should be 'prospective'
        status_res_before = await async_client.get("/api/v1/owner/status", headers=gamer_headers)
        assert status_res_before.status_code == 200
        assert status_res_before.json()["data"]["status"] == "prospective"

        # 2. Submit onboarding
        onboarding_payload = {
            "name": "Status Test Cafe",
            "addressLine1": "123 Status St",
            "city": "Bengaluru",
            "state": "Karnataka",
            "pincode": "560001",
            "phoneNumber": "+919999999999",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00"
        }
        onboarding_res = await async_client.post("/api/v1/owner/onboarding/submit", json=onboarding_payload, headers=gamer_headers)
        assert onboarding_res.status_code == 200
        cafe_id = onboarding_res.json()["data"]["cafeId"]

        # 3. After onboarding: status should be 'pending'
        status_res_after = await async_client.get("/api/v1/owner/status", headers=gamer_headers)
        assert status_res_after.status_code == 200
        data_after = status_res_after.json()["data"]
        assert data_after["status"] == "pending"
        assert data_after["cafe"]["id"] == cafe_id






