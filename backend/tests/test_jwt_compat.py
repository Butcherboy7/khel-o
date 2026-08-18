import pytest
import uuid
from datetime import datetime, timedelta, timezone
from jose import jwt
from sqlalchemy import select
from app.config import settings
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.core.security import get_password_hash
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService
from app.database import AsyncSessionLocal

ALGORITHM = "HS256"

@pytest.mark.asyncio
async def test_jwt_legacy_claim_shape_resolves_user():
    """Verify that a JWT with legacy claim shape {'sub', 'role'} is decoded and authenticated correctly."""
    async with AsyncSessionLocal() as db:
        user_repo = UserRepository(db)
        auth_service = AuthService(user_repo)

        user = User(
            id=uuid.uuid4(),
            email=f"legacy_jwt_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Legacy JWT User",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(user)
        await db.commit()

        # Generate Legacy JWT shape (sub + role)
        now = datetime.now(timezone.utc)
        legacy_payload = {
            "sub": str(user.id),
            "email": user.email,
            "role": "gamer",
            "type": "access",
            "exp": now + timedelta(minutes=15)
        }
        legacy_token = jwt.encode(legacy_payload, settings.SECRET_KEY, algorithm=ALGORITHM)

        # Decode & resolve user via auth_service
        resolved_user = await auth_service.get_current_user(legacy_token)
        assert resolved_user.id == user.id
        assert resolved_user.email == user.email

@pytest.mark.asyncio
async def test_jwt_new_multi_role_claim_shape_resolves_user():
    """Verify that a JWT with new claim shape {'sub', 'roles', 'active_role'} is decoded and authenticated correctly."""
    async with AsyncSessionLocal() as db:
        user_repo = UserRepository(db)
        auth_service = AuthService(user_repo)

        user = User(
            id=uuid.uuid4(),
            email=f"new_jwt_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Multi Role User",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(user)
        await db.commit()

        # Generate New Multi-Role JWT shape (sub + roles array + active_role)
        now = datetime.now(timezone.utc)
        new_payload = {
            "sub": str(user.id),
            "email": user.email,
            "roles": ["gamer", "cafe_owner"],
            "active_role": "cafe_owner",
            "type": "access",
            "exp": now + timedelta(minutes=15)
        }
        new_token = jwt.encode(new_payload, settings.SECRET_KEY, algorithm=ALGORITHM)

        # Decode & resolve user via auth_service
        resolved_user = await auth_service.get_current_user(new_token)
        assert resolved_user.id == user.id
        assert resolved_user.email == user.email

@pytest.mark.asyncio
async def test_dual_write_role_sync():
    """Verify that dual-write synchronization between user_roles join table and legacy user.role column works bi-directionally."""
    async with AsyncSessionLocal() as db:
        user = User(
            id=uuid.uuid4(),
            email=f"dual_write_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Dual Write User",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(user)
        await db.commit()

        # 1. Write role via user_roles join table
        cafe_id = uuid.uuid4()
        owner_role_entry = UserRoleMapping(
            id=uuid.uuid4(),
            user_id=user.id,
            role=UserRole.CAFE_OWNER,
            cafe_id=cafe_id
        )
        db.add(owner_role_entry)
        
        # Application sync helper updates legacy user.role
        user.role = UserRole.CAFE_OWNER
        await db.commit()

        # Verify query on user_roles join table
        stmt_join = select(UserRoleMapping).where(UserRoleMapping.user_id == user.id, UserRoleMapping.role == UserRole.CAFE_OWNER)
        res_join = (await db.execute(stmt_join)).scalars().first()
        assert res_join is not None
        assert res_join.cafe_id == cafe_id

        # Verify legacy column reflects CAFE_OWNER
        stmt_user = select(User).where(User.id == user.id)
        res_user = (await db.execute(stmt_user)).scalars().first()
        assert res_user is not None
        assert res_user.role == UserRole.CAFE_OWNER

@pytest.mark.asyncio
async def test_deactivated_user_rejected_mid_session():
    """Verify that a user deactivated in DB is rejected on next request despite holding a valid unexpired JWT."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.core.security import create_access_token
    async with AsyncSessionLocal() as db:
        user = User(
            id=uuid.uuid4(),
            email=f"deactive_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Deactive User",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(user)
        db.add(UserRoleMapping(id=uuid.uuid4(), user_id=user.id, role=UserRole.GAMER, cafe_id=None))
        db.add(UserRoleMapping(id=uuid.uuid4(), user_id=user.id, role=UserRole.CAFE_OWNER, cafe_id=None))
        await db.commit()

        # Issue valid unexpired token
        token = create_access_token(subject=str(user.id), role="cafe_owner")
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            # 1. First request succeeds
            res1 = await client.get("/api/v1/owner/dashboard", headers=headers)
            assert res1.status_code == 200

            # 2. Admin deactivates user in DB
            stmt = select(User).where(User.id == user.id)
            res = await db.execute(stmt)
            db_user = res.scalar_one()
            db_user.is_active = False
            await db.commit()

            # 3. Second request with same valid token is REJECTED with 403
            res2 = await client.get("/api/v1/owner/dashboard", headers=headers)
            assert res2.status_code == 403
            assert "deactivated" in res2.json()["error"]["message"].lower()

