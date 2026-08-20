"""
Regression lock for the server-side authorization boundary.

These tests encode behavior the backend is believed to already have correctly:
- Admin-only routes reject non-admin roles (owner, gamer) even with a valid JWT.
- A forged JWT 'role' claim (admin) is ignored because authorization reads the
  DB-backed user_roles table, never the JWT body.
- switch-role rejects a target role the user was not actually granted.
- A café owner cannot manage another owner's café.

If any of these fail, that is a live authorization regression / vulnerability,
not a test bug. Do not weaken the assertions to make them pass.
"""
import uuid

import pytest

from app.models.cafe import Cafe, VerificationStatus
from app.models.user import UserRole
from tests.conftest import create_test_user, auth_headers

ADMIN_ROUTES = [
    ("get", "/api/v1/admin/analytics"),
    ("get", "/api/v1/admin/cafes/pending"),
    ("get", "/api/v1/admin/users"),
    ("get", "/api/v1/admin/audit-log"),
]


async def _make_owner(db_session):
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await db_session.commit()
    return owner


async def _make_gamer(db_session):
    gamer = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()
    return gamer


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
async def test_owner_cannot_reach_admin_routes(async_client, db_session, method, path):
    owner = await _make_owner(db_session)
    headers = auth_headers(owner)
    res = await getattr(async_client, method)(path, headers=headers)
    assert res.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
async def test_gamer_cannot_reach_admin_routes(async_client, db_session, method, path):
    gamer = await _make_gamer(db_session)
    headers = auth_headers(gamer)
    res = await getattr(async_client, method)(path, headers=headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_owner_cannot_switch_to_admin(async_client, db_session):
    owner = await _make_owner(db_session)
    headers = auth_headers(owner)
    res = await async_client.post(
        "/api/v1/auth/switch-role",
        json={"targetRole": "admin"},
        headers=headers,
    )
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "ROLE_NOT_GRANTED"


@pytest.mark.asyncio
async def test_forged_jwt_role_claim_is_ignored(async_client, db_session):
    """A JWT whose 'role' claim says admin, minted for a user with NO admin
    UserRoleMapping row in the DB, must still be denied. This proves
    authorization reads user_roles from the DB, never the JWT body.

    If this fails: STOP. This is a live vulnerability, not a test bug.
    """
    owner = await _make_owner(db_session)
    forged_headers = auth_headers(owner, is_admin=True)
    res = await async_client.get("/api/v1/admin/analytics", headers=forged_headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_owner_cannot_manage_another_owners_cafe(async_client, db_session):
    owner = await _make_owner(db_session)

    other_owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await db_session.commit()

    other_cafe = Cafe(
        id=uuid.uuid4(),
        owner_id=other_owner.id,
        name="Someone Else's Arena",
        address_line1="1 Other St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number=f"+9190000{uuid.uuid4().hex[:5]}",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
    )
    db_session.add(other_cafe)
    await db_session.commit()

    headers = auth_headers(owner)
    res = await async_client.patch(
        f"/api/v1/owner/cafes/{other_cafe.id}/details",
        json={"name": "hijacked"},
        headers=headers,
    )
    assert res.status_code == 403
