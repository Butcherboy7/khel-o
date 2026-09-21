import uuid
from unittest.mock import patch
import pytest
from sqlalchemy import select

from app.models.push_subscription import PushSubscription
from app.models.user import UserRole
from tests.conftest import create_test_user, auth_headers

_SUB_BODY = {
    "endpoint": "https://fcm.googleapis.com/fcm/send/AAA",
    "keys": {"p256dh": "p256dh-value", "auth": "auth-value"},
}


async def _owner(db_session):
    """Must commit: the API runs on its own session via the get_db override, so
    an uncommitted user simply does not exist as far as the request is
    concerned and every call 401s."""
    user = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_vapid_key_returns_public_key(async_client, db_session):
    user = await _owner(db_session)
    with patch("app.api.v1.notifications.settings.VAPID_PUBLIC_KEY", "pub-key-123"):
        r = await async_client.get(
            "/api/v1/notifications/push/vapid-key", headers=auth_headers(user))
    assert r.status_code == 200
    assert r.json()["publicKey"] == "pub-key-123"


@pytest.mark.asyncio
async def test_vapid_key_503_when_unconfigured(async_client, db_session):
    """A 200 with an empty key would make the browser throw an opaque
    InvalidAccessError. 503 tells the UI to hide the enable button instead."""
    user = await _owner(db_session)
    with patch("app.api.v1.notifications.settings.VAPID_PUBLIC_KEY", ""):
        r = await async_client.get(
            "/api/v1/notifications/push/vapid-key", headers=auth_headers(user))
    assert r.status_code == 503


@pytest.mark.asyncio
async def test_subscribe_creates_row(async_client, db_session):
    user = await _owner(db_session)
    r = await async_client.post(
        "/api/v1/notifications/push/subscribe", json=_SUB_BODY, headers=auth_headers(user))
    assert r.status_code == 200
    rows = (await db_session.execute(select(PushSubscription))).scalars().all()
    assert len(rows) == 1
    assert rows[0].user_id == user.id


@pytest.mark.asyncio
async def test_subscribe_twice_upserts(async_client, db_session):
    """Browsers resubscribe against the same endpoint after a key rotation. A
    second row would double every future push to that device."""
    user = await _owner(db_session)
    for _ in range(2):
        r = await async_client.post(
            "/api/v1/notifications/push/subscribe", json=_SUB_BODY, headers=auth_headers(user))
        assert r.status_code == 200
    rows = (await db_session.execute(select(PushSubscription))).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_subscribe_requires_auth(async_client):
    r = await async_client.post("/api/v1/notifications/push/subscribe", json=_SUB_BODY)
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_unsubscribe_deletes_own_row(async_client, db_session):
    user = await _owner(db_session)
    await async_client.post(
        "/api/v1/notifications/push/subscribe", json=_SUB_BODY, headers=auth_headers(user))
    r = await async_client.request(
        "DELETE", "/api/v1/notifications/push/unsubscribe",
        json={"endpoint": _SUB_BODY["endpoint"]}, headers=auth_headers(user))
    assert r.status_code == 200
    rows = (await db_session.execute(select(PushSubscription))).scalars().all()
    assert rows == []


@pytest.mark.asyncio
async def test_cannot_unsubscribe_another_users_endpoint(async_client, db_session):
    """Endpoints are long but not secret. Without the ownership filter, knowing
    one would let anyone silence another café's alerts."""
    owner = await _owner(db_session)
    attacker = await _owner(db_session)
    await async_client.post(
        "/api/v1/notifications/push/subscribe", json=_SUB_BODY, headers=auth_headers(owner))
    r = await async_client.request(
        "DELETE", "/api/v1/notifications/push/unsubscribe",
        json={"endpoint": _SUB_BODY["endpoint"]}, headers=auth_headers(attacker))
    assert r.status_code == 404
    rows = (await db_session.execute(select(PushSubscription))).scalars().all()
    assert len(rows) == 1
