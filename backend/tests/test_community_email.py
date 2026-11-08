"""Community email: test first, count must match, unsubscribe sticks."""
import pytest
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.services import community_mailer as mailer

from tests.test_drops import _client, _h, _user


@pytest.mark.asyncio
async def test_real_send_needs_a_test_first_and_a_matching_count():
    admin = await _user(UserRole.ADMIN, phone="9876500101")
    async with _client() as c:
        pre = await c.get("/api/v1/admin/community/email", headers=_h(admin))
        assert pre.status_code == 200, pre.text
        d = pre.json()["data"]
        assert d["subject"] and "Join the community" in d["html"] and d["testedRecently"] is False
        r = await c.post("/api/v1/admin/community/email", headers=_h(admin), json={"test": False, "confirmCount": d["recipients"]})
        assert r.status_code == 400 and r.json()["error"]["code"] == "TEST_FIRST"
        t = await c.post("/api/v1/admin/community/email", headers=_h(admin), json={"test": True})
        assert t.status_code == 200 and t.json()["data"]["test"] is True
        r = await c.post("/api/v1/admin/community/email", headers=_h(admin), json={"test": False, "confirmCount": d["recipients"] + 5})
        assert r.status_code == 400 and r.json()["error"]["code"] == "COUNT_CHANGED"


@pytest.mark.asyncio
async def test_non_admin_cannot_use_it():
    gamer = await _user(UserRole.GAMER, phone="9876500102")
    async with _client() as c:
        assert (await c.get("/api/v1/admin/community/email", headers=_h(gamer))).status_code in (401, 403)


@pytest.mark.asyncio
async def test_unsubscribe_needs_the_right_token_and_removes_the_person():
    user = await _user(UserRole.GAMER, phone="9876500103")
    async with AsyncSessionLocal() as db:
        u = await db.get(User, user.id)
        u.email = "realperson@gmail.com"
        await db.commit()
        assert any(x.id == user.id for x in await mailer.recipients(db))
    async with _client() as c:
        bad = await c.post("/api/v1/community/unsubscribe", content=f"u={user.id}&t=nope", headers={"content-type": "application/x-www-form-urlencoded"})
        assert "did not work" in bad.text
        ok = await c.post("/api/v1/community/unsubscribe", content=f"u={user.id}&t={mailer.unsubscribe_token(user.id)}", headers={"content-type": "application/x-www-form-urlencoded"})
        assert "No more community emails" in ok.text
        page = await c.get(f"/api/v1/community/unsubscribe?u={user.id}&t=x")
        assert page.status_code == 200 and "Unsubscribe" in page.text
    async with AsyncSessionLocal() as db:
        assert not any(x.id == user.id for x in await mailer.recipients(db))
