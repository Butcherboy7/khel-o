""""Know the owner?" intros: a signed-in player drops a café owner's contact
and it lands on the admin Leads page."""
from unittest.mock import AsyncMock, patch

import pytest

from app.api.v1.owner_intros import normalise_phone
from app.models.user import UserRole
from tests.conftest import create_test_user, auth_headers
from tests.test_lead_listings import _make_cafe


def _body(cafe_id=None, **over):
    body = {
        "ownerName": "Ravi",
        "ownerPhone": "98765 43210",
        "relation": "regular",
        "ownerConsent": True,
    }
    if cafe_id:
        body["cafeId"] = str(cafe_id)
    body.update(over)
    return body


@pytest.fixture(autouse=True)
def _no_email():
    with patch("app.api.v1.owner_intros.NotificationService.send_owner_intro", new=AsyncMock(return_value=True)) as m:
        yield m


def test_phone_normalisation():
    assert normalise_phone("98765 43210") == "+919876543210"
    assert normalise_phone("+91-98765-43210") == "+919876543210"
    assert normalise_phone("919876543210") == "+919876543210"
    assert normalise_phone("+44 7700 900123") == "+447700900123"
    with pytest.raises(ValueError):
        normalise_phone("12345")


async def test_requires_sign_in(db_session, async_client):
    cafe = await _make_cafe(db_session, "Intro Anon", is_lead_listing=True)
    r = await async_client.post("/api/v1/owner-intros", json=_body(cafe.id))
    assert r.status_code == 401, r.text


async def test_intro_from_cafe_page_reaches_admin(db_session, async_client, _no_email):
    cafe = await _make_cafe(db_session, "Intro Cafe", is_lead_listing=True)
    gamer = await create_test_user(db_session, role=UserRole.GAMER, full_name="Asha")
    admin = await create_test_user(db_session, role=UserRole.ADMIN)
    await db_session.commit()

    r = await async_client.post("/api/v1/owner-intros", headers=auth_headers(gamer), json=_body(cafe.id, note="He's there after 6"))
    assert r.status_code == 201, r.text
    assert r.json()["data"]["duplicate"] is False
    _no_email.assert_awaited_once()

    r = await async_client.get("/api/v1/admin/leads/owner-intros", headers=auth_headers(admin, is_admin=True))
    assert r.status_code == 200, r.text
    mine = [i for i in r.json()["data"]["intros"] if i["cafeId"] == str(cafe.id)]
    assert len(mine) == 1
    assert mine[0]["cafeName"] == "Intro Cafe"
    assert mine[0]["ownerPhone"] == "+919876543210"
    assert mine[0]["status"] == "new"
    assert mine[0]["submittedBy"]["name"] == "Asha"

    r = await async_client.patch(f"/api/v1/admin/leads/owner-intros/{mine[0]['id']}",
                                 headers=auth_headers(admin, is_admin=True), json={"status": "contacted"})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "contacted"


async def test_general_form_needs_a_cafe_name(db_session, async_client):
    gamer = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()
    h = auth_headers(gamer)

    r = await async_client.post("/api/v1/owner-intros", headers=h, json=_body())
    assert r.status_code == 400, r.text

    r = await async_client.post("/api/v1/owner-intros", headers=h, json=_body(cafeName="Pixel Den", area="Kondapur"))
    assert r.status_code == 201, r.text


async def test_consent_is_required(db_session, async_client):
    cafe = await _make_cafe(db_session, "Intro Consent", is_lead_listing=True)
    gamer = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()
    r = await async_client.post("/api/v1/owner-intros", headers=auth_headers(gamer), json=_body(cafe.id, ownerConsent=False))
    assert r.status_code == 400, r.text
    assert r.json()["error"]["code"] == "OWNER_CONSENT_REQUIRED"


async def test_repeat_is_not_a_second_lead_and_daily_cap(db_session, async_client):
    cafe = await _make_cafe(db_session, "Intro Repeat", is_lead_listing=True)
    gamer = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()
    h = auth_headers(gamer)

    first = await async_client.post("/api/v1/owner-intros", headers=h, json=_body(cafe.id))
    again = await async_client.post("/api/v1/owner-intros", headers=h, json=_body(cafe.id))
    assert again.status_code == 201
    assert again.json()["data"] == {"id": first.json()["data"]["id"], "duplicate": True}

    for n in range(4):
        r = await async_client.post("/api/v1/owner-intros", headers=h, json=_body(cafe.id, ownerPhone=f"700000000{n}"))
        assert r.status_code == 201, r.text
    r = await async_client.post("/api/v1/owner-intros", headers=h, json=_body(cafe.id, ownerPhone="9123456789"))
    assert r.status_code == 429, r.text


async def test_admin_only(db_session, async_client):
    gamer = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()
    r = await async_client.get("/api/v1/admin/leads/owner-intros", headers=auth_headers(gamer))
    assert r.status_code == 403
