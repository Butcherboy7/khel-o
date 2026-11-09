"""Admin runs the whole community page: posts (pin/hide/schedule/delete), photo wall, page setup, polls, analytics."""
import pytest
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.analytics_event import AnalyticsEvent
from app.models.community import CommunityPhoto, CommunityPost
from app.models.user import UserRole

from tests.test_drops import _client, _h, _user


async def _clear():
    async with AsyncSessionLocal() as db:
        for m in (CommunityPost, CommunityPhoto):
            for row in (await db.execute(select(m))).scalars():
                await db.delete(row)
        await db.commit()


@pytest.mark.asyncio
async def test_posts_pin_hide_schedule_edit_delete():
    await _clear()
    admin = await _user(UserRole.ADMIN, phone="9876500301")
    async with _client() as c:
        h = _h(admin)
        a = (await c.post("/api/v1/admin/community/post", headers=h, json={"headline": "Older post"})).json()["data"]["id"]
        b = (await c.post("/api/v1/admin/community/post", headers=h, json={"headline": "Newest post"})).json()["data"]["id"]
        week = (await c.get("/api/v1/community/this-week")).json()["data"]
        assert week["post"]["headline"] == "Newest post" and week["earlierPosts"][0]["headline"] == "Older post"
        # Pin the older one: it goes on top.
        r = await c.patch(f"/api/v1/admin/community/posts/{a}", headers=h, json={"headline": "Older post, pinned", "pinned": True})
        assert r.status_code == 200, r.text
        assert (await c.get("/api/v1/community/this-week")).json()["data"]["post"]["headline"] == "Older post, pinned"
        # Hide it: the newest is back on top; admin still sees it as hidden.
        await c.patch(f"/api/v1/admin/community/posts/{a}", headers=h, json={"headline": "Older post, pinned", "pinned": True, "hidden": True})
        assert (await c.get("/api/v1/community/this-week")).json()["data"]["post"]["headline"] == "Newest post"
        listing = (await c.get("/api/v1/admin/community/posts", headers=h)).json()["data"]
        assert {p["state"] for p in listing["posts"]} == {"hidden", "live"} and listing["onTopId"] == b
        # Scheduled for later: not shown yet.
        s = (await c.post("/api/v1/admin/community/post", headers=h, json={"headline": "Next week", "showFrom": "2030-01-01T00:00:00+05:30"})).json()["data"]["id"]
        assert (await c.get("/api/v1/community/this-week")).json()["data"]["post"]["headline"] == "Newest post"
        assert [p for p in (await c.get("/api/v1/admin/community/posts", headers=h)).json()["data"]["posts"] if p["id"] == s][0]["state"] == "scheduled"
        assert (await c.post("/api/v1/admin/community/post", headers=h, json={"headline": "Bad", "imageUrl": "javascript:x"})).status_code == 400
        assert (await c.delete(f"/api/v1/admin/community/posts/{b}", headers=h)).status_code == 200
        assert (await c.get("/api/v1/community/this-week")).json()["data"]["post"] is None
        gamer = await _user(UserRole.GAMER, phone="9876500302")
        assert (await c.delete(f"/api/v1/admin/community/posts/{a}", headers=_h(gamer))).status_code in (401, 403)


