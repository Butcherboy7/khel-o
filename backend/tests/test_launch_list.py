"""Launch lists (GTA 6 first): a public sign-up for a game launch, with how the
player wants to be reached, a real public count, and an admin list + CSV."""
import time
import uuid

import pytest

from app.core import bot_guard
from app.models.user import UserRole
from tests.conftest import auth_headers, create_test_user


def _ticket(age_seconds: float = 30) -> str:
    return bot_guard.issue_form_ticket(now=time.time() - age_seconds)


def _body(**over):
    body = {
        "name": "Arjun",
        "phone": "98765 " + str(uuid.uuid4().int)[:5],
        "contactMethod": "whatsapp",
        "consent": True,
        "formTicket": _ticket(),
    }
    body.update(over)
    return body


async def _count(client) -> int:
    res = await client.get("/api/v1/launch-list/gta6")
    assert res.status_code == 200, res.text
    return res.json()["data"]["count"]


@pytest.mark.asyncio
async def test_join_counts_and_returns_the_launch(async_client):
    before = await _count(async_client)
    res = await async_client.post("/api/v1/launch-list/gta6", json=_body())
    assert res.status_code == 201, res.text
    data = res.json()["data"]
    assert data["joined"] is True and data["alreadyJoined"] is False
    assert data["count"] == before + 1
    info = (await async_client.get("/api/v1/launch-list/gta6")).json()["data"]
    assert info["launchDate"] == "2026-11-19"


@pytest.mark.asyncio
async def test_same_number_twice_updates_instead_of_double_counting(async_client):
    body = _body()
    await async_client.post("/api/v1/launch-list/gta6", json=body)
    before = await _count(async_client)
    again = await async_client.post("/api/v1/launch-list/gta6", json={**body, "contactMethod": "call", "formTicket": _ticket()})
    assert again.status_code == 201
    assert again.json()["data"]["alreadyJoined"] is True
    assert await _count(async_client) == before


@pytest.mark.asyncio
async def test_unknown_launch_is_404(async_client):
    assert (await async_client.get("/api/v1/launch-list/gta7")).status_code == 404
    assert (await async_client.post("/api/v1/launch-list/gta7", json=_body())).status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", [
    {"consent": False},
    {"phone": "12345"},
    {"contactMethod": "pigeon"},
    {"name": ""},
])
async def test_rejects_bad_input(async_client, bad):
    res = await async_client.post("/api/v1/launch-list/gta6", json=_body(**bad))
    assert res.status_code in (400, 422), res.text


@pytest.mark.asyncio
async def test_bots_are_refused(async_client, strict_bot_guard):
    before = await _count(async_client)
    trap = await async_client.post("/api/v1/launch-list/gta6", json=_body(website="http://spam"))
    too_fast = await async_client.post("/api/v1/launch-list/gta6", json=_body(formTicket=_ticket(0)))
    no_ticket = await async_client.post("/api/v1/launch-list/gta6", json=_body(formTicket=None))
    assert trap.status_code == too_fast.status_code == no_ticket.status_code == 400
    assert await _count(async_client) == before


@pytest.mark.asyncio
async def test_admin_sees_the_list_and_csv_players_do_not(async_client, db_session):
    body = _body(name="Csv Player", contactMethod="text", email="csv@example.com")
    await async_client.post("/api/v1/launch-list/gta6", json=body)

    admin = await create_test_user(db_session, email=f"adm_{uuid.uuid4().hex[:6]}@test.com", role=UserRole.ADMIN)
    player = await create_test_user(db_session, email=f"p_{uuid.uuid4().hex[:6]}@test.com", role=UserRole.GAMER)
    await db_session.commit()

    rows = (await async_client.get("/api/v1/admin/launch-list/gta6", headers=auth_headers(admin, is_admin=True))).json()["data"]
    row = next(r for r in rows["items"] if r["name"] == "Csv Player")
    assert row["phone"].startswith("+91") and row["contactMethod"] == "text" and row["email"] == "csv@example.com"
    assert rows["byMethod"]["text"] >= 1

    csv = await async_client.get("/api/v1/admin/launch-list/gta6.csv", headers=auth_headers(admin, is_admin=True))
    assert csv.status_code == 200 and "text/csv" in csv.headers["content-type"]
    assert "Csv Player" in csv.text

    assert (await async_client.get("/api/v1/admin/launch-list/gta6", headers=auth_headers(player))).status_code == 403
