"""Event schedule on drops: hours per date (several stretches, closed days), price windows with a
shortest booking, prices per date, the booking-ahead limit, and café blocks."""
from datetime import date, time, timedelta

import pytest

from app.database import AsyncSessionLocal
from app.models.drop import Drop
from app.services import drop_service as svc

from tests.test_drops import DAY, _cafe_with_rig, _client, _h, _rig_body, _user, fake_razorpay  # noqa: F401
from tests.test_drop_prices import _open24


async def _drop(c, owner, cafe, tier, **extra):
    body = {**_rig_body(cafe, tier, start="10:00", end="23:00", seats=2, days=3), "maxHours": 8,
            "depositAmount": 150, "depositAmountLong": 200, **extra}
    r = await c.post("/api/v1/owner/drops", json=body, headers=_h(owner))
    assert r.status_code == 201, r.text
    return r.json()["data"]


async def _reserve(c, slug, blk, start, hours, phone):
    g = await _user(phone=phone)
    return await c.post(f"/api/v1/drops/{slug}/reserve", headers=_h(g),
                        json={"blockId": blk, "seats": 1, "startTime": start, "hours": hours})


async def _schedule(c, owner, d, **body):
    return await c.put(f"/api/v1/owner/drops/{d['id']}/schedule", headers=_h(owner), json=body)


def _on(data, day):
    return [b for b in data["blocks"] if b["date"] == day.isoformat()]


@pytest.mark.asyncio
async def test_a_date_can_have_two_stretches_or_be_closed_and_bookings_stay_inside():
    owner, cafe, tier = await _cafe_with_rig(total=4)
    await _open24(cafe.id)
    async with _client() as c:
        d = await _drop(c, owner, cafe, tier)
        d2, d3 = DAY + timedelta(days=1), DAY + timedelta(days=2)
        r = await _schedule(c, owner, d, dates=[d2.isoformat()], hours=[{"start": "10:00", "end": "14:00"}, {"start": "18:00", "end": "02:00"}])
        assert r.status_code == 200, r.text
        got = _on(r.json()["data"], d2)
        assert [(b["startTime"], b["endTime"]) for b in got] == [("10:00", "14:00"), ("18:00", "26:00")]
        r = await _schedule(c, owner, d, dates=[d3.isoformat()], hours=[])
        assert _on(r.json()["data"], d3) == []
        # Players see the same.
        pub = (await c.get(f"/api/v1/drops/{d['slug']}")).json()["data"]
        assert len(_on(pub, d2)) == 2 and _on(pub, d3) == []
        # 3 PM is not open on that date; 7 PM to 1 AM is.
        late = got[1]["id"]
        assert (await _reserve(c, d["slug"], got[0]["id"], "13:00", 2, "9876530001")).status_code == 400
        ok = await _reserve(c, d["slug"], late, "23:00", 2, "9876530002")
        assert ok.status_code == 201, ok.text
        # Overlapping stretches are refused.
        bad = await _schedule(c, owner, d, dates=[d2.isoformat()], hours=[{"start": "10:00", "end": "14:00"}, {"start": "13:00", "end": "16:00"}])
        assert bad.status_code == 400 and "HOURS_OVERLAP" in bad.text


@pytest.mark.asyncio
async def test_changing_hours_never_drops_a_booking():
    owner, cafe, tier = await _cafe_with_rig(total=4)
    async with _client() as c:
        d = await _drop(c, owner, cafe, tier)
        blk = _on(d, DAY)[0]["id"]
        assert (await _reserve(c, d["slug"], blk, "12:00", 2, "9876531001")).status_code == 201
        # Closing the date, or cutting the booked hours, is refused.
        r = await _schedule(c, owner, d, dates=[DAY.isoformat()], hours=[])
        assert r.status_code == 400 and "HAS_BOOKINGS" in r.text
        r = await _schedule(c, owner, d, dates=[DAY.isoformat()], hours=[{"start": "13:00", "end": "23:00"}])
        assert r.status_code == 400 and "HAS_BOOKINGS" in r.text
        # Opening earlier and closing sooner around the booking is fine; the booking keeps its times.
        r = await _schedule(c, owner, d, dates=[DAY.isoformat()], hours=[{"start": "11:00", "end": "15:00"}])
        assert r.status_code == 200, r.text
        b = _on(r.json()["data"], DAY)
        assert [(x["startTime"], x["endTime"]) for x in b] == [("11:00", "15:00")]
        res = b[0]["reservations"][0]
        assert (res["startTime"], res["endTime"]) == ("12:00", "14:00")
        # Back to the usual hours.
        r = await _schedule(c, owner, d, dates=[DAY.isoformat()], useDefaultHours=True)
        assert [(x["startTime"], x["endTime"]) for x in _on(r.json()["data"], DAY)] == [("10:00", "23:00")]


