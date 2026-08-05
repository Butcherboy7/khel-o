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

@pytest.mark.asyncio
async def test_reverse_dual_write_sync(async_client: AsyncClient):
    """Verify that update_role writes to user_roles join table and updates legacy user.role scalar field."""
    from app.repositories.user_repository import UserRepository
    async with AsyncSessionLocal() as db:
        user = User(
            id=uuid.uuid4(),
            email=f"dual_write_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Dual Write User",
            role=UserRole.GAMER,
            is_active=True
        )
        user_repo = UserRepository(db)
        created_user = await user_repo.create(user)

        # 1. Verify user_roles has default gamer mapping
        from sqlalchemy import select
        res_gamer = await db.execute(
            select(UserRoleMapping).where(UserRoleMapping.user_id == created_user.id, UserRoleMapping.role == UserRole.GAMER)
        )
        assert res_gamer.scalars().first() is not None

        # 2. Trigger update_role to staff
        cafe_id = uuid.uuid4()
        updated_user = await user_repo.update_role(created_user.id, UserRole.STAFF, cafe_id=cafe_id)
        assert updated_user.role == UserRole.STAFF

        # 3. Verify user_roles join table reflects staff role mapping
        res_staff = await db.execute(
            select(UserRoleMapping).where(UserRoleMapping.user_id == created_user.id, UserRoleMapping.role == UserRole.STAFF)
        )
        mapping = res_staff.scalars().first()
        assert mapping is not None
        assert mapping.cafe_id == cafe_id

@pytest.mark.asyncio
async def test_update_role_idempotency(async_client: AsyncClient):
    """Verify that calling update_role twice with identical params does not create duplicate user_roles rows."""
    from app.repositories.user_repository import UserRepository
    from sqlalchemy import select, func
    async with AsyncSessionLocal() as db:
        user = User(
            id=uuid.uuid4(),
            email=f"idempotent_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Idempotency Test User",
            role=UserRole.GAMER,
            is_active=True
        )
        user_repo = UserRepository(db)
        created_user = await user_repo.create(user)

        cafe_id = uuid.uuid4()
        # Call update_role first time
        await user_repo.update_role(created_user.id, UserRole.CAFE_OWNER, cafe_id=cafe_id)
        
        stmt_count = select(func.count(UserRoleMapping.id)).where(
            UserRoleMapping.user_id == created_user.id,
            UserRoleMapping.role == UserRole.CAFE_OWNER,
            UserRoleMapping.cafe_id == cafe_id
        )
        count1 = (await db.execute(stmt_count)).scalar() or 0
        assert count1 == 1

        # Call update_role second time (duplicate call)
        await user_repo.update_role(created_user.id, UserRole.CAFE_OWNER, cafe_id=cafe_id)
        count2 = (await db.execute(stmt_count)).scalar() or 0
        assert count2 == 1  # Row count must remain 1


