"""Package prices (1 hr 250, 3 hrs 650, 5 hrs 850) and time-of-day prices on drops."""
from datetime import time, timedelta

import pytest

from app.database import AsyncSessionLocal
from app.models.cafe import Cafe

from tests.test_drops import DAY, _cafe_with_rig, _client, _h, _rig_body, _user, fake_razorpay  # noqa: F401

PACKS = [{"hours": 1, "price": 250}, {"hours": 3, "price": 650}, {"hours": 5, "price": 850}]


async def _open24(cafe_id):
    async with AsyncSessionLocal() as db:
        cafe = await db.get(Cafe, cafe_id)
        cafe.opening_time, cafe.closing_time = time(0), time(0)
        await db.commit()


async def _drop(c, owner, cafe, tier, **extra):
    body = {**_rig_body(cafe, tier, start="10:00", end="23:00", seats=2, days=2), "maxHours": 5,
            "depositAmount": 150, "depositAmountLong": 200, **extra}
    r = await c.post("/api/v1/owner/drops", json=body, headers=_h(owner))
    assert r.status_code == 201, r.text
    return r.json()["data"]


async def _reserve(c, slug, blk, start, hours, phone):
    g = await _user(phone=phone)
    return await c.post(f"/api/v1/drops/{slug}/reserve", headers=_h(g),
                        json={"blockId": blk, "seats": 1, "startTime": start, "hours": hours})


@pytest.mark.asyncio
async def test_packages_set_the_price_and_only_those_lengths_book():
    owner, cafe, tier = await _cafe_with_rig(total=4)
    async with _client() as c:
        d = await _drop(c, owner, cafe, tier, lengthPrices=PACKS)
        assert d["lengthPrices"] == PACKS and d["maxHours"] == 5
        blk = d["blocks"][0]["id"]
        r = await _reserve(c, d["slug"], blk, "12:00", 3, "9876520001")
        assert r.status_code == 201, r.text
        res = r.json()["data"]["reservation"]
        assert res["blockPrice"] == 650 and res["deposit"] == 150 and res["balanceDue"] == 500
        r = await _reserve(c, d["slug"], blk, "16:00", 5, "9876520002")
        assert r.json()["data"]["reservation"]["blockPrice"] == 850
        r = await _reserve(c, d["slug"], blk, "12:00", 2, "9876520003")
        assert r.status_code == 400 and "BAD_HOURS" in r.text


@pytest.mark.asyncio
async def test_time_prices_change_the_hours_inside_them():
    owner, cafe, tier = await _cafe_with_rig(total=4)
    await _open24(cafe.id)
    async with _client() as c:
        bands = [{"start": "00:00", "end": "06:00", "perHour": 200}, {"start": "18:00", "end": "20:00", "perHour": 350}]
        d = await _drop(c, owner, cafe, tier, dailyStartTime="06:00", dailyEndTime="06:00", timePrices=bands)
        blk = d["blocks"][1]["id"]  # a full day (06:00 to 06:00)
        # 7 PM for 2 hours: 1 peak hour (350) + 1 normal (250)
        r = await _reserve(c, d["slug"], blk, "19:00", 2, "9876521001")
        assert r.json()["data"]["reservation"]["blockPrice"] == 600
        # 11 PM for 3 hours: 1 normal + 2 late-night hours
        r = await _reserve(c, d["slug"], blk, "23:00", 3, "9876521002")
        assert r.json()["data"]["reservation"]["blockPrice"] == 650


@pytest.mark.asyncio
async def test_packages_and_time_prices_together_and_bad_input():
    owner, cafe, tier = await _cafe_with_rig(total=4)
    await _open24(cafe.id)
    async with _client() as c:
        d = await _drop(c, owner, cafe, tier, dailyStartTime="06:00", dailyEndTime="06:00", lengthPrices=PACKS,
                        timePrices=[{"start": "00:00", "end": "06:00", "perHour": 200}])
        r = await _reserve(c, d["slug"], d["blocks"][1]["id"], "01:00", 3, "9876522001")
        assert r.json()["data"]["reservation"]["blockPrice"] == 500  # 650 package, 3 late hours at 50 less
        bad = await c.patch(f"/api/v1/owner/drops/{d['id']}", headers=_h(owner),
                            json={"timePrices": [{"start": "00:00", "end": "06:00", "perHour": 200}, {"start": "05:00", "end": "07:00", "perHour": 300}]})
        assert bad.status_code == 400 and "overlap" in bad.text
        ok = await c.patch(f"/api/v1/owner/drops/{d['id']}", headers=_h(owner), json={"lengthPrices": [{"hours": 2, "price": 450}], "timePrices": []})
        assert ok.status_code == 200, ok.text
        assert ok.json()["data"]["maxHours"] == 2 and ok.json()["data"]["timePrices"] == []
