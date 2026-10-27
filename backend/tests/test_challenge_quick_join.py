"""One-step sign-up: name, WhatsApp number and email make the account and the
spot together. An email that already has an account is refused, and a login
made this way stops working once the real owner of that email claims it."""
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.models.challenge import ChallengeEntry
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.services.auth_service import AuthService
from tests.conftest import TestAsyncSessionLocal, create_test_user
from tests.test_challenges import _challenge, _join, _phone, _player


def _body(**over):
    body = {
        "name": "Ravi Teja",
        "phone": _phone(),
        "email": f"ravi-{uuid.uuid4().hex[:8]}@example.com",
        "consentRules": True,
        "consentFilming": False,
        "consentUpdates": False,
    }
    body.update(over)
    return body


def _url(ch):
    return f"/api/v1/challenges/{ch['slug']}/quick-join"


async def _users_with(email: str) -> int:
    async with TestAsyncSessionLocal() as db:
        return (await db.execute(select(func.count()).select_from(User).where(User.email == email))).scalar_one()


@pytest.mark.asyncio
async def test_quick_join_makes_the_account_and_the_spot_and_signs_them_in(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session, capacity=3)
    body = _body()
    res = await async_client.post(_url(ch), json=body)
    assert res.status_code == 201, res.text
    data = res.json()["data"]
    assert data["created"] is True
    assert data["entry"]["status"] == "confirmed" and data["entry"]["rank"] == 1
    assert data["user"]["email"] == body["email"]
    assert data["accessToken"] and data["refreshToken"]
    # The tokens work: it's their own page.
    me = await async_client.get(
        f"/api/v1/challenges/{ch['slug']}/me", headers={"Authorization": f"Bearer {data['accessToken']}"}
    )
    assert me.status_code == 200 and me.json()["data"]["entry"]["status"] == "confirmed"
    # No password and no Google link: it can be claimed later.
    async with TestAsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == body["email"]))).scalar_one()
        assert user.password_hash is None and user.google_id is None
    # Phones never reach the public page.
    public = (await async_client.get(f"/api/v1/challenges/{ch['slug']}")).text
    assert body["phone"] not in public and body["email"] not in public


@pytest.mark.asyncio
async def test_quick_join_never_merges_into_an_existing_account(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session)
    existing = await create_test_user(db_session, email="already@example.com", full_name="Already Here")
    await db_session.commit()
    res = await async_client.post(_url(ch), json=_body(email="Already@Example.com"))
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "EMAIL_ALREADY_EXISTS"
    assert await _users_with("already@example.com") == 1
    async with TestAsyncSessionLocal() as db:
        entries = (await db.execute(select(func.count()).select_from(ChallengeEntry).where(ChallengeEntry.user_id == existing.id))).scalar_one()
    assert entries == 0


@pytest.mark.asyncio
async def test_a_number_already_signed_up_leaves_no_account_behind(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session)
    first = await _player(db_session, "First")
    phone = _phone()
    assert (await _join(async_client, ch["slug"], first, phone=phone)).status_code == 201
    email = f"second-{uuid.uuid4().hex[:6]}@example.com"
    res = await async_client.post(_url(ch), json=_body(phone=phone, email=email))
    assert res.status_code == 409 and res.json()["error"]["code"] == "PHONE_ALREADY_SIGNED_UP"
    assert await _users_with(email) == 0


@pytest.mark.asyncio
async def test_quick_join_needs_the_rules_and_an_open_challenge(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session)
    res = await async_client.post(_url(ch), json=_body(consentRules=False))
    assert res.status_code == 400 and res.json()["error"]["code"] == "RULES_REQUIRED"
    bad = await async_client.post(_url(ch), json=_body(email="not-an-email"))
    assert bad.status_code == 422
    short = await async_client.post(_url(ch), json=_body(phone="12345"))
    assert short.status_code == 422
    closed, _ = await _challenge(async_client, db_session, status="closed")
    assert (await async_client.post(_url(closed), json=_body())).status_code in (400, 404)


