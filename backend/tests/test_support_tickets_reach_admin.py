"""A ticket raised by a gamer or a café owner reaches the admin: stored, listed,
counted for the sidebar badge, and emailed to the support inbox."""
from unittest.mock import AsyncMock, patch

import pytest

from app.models.user import UserRole
from tests.conftest import create_test_user, auth_headers

BODY = {"subject": "Refund not received", "description": "Paid twice for one booking, please check.", "category": "payment"}


@pytest.fixture
def _email():
    with patch("app.api.v1.support.NotificationService.send_support_ticket", new=AsyncMock(return_value=True)) as m:
        yield m


async def test_requires_sign_in(async_client):
    r = await async_client.post("/api/v1/support/tickets", json=BODY)
    assert r.status_code in (401, 403)


@pytest.mark.parametrize("role", [UserRole.GAMER, UserRole.CAFE_OWNER])
async def test_ticket_reaches_admin(db_session, async_client, _email, role):
    user = await create_test_user(db_session, role=role)
    admin = await create_test_user(db_session, role=UserRole.ADMIN)
    await db_session.commit()

    r = await async_client.post("/api/v1/support/tickets", headers=auth_headers(user), json=BODY)
    assert r.status_code == 201, r.text
    _email.assert_awaited_once()

    ah = auth_headers(admin, is_admin=True)
    r = await async_client.get("/api/v1/admin/support/open-count", headers=ah)
    assert r.status_code == 200, r.text
    assert r.json()["data"]["count"] >= 1

    r = await async_client.get("/api/v1/admin/support/tickets", headers=ah)
    assert r.status_code == 200, r.text
    assert "Refund not received" in r.text


async def test_email_failure_does_not_lose_ticket(db_session, async_client):
    user = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()
    with patch("app.api.v1.support.NotificationService.send_support_ticket", new=AsyncMock(side_effect=RuntimeError("boom"))):
        r = await async_client.post("/api/v1/support/tickets", headers=auth_headers(user), json=BODY)
    assert r.status_code == 201, r.text


async def test_open_count_is_admin_only(db_session, async_client):
    user = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()
    r = await async_client.get("/api/v1/admin/support/open-count", headers=auth_headers(user))
    assert r.status_code in (401, 403)
