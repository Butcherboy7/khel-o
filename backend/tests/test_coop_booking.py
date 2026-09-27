"""
Co-op (friends sharing one console) pricing and per-setup booking length,
through the real booking endpoint.

A booking is co-op when playersCount > seatsCount. It holds one unit and is
priced (price_per_hour + coop_extra_player_price * (players - 1)) * hours.
"""
import pytest
from datetime import datetime, time

from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.time import IST
from tests.conftest import auth_headers
from tests.test_booking_time_validation import BASE_DATE, _freeze_now, _setup_cafe_and_gamer


async def _book(tier, cafe, gamer, **extra):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.post(
            "/api/v1/bookings",
            json={
                "cafeId": str(cafe.id),
                "hardwareTierId": str(tier.id),
                "sessionDate": BASE_DATE.isoformat(),
                "startTime": "12:00:00",
                **extra,
            },
            headers=auth_headers(gamer),
        )


async def _setup(db_session, monkeypatch, **tier_fields):
    cafe, tier, gamer = await _setup_cafe_and_gamer(db_session)
    for k, v in tier_fields.items():
        setattr(tier, k, v)
    await db_session.commit()
    _freeze_now(monkeypatch, datetime.combine(BASE_DATE, time(10, 0)).replace(tzinfo=IST))
    return cafe, tier, gamer


@pytest.mark.asyncio
async def test_coop_priced_per_extra_player_and_holds_one_unit(db_session, monkeypatch):
    cafe, tier, gamer = await _setup(db_session, monkeypatch, coop_enabled=True, coop_max_players=2, coop_extra_player_price=60)
    resp = await _book(tier, cafe, gamer, durationHours=2, seatsCount=1, playersCount=2)
    assert resp.status_code == 201, resp.json()
    body = resp.json()["data"]["booking"]
    assert body["seatsCount"] == 1
    assert body["playersCount"] == 2
    assert float(body["baseAmount"]) == 320.0  # (100 + 60) * 2h


@pytest.mark.asyncio
async def test_coop_refused_when_owner_has_not_enabled_it(db_session, monkeypatch):
    cafe, tier, gamer = await _setup(db_session, monkeypatch)
    resp = await _book(tier, cafe, gamer, durationHours=1, seatsCount=1, playersCount=2)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "COOP_NOT_ALLOWED"


@pytest.mark.asyncio
async def test_coop_refused_above_max_players(db_session, monkeypatch):
    cafe, tier, gamer = await _setup(db_session, monkeypatch, coop_enabled=True, coop_max_players=2)
    resp = await _book(tier, cafe, gamer, durationHours=1, seatsCount=1, playersCount=3)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "COOP_TOO_MANY_PLAYERS"


@pytest.mark.asyncio
async def test_own_consoles_price_unchanged(db_session, monkeypatch):
    cafe, tier, gamer = await _setup(db_session, monkeypatch, coop_enabled=True, coop_extra_player_price=60)
    resp = await _book(tier, cafe, gamer, durationHours=2, seatsCount=2, playersCount=2)
    assert resp.status_code == 201, resp.json()
    assert float(resp.json()["data"]["booking"]["baseAmount"]) == 400.0  # 100 * 2h * 2 consoles


@pytest.mark.asyncio
async def test_fifteen_minute_setup_accepts_quarter_hour(db_session, monkeypatch):
    cafe, tier, gamer = await _setup(db_session, monkeypatch, min_booking_minutes=15)
    resp = await _book(tier, cafe, gamer, durationHours=0.25)
    assert resp.status_code == 201, resp.json()
    assert float(resp.json()["data"]["booking"]["baseAmount"]) == 25.0


@pytest.mark.asyncio
@pytest.mark.parametrize("hours", [0.5, 1.1])
async def test_duration_below_minimum_or_off_step_refused(db_session, monkeypatch, hours):
    cafe, tier, gamer = await _setup(db_session, monkeypatch)  # default 60 min minimum
    resp = await _book(tier, cafe, gamer, durationHours=hours)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "INVALID_DURATION"
