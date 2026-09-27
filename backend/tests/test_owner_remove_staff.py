"""Removing staff takes away their staff access to that café, keeps their
account as a normal player, and cancels their pending invitations."""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models.staff_invitation import StaffInvitation
from app.models.user import User, UserRole
from tests.conftest import auth_headers, create_test_user
from tests.test_growth_reports import _cafe


async def test_owner_removes_staff_role_but_not_the_account(db_session, async_client):
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    other_owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await db_session.commit()
    cafe, _ = await _cafe(db_session, owner, "Staff Cafe")
    await _cafe(db_session, other_owner, "Other Staff Cafe")
    staff = await create_test_user(db_session, role=UserRole.STAFF, cafe_id=cafe.id)
    staff_id, staff_email, staff_h = staff.id, staff.email, auth_headers(staff)
    owner_h, other_h = auth_headers(owner), auth_headers(other_owner)
    db_session.add(StaffInvitation(
        id=uuid.uuid4(), venue_id=cafe.id, email=staff.email, full_name="Desk", token=uuid.uuid4().hex,
        expires_at=datetime.now(timezone.utc) + timedelta(days=3), status="pending", invited_by=owner.id,
    ))
    await db_session.commit()

    assert (await async_client.get("/api/v1/owner/occupancy", headers=staff_h)).status_code != 403
    listed = (await async_client.get("/api/v1/owner/staff", headers=owner_h)).json()["data"]["staff"]
    assert any(s["id"] == str(staff_id) for s in listed)

    # Another café's owner can't remove them.
    assert (await async_client.delete(f"/api/v1/owner/staff/{staff_id}", headers=other_h)).status_code == 404

    r = await async_client.delete(f"/api/v1/owner/staff/{staff_id}", headers=owner_h)
    assert r.status_code == 200, r.text

    # Access is gone immediately, the account lives on as a player.
    assert (await async_client.get("/api/v1/owner/occupancy", headers=staff_h)).status_code == 403
    db_session.expire_all()
    user = await db_session.get(User, staff_id)
    assert user.is_active is True and user.role == UserRole.GAMER
    invite = (await db_session.execute(select(StaffInvitation).where(StaffInvitation.email == staff_email))).scalar_one()
    assert invite.status == "cancelled"
    listed = (await async_client.get("/api/v1/owner/staff", headers=owner_h)).json()["data"]["staff"]
    assert all(s["id"] != str(staff_id) for s in listed)

    # Removing again: nothing to remove.
    assert (await async_client.delete(f"/api/v1/owner/staff/{staff_id}", headers=owner_h)).status_code == 404
