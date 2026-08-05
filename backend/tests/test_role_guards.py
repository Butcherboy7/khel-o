import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.booking import Booking, BookingStatus
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal
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
        gamer = User(
            id=uuid.uuid4(),
            email=f"gamer_guard_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Guard Test Gamer",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
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
