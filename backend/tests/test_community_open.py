"""Community page without login: one phone = one join / one vote; leads; admin sees it."""
import pytest
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.analytics_event import AnalyticsEvent
from app.models.community import CommunityPoll
from app.models.user import UserRole

from tests.test_drops import _client, _h, _user

DEV = "dev-test-phone-0001"
DEV2 = "dev-test-phone-0002"


async def _poll():
    async with AsyncSessionLocal() as db:
        for old in (await db.execute(select(CommunityPoll).where(CommunityPoll.status == "active"))).scalars():
            old.status = "closed"
        p = CommunityPoll(question="Which game?", options=["A", "B"], members_code="CODE1")
        db.add(p)
        await db.commit()
        return str(p.id)


@pytest.mark.asyncio
async def test_join_counts_once_per_phone_and_unlocks_the_code_without_login():
    await _poll()
    async with _client() as c:
        before = (await c.get("/api/v1/community/this-week", params={"deviceId": DEV})).json()["data"]
        assert before["isMember"] is False and before["poll"]["code"] is None
        for _ in range(2):
            r = await c.post("/api/v1/community/join", json={"deviceId": DEV, "source": "reel-1"})
            assert r.status_code == 200 and r.json()["data"]["code"] == "CODE1"
        after = (await c.get("/api/v1/community/this-week", params={"deviceId": DEV})).json()["data"]
        assert after["isMember"] is True and after["poll"]["code"] == "CODE1"
        assert after["members"] == before["members"] + 1
        other = (await c.get("/api/v1/community/this-week", params={"deviceId": DEV2})).json()["data"]
        assert other["isMember"] is False and other["poll"]["code"] is None
        bad = await c.post("/api/v1/community/join", json={"deviceId": "x"})
        assert bad.status_code == 400


@pytest.mark.asyncio
async def test_vote_without_login_is_one_per_phone_and_can_change():
    pid = await _poll()
    async with _client() as c:
        assert (await c.post(f"/api/v1/community/polls/{pid}/vote", json={"optionIndex": 0, "deviceId": DEV})).status_code == 200
        assert (await c.post(f"/api/v1/community/polls/{pid}/vote", json={"optionIndex": 1, "deviceId": DEV})).status_code == 200
        assert (await c.post(f"/api/v1/community/polls/{pid}/vote", json={"optionIndex": 1, "deviceId": DEV2})).status_code == 200
        poll = (await c.get("/api/v1/community/this-week", params={"deviceId": DEV})).json()["data"]["poll"]
        assert poll["total"] == 2 and poll["myVote"] == 1
        assert (await c.post(f"/api/v1/community/polls/{pid}/vote", json={"optionIndex": 1})).status_code == 400


@pytest.mark.asyncio
async def test_lead_needs_a_valid_contact_and_admin_gets_people_and_csv():
    admin = await _user(UserRole.ADMIN, phone="9876500201")
    async with _client() as c:
        assert (await c.post("/api/v1/community/lead", json={"deviceId": DEV})).status_code == 400
        assert (await c.post("/api/v1/community/lead", json={"deviceId": DEV, "email": "nope"})).status_code == 400
        ok = await c.post("/api/v1/community/lead", json={"deviceId": DEV, "email": "Fan@Gmail.com", "phone": "98765 43210", "marketingOk": True, "source": "reel-1"})
        assert ok.status_code == 200, ok.text
        ppl = (await c.get("/api/v1/admin/community/people", headers=_h(admin))).json()["data"]
        mine = [p for p in ppl if p["email"] == "fan@gmail.com"][0]
        assert mine["phone"] == "9876543210" and mine["promoOk"] is True and mine["source"] == "reel-1"
        csv_text = (await c.get("/api/v1/admin/community/people.csv", headers=_h(admin))).text
        assert "fan@gmail.com" in csv_text and "ok_to_send_promotions" in csv_text
        gamer = await _user(UserRole.GAMER, phone="9876500202")
        assert (await c.get("/api/v1/admin/community/people", headers=_h(gamer))).status_code in (401, 403)


@pytest.mark.asyncio
async def test_suggestion_without_login_and_weekly_post_and_funnel():
    admin = await _user(UserRole.ADMIN, phone="9876500203")
    async with _client() as c:
        r = await c.post("/api/v1/community/contributions", json={
            "kind": "cafe", "title": "Pixel Arena", "detail": "Banjara Hills", "deviceId": DEV, "name": "Ravi", "contact": "ravi@x.com"})
        assert r.status_code == 201, r.text
        rows = (await c.get("/api/v1/admin/community/contributions", headers=_h(admin))).json()["data"]
        assert any(x["title"] == "Pixel Arena" and x["contact"] == "ravi@x.com" and x["name"] == "Ravi" for x in rows)
        p = await c.post("/api/v1/admin/community/post", headers=_h(admin), json={"headline": "Challenge 2 is Street Fighter", "buttonLabel": "Vote", "buttonUrl": "/community#vote"})
        assert p.status_code == 201
        week = (await c.get("/api/v1/community/this-week")).json()["data"]
        assert week["post"]["headline"].startswith("Challenge 2")
    async with AsyncSessionLocal() as db:
        for sid, act in (("s1", "community_landed"), ("s2", "community_landed"), ("s1", "community_join_tap")):
            db.add(AnalyticsEvent(session_id=sid, event_type="ui_action",
                                  event_metadata={"action": act, "utm": {"c": "reel-9"}, "iab": "instagram" if sid == "s2" else None}))
        await db.commit()
    async with _client() as c:
        ov = (await c.get("/api/v1/admin/community/overview", headers=_h(admin))).json()["data"]
        row = [f for f in ov["funnel"] if f["source"] == "reel-9"][0]
        assert row["community_landed"] == 2 and row["community_join_tap"] == 1 and row["inApp"] == 1
        assert ov["postIsStale"] is False
        g = await c.post("/api/v1/admin/community/group-size", headers=_h(admin), json={"size": 180})
        assert g.status_code == 200
        assert (await c.get("/api/v1/admin/community/overview", headers=_h(admin))).json()["data"]["groupSize"]["size"] == 180
