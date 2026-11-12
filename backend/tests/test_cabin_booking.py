"""
Cabins (private rooms), e.g. Wild Gaming: a room fee per hour plus a price per PC
used inside, booked as ONE room however many PCs the group uses.

Stored with the co-op fields: price_per_hour = room fee + one PC (300 + 150 = 450),
coop_extra_player_price = one more PC (150), coop_max_players = PCs in the room (5).
"""
import pytest
from datetime import datetime, time

from tests.test_booking_time_validation import BASE_DATE, _freeze_now  # noqa: F401
from tests.test_coop_booking import _book, _setup

CABIN = dict(
    is_room=True,
    coop_enabled=True,
    coop_max_players=5,
    coop_extra_player_price=150,
    price_per_hour=450,
    total_seats=2,
    app_bookable_seats=2,
)


@pytest.mark.asyncio
@pytest.mark.parametrize("pcs, expected", [(1, 450.0), (2, 600.0), (3, 750.0), (5, 1050.0)])
async def test_cabin_is_room_fee_plus_each_pc_for_one_hour(db_session, monkeypatch, pcs, expected):
    cafe, tier, gamer = await _setup(db_session, monkeypatch, **CABIN)
    resp = await _book(tier, cafe, gamer, durationHours=1, seatsCount=1, playersCount=pcs)
    assert resp.status_code == 201, resp.json()
    body = resp.json()["data"]["booking"]
    assert body["seatsCount"] == 1  # one room, whatever the PC count
    assert float(body["baseAmount"]) == expected


@pytest.mark.asyncio
async def test_cabin_thirty_minutes_is_half_of_the_hourly_price(db_session, monkeypatch):
    cafe, tier, gamer = await _setup(db_session, monkeypatch, min_booking_minutes=30, **CABIN)
    resp = await _book(tier, cafe, gamer, durationHours=0.5, seatsCount=1, playersCount=2)
    assert resp.status_code == 201, resp.json()
    assert float(resp.json()["data"]["booking"]["baseAmount"]) == 300.0  # half of 600


@pytest.mark.asyncio
async def test_cabin_refuses_more_pcs_than_the_room_holds(db_session, monkeypatch):
    cafe, tier, gamer = await _setup(db_session, monkeypatch, **CABIN)
    resp = await _book(tier, cafe, gamer, durationHours=1, seatsCount=1, playersCount=6)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "COOP_TOO_MANY_PLAYERS"
    assert "cabin" in resp.json()["error"]["message"].lower()


@pytest.mark.asyncio
async def test_cabin_never_books_two_rooms_for_two_players(db_session, monkeypatch):
    cafe, tier, gamer = await _setup(db_session, monkeypatch, **CABIN)
    resp = await _book(tier, cafe, gamer, durationHours=1, seatsCount=2, playersCount=2)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "ROOM_ONE_UNIT"
