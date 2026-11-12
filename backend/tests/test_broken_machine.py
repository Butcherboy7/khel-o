"""An owner marks "PC 7" broken / fixed on an ordinary PC or console setup.

Only the owner's own name for the machine is stored; customers just see one fewer
machine bookable. Booking-time capacity and the availability screen both follow.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.models.user import User
from tests.conftest import auth_headers
from tests.test_booking_time_validation import BASE_DATE, _setup_cafe_and_gamer


async def _owner(db_session, cafe):
    return (await db_session.execute(select(User).where(User.id == cafe.owner_id))).scalars().first()


async def _call(method, url, headers, **kw):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.request(method, url, headers=headers, **kw)


async def _seats(cafe, tier):
    r = await _call("GET", f"/api/v1/cafes/{cafe.id}/availability?tier_id={tier.id}&date={BASE_DATE.isoformat()}", {})
    assert r.status_code == 200, r.text
    return r.json()["data"]["appBookableSeats"]


@pytest.mark.asyncio
async def test_marking_a_pc_broken_takes_one_seat_off_and_fixing_puts_it_back(db_session):
    cafe, tier, _gamer = await _setup_cafe_and_gamer(db_session)
    tier.total_seats = 5
    tier.app_bookable_seats = 5
    await db_session.commit()
    owner = await _owner(db_session, cafe)
    h = auth_headers(owner)
    base = f"/api/v1/cafes/{cafe.id}/tiers/{tier.id}"

    before = await _seats(cafe, tier)
    r = await _call("POST", f"{base}/broken", h, json={"label": "PC 7"})
    assert r.status_code == 201, r.text
    unit = r.json()["data"]["unit"]
    assert unit["label"] == "PC 7" and unit["status"] == "maintenance"
    assert await _seats(cafe, tier) == before - 1

    r = await _call("DELETE", f"{base}/broken/{unit['id']}", h)
    assert r.status_code == 200, r.text
    assert await _seats(cafe, tier) == before


@pytest.mark.asyncio
async def test_same_machine_twice_and_blank_names_are_refused(db_session):
    cafe, tier, _gamer = await _setup_cafe_and_gamer(db_session)
    owner = await _owner(db_session, cafe)
    h = auth_headers(owner)
    url = f"/api/v1/cafes/{cafe.id}/tiers/{tier.id}/broken"
    assert (await _call("POST", url, h, json={"label": "PC 3"})).status_code == 201
    again = await _call("POST", url, h, json={"label": "pc 3"})
    assert again.status_code == 422 and again.json()["error"]["code"] == "ALREADY_BROKEN"
    blank = await _call("POST", url, h, json={"label": "   "})
    assert blank.status_code == 422 and blank.json()["error"]["code"] == "INVALID_LABEL"


@pytest.mark.asyncio
async def test_another_owner_cannot_mark_my_machines_broken(db_session):
    cafe, tier, gamer = await _setup_cafe_and_gamer(db_session)
    r = await _call("POST", f"/api/v1/cafes/{cafe.id}/tiers/{tier.id}/broken", auth_headers(gamer), json={"label": "PC 1"})
    assert r.status_code in (401, 403)
