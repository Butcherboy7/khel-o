import pytest
import uuid
from datetime import datetime, timedelta, timezone
from jose import jwt
from app.config import settings
from app.models.user import User, UserRole
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
