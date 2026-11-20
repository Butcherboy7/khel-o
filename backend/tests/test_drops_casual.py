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
        assert r.json()["data"]["reservation"]["deposit"] == 250


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


# ---------------------------------------------------------------- one ledger in normal hours (2026-11-20)
from datetime import timedelta  # noqa: E402
from uuid import uuid4  # noqa: E402

from app.models.drop import DropReservation  # noqa: E402
from tests.test_drops import DAY, NOW, _cafe_with_rig, _rig_body  # noqa: E402


async def _rig_drop(start="10:00", end="23:00", seats=2, total=2):
    owner, cafe, tier = await _cafe_with_rig(total=total)
    async with _client() as c:
        r = await c.post("/api/v1/owner/drops", json={**_rig_body(cafe, tier, start, end, seats=seats), "maxHours": 5, "depositAmountLong": 200}, headers=_h(owner))
        assert r.status_code == 201, r.text
    return owner, cafe, tier


@pytest.mark.asyncio
async def test_casual_drop_no_longer_blankets_normal_hours():
    _o, _cafe, tier = await _rig_drop("10:00", "23:00", seats=2)
    async with AsyncSessionLocal() as db:
        assert await svc.dedicated_windows(db, tier.id, DAY) == []        # nothing kept at 2 PM


@pytest.mark.asyncio
async def test_casual_drop_still_keeps_its_late_night_hours():
    # Drop 10:00-23:00, but the café closes at 20:00: 20:00-23:00 is a special session and stays held.
    _o, cafe, tier = await _rig_drop("10:00", "23:00", seats=2)
    async with AsyncSessionLocal() as db:
        await db.execute(update(Cafe).where(Cafe.id == cafe.id).values(closing_time=time(20, 0)))
        await db.commit()
        wins = {(s, e, n) for s, e, n, _t in await svc.dedicated_windows(db, tier.id, DAY)}
        assert wins == {(20 * 60, 23 * 60, 2)}


@pytest.mark.asyncio
async def test_a_real_drop_reservation_in_normal_hours_still_blocks_a_normal_booking():
    _o, _cafe, tier = await _rig_drop("10:00", "23:00", seats=2)
    u = await _user()
    async with AsyncSessionLocal() as db:
        block = (await db.execute(__import__("sqlalchemy").select(DropBlock).where(
            DropBlock.session_date == DAY).order_by(DropBlock.created_at.desc()).limit(1))).scalars().first()
        if block is None:                                          # blocks are made when the date comes into view
            from app.models.drop import Drop as _D
            drop = (await db.execute(__import__("sqlalchemy").select(_D).order_by(_D.created_at.desc()).limit(1))).scalars().first()
            await svc.ensure_blocks(db, drop)
            block = (await svc.blocks_of(db, drop.id))[0]
        db.add(DropReservation(
            id=uuid4(), reference=f"R{uuid4().hex[:8]}", drop_id=block.drop_id, block_id=block.id, user_id=u.id, seats=1,
            start_time=time(14, 0), end_time=time(16, 0), hours=2, status="confirmed", block_price=500, deposit_amount=150,
            balance_due=350, expires_at=NOW() + timedelta(days=1), checkin_token=uuid4().hex))
        await db.commit()
        wins = {(s, e, n) for s, e, n, _t in await svc.dedicated_windows(db, tier.id, DAY)}
        assert (14 * 60, 16 * 60, 1) in wins


@pytest.mark.asyncio
async def test_drop_page_shows_normal_bookings_and_opens_a_week_ahead():
    from app.models.booking import Booking, BookingStatus
    owner, cafe, tier = await _rig_drop("10:00", "23:00", seats=2, total=2)
    u = await _user()
    async with AsyncSessionLocal() as db:
        db.add(Booking(
            id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=u.id, cafe_id=cafe.id,
            hardware_tier_id=tier.id, session_date=DAY, start_time=time(14, 0), end_time=time(16, 0), duration_hours=2.0,
            base_amount=200.0, discount_amount=0.0, gateway_fee=0.0, total_amount=200.0, convenience_fee=0.0,
            seats_count=1, status=BookingStatus.CONFIRMED))
        await db.commit()
        from sqlalchemy import select as _sel
        await db.execute(update(Drop).where(Drop.cafe_id == cafe.id).values(advance_hours=48))   # as on prod
        await db.commit()
        slug = (await db.execute(_sel(Drop.slug).where(Drop.cafe_id == cafe.id))).scalar_one()
    async with _client() as c:
        d = (await c.get(f"/api/v1/drops/{slug}")).json()["data"]
        blk = next(b for b in d["blocks"] if b["date"] == str(DAY))
        assert {"startTime": "14:00", "endTime": "16:00", "seatsCount": 1} in blk["bookedSlots"]
        # a casual drop opens a week ahead for normal-hours requests, whatever its 48-hour setting
        from datetime import datetime as _dt, timezone as _tz
        limit = _dt.fromisoformat(d["bookableUntil"])
        assert limit - _dt.now(_tz.utc) > timedelta(days=6, hours=20)
