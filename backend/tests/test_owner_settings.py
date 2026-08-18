import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from app.main import app
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal
import uuid
from datetime import time

@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

@pytest.mark.asyncio
async def test_get_owner_settings_success(async_client: AsyncClient):
    """Verify owner can fetch cafe settings."""
    async with AsyncSessionLocal() as db:
        owner_id = uuid.uuid4()
        owner = User(
            id=owner_id,
            email=f"settings_owner_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Settings Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)

        role_mapping = UserRoleMapping(
            id=uuid.uuid4(),
            user_id=owner_id,
            role=UserRole.CAFE_OWNER,
            cafe_id=None
        )
        db.add(role_mapping)

        cafe = Cafe(
            id=uuid.uuid4(),
            owner_id=owner_id,
            name="Settings Arena",
            address_line1="123 Setting St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919876543210",
            opening_time=time(9, 0),
            closing_time=time(23, 0),
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
            is_emergency_mode=False,
            bookings_paused=False
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role="cafe_owner")
        headers = {"Authorization": f"Bearer {token}"}

        res = await async_client.get("/api/v1/owner/settings", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["cafe"]["cafeName"] == "Settings Arena"
        assert data["cafe"]["isEmergencyMode"] is False
        assert data["cafe"]["bookingsPaused"] is False

@pytest.mark.asyncio
async def test_toggle_emergency_mode(async_client: AsyncClient):
    """Verify owner can toggle emergency mode on and off."""
    async with AsyncSessionLocal() as db:
        owner_id = uuid.uuid4()
        owner = User(
            id=owner_id,
            email=f"emerg_toggle_owner_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Emerg Toggle Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)

        db.add(UserRoleMapping(
            id=uuid.uuid4(),
            user_id=owner_id,
            role=UserRole.CAFE_OWNER
        ))

        cafe = Cafe(
            id=uuid.uuid4(),
            owner_id=owner_id,
            name="Emerg Arena",
            address_line1="456 Emerg Rd",
            city="Mumbai",
            state="Maharashtra",
            pincode="400001",
            phone_number="+919876543211",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
            is_emergency_mode=False
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role="cafe_owner")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Enable Emergency Mode via PATCH query param
        res = await async_client.patch("/api/v1/owner/cafe/emergency-mode?isEmergencyMode=true", headers=headers)
        assert res.status_code == 200
        assert res.json()["data"]["isEmergencyMode"] is True

        # Verify DB updated
        await db.refresh(cafe)
        assert cafe.is_emergency_mode is True

        # 2. Disable Emergency Mode via PATCH JSON body
        res_off = await async_client.patch("/api/v1/owner/cafe/emergency-mode", json={"isEmergencyMode": False}, headers=headers)
        assert res_off.status_code == 200
        assert res_off.json()["data"]["isEmergencyMode"] is False

        await db.refresh(cafe)
        assert cafe.is_emergency_mode is False

@pytest.mark.asyncio
async def test_toggle_bookings_paused_and_aliases(async_client: AsyncClient):
    """Verify owner can pause/resume online bookings via PATCH and POST aliases."""
    async with AsyncSessionLocal() as db:
        owner_id = uuid.uuid4()
        owner = User(
            id=owner_id,
            email=f"pause_owner_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Pause Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)

        db.add(UserRoleMapping(
            id=uuid.uuid4(),
            user_id=owner_id,
            role=UserRole.CAFE_OWNER
        ))

        cafe = Cafe(
            id=uuid.uuid4(),
            owner_id=owner_id,
            name="Pause Arena",
            address_line1="789 Pause St",
            city="Delhi",
            state="Delhi",
            pincode="110001",
            phone_number="+919876543212",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
            bookings_paused=False
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role="cafe_owner")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Pause bookings using alias POST /api/v1/owner/cafe/pause-bookings
        pause_res = await async_client.post("/api/v1/owner/cafe/pause-bookings", headers=headers)
        assert pause_res.status_code == 200
        assert pause_res.json()["data"]["bookingsPaused"] is True

        await db.refresh(cafe)
        assert cafe.bookings_paused is True

        # 2. Resume bookings using alias POST /api/v1/owner/cafe/resume-bookings
        resume_res = await async_client.post("/api/v1/owner/cafe/resume-bookings", headers=headers)
        assert resume_res.status_code == 200
        assert resume_res.json()["data"]["bookingsPaused"] is False

        await db.refresh(cafe)
        assert cafe.bookings_paused is False

        # 3. Toggle via PATCH
        patch_res = await async_client.patch("/api/v1/owner/cafe/bookings-pause", json={"bookingsPaused": True}, headers=headers)
        assert patch_res.status_code == 200
        assert patch_res.json()["data"]["bookingsPaused"] is True

@pytest.mark.asyncio
async def test_gamer_cannot_toggle_settings(async_client: AsyncClient):
    """Verify gamer role cannot access owner settings or toggle controls."""
    async with AsyncSessionLocal() as db:
        gamer_id = uuid.uuid4()
        gamer = User(
            id=gamer_id,
            email=f"settings_gamer_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Settings Gamer",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)

        db.add(UserRoleMapping(
            id=uuid.uuid4(),
            user_id=gamer_id,
            role=UserRole.GAMER
        ))
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role="gamer")
        headers = {"Authorization": f"Bearer {token}"}

        res_get = await async_client.get("/api/v1/owner/settings", headers=headers)
        assert res_get.status_code == 403

        res_toggle = await async_client.patch("/api/v1/owner/cafe/emergency-mode?isEmergencyMode=true", headers=headers)
        assert res_toggle.status_code == 403