@pytest.mark.asyncio
async def test_photo_wall_add_order_hero_hide_delete():
    await _clear()
    admin = await _user(UserRole.ADMIN, phone="9876500303")
    async with _client() as c:
        h = _h(admin)
        ids = [(await c.post("/api/v1/admin/community/photos", headers=h, json={"url": f"/community/{n}.webp", "caption": n})).json()["data"]["id"] for n in ("a", "b", "c")]
        week = (await c.get("/api/v1/community/this-week")).json()["data"]
        assert [p["caption"] for p in week["photos"]] == ["a", "b", "c"] and week["heroUrl"] == "/community/a.webp"
        assert (await c.put("/api/v1/admin/community/photos/order", headers=h, json={"ids": [ids[2], ids[0], ids[1]]})).status_code == 200
        await c.patch(f"/api/v1/admin/community/photos/{ids[1]}", headers=h, json={"isHero": True})
        await c.patch(f"/api/v1/admin/community/photos/{ids[0]}", headers=h, json={"hidden": True, "caption": "hidden one"})
        week = (await c.get("/api/v1/community/this-week")).json()["data"]
        assert [p["caption"] for p in week["photos"]] == ["c", "b"] and week["heroUrl"] == "/community/b.webp"
        assert (await c.delete(f"/api/v1/admin/community/photos/{ids[1]}", headers=h)).status_code == 200
        rows = (await c.get("/api/v1/admin/community/photos", headers=h)).json()["data"]
        assert len(rows) == 2 and sum(r["isHero"] for r in rows) == 1
        assert (await c.post("/api/v1/admin/community/photos", headers=h, json={"url": "ftp://x"})).status_code == 400


@pytest.mark.asyncio
async def test_page_settings_tabs_and_text():
    admin = await _user(UserRole.ADMIN, phone="9876500304")
    async with _client() as c:
        h = _h(admin)
        r = await c.put("/api/v1/admin/community/settings", headers=h, json={"headline": "Pick #02 with us", "tabs": ["vote", "week", "bogus", "vote"], "showMembersCode": False, "joinLabel": "Get in"})
        assert r.status_code == 200, r.text
        st = (await c.get("/api/v1/community/this-week")).json()["data"]["settings"]
        assert st["headline"] == "Pick #02 with us" and st["tabs"] == ["vote", "week"] and st["showMembersCode"] is False and st["joinLabel"] == "Get in"
        assert (await c.put("/api/v1/admin/community/settings", headers=h, json={"tabs": ["nope"]})).status_code == 400
        await c.post("/api/v1/admin/community/settings/reset", headers=h)
        st = (await c.get("/api/v1/community/this-week")).json()["data"]["settings"]
        assert st["tabs"] == ["week", "vote", "next", "photos"] and st["headline"] == "Be there when it drops."


@pytest.mark.asyncio
async def test_poll_history_delete_and_analytics():
    admin = await _user(UserRole.ADMIN, phone="9876500305")
    async with _client() as c:
        h = _h(admin)
        await c.put("/api/v1/admin/community/poll", headers=h, json={"question": "Test poll?", "options": ["x", "y"]})
        hist = (await c.get("/api/v1/admin/community/polls", headers=h)).json()["data"]
        pid = [p for p in hist if p["question"] == "Test poll?"][0]["id"]
        assert (await c.delete(f"/api/v1/admin/community/polls/{pid}", headers=h)).status_code == 200
        assert not [p for p in (await c.get("/api/v1/admin/community/polls", headers=h)).json()["data"] if p["id"] == pid]
    async with AsyncSessionLocal() as db:
        for sid, act, extra in (("an1", "community_landed", {"iab": "instagram"}), ("an2", "community_landed", {}),
                                ("an1", "community_join_tap", {"where": "community_page_sticky"}), ("an1", "community_tab", {"tab": "vote"}),
                                ("an3", "community_landed", {"internal": True})):
            db.add(AnalyticsEvent(session_id=sid, event_type="ui_action", event_metadata={"action": act, "utm": {"c": "ig-boost"}, **extra}))
        await db.commit()
    async with _client() as c:
        a = (await c.get("/api/v1/admin/community/analytics?days=7", headers=_h(admin))).json()["data"]
        assert a["totals"]["visits"] >= 2 and a["totals"]["inApp"] >= 1 and a["totals"]["joined"] >= 1
        assert a["tabs"].get("vote", 0) >= 1 and a["joinWhere"].get("community_page_sticky", 0) >= 1
        assert len(a["series"]) == 7 and any(s["source"] == "ig-boost" for s in a["sources"])
