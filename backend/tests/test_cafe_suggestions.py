"""Suggest a cafe: public form, Google Maps link check, admin inbox + status."""
import time
import uuid

import pytest

from app.core import bot_guard
from app.models.user import UserRole
from tests.conftest import auth_headers, create_test_user


def _body(**over):
    body = {
        "cafeName": "Pixel Den",
        "city": "Jaipur",
        "mapsUrl": "https://maps.app.goo.gl/abc123",
        "cafePhone": "9876543210",
        "suggesterName": "Arjun",
        "suggesterPhone": "98765 " + str(uuid.uuid4().int)[:5],
        "formTicket": bot_guard.issue_form_ticket(now=time.time() - 30),
    }
    body.update(over)
    return body


@pytest.mark.asyncio
async def test_anyone_can_suggest_a_cafe(async_client):
    res = await async_client.post("/api/v1/cafe-suggestions", json=_body())
    assert res.status_code == 201, res.text
    assert res.json()["data"]["received"] is True


@pytest.mark.asyncio
async def test_maps_link_and_cafe_phone_are_optional(async_client):
    res = await async_client.post("/api/v1/cafe-suggestions", json=_body(mapsUrl="", cafePhone=""))
    assert res.status_code == 201, res.text


@pytest.mark.asyncio
async def test_a_non_maps_link_is_refused(async_client):
    res = await async_client.post("/api/v1/cafe-suggestions", json=_body(mapsUrl="https://evil.example.com/x"))
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_bots_are_stopped(async_client):
    res = await async_client.post("/api/v1/cafe-suggestions", json=_body(website="http://spam.example"))
    assert res.status_code >= 400


@pytest.mark.asyncio
async def test_admin_sees_and_updates_suggestions_players_do_not(async_client, db_session):
    await async_client.post("/api/v1/cafe-suggestions", json=_body(cafeName="Unique Zed Cafe"))
    admin = await create_test_user(db_session, email=f"adm_{uuid.uuid4().hex[:6]}@test.com", role=UserRole.ADMIN)
    player = await create_test_user(db_session, email=f"pl_{uuid.uuid4().hex[:6]}@test.com", role=UserRole.GAMER)
    await db_session.commit()
    headers = auth_headers(admin, is_admin=True)
    res = await async_client.get("/api/v1/admin/cafe-suggestions", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    row = next(r for r in data["items"] if r["cafeName"] == "Unique Zed Cafe")
    assert row["status"] == "new" and row["city"] == "Jaipur"
    done = await async_client.patch(f"/api/v1/admin/cafe-suggestions/{row['id']}", json={"status": "contacted"}, headers=headers)
    assert done.json()["data"]["status"] == "contacted"
    csv = await async_client.get("/api/v1/admin/cafe-suggestions/export.csv", headers=headers)
    assert "Unique Zed Cafe" in csv.text
    assert (await async_client.get("/api/v1/admin/cafe-suggestions", headers=auth_headers(player))).status_code == 403
