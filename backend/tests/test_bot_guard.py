"""Bot guard on sign-up / login / forgot-password: speed ticket, trap field, limits."""
import time
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core import bot_guard
from app.database import AsyncSessionLocal
from app.main import app
from app.models.auth_attempt import AuthAttempt
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User


def _client(ip: str) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers={"X-Forwarded-For": ip})


def _ip() -> str:
    return f"10.{uuid4().int % 250}.{uuid4().int % 250}.{uuid4().int % 250}"


def _signup(email: str, **extra) -> dict:
    return {"email": email, "password": "goodpassword1", "fullName": "Asha Reddy", **extra}


def _old_ticket(seconds: int = 30) -> str:
    return bot_guard.issue_form_ticket(now=time.time() - seconds)


def test_ticket_ages_and_rejects_forgeries():
    t = bot_guard.issue_form_ticket(now=1000)
    assert bot_guard.ticket_age(t, now=1007) == 7
    ts, nonce, sig = t.split(".")
    assert bot_guard.ticket_age(f"{int(ts) - 60}.{nonce}.{sig}", now=1007) is None  # backdated
    assert bot_guard.ticket_age(None) is None and bot_guard.ticket_age("abc") is None


def test_bot_reason_rules(strict_bot_guard):
    now = 10_000
    fresh = bot_guard.issue_form_ticket(now=now - 1)
    old = bot_guard.issue_form_ticket(now=now - 20)
    assert bot_guard.bot_reason("register", old, "http://spam", now) == "trap"
    assert bot_guard.bot_reason("register", None, None, now) == "no_ticket"
    assert bot_guard.bot_reason("register", fresh, None, now) == "too_fast"
    assert bot_guard.bot_reason("register", old, "", now) is None
    # Login: password managers submit instantly and old tabs have no ticket.
    assert bot_guard.bot_reason("login", None, None, now) is None
    assert bot_guard.bot_reason("login", fresh, None, now) is None
    assert bot_guard.bot_reason("login", None, "x", now) == "trap"


@pytest.mark.asyncio
async def test_form_ticket_endpoint_and_human_signup_passes(strict_bot_guard):
    async with _client(_ip()) as c:
        r = await c.get("/api/v1/auth/form-ticket")
        assert r.status_code == 200
        assert bot_guard.ticket_age(r.json()["data"]["ticket"]) is not None
        email = f"human_{uuid4().hex[:8]}@test.com"
        r = await c.post("/api/v1/auth/register", json=_signup(email, formTicket=_old_ticket()))
        assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_instant_or_trapped_signups_create_no_account(strict_bot_guard):
    async with _client(_ip()) as c:
        too_fast = f"bot_{uuid4().hex[:8]}@test.com"
        r = await c.post("/api/v1/auth/register", json=_signup(too_fast, formTicket=bot_guard.issue_form_ticket()))
        assert r.status_code == 400 and r.json()["error"]["code"] == "TRY_AGAIN"
        trapped = f"bot_{uuid4().hex[:8]}@test.com"
        r = await c.post("/api/v1/auth/register", json=_signup(trapped, formTicket=_old_ticket(), website="http://x"))
        assert r.status_code == 400
        no_ticket = f"bot_{uuid4().hex[:8]}@test.com"
        r = await c.post("/api/v1/auth/register", json=_signup(no_ticket))
        assert r.status_code == 400
    async with AsyncSessionLocal() as db:
        made = (await db.execute(select(User).where(User.email.in_([too_fast, trapped, no_ticket])))).scalars().all()
        assert made == []
        reasons = (await db.execute(
            select(AuthAttempt.reason).where(AuthAttempt.kind == "register", AuthAttempt.outcome == "blocked")
        )).scalars().all()
        assert {"too_fast", "trap", "no_ticket"} <= set(reasons)


@pytest.mark.asyncio
async def test_signups_per_ip_are_limited(strict_bot_guard):
    ip = _ip()
    async with _client(ip) as c:
        codes = []
        for _ in range(6):
            r = await c.post("/api/v1/auth/register", json=_signup(f"burst_{uuid4().hex[:8]}@test.com", formTicket=_old_ticket()))
            codes.append(r.status_code)
    assert codes[:5] == [201] * 5 and codes[5] == 429


@pytest.mark.asyncio
async def test_bot_reset_request_looks_normal_but_sends_nothing(strict_bot_guard, db_session):
    from tests.test_password_reset import _make_user

    user = await _make_user(db_session)
    async with _client(_ip()) as c:
        r = await c.post("/api/v1/auth/forgot-password", json={"email": user.email, "formTicket": bot_guard.issue_form_ticket()})
        assert r.status_code == 200  # same answer a real request gets
    async with AsyncSessionLocal() as db:
        assert (await db.execute(select(PasswordResetToken).where(PasswordResetToken.user_id == user.id))).first() is None


@pytest.mark.asyncio
async def test_reset_emails_per_address_are_limited(strict_bot_guard, db_session):
    from tests.test_password_reset import _make_user

    user = await _make_user(db_session)
    for _ in range(4):  # a fresh IP each time: the per-address limit still holds
        async with _client(_ip()) as c:
            r = await c.post("/api/v1/auth/forgot-password", json={"email": user.email, "formTicket": _old_ticket()})
    assert r.status_code == 429


@pytest.mark.asyncio
async def test_login_password_guessing_is_limited(strict_bot_guard):
    ip = _ip()
    async with _client(ip) as c:
        email = f"guess_{uuid4().hex[:8]}@test.com"
        await c.post("/api/v1/auth/register", json=_signup(email, formTicket=_old_ticket()))
        codes = [
            (await c.post("/api/v1/auth/login", json={"email": email, "password": "wrongpass1"})).status_code
            for _ in range(11)
        ]
    assert codes[:10] == [401] * 10 and codes[10] == 429


@pytest.mark.asyncio
async def test_admin_sees_bots_stopped(strict_bot_guard, db_session):
    from tests.conftest import auth_headers, create_test_user
    from app.models.user import UserRole

    async with _client(_ip()) as c:
        await c.post("/api/v1/auth/register", json=_signup(f"bot_{uuid4().hex[:8]}@test.com", website="spam"))
    admin = await create_test_user(db_session, role=UserRole.ADMIN)
    await db_session.commit()
    async with _client(_ip()) as c:
        r = await c.get("/api/v1/admin/analytics/bot-blocks", headers=auth_headers(admin, is_admin=True))
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["blocked"] >= 1 and d["byReason"].get("trap", 0) >= 1 and d["byKind"].get("register", 0) >= 1
