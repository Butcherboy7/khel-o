"""Admin city fix + the "no other live café in this city" signal.

Owners sometimes type their area ("Kukatpally") as the city. City lists match
on city, so the café disappears from Hyderabad. Admin lists now say how many
other live cafés share the city, and admin can correct it.
"""
import uuid

import pytest
from sqlalchemy import select

from app.models.admin_audit_log import AdminAuditLog
from app.models.cafe import Cafe, VerificationStatus
from app.models.user import UserRole
from tests.conftest import auth_headers, create_test_user


async def _cafe(db_session, owner, *, city, status=VerificationStatus.VERIFIED, active=True, name=None) -> Cafe:
    cafe = Cafe(
        id=uuid.uuid4(), owner_id=owner.id, name=name or f"Cafe {uuid.uuid4().hex[:6]}",
        address_line1="1 Test Rd", city=city, state="Telangana",
        pincode="500072", phone_number="7777777777", email=owner.email,
        verification_status=status, is_active=active,
        amenities=[], photos=[], supported_games={}, menu_photos=[],
        house_rules=[], social_links={},
    )
    db_session.add(cafe)
    await db_session.commit()
    return cafe


@pytest.mark.asyncio
async def test_admin_fixes_city_and_area_and_it_is_audited(db_session, async_client):
    owner = await create_test_user(db_session, email="loc_owner1@test.com", role=UserRole.CAFE_OWNER)
    admin = await create_test_user(db_session, email="loc_admin1@test.com", role=UserRole.ADMIN)
    cafe = await _cafe(db_session, owner, city="kukatpally Hosuing Board Colony")
    slug_before = cafe.slug

    resp = await async_client.patch(
        f"/api/v1/admin/cafes/{cafe.id}/location",
        json={"city": "  Hyderabad ", "area": "Kukatpally  Housing Board Colony"},
        headers=auth_headers(admin, is_admin=True),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"] == {
        "city": "Hyderabad", "state": "Telangana", "addressLine2": "Kukatpally Housing Board Colony",
    }

    await db_session.refresh(cafe)
    assert cafe.city == "Hyderabad"
    assert cafe.slug == slug_before

    log = (await db_session.execute(
        select(AdminAuditLog).where(AdminAuditLog.action == "cafe.update_location")
    )).scalars().first()
    assert log is not None and "kukatpally Hosuing Board Colony" in (log.reason or "")


@pytest.mark.asyncio
async def test_city_fix_rejects_garbage_and_non_admins(db_session, async_client):
    owner = await create_test_user(db_session, email="loc_owner2@test.com", role=UserRole.CAFE_OWNER)
    admin = await create_test_user(db_session, email="loc_admin2@test.com", role=UserRole.ADMIN)
    cafe = await _cafe(db_session, owner, city="Hyderabad")

    bad = await async_client.patch(
        f"/api/v1/admin/cafes/{cafe.id}/location", json={"city": "1"},
        headers=auth_headers(admin, is_admin=True),
    )
    assert bad.status_code == 422

    forbidden = await async_client.patch(
        f"/api/v1/admin/cafes/{cafe.id}/location", json={"city": "Hyderabad"},
        headers=auth_headers(owner),
    )
    assert forbidden.status_code in (401, 403)


@pytest.mark.asyncio
async def test_admin_lists_flag_a_city_with_no_other_live_cafe(db_session, async_client):
    owner = await create_test_user(db_session, email="loc_owner3@test.com", role=UserRole.CAFE_OWNER)
    admin = await create_test_user(db_session, email="loc_admin3@test.com", role=UserRole.ADMIN)
    # Unique names: other tests leave cafés in the shared test database.
    city, area, area2 = (f"{w} {uuid.uuid4().hex[:6]}" for w in ("Testabad", "Testpally", "Testguda"))
    live = await _cafe(db_session, owner, city=city, name="Live One")
    await _cafe(db_session, owner, city=f" {city.lower()} ", name="Live Two")
    lone = await _cafe(db_session, owner, city=area, name="Lone Live")
    pending = await _cafe(
        db_session, owner, city=city, status=VerificationStatus.PENDING, active=False, name="Pending Hyd",
    )
    pending_lone = await _cafe(
        db_session, owner, city=area2, status=VerificationStatus.PENDING, active=False, name="Pending Lone",
    )

    resp = await async_client.get("/api/v1/admin/cafes?limit=50", headers=auth_headers(admin, is_admin=True))
    assert resp.status_code == 200, resp.text
    mine = {str(c.id) for c in (live, lone, pending, pending_lone)}
    by_name = {c["name"]: c["cityLiveCafes"] for c in resp.json()["data"]["items"] if c["id"] in mine}
    # A live café doesn't count itself.
    assert by_name["Live One"] == 1
    assert by_name["Lone Live"] == 0
    assert by_name["Pending Hyd"] == 2

    resp = await async_client.get("/api/v1/admin/cafes/pending", headers=auth_headers(admin, is_admin=True))
    assert resp.status_code == 200, resp.text
    by_id = {c["id"]: c["cityLiveCafes"] for c in resp.json()["data"]["items"]}
    assert by_id[str(pending.id)] == 2
    assert by_id[str(pending_lone.id)] == 0
    assert str(lone.id) not in by_id
