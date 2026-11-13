"""Drops that run past midnight, or all 24 hours at a 24/7 café."""
from datetime import time, timedelta

import pytest

from app.database import AsyncSessionLocal
from app.models.cafe import Cafe
from app.services import drop_service as svc

from tests.test_drops import DAY, _cafe_with_rig, _client, _h, _rig_body, _user, fake_razorpay  # noqa: F401


async def _hours(cafe_id, o, c):
    async with AsyncSessionLocal() as db:
        cafe = await db.get(Cafe, cafe_id)
        cafe.opening_time, cafe.closing_time = o, c
        await db.commit()


def test_span():
    assert svc.span(time(10), time(23)) == (600, 1380)
    assert svc.span(time(18), time(4)) == (1080, 1680)
    assert svc.span(time(0), time(0)) == (0, 1440)
    assert svc.span(time(6), time(6)) == (360, 1800)


@pytest.mark.asyncio
async def test_24_7_cafe_runs_a_24_hour_drop_and_players_book_after_midnight():
    owner, cafe, tier = await _cafe_with_rig(total=4)
    await _hours(cafe.id, time(0), time(0))  # open 24 hours
    async with _client() as c:
        body = {**_rig_body(cafe, tier, start="06:00", end="06:00", seats=2, days=2), "maxHours": 5, "depositAmountLong": 200}
        r = await c.post("/api/v1/owner/drops", json=body, headers=_h(owner))
        assert r.status_code == 201, r.text
        slug = r.json()["data"]["slug"]
        drop = (await c.get(f"/api/v1/drops/{slug}")).json()["data"]
        blk = drop["blocks"][0]
        assert blk["startTime"] == "06:00" and blk["endTime"] == "30:00" and blk["hours"] == 24

        # 2 AM to 4 AM, after midnight, books into the same night's session.
        gamer = await _user(phone="9876511001")
        r = await c.post(f"/api/v1/drops/{slug}/reserve", headers=_h(gamer),
                         json={"blockId": blk["id"], "seats": 1, "startTime": "02:00", "hours": 2})
        assert r.status_code == 201, r.text
        res = r.json()["data"]["reservation"]
        assert res["startTime"] == "26:00" and res["endTime"] == "28:00"
        # 11 PM for 3 hours crosses midnight inside the session.
        g2 = await _user(phone="9876511002")
        r = await c.post(f"/api/v1/drops/{slug}/reserve", headers=_h(g2),
                         json={"blockId": blk["id"], "seats": 1, "startTime": "23:00", "hours": 3})
        assert r.status_code == 201, r.text
        # Past the session end (6 AM) is refused.
        g3 = await _user(phone="9876511003")
        r = await c.post(f"/api/v1/drops/{slug}/reserve", headers=_h(g3),
                         json={"blockId": blk["id"], "seats": 1, "startTime": "05:00", "hours": 2})
        assert r.status_code == 400

        # Normal booking sees the kept seats all day, including the small hours of the next day.
        nxt = (await c.get(f"/api/v1/cafes/{cafe.id}/availability", params={"tier_id": str(tier.id), "date": str(DAY + timedelta(days=1))})).json()["data"]
        assert {"startTime": "00:00:00", "endTime": "06:00:00", "seatsCount": 2} in nxt["bookedSlots"]
        assert {"startTime": "06:00:00", "endTime": "24:00:00", "seatsCount": 2} in nxt["bookedSlots"]


@pytest.mark.asyncio
async def test_overnight_drop_inside_overnight_cafe_hours_and_outside_refused():
    owner, cafe, tier = await _cafe_with_rig(total=4)
    await _hours(cafe.id, time(12), time(4))  # noon to 4 AM
    async with _client() as c:
        ok = await c.post("/api/v1/owner/drops", json=_rig_body(cafe, tier, start="18:00", end="03:00", seats=2), headers=_h(owner))
        assert ok.status_code == 201, ok.text
        late = await c.post("/api/v1/owner/drops", json=_rig_body(cafe, tier, start="20:00", end="06:00", seats=1), headers=_h(owner))
        assert late.status_code == 400 and "OUTSIDE_CAFE_HOURS" in late.text
        # Seats clash after midnight with the first drop: only 2 of 4 left from 18:00 to 03:00.
        clash = await c.post("/api/v1/owner/drops", json=_rig_body(cafe, tier, start="01:00", end="03:00", seats=3), headers=_h(owner))
        assert clash.status_code == 400 and "SEATS_CLASH" in clash.text
