"""Flexible hours: pick 1-5 hours inside a session, fee 100 (up to 3h) / 200 (4-5h)
counted toward the bill, seats counted per hour, owner gives a seat away 15
minutes after the start."""
from uuid import UUID
from datetime import datetime, time, timedelta, timezone

import pytest
from sqlalchemy import update

from app.core.time import IST
from app.database import AsyncSessionLocal
from app.models.drop import Drop, DropBlock, DropReservation
from app.services import drop_service as svc

from tests.test_drops import fake_razorpay, _client, _drop, _h, _pay, _taken, _user  # noqa: F401
from app.models.user import UserRole


async def _flex(seats=2):
    drop, block, _b2, owner, cafe = await _drop(seats=seats, deposit=100)
    async with AsyncSessionLocal() as db:
        await db.execute(update(Drop).where(Drop.id == drop.id).values(max_hours=5, deposit_amount_long=200))
        await db.commit()
    return drop, block, owner


async def _book(c, drop, block, user, start="18:00", hours=1, seats=1):
    return await c.post(f"/api/v1/drops/{drop.slug}/reserve", headers=_h(user), json={
        "blockId": str(block.id), "seats": seats, "startTime": start, "hours": hours})


@pytest.mark.asyncio
async def test_fee_is_100_up_to_3_hours_and_200_for_4_or_5_and_counts_toward_bill():
    drop, block, _ = await _flex(seats=5)
    u = await _user()
    async with _client() as c:
        for hours, fee in ((1, 100), (3, 100), (4, 200), (5, 200)):
            u = await _user()
            r = await _book(c, drop, block, u, hours=hours)
            assert r.status_code == 201, r.text
            res = r.json()["data"]["reservation"]
            assert res["deposit"] == fee and res["blockPrice"] == 250 * hours
            assert res["balanceDue"] == 250 * hours - fee and res["hours"] == hours


@pytest.mark.asyncio
async def test_hours_outside_1_to_5_or_the_session_are_refused():
    drop, block, _ = await _flex()
    u = await _user()
    async with _client() as c:
        assert (await _book(c, drop, block, u, hours=6)).status_code == 400
        assert (await _book(c, drop, block, u, start="21:00", hours=3)).status_code == 400  # ends 00:00 > 23:00
        assert (await _book(c, drop, block, u, start="17:00", hours=1)).status_code == 400  # before the session
        assert (await _book(c, drop, block, u, start="18:15", hours=1)).status_code == 400  # not on the half hour
        assert (await _book(c, drop, block, u, start="18:00", hours=1.25)).status_code == 400  # odd length
        assert (await _book(c, drop, block, u, start="18:30", hours=1.5)).status_code == 201  # half hours are fine
        r = await c.post(f"/api/v1/drops/{drop.slug}/reserve", headers=_h(u), json={"blockId": str(block.id), "seats": 1})
        assert r.status_code == 400  # flexible drops need hours


@pytest.mark.asyncio
async def test_seats_are_counted_per_hour_not_per_session():
    drop, block, _ = await _flex(seats=1)
    a, b, c3 = await _user(), await _user(), await _user()
    async with _client() as c:
        assert (await _book(c, drop, block, a, start="18:00", hours=2)).status_code == 201   # 18-20
        assert (await _book(c, drop, block, b, start="19:00", hours=1)).status_code == 400   # 19-20 clashes
        assert (await _book(c, drop, block, b, start="20:00", hours=3)).status_code == 201   # 20-23 is free
        assert (await _book(c, drop, block, c3, start="22:00", hours=1)).status_code == 400
        page = (await c.get(f"/api/v1/drops/{drop.slug}")).json()["data"]["blocks"][0]
        assert page["hourFree"]["18:00"] == 0 and page["hourFree"]["20:00"] == 0 and page["hourFree"]["23:00" if "23:00" in page["hourFree"] else "22:00"] == 0


