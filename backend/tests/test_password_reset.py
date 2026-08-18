"""
Tests for the forgot-password / reset-password flow, shared by customers and owners.
"""
import pytest
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from httpx import AsyncClient

from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.password_reset_token import PasswordResetToken
from app.core.security import get_password_hash, verify_password
from app.database import AsyncSessionLocal
from app.main import app


async def _make_user(db_session, role: UserRole = UserRole.GAMER) -> User:
    user = User(
        id=uuid4(),
        email=f"reset_{uuid4().hex[:8]}@test.com",
        full_name="Reset Test User",
        password_hash=get_password_hash("oldpassword123"),
        role=role,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid4(), user_id=user.id, role=UserRole.GAMER))
    if role != UserRole.GAMER:
        db_session.add(UserRoleMapping(id=uuid4(), user_id=user.id, role=role))
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_forgot_password_creates_token_for_existing_user(db_session):
    """No RESEND_API_KEY is configured in tests, so the email send is a no-op —
    what matters is that a usable token is persisted."""
    user = await _make_user(db_session)

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.post("/api/v1/auth/forgot-password", json={"email": user.email})
        assert res.status_code == 200

    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        result = await db.execute(select(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
        token_row = result.scalars().first()
        assert token_row is not None
        assert token_row.used_at is None
        expires_at = token_row.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        assert expires_at > datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_forgot_password_unknown_email_still_returns_200():
    """Never reveal whether an email is registered."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.post("/api/v1/auth/forgot-password", json={"email": "definitely_not_registered@test.com"})
        assert res.status_code == 200
        assert "message" in res.json()["data"]


@pytest.mark.asyncio
async def test_reset_password_full_cycle_works_for_owner(db_session):
    """Same flow for a cafe_owner account — the endpoint is role-agnostic."""
    owner = await _make_user(db_session, role=UserRole.CAFE_OWNER)

    async with AsyncClient(app=app, base_url="http://test") as client:
        await client.post("/api/v1/auth/forgot-password", json={"email": owner.email})

    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        result = await db.execute(select(PasswordResetToken).where(PasswordResetToken.user_id == owner.id))
        token_row = result.scalars().first()
        token = token_row.token

    async with AsyncClient(app=app, base_url="http://test") as client:
        reset_res = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "newPassword": "brandnewpassword456"},
        )
        assert reset_res.status_code == 200, reset_res.text

        # New password works
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": owner.email, "password": "brandnewpassword456"},
        )
        assert login_res.status_code == 200

        # Old password no longer works
        old_login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": owner.email, "password": "oldpassword123"},
        )
        assert old_login_res.status_code != 200

        # Token cannot be reused
        replay_res = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "newPassword": "anotherpassword789"},
        )
        assert replay_res.status_code != 200


@pytest.mark.asyncio
async def test_reset_password_rejects_expired_token(db_session):
    user = await _make_user(db_session)

    expired_token = PasswordResetToken(
        id=uuid4(),
        user_id=user.id,
        token=uuid4().hex,
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    db_session.add(expired_token)
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": expired_token.token, "newPassword": "somepassword123"},
        )
        assert res.status_code != 200


@pytest.mark.asyncio
async def test_reset_password_rejects_unknown_token():
    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": "not-a-real-token", "newPassword": "somepassword123"},
        )
        assert res.status_code != 200


@pytest.mark.asyncio
async def test_requesting_new_reset_invalidates_previous_token(db_session):
    user = await _make_user(db_session)

    async with AsyncClient(app=app, base_url="http://test") as client:
        await client.post("/api/v1/auth/forgot-password", json={"email": user.email})

    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        result = await db.execute(select(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
        first_token = result.scalars().first()
        first_token_value = first_token.token

    async with AsyncClient(app=app, base_url="http://test") as client:
        await client.post("/api/v1/auth/forgot-password", json={"email": user.email})

        # The first token should no longer work
        res = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": first_token_value, "newPassword": "somepassword123"},
        )
        assert res.status_code != 200
