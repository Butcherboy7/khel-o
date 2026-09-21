import pytest

from tests.conftest import create_test_user, auth_headers
from app.models.user import UserRole


@pytest.mark.asyncio
async def test_update_me_persists_city(async_client, db_session):
    user = await create_test_user(db_session)
    await db_session.commit()

    r = await async_client.patch(
        "/api/v1/auth/me", json={"city": "Hyderabad"}, headers=auth_headers(user)
    )
    assert r.status_code == 200
    assert r.json()["data"]["user"]["city"] == "Hyderabad"

    r2 = await async_client.get("/api/v1/auth/me", headers=auth_headers(user))
    assert r2.status_code == 200
    assert r2.json()["data"]["user"]["city"] == "Hyderabad"


@pytest.mark.asyncio
async def test_update_me_keeps_roles_in_response(async_client, db_session):
    user = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await db_session.commit()

    r = await async_client.patch(
        "/api/v1/auth/me", json={"fullName": "Updated Name"}, headers=auth_headers(user)
    )

    assert r.status_code == 200
    body = r.json()["data"]["user"]
    assert "roles" in body
    assert "cafe_owner" in body["roles"]
    assert "pendingInvitations" in body