@pytest.mark.asyncio
async def test_price_windows_split_the_bill_and_set_the_shortest_booking():
    owner, cafe, tier = await _cafe_with_rig(total=4)
    await _open24(cafe.id)
    async with _client() as c:
        bands = [{"start": "00:00", "end": "06:00", "perHour": 300, "minHours": 3},
                 {"start": "06:00", "end": "12:00", "perHour": 200}]
        d = await _drop(c, owner, cafe, tier, dailyStartTime="00:00", dailyEndTime="23:00", timePrices=bands)
        assert d["timePrices"][0]["minHours"] == 3
        blk = _on(d, DAY)[0]["id"]
        # 5 AM to 8 AM: 1 hour at 300 + 2 at 200 = 700. Starts in the 3-hour window, so 3 hours is fine.
        r = await _reserve(c, d["slug"], blk, "05:00", 3, "9876532001")
        assert r.status_code == 201, r.text
        assert r.json()["data"]["reservation"]["blockPrice"] == 700
        r = await _reserve(c, d["slug"], blk, "02:00", 2, "9876532002")
        assert r.status_code == 400 and "BELOW_MIN" in r.text and "3 hours" in r.text
        # Starting at 7 AM the shortest is 1 hour.
        assert (await _reserve(c, d["slug"], blk, "07:00", 1, "9876532003")).status_code == 201


@pytest.mark.asyncio
async def test_one_date_can_have_its_own_prices_and_a_tampered_price_is_ignored():
    owner, cafe, tier = await _cafe_with_rig(total=4)
    async with _client() as c:
        d = await _drop(c, owner, cafe, tier)
        d2 = DAY + timedelta(days=1)
        r = await _schedule(c, owner, d, dates=[d2.isoformat()], prices=[{"start": "18:00", "end": "21:00", "perHour": 400}])
        assert r.status_code == 200, r.text
        assert _on(r.json()["data"], d2)[0]["timePrices"][0]["perHour"] == 400
        assert _on(r.json()["data"], DAY)[0]["timePrices"] == []
        g = await _user(phone="9876533001")
        res = await c.post(f"/api/v1/drops/{d['slug']}/reserve", headers=_h(g),
                           json={"blockId": _on(r.json()["data"], d2)[0]["id"], "seats": 1, "startTime": "18:00", "hours": 2,
                                 "price": 1, "blockPrice": 1})
        assert res.status_code == 201, res.text
        assert res.json()["data"]["reservation"]["blockPrice"] == 800  # server price, not the one sent
        same = await _reserve(c, d["slug"], _on(r.json()["data"], DAY)[0]["id"], "18:00", 2, "9876533002")
        assert same.json()["data"]["reservation"]["blockPrice"] == 500


@pytest.mark.asyncio
async def test_booking_ahead_limit_switches_on_from_its_date():
    owner, cafe, tier = await _cafe_with_rig(total=4)
    async with _client() as c:
        d = await _drop(c, owner, cafe, tier)
        blk = _on(d, DAY)[0]["id"]  # 10 days ahead
        later = (date.today() + timedelta(days=30)).isoformat()
        r = await c.patch(f"/api/v1/owner/drops/{d['id']}", headers=_h(owner), json={"advanceHours": 48, "advanceFrom": later})
        assert r.status_code == 200 and r.json()["data"]["bookableUntil"] is None
        assert (await _reserve(c, d["slug"], blk, "12:00", 1, "9876534001")).status_code == 201
        r = await c.patch(f"/api/v1/owner/drops/{d['id']}", headers=_h(owner), json={"advanceFrom": None})
        assert r.json()["data"]["advanceHours"] == 48 and r.json()["data"]["bookableUntil"]
        r = await _reserve(c, d["slug"], blk, "15:00", 1, "9876534002")
        assert r.status_code == 400 and "ADVANCE_LIMIT" in r.text and "48 hours" in r.text
        # The café itself can still write a phone booking further ahead.
        w = await c.post(f"/api/v1/owner/drops/{d['id']}/offline-bookings", headers=_h(owner),
                         json={"blockId": blk, "seats": 1, "startTime": "18:00", "hours": 2})
        assert w.status_code == 201, w.text


