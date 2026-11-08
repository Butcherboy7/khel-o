"""Community hub: weekly poll (one vote each, can change), members-only code,
contributions (daily limit), the admin side, and the public drops list that
feeds the home Drops tab."""
from datetime import time, timedelta
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal
from app.main import app
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping

from tests.test_drops import DAY, NOW, _drop  # noqa: F401  (a live drop with a future session)


def _h(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(subject=str(user.id), role=user.role.value)}"}


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _user(role=UserRole.GAMER, name="Ravi Kumar") -> User:
    async with AsyncSessionLocal() as db:
        u = User(id=uuid4(), email=f"comm_{uuid4().hex[:8]}@test.com", full_name=name, phone_number="9876543210",
                 password_hash=get_password_hash("x12345678"), role=role, is_active=True)
        db.add(u)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=u.id, role=UserRole.GAMER))
        if role != UserRole.GAMER:
            db.add(UserRoleMapping(id=uuid4(), user_id=u.id, role=role))
        await db.commit()
        return u


async def _new_poll(c, admin, code="EARLY-42"):
    r = await c.put("/api/v1/admin/community/poll", headers=_h(admin), json={
        "question": "Which game for #02?", "options": ["Tekken 8", "Street Fighter 6", "EA FC 26"],
        "membersCode": code, "membersCodeNote": "For the next drop"})
    assert r.status_code == 200, r.text
    r = await c.get("/api/v1/community/this-week")
    return r.json()["data"]["poll"]


@pytest.mark.asyncio
async def test_poll_one_vote_each_and_can_change():
    admin = await _user(UserRole.ADMIN)
    a, b = await _user(), await _user()
    async with _client() as c:
        poll = await _new_poll(c, admin)
        assert poll["total"] == 0 and poll["myVote"] is None
        for u, i in ((a, 0), (b, 0)):
            assert (await c.post(f"/api/v1/community/polls/{poll['id']}/vote", json={"optionIndex": i}, headers=_h(u))).status_code == 200
        # a changes their mind: still two votes in total, not three.
        assert (await c.post(f"/api/v1/community/polls/{poll['id']}/vote", json={"optionIndex": 2}, headers=_h(a))).status_code == 200
        week = (await c.get("/api/v1/community/this-week", headers=_h(a))).json()["data"]["poll"]
        assert week["total"] == 2 and week["myVote"] == 2
        assert [o["votes"] for o in week["options"]] == [1, 0, 1]
        assert week["options"][0]["percent"] == 50
        # A choice that is not on the list is refused; a vote needs an account or a phone id.
        assert (await c.post(f"/api/v1/community/polls/{poll['id']}/vote", json={"optionIndex": 7}, headers=_h(a))).status_code == 400
        assert (await c.post(f"/api/v1/community/polls/{poll['id']}/vote", json={"optionIndex": 0})).status_code == 400  # no login and no phone id


@pytest.mark.asyncio
async def test_members_code_only_after_tapping_join():
    admin = await _user(UserRole.ADMIN)
    u = await _user()
    async with _client() as c:
        await _new_poll(c, admin, code="SECRET-7")
        anon = (await c.get("/api/v1/community/this-week")).json()["data"]
        assert anon["poll"]["hasCode"] is True and anon["poll"]["code"] is None
        before = (await c.get("/api/v1/community/this-week", headers=_h(u))).json()["data"]
        assert before["isMember"] is False and before["poll"]["code"] is None
        assert (await c.post("/api/v1/community/joined", headers=_h(u))).status_code == 200
        assert (await c.post("/api/v1/community/joined", headers=_h(u))).status_code == 200  # twice is fine
        after = (await c.get("/api/v1/community/this-week", headers=_h(u))).json()["data"]
        assert after["isMember"] is True and after["poll"]["code"] == "SECRET-7"
        assert after["members"] >= 1


@pytest.mark.asyncio
async def test_new_poll_closes_the_old_one_and_only_admins_can_set_it():
    admin = await _user(UserRole.ADMIN)
    gamer = await _user()
    async with _client() as c:
        body = {"question": "Next game?", "options": ["A", "B"]}
        assert (await c.put("/api/v1/admin/community/poll", json=body, headers=_h(gamer))).status_code == 403
        first = await _new_poll(c, admin)
        second = await _new_poll(c, admin)
        assert first["id"] != second["id"]
        # The old poll no longer takes votes.
        assert (await c.post(f"/api/v1/community/polls/{first['id']}/vote", json={"optionIndex": 0}, headers=_h(gamer))).status_code == 404


@pytest.mark.asyncio
async def test_contributions_need_login_are_limited_and_admin_can_approve():
    admin = await _user(UserRole.ADMIN)
    u = await _user(name="Asha Rao")
    body = {"kind": "cafe", "title": "Pixel Arena", "detail": "Madhapur, 6 PS5", "showName": True}
    async with _client() as c:
        assert (await c.post("/api/v1/community/contributions", json=body)).status_code == 400  # no account and no phone id
        assert (await c.post("/api/v1/community/contributions", json=body, headers=_h(u))).status_code == 201
        listing = (await c.get("/api/v1/admin/community/contributions", headers=_h(admin))).json()["data"]
        mine = next(r for r in listing if r["title"] == "Pixel Arena" and r["email"] == u.email)
        assert mine["status"] == "new"
        # Not on the wall until an admin approves.
        assert "Asha" not in (await c.get("/api/v1/community/this-week")).json()["data"]["contributors"]
        assert (await c.patch(f"/api/v1/admin/community/contributions/{mine['id']}", json={"status": "approved"}, headers=_h(admin))).status_code == 200
        assert "Asha" in (await c.get("/api/v1/community/this-week")).json()["data"]["contributors"]
        # The daily limit stops a flood.
        for _ in range(4):
            assert (await c.post("/api/v1/community/contributions", json=body, headers=_h(u))).status_code == 201
        assert (await c.post("/api/v1/community/contributions", json=body, headers=_h(u))).status_code == 400


@pytest.mark.asyncio
async def test_drops_list_shows_live_drops_and_marks_the_ones_you_hold():
    drop, block, _block2, _owner, _cafe = await _drop(state="open")
    async with _client() as c:
        r = await c.get("/api/v1/drops")
        assert r.status_code == 200
        item = next(d for d in r.json()["data"] if d["slug"] == drop.slug)
        assert item["state"] == "open" and item["seatsLeft"] > 0 and item["iHold"] is False
        assert "blocks" not in item and item["nextStartsAt"]
