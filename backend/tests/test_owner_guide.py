import pytest
from uuid import uuid4

from app.models.user import User, UserRole
from app.core.security import get_password_hash
from tests.conftest import auth_headers

URL = "/api/v1/owner/guide"


async def _user(db_session, role):
    u = User(
        id=uuid4(), email=f"{role.value}_{uuid4().hex[:8]}@test.com", full_name="T",
        password_hash=get_password_hash("testpass123"), role=role, is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest.mark.asyncio
async def test_new_owner_starts_with_empty_guide_state(async_client, db_session):
    owner = await _user(db_session, UserRole.CAFE_OWNER)
    resp = await async_client.get(URL, headers=auth_headers(owner))
    assert resp.status_code == 200
    assert resp.json()["data"] == {"sessions": 0, "pages": {}}


@pytest.mark.asyncio
async def test_events_increment_counters_and_dismiss_sticks(async_client, db_session):
    owner = await _user(db_session, UserRole.CAFE_OWNER)
    h = auth_headers(owner)
    for body in (
        {"type": "session_start"},
        {"type": "session_start"},
        {"type": "page_view", "page": "bookings"},
        {"type": "page_view", "page": "bookings"},
        {"type": "page_view", "page": "payouts"},
        {"type": "dismiss", "page": "payouts"},
    ):
        resp = await async_client.post(f"{URL}/events", json=body, headers=h)
        assert resp.status_code == 200, resp.text

    data = (await async_client.get(URL, headers=h)).json()["data"]
    assert data["sessions"] == 2
    assert data["pages"]["bookings"] == {"views": 2, "dismissed": False}
    assert data["pages"]["payouts"] == {"views": 1, "dismissed": True}


@pytest.mark.asyncio
async def test_rejects_unknown_page_and_missing_page(async_client, db_session):
    owner = await _user(db_session, UserRole.CAFE_OWNER)
    h = auth_headers(owner)
    assert (await async_client.post(f"{URL}/events", json={"type": "page_view", "page": "nope"}, headers=h)).status_code == 422
    assert (await async_client.post(f"{URL}/events", json={"type": "dismiss"}, headers=h)).status_code == 422


@pytest.mark.asyncio
async def test_guide_is_per_account_and_staff_allowed(async_client, db_session):
    owner = await _user(db_session, UserRole.CAFE_OWNER)
    staff = await _user(db_session, UserRole.STAFF)
    await async_client.post(f"{URL}/events", json={"type": "session_start"}, headers=auth_headers(owner))

    resp = await async_client.get(URL, headers=auth_headers(staff))
    assert resp.status_code == 200
    assert resp.json()["data"]["sessions"] == 0


@pytest.mark.asyncio
async def test_gamer_forbidden(async_client, db_session):
    gamer = await _user(db_session, UserRole.GAMER)
    assert (await async_client.get(URL, headers=auth_headers(gamer))).status_code == 403
