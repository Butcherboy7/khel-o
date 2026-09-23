"""Café demand (waitlist) outreach endpoints: ranked lead demand for admins,
and the waitlist goal shown to visitors.
"""
import uuid

from app.models.cafe import Cafe, VerificationStatus
from app.models.user import UserRole
from tests.conftest import create_test_user, auth_headers


async def _make_cafe(db_session, name: str, **overrides) -> Cafe:
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await db_session.flush()
    fields = dict(
        id=uuid.uuid4(),
        owner_id=owner.id,
        name=name,
        address_line1="1 Test Rd",
        city="Hyderabad",
        state="Telangana",
        pincode="500001",
        phone_number="0000000000",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        is_lead_listing=True,
        amenities=[],
        photos=[],
        supported_games={},
        menu_photos=[],
        house_rules=[],
        social_links={},
    )
    fields.update(overrides)
    cafe = Cafe(**fields)
    db_session.add(cafe)
    await db_session.commit()
    return cafe


async def test_join_waitlist_returns_count_and_goal(db_session, async_client):
    cafe = await _make_cafe(db_session, "Lead Cafe A")

    resp = await async_client.post(
        f"/api/v1/cafes/{cafe.id}/waitlist",
        json={"sessionId": "sess-1", "contact": "player1@test.com"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["count"] == 1
    assert data["joined"] is True
    assert data["goal"] == 30  # default


async def test_admin_lead_demand_ranks_by_count_and_lists_contacts(db_session, async_client):
    admin = await create_test_user(db_session, role=UserRole.ADMIN)
    cafe_hot = await _make_cafe(db_session, "Popular Lead Cafe")
    cafe_cold = await _make_cafe(db_session, "Quiet Lead Cafe")

    for i in range(3):
        r = await async_client.post(
            f"/api/v1/cafes/{cafe_hot.id}/waitlist",
            json={"sessionId": f"hot-sess-{i}", "contact": f"hotfan{i}@test.com"},
        )
        assert r.status_code == 200

    r = await async_client.post(
        f"/api/v1/cafes/{cafe_cold.id}/waitlist",
        json={"sessionId": "cold-sess-1"},
    )
    assert r.status_code == 200

    headers = auth_headers(admin, is_admin=True)
    resp = await async_client.get("/api/v1/admin/leads/demand", headers=headers)
    assert resp.status_code == 200, resp.text
    leads = resp.json()["data"]["leads"]

    by_name = {l["cafeName"]: l for l in leads}
    assert by_name["Popular Lead Cafe"]["count"] == 3
    assert len(by_name["Popular Lead Cafe"]["contacts"]) == 3
    assert by_name["Quiet Lead Cafe"]["count"] == 1
    assert by_name["Quiet Lead Cafe"]["noContactCount"] == 1

    # Ranked highest demand first. Assert relative order between the two
    # cafes created in this test rather than absolute list position — the
    # test DB schema is created once per session (see conftest.py), so
    # other test modules' lead-listing cafes with the same count can also
    # be present here.
    names = [l["cafeName"] for l in leads]
    assert names.index("Popular Lead Cafe") < names.index("Quiet Lead Cafe")


async def test_admin_lead_demand_surfaces_signed_in_users_account_contact(db_session, async_client):
    """A signed-in visitor isn't asked for a contact when tapping Notify Me
    (they're already reachable via their account) -- but that account's
    phone/email must still show up in the outreach contact list, not just get
    invisibly counted as noContactCount."""
    admin = await create_test_user(db_session, role=UserRole.ADMIN)
    gamer = await create_test_user(
        db_session, role=UserRole.GAMER, full_name="Priya Sharma", email="priya@real.com",
    )
    gamer.phone_number = "9123456789"
    await db_session.commit()
    cafe = await _make_cafe(db_session, "Account Contact Cafe")

    r = await async_client.post(
        f"/api/v1/cafes/{cafe.id}/waitlist",
        json={"sessionId": "irrelevant-when-signed-in"},
        headers=auth_headers(gamer),
    )
    assert r.status_code == 200, r.text

    headers = auth_headers(admin, is_admin=True)
    resp = await async_client.get("/api/v1/admin/leads/demand", headers=headers)
    assert resp.status_code == 200, resp.text
    leads = resp.json()["data"]["leads"]
    lead = next(l for l in leads if l["cafeName"] == "Account Contact Cafe")

    assert lead["count"] == 1
    assert lead["noContactCount"] == 0, "a signed-in user's own account contact must not count as unreachable"
    assert len(lead["contacts"]) == 1
    assert "Priya Sharma" in lead["contacts"][0]
    assert "9123456789" in lead["contacts"][0]


async def test_admin_can_update_waitlist_goal(db_session, async_client):
    admin = await create_test_user(db_session, role=UserRole.ADMIN)
    cafe = await _make_cafe(db_session, "Goal Cafe")

    headers = auth_headers(admin, is_admin=True)
    resp = await async_client.patch(
        f"/api/v1/admin/cafes/{cafe.id}/waitlist-goal",
        json={"waitlistGoal": 10},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["waitlistGoal"] == 10

    join_resp = await async_client.post(
        f"/api/v1/cafes/{cafe.id}/waitlist",
        json={"sessionId": "sess-goal"},
    )
    assert join_resp.json()["data"]["goal"] == 10
