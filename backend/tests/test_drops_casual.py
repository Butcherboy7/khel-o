"""GTA 6 is out: a time inside the café's normal hours is a normal booking (paid in full at the café page),
and only a session outside those hours (late night / early morning launch) is reserved with the booking fee."""
from datetime import time

import pytest
from sqlalchemy import update

from app.database import AsyncSessionLocal
from app.models.cafe import Cafe
from app.models.drop import Drop, DropBlock
from app.services import drop_service as svc

from tests.test_drops import fake_razorpay, _client, _drop, _h, _user  # noqa: F401

pytestmark = pytest.mark.casual


async def _flex(start=time(18, 0), end=time(23, 0), opening=time(10, 0), closing=time(23, 0)):
    drop, block, _b2, owner, cafe = await _drop(seats=3, deposit=100)
    async with AsyncSessionLocal() as db:
        await db.execute(update(Drop).where(Drop.id == drop.id).values(max_hours=5, deposit_amount_long=200))
        await db.execute(update(DropBlock).where(DropBlock.id == block.id).values(start_time=start, end_time=end))
        await db.execute(update(Cafe).where(Cafe.id == cafe.id).values(opening_time=opening, closing_time=closing))
        await db.commit()
    return drop, block


async def _book(c, drop, block, user, start, hours=1):
    return await c.post(f"/api/v1/drops/{drop.slug}/reserve", headers=_h(user), json={
        "blockId": str(block.id), "seats": 1, "startTime": start, "hours": hours})


@pytest.mark.asyncio
async def test_normal_hours_time_is_refused_as_a_reservation():
    drop, block = await _flex()                       # café open 10:00-23:00, session 18:00-23:00
    u = await _user()
    async with _client() as c:
        r = await _book(c, drop, block, u, "19:00", 2)
        assert r.status_code == 400 and "normal booking" in r.text


@pytest.mark.asyncio
async def test_late_night_session_outside_normal_hours_is_still_a_reservation():
    drop, block = await _flex(start=time(23, 0), end=time(5, 0), closing=time(23, 0))  # 11 PM to 5 AM
    u = await _user()
    async with _client() as c:
        r = await _book(c, drop, block, u, "23:30", 2)
        assert r.status_code == 201, r.text
        assert r.json()["data"]["reservation"]["deposit"] == 100


@pytest.mark.asyncio
async def test_a_stretch_that_touches_normal_hours_is_a_normal_booking():
    drop, block = await _flex(start=time(21, 0), end=time(2, 0), closing=time(23, 0))
    u = await _user()
    async with _client() as c:
        assert (await _book(c, drop, block, u, "22:00", 2)).status_code == 400   # 22:00-00:00 starts inside hours
        assert (await _book(c, drop, block, u, "23:00", 2)).status_code == 201   # 23:00-01:00 is wholly after closing


@pytest.mark.asyncio
async def test_overnight_cafe_counts_the_early_hours_as_normal():
    # Open 10:00 to 02:00: 00:00-02:00 belongs to the night before, so it is normal too.
    drop, block = await _flex(start=time(0, 0), end=time(2, 0), opening=time(10, 0), closing=time(2, 0))
    u = await _user()
    async with _client() as c:
        assert (await _book(c, drop, block, u, "00:00", 1)).status_code == 400


@pytest.mark.asyncio
async def test_listing_says_whether_special_sessions_exist_and_gives_the_cafe_hours():
    drop, block = await _flex()                                # all inside normal hours
    late, lblock = await _flex(start=time(23, 0), end=time(5, 0))
    async with _client() as c:
        rows = {d["slug"]: d for d in (await c.get("/api/v1/drops")).json()["data"]}
        assert rows[drop.slug]["casual"] is True and rows[drop.slug]["hasSpecial"] is False
        assert rows[late.slug]["hasSpecial"] is True
        assert rows[drop.slug]["cafe"]["openingTime"] == "10:00" and rows[drop.slug]["cafe"]["closingTime"] == "23:00"


def test_helpers():
    class C:  # a café without hours set
        opening_time = None
        closing_time = None
    assert svc.normal_windows(C()) is None and svc.inside_normal(C(), 600, 700) is False
