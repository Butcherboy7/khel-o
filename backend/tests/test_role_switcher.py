import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.user_role import UserRoleMapping
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal
import uuid

@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

@pytest.mark.asyncio
async def test_verified_owner_can_switch_roles(async_client: AsyncClient):
    """Verify that a user with a verified cafe can seamlessly switch active role between gamer and cafe_owner."""
    async with AsyncSessionLocal() as db:
        user = User(
            id=uuid.uuid4(),
            email=f"verified_switcher_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Verified Switcher",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(user)
        await db.flush()

        cafe = Cafe(
            id=uuid.uuid4(),
            owner_id=user.id,
            name="Switcher Arena",
            address_line1="Road 1",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919876543210",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True
        )
        db.add(cafe)
        
        # Add role mapping entries
        db.add(UserRoleMapping(id=uuid.uuid4(), user_id=user.id, role=UserRole.GAMER, cafe_id=None))
        db.add(UserRoleMapping(id=uuid.uuid4(), user_id=user.id, role=UserRole.CAFE_OWNER, cafe_id=cafe.id))
        await db.commit()

        token = create_access_token(subject=str(user.id), role="cafe_owner")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Switch to Gamer Mode
        resp_gamer = await async_client.post("/api/v1/auth/switch-role", json={"targetRole": "gamer"}, headers=headers)
        assert resp_gamer.status_code == 200
        data_gamer = resp_gamer.json()["data"]
        assert data_gamer["activeRole"] == "gamer"

        # 2. Switch back to Owner Mode
        resp_owner = await async_client.post("/api/v1/auth/switch-role", json={"targetRole": "cafe_owner"}, headers=headers)
        assert resp_owner.status_code == 200
        data_owner = resp_owner.json()["data"]
        assert data_owner["activeRole"] == "cafe_owner"

@pytest.mark.asyncio
async def test_unverified_gamer_cannot_switch_to_owner(async_client: AsyncClient):
    """Verify that a gamer without a verified cafe is blocked from switching to cafe_owner role."""
    async with AsyncSessionLocal() as db:
        user = User(
            id=uuid.uuid4(),
            email=f"gamer_switcher_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Pure Gamer",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(user)
        db.add(UserRoleMapping(id=uuid.uuid4(), user_id=user.id, role=UserRole.GAMER, cafe_id=None))
        await db.commit()

        token = create_access_token(subject=str(user.id), role="gamer")
        headers = {"Authorization": f"Bearer {token}"}

        resp = await async_client.post("/api/v1/auth/switch-role", json={"targetRole": "cafe_owner"}, headers=headers)
        assert resp.status_code == 403
