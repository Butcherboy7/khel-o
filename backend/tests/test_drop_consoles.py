"""Consoles on drops: a drop can use PS5s and Xboxes together, the café can sell or block one
console without touching the others, and online players get a console of the type they picked."""
from uuid import uuid4

import pytest

from app.database import AsyncSessionLocal
from app.models.hardware_tier import HardwareTier, PlatformType
from app.services import drop_service as svc

from tests.test_drops import DAY, _cafe_with_rig, _client, _h, _user, fake_razorpay  # noqa: F401
from tests.test_drop_schedule import _drop, _on


async def _with_xbox(cafe):
    async with AsyncSessionLocal() as db:
        x = HardwareTier(id=uuid4(), cafe_id=cafe.id, name="Xbox Series X", price_per_hour=100.0, total_seats=1,
                         app_bookable_seats=1, active_seats_count=1, is_active=True, platform=PlatformType.XBOX)
        db.add(x)
        await db.commit()
    return x


async def _setup(c):
    owner, cafe, ps5 = await _cafe_with_rig(total=3)
    xbox = await _with_xbox(cafe)
    d = await _drop(c, owner, cafe, ps5)
    keys = [f"{ps5.id}:1", f"{ps5.id}:2", f"{ps5.id}:3", f"{xbox.id}:1"]
    r = await c.put(f"/api/v1/owner/drops/{d['id']}/consoles", headers=_h(owner), json={"keys": keys})
    assert r.status_code == 200, r.text
    return owner, ps5, xbox, r.json()["data"]


async def _walkin(c, owner, d, blk, start, hours, units, kind="walkin"):
    return await c.post(f"/api/v1/owner/drops/{d['id']}/offline-bookings", headers=_h(owner),
                        json={"blockId": blk, "startTime": start, "hours": hours, "units": units, "kind": kind, "name": "Walk-in"})


async def _online(c, d, blk, start, hours, phone, setup=None):
    g = await _user(phone=phone)
    body = {"blockId": blk, "seats": 1, "startTime": start, "hours": hours, **({"setup": str(setup)} if setup else {})}
    return await c.post(f"/api/v1/drops/{d['slug']}/reserve", headers=_h(g), json=body)


@pytest.mark.asyncio
async def test_a_drop_lists_ps5s_and_an_xbox_by_name():
    async with _client() as c:
        _owner, ps5, xbox, d = await _setup(c)
        assert [x["label"] for x in d["consoles"]] == ["PS5 1", "PS5 2", "PS5 3", "Xbox Series X 1"]
        assert {s["name"]: s["count"] for s in d["setups"]} == {"PS5": 3, "Xbox Series X": 1}
        assert d["seatsPerSlot"] == 4 and _on(d, DAY)[0]["seatsTotal"] == 4
        assert {s["name"] for s in d["cafeSetups"]} == {"PS5", "Xbox Series X"}


@pytest.mark.asyncio
async def test_selling_ps5_2_leaves_the_other_consoles_free():
    async with _client() as c:
        owner, ps5, xbox, d = await _setup(c)
        blk = _on(d, DAY)[0]["id"]
        r = await _walkin(c, owner, d, blk, "12:00", 3, [f"{ps5.id}:2"])
        assert r.status_code == 201, r.text
        # PS5 2 is taken for that time, so the same console again is refused...
        again = await _walkin(c, owner, d, blk, "13:00", 1, [f"{ps5.id}:2"])
        assert again.status_code == 400 and "SOLD_OUT" in again.text
        # ...but PS5 1 and the Xbox are still free.
        assert (await _walkin(c, owner, d, blk, "13:00", 1, [f"{ps5.id}:1"])).status_code == 201
        pub = (await c.get(f"/api/v1/drops/{d['slug']}")).json()["data"]
        by = _on(pub, DAY)[0]["bySetup"]
        assert by[str(ps5.id)]["hourFree"]["13:00"] == 1 and by[str(ps5.id)]["hourFree"]["16:00"] == 3
        assert by[str(xbox.id)]["hourFree"]["13:00"] == 1
        # The café's own view says which console each booking is on.
        det = (await c.get(f"/api/v1/owner/drops/{d['id']}", headers=_h(owner))).json()["data"]
        units = sorted(tuple(s["units"]) for s in _on(det, DAY)[0]["bookedSlots"])
        assert units == [(f"{ps5.id}:1",), (f"{ps5.id}:2",)]


@pytest.mark.asyncio
async def test_blocking_one_console_or_all_of_them():
    async with _client() as c:
        owner, ps5, xbox, d = await _setup(c)
        blk = _on(d, DAY)[0]["id"]
        assert (await _walkin(c, owner, d, blk, "16:00", 2, [f"{ps5.id}:3"], kind="block")).status_code == 201
        assert (await _online(c, d, blk, "16:00", 2, "9876540001")).status_code == 201
        everything = [x["key"] for x in d["consoles"]]
        r = await _walkin(c, owner, d, blk, "20:00", 2, everything, kind="block")
        assert r.status_code == 201, r.text
        assert (await _online(c, d, blk, "20:00", 1, "9876540002")).status_code == 400