@pytest.mark.asyncio
async def test_blocked_hours_are_not_sold_not_counted_as_money_and_can_be_freed():
    owner, cafe, tier = await _cafe_with_rig(total=4)
    async with _client() as c:
        d = await _drop(c, owner, cafe, tier, dailySeats=1)
        blk = _on(d, DAY)[0]["id"]
        r = await c.post(f"/api/v1/owner/drops/{d['id']}/offline-bookings", headers=_h(owner),
                         json={"blockId": blk, "seats": 1, "startTime": "14:00", "hours": 2, "kind": "block", "note": "Cleaning"})
        assert r.status_code == 201, r.text
        bid = r.json()["data"]["id"]
        assert r.json()["data"]["blockPrice"] == 0
        full = await _reserve(c, d["slug"], blk, "15:00", 1, "9876535001")
        assert full.status_code == 400 and "SOLD_OUT" in full.text
        detail = (await c.get(f"/api/v1/owner/drops/{d['id']}", headers=_h(owner))).json()["data"]
        kinds = [s["kind"] for s in _on(detail, DAY)[0]["bookedSlots"]]
        assert kinds == ["blocked"]
        assert detail["totals"]["paidReservations"] == 0 and detail["totals"]["offlineCollected"] == 0
        lst = (await c.get("/api/v1/owner/drops/reservations", headers=_h(owner))).json()["data"]
        assert lst == []
        assert (await c.post(f"/api/v1/owner/drops/reservations/{bid}/remove-offline", headers=_h(owner))).status_code == 200
        assert (await _reserve(c, d["slug"], blk, "15:00", 1, "9876535002")).status_code == 201


@pytest.mark.asyncio
async def test_normal_cafe_booking_follows_each_dates_hours():
    owner, cafe, tier = await _cafe_with_rig(total=4)
    await _open24(cafe.id)
    async with _client() as c:
        d = await _drop(c, owner, cafe, tier)
        d2 = DAY + timedelta(days=1)
        await _schedule(c, owner, d, dates=[d2.isoformat()], hours=[{"start": "20:00", "end": "03:00"}])
        await _schedule(c, owner, d, dates=[DAY.isoformat()], hours=[])
    async with AsyncSessionLocal() as db:
        assert await svc.dedicated_windows(db, tier.id, DAY) == []
        w2 = await svc.dedicated_windows(db, tier.id, d2)
        assert [(s, e) for s, e, *_ in w2] == [(1200, 1440)]
        w3 = await svc.dedicated_windows(db, tier.id, d2 + timedelta(days=1))
        assert (0, 180) in [(s, e) for s, e, *_ in w3]


@pytest.mark.asyncio
async def test_a_night_cannot_run_into_the_next_dates_opening():
    owner, cafe, tier = await _cafe_with_rig(total=4)
    await _open24(cafe.id)
    async with _client() as c:
        d = await _drop(c, owner, cafe, tier)
        d2 = DAY + timedelta(days=1)
        await _schedule(c, owner, d, dates=[d2.isoformat()], hours=[{"start": "08:00", "end": "23:00"}])
        r = await _schedule(c, owner, d, dates=[DAY.isoformat()], hours=[{"start": "20:00", "end": "10:00"}])
        assert r.status_code == 400 and "HOURS_OVERLAP" in r.text
    async with AsyncSessionLocal() as db:
        drop = await db.get(Drop, __import__("uuid").UUID(d["id"]))
        assert svc.day_intervals(drop, DAY) == [(600, 1380)]  # unchanged