@pytest.mark.asyncio
async def test_the_waitlist_applies_to_quick_sign_ups_too(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session, capacity=1)
    first = await async_client.post(_url(ch), json=_body())
    second = await async_client.post(_url(ch), json=_body())
    assert first.json()["data"]["entry"]["status"] == "confirmed"
    assert second.json()["data"]["entry"]["status"] == "waitlist"


@pytest.mark.asyncio
async def test_google_sign_in_claims_the_account_and_kills_the_earlier_login(async_client, db_session, monkeypatch):
    ch, _ = await _challenge(async_client, db_session)
    body = _body()
    joined = (await async_client.post(_url(ch), json=body)).json()["data"]
    old_headers = {"Authorization": f"Bearer {joined['accessToken']}"}
    assert (await async_client.get("/api/v1/auth/me", headers=old_headers)).status_code == 200

    async def fake_verify(self, id_token):
        return {"sub": "g-owner-1", "email": body["email"], "name": "Real Owner", "aud": "test"}

    monkeypatch.setattr(AuthService, "verify_google_id_token", fake_verify)
    # Tokens carry whole-second issue times; make sure the claim lands after them.
    import asyncio
    await asyncio.sleep(1.1)
    claimed = await async_client.post("/api/v1/auth/google", json={"idToken": "x"})
    assert claimed.status_code == 200, claimed.text
    new_headers = {"Authorization": f"Bearer {claimed.json()['data']['accessToken']}"}

    assert (await async_client.get("/api/v1/auth/me", headers=old_headers)).status_code == 401
    assert (await async_client.get("/api/v1/auth/me", headers=new_headers)).status_code == 200
    # The earlier refresh token is refused too.
    refreshed = await async_client.post("/api/v1/auth/refresh", json={"refreshToken": joined["refreshToken"]})
    assert refreshed.status_code == 401


@pytest.mark.asyncio
async def test_setting_a_first_password_kills_the_earlier_login(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session)
    body = _body()
    joined = (await async_client.post(_url(ch), json=body)).json()["data"]
    old_headers = {"Authorization": f"Bearer {joined['accessToken']}"}
    async with TestAsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == body["email"]))).scalar_one()
        token = secrets.token_urlsafe(24)
        db.add(PasswordResetToken(user_id=user.id, token=token, expires_at=datetime.now(timezone.utc) + timedelta(minutes=30)))
        await db.commit()
    import asyncio
    await asyncio.sleep(1.1)
    done = await async_client.post("/api/v1/auth/reset-password", json={"token": token, "newPassword": "BrandNew123"})
    assert done.status_code == 200, done.text
    assert (await async_client.get("/api/v1/auth/me", headers=old_headers)).status_code == 401
    login = await async_client.post("/api/v1/auth/login", json={"email": body["email"], "password": "BrandNew123"})
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_ordinary_accounts_are_not_logged_out_by_linking_google(async_client, db_session, monkeypatch):
    """Only an unclaimed account (no password, no Google link) is cut off. A normal
    password account that links Google keeps its other sessions."""
    user = await create_test_user(db_session, email="normal@example.com", password="rightpass1")
    await db_session.commit()
    tokens = AuthService(None).create_tokens(user)
    headers = {"Authorization": f"Bearer {tokens[0]}"}

    async def fake_verify(self, id_token):
        return {"sub": "g-normal", "email": "normal@example.com", "name": "Normal", "aud": "test"}

    monkeypatch.setattr(AuthService, "verify_google_id_token", fake_verify)
    import asyncio
    await asyncio.sleep(1.1)
    assert (await async_client.post("/api/v1/auth/google", json={"idToken": "x"})).status_code == 200
    assert (await async_client.get("/api/v1/auth/me", headers=headers)).status_code == 200