@pytest.mark.asyncio
async def test_an_xbox_player_gets_the_xbox_and_it_can_sell_out_alone():
    async with _client() as c:
        owner, ps5, xbox, d = await _setup(c)
        blk = _on(d, DAY)[0]["id"]
        r = await _online(c, d, blk, "14:00", 2, "9876541001", setup=xbox.id)
        assert r.status_code == 201, r.text
        second = await _online(c, d, blk, "14:00", 2, "9876541002", setup=xbox.id)
        assert second.status_code == 400 and "SOLD_OUT" in second.text
        assert (await _online(c, d, blk, "14:00", 2, "9876541003", setup=ps5.id)).status_code == 201
        bad = await _online(c, d, blk, "14:00", 2, "9876541004", setup=uuid4())
        assert bad.status_code == 400 and "BAD_SETUP" in bad.text


@pytest.mark.asyncio
async def test_an_online_booking_moves_to_another_ps5_to_make_room_but_a_picked_one_never_moves():
    async with _client() as c:
        owner, cafe, ps5 = await _cafe_with_rig(total=2)
        d = await _drop(c, owner, cafe, ps5)  # 2 PS5s
        blk = _on(d, DAY)[0]["id"]
        assert (await _online(c, d, blk, "12:00", 2, "9876542001")).status_code == 201  # lands on PS5 1
        # The café sells PS5 1 from 1 PM: the online player is moved to PS5 2.
        assert (await _walkin(c, owner, d, blk, "13:00", 2, [f"{ps5.id}:1"])).status_code == 201
        det = (await c.get(f"/api/v1/owner/drops/{d['id']}", headers=_h(owner))).json()["data"]
        online = next(s for s in _on(det, DAY)[0]["bookedSlots"] if s["kind"] == "online")
        assert online["units"] == [f"{ps5.id}:2"]
        # Now PS5 2 at 12 PM is taken by the moved player and PS5 1 is pinned: refused.
        r = await _walkin(c, owner, d, blk, "12:00", 1, [f"{ps5.id}:2"])
        assert r.status_code == 400 and "SOLD_OUT" in r.text


@pytest.mark.asyncio
async def test_removing_a_console_with_a_picked_booking_is_refused():
    async with _client() as c:
        owner, ps5, xbox, d = await _setup(c)
        blk = _on(d, DAY)[0]["id"]
        assert (await _walkin(c, owner, d, blk, "12:00", 1, [f"{xbox.id}:1"])).status_code == 201
        r = await c.put(f"/api/v1/owner/drops/{d['id']}/consoles", headers=_h(owner), json={"keys": [f"{ps5.id}:1"]})
        assert r.status_code == 400 and "CONSOLE_IN_USE" in r.text and "Xbox Series X 1" in r.text
        r = await c.put(f"/api/v1/owner/drops/{d['id']}/consoles", headers=_h(owner),
                        json={"keys": [f"{ps5.id}:1", f"{xbox.id}:1"]})
        assert r.status_code == 200, r.text
        assert _on(r.json()["data"], DAY)[0]["seatsTotal"] == 2
        bad = await c.put(f"/api/v1/owner/drops/{d['id']}/consoles", headers=_h(owner), json={"keys": [f"{ps5.id}:9"]})
        assert bad.status_code == 400 and "BAD_CONSOLE" in bad.text


@pytest.mark.asyncio
async def test_normal_booking_only_loses_the_consoles_the_drop_keeps():
    async with _client() as c:
        owner, ps5, xbox, d = await _setup(c)
        async with AsyncSessionLocal() as db:
            assert {n for _s, _e, n, _t in await svc.dedicated_windows(db, xbox.id, DAY)} == {1}
            assert {n for _s, _e, n, _t in await svc.dedicated_windows(db, ps5.id, DAY)} == {3}


def test_fitting_keeps_picked_consoles_and_moves_the_rest():
    keys = ["a:1", "a:2"]
    items = [{"id": "x", "s": 0, "e": 120, "n": 1, "fixed": None, "cur": ["a:1"], "allowed": keys},
             {"id": "y", "s": 60, "e": 180, "n": 1, "fixed": ["a:1"], "cur": ["a:1"], "allowed": keys}]
    assert svc.fit_consoles(keys, items) == {"y": ["a:1"], "x": ["a:2"]}
    items.append({"id": "z", "s": 30, "e": 90, "n": 1, "fixed": None, "cur": [], "allowed": keys})
    assert svc.fit_consoles(keys, items) is None