@pytest.mark.asyncio
async def test_expiry_frees_only_that_persons_hours():
    drop, block, _ = await _flex(seats=1)
    a = await _user()
    async with _client() as c:
        r = await _book(c, drop, block, a, hours=2)
        rid = UUID(r.json()["data"]["reservation"]["id"])
    async with AsyncSessionLocal() as db:
        await db.execute(update(DropReservation).where(DropReservation.id == rid).values(expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)))
        await db.commit()
        await svc.release_expired(db, drop.id)
    b = await _user()
    async with _client() as c:
        assert (await _book(c, drop, block, b, hours=2)).status_code == 201


@pytest.mark.asyncio
async def test_give_away_waits_15_minutes_keeps_the_fee_and_frees_the_seat():
    drop, block, owner = await _flex(seats=1)
    a = await _user()
    async with _client() as c:
        order = (await _book(c, drop, block, a, hours=2)).json()["data"]["order"]["orderId"]
        await _pay(c, a, order)
        rid = UUID((await c.get(f"/api/v1/drops/{drop.slug}", headers=_h(a))).json()["data"]["myReservations"][0]["id"])
        # Too early: the session is days away.
        r = await c.post(f"/api/v1/owner/drops/reservations/{rid}/give-away", headers=_h(owner))
        assert r.status_code == 400 and r.json()["error"]["code"] == "TOO_EARLY" if "error" in r.json() else r.status_code == 400
        # Move the session to 20 minutes ago: now it can be given away.
        past = datetime.now(IST) - timedelta(minutes=20)
        async with AsyncSessionLocal() as db:
            await db.execute(update(DropBlock).where(DropBlock.id == block.id).values(
                session_date=past.date(), start_time=time(0, 0), end_time=time(23, 0)))
            await db.execute(update(DropReservation).where(DropReservation.id == rid).values(
                start_time=past.time().replace(second=0, microsecond=0, tzinfo=None), end_time=time(23, 0)))
            await db.commit()
        stranger = await _user(UserRole.GAMER)
        assert (await c.post(f"/api/v1/owner/drops/reservations/{rid}/give-away", headers=_h(stranger))).status_code == 403
        r = await c.post(f"/api/v1/owner/drops/reservations/{rid}/give-away", headers=_h(owner))
        assert r.status_code == 200 and r.json()["data"]["status"] == "given_away"
    assert await _taken(block.id) == 0
    async with AsyncSessionLocal() as db:
        res = await db.get(DropReservation, rid)
        assert res.refund_id is None and res.status == "given_away"


@pytest.mark.asyncio
async def test_rolling_drop_makes_the_next_7_days_and_ends_after_its_end_date():
    from datetime import date
    from app.models.drop import Drop as D
    drop, _b, _b2, owner, cafe = await _drop(seats=2)
    today = datetime.now(IST).date()
    async with AsyncSessionLocal() as db:
        await db.execute(update(D).where(D.id == drop.id).values(
            max_hours=5, daily_start_time=time(12, 0), daily_end_time=time(23, 0), daily_seats=3,
            starts_on=today - timedelta(days=1), ends_on=today + timedelta(days=2)))
        await db.commit()
    async with _client() as c:
        d = (await c.get(f"/api/v1/drops/{drop.slug}")).json()["data"]
        dates = {b["date"] for b in d["blocks"]}
        # Today, +1, +2 exist (ends_on caps it); the earlier hand-made blocks are still there.
        assert {str(today), str(today + timedelta(days=1)), str(today + timedelta(days=2))} <= dates
        assert str(today + timedelta(days=3)) not in dates and d["rolling"] is True and d["state"] != "ended"
        # Past its end date: over, reservations refused.
        async with AsyncSessionLocal() as db:
            await db.execute(update(D).where(D.id == drop.id).values(ends_on=today - timedelta(days=1)))
            await db.commit()
        d = (await c.get(f"/api/v1/drops/{drop.slug}")).json()["data"]
        assert d["state"] == "ended"
