"""The café sold GTA 6 seats itself and took the cash: the app must stop offering those seats."""
from uuid import UUID

import pytest
from sqlalchemy import update

from app.database import AsyncSessionLocal
from app.models.drop import Drop

from tests.test_drops import fake_razorpay, _client, _drop, _h, _pay, _taken, _user  # noqa: F401


async def _offline(c, owner, drop, block, **kw):
    body = {"blockId": str(block.id), "name": "Ravi", "phone": "9876543210", "seats": 1}
    body.update(kw)
    return await c.post(f"/api/v1/owner/drops/{drop.id}/offline-bookings", headers=_h(owner), json=body)


@pytest.mark.asyncio
async def test_offline_seats_hold_the_seat_and_block_online_buyers():
    drop, block, _b2, owner, cafe = await _drop(seats=2, deposit=100)
    gamer = await _user()
    async with _client() as c:
        r = await _offline(c, owner, drop, block, seats=2, amount=1500)
        assert r.status_code == 201, r.text
        assert r.json()["data"]["status"] == "confirmed"
        # Sold out online now.
        r2 = await c.post(f"/api/v1/drops/{drop.slug}/reserve", headers=_h(gamer), json={"blockId": str(block.id), "seats": 1})
        assert r2.status_code == 400
        detail = (await c.get(f"/api/v1/owner/drops/{drop.id}", headers=_h(owner))).json()["data"]
        t = detail["totals"]
        assert t["offlineBookings"] == 1 and t["offlineSeats"] == 2 and t["offlineCollected"] == 1500
        # Online money untouched.
        assert t["depositsCollected"] == 0
        row = detail["blocks"][0]["reservations"][0]
        assert row["name"] == "Ravi" and row["source"] == "offline"


@pytest.mark.asyncio
async def test_removing_an_offline_seat_frees_it_and_only_the_cafe_can():
    drop, block, _b2, owner, cafe = await _drop(seats=1, deposit=100)
    other = await _user()
    async with _client() as c:
        rid = (await _offline(c, owner, drop, block)).json()["data"]["id"]
        assert (await _offline(c, owner, drop, block)).status_code == 400  # no seat left
        assert (await c.post(f"/api/v1/owner/drops/reservations/{rid}/remove-offline", headers=_h(other))).status_code in (401, 403)
        assert (await c.post(f"/api/v1/owner/drops/reservations/{rid}/remove-offline", headers=_h(owner))).status_code == 200
        assert (await _offline(c, owner, drop, block)).status_code == 201  # free again


@pytest.mark.asyncio
async def test_offline_name_is_optional_phone_must_be_real_and_other_cafes_are_refused():
    drop, block, _b2, owner, cafe = await _drop(seats=3, deposit=100)
    stranger = await _user()
    async with _client() as c:
        # Just marking hours booked: no name needed, it reads "Booked at the café".
        quick = await _offline(c, owner, drop, block, name="  ")
        assert quick.status_code == 201, quick.text
        assert (await _offline(c, owner, drop, block, phone="12")).status_code == 400
        assert (await _offline(c, owner, drop, block, phone=None)).status_code == 201
        assert (await _offline(c, stranger, drop, block)).status_code in (401, 403)


@pytest.mark.asyncio
async def test_cancelling_the_drop_does_not_try_to_refund_offline_seats():
    drop, block, _b2, owner, cafe = await _drop(seats=3, deposit=100)
    async with _client() as c:
        await _offline(c, owner, drop, block)
        r = await c.post(f"/api/v1/owner/drops/{drop.id}/cancel", headers=_h(owner))
        assert r.status_code == 200, r.text
        assert r.json()["data"]["failed"] == 0


@pytest.mark.asyncio
async def test_offline_seat_does_not_appear_in_the_owners_own_customer_bookings():
    drop, block, _b2, owner, cafe = await _drop(seats=3, deposit=100)
    async with _client() as c:
        await _offline(c, owner, drop, block)
        mine = (await c.get("/api/v1/drops/me/reservations", headers=_h(owner))).json()["data"]
        assert mine == []
        lst = (await c.get("/api/v1/owner/drops/reservations", headers=_h(owner))).json()["data"]
        assert lst and lst[0]["name"] == "Ravi" and lst[0]["source"] == "offline"
