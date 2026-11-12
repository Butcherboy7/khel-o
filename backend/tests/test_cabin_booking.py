"""
Cabins (private rooms), e.g. Wild Gaming: a room fee per hour plus a price per PC
used inside, booked as ONE room however many PCs the group uses.

Stored with the co-op fields: price_per_hour = room fee + one PC (300 + 150 = 450),
coop_extra_player_price = one more PC (150), coop_max_players = PCs in the room (5).
"""
import uuid
import pytest
from datetime import datetime, time, timedelta, timezone

from app.models.promotion import Promotion, PromotionType

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


def _offer(cafe, tier, **kw):
    # The booked day (BASE_DATE) is fixed, so the offer's window is built around it.
    # (and the real today, which the offer lookup also checks).
    now = datetime.now(timezone.utc)
    base = dict(
        id=uuid.uuid4(), cafe_id=cafe.id, title="Deal", applicable_tier_id=tier.id,
        valid_from=datetime.combine(BASE_DATE, time(0, 0)).replace(tzinfo=timezone.utc) - timedelta(days=1),
        valid_until=now + timedelta(days=60),
        days_of_week=[0, 1, 2, 3, 4, 5, 6], start_hour=0, end_hour=24,
        max_uses=None, current_uses=0, is_active=True, khelo_code=None, play_mode="any",
    )
    base.update(kw)
    return Promotion(**base)


def _fixed(cafe, tier, hours, price, **kw):
    return _offer(
        cafe, tier, promotion_type=PromotionType.FIXED_PRICE,
        fixed_price_amount=price, min_duration_hours=hours, **kw,
    )


@pytest.mark.asyncio
async def test_fixed_price_deal_does_not_apply_to_a_five_pc_cabin(db_session, monkeypatch):
    """'3 hours for 400' is priced for one PC. Five PCs for 3 hours is 3150, not 400."""
    cafe, tier, gamer = await _setup(db_session, monkeypatch, **CABIN)
    db_session.add(_fixed(cafe, tier, 3, 400))
    await db_session.commit()
    resp = await _book(tier, cafe, gamer, durationHours=3, seatsCount=1, playersCount=5)
    assert resp.status_code == 201, resp.json()
    body = resp.json()["data"]["booking"]
    assert float(body["baseAmount"]) == 3150.0
    assert float(body["discountAmount"]) == 0.0


@pytest.mark.asyncio
async def test_fixed_price_deal_still_applies_to_one_pc_in_a_cabin(db_session, monkeypatch):
    cafe, tier, gamer = await _setup(db_session, monkeypatch, **CABIN)
    db_session.add(_fixed(cafe, tier, 3, 400))
    await db_session.commit()
    resp = await _book(tier, cafe, gamer, durationHours=3, seatsCount=1, playersCount=1)
    assert resp.status_code == 201, resp.json()
    body = resp.json()["data"]["booking"]
    assert float(body["baseAmount"]) - float(body["discountAmount"]) == 400.0


@pytest.mark.asyncio
async def test_percentage_offer_still_applies_to_a_full_cabin(db_session, monkeypatch):
    cafe, tier, gamer = await _setup(db_session, monkeypatch, **CABIN)
    db_session.add(_offer(cafe, tier, promotion_type=PromotionType.PERCENTAGE, discount_percentage=10, min_booking_minutes=60))
    await db_session.commit()
    resp = await _book(tier, cafe, gamer, durationHours=1, seatsCount=1, playersCount=5)
    assert resp.status_code == 201, resp.json()
    assert float(resp.json()["data"]["booking"]["discountAmount"]) == 105.0  # 10% of 1050


async def _owner_get(db_session, cafe, path):
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.models.user import User
    from tests.conftest import auth_headers
    owner = await db_session.get(User, cafe.owner_id)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.get(path, headers=auth_headers(owner))


@pytest.mark.asyncio
async def test_owner_is_told_how_many_pcs_a_cabin_booking_needs(db_session, monkeypatch):
    cafe, tier, gamer = await _setup(db_session, monkeypatch, **CABIN)
    resp = await _book(tier, cafe, gamer, durationHours=1, seatsCount=1, playersCount=4)
    assert resp.status_code == 201, resp.json()
    body = resp.json()["data"]["booking"]
    assert body["playersCount"] == 4

    listing = await _owner_get(db_session, cafe, "/api/v1/owner/bookings")
    assert listing.status_code == 200, listing.text
    row = listing.json()["data"]["items"][0]
    assert row["seatsCount"] == 1
    assert row["playersCount"] == 4
    assert row["isRoom"] is True


@pytest.mark.asyncio
async def test_a_hall_pc_booking_is_not_marked_as_a_cabin(db_session, monkeypatch):
    cafe, tier, gamer = await _setup(db_session, monkeypatch)
    resp = await _book(tier, cafe, gamer, durationHours=1, seatsCount=2)
    assert resp.status_code == 201, resp.json()
    listing = await _owner_get(db_session, cafe, "/api/v1/owner/bookings")
    row = listing.json()["data"]["items"][0]
    assert row["isRoom"] is False
    assert row["seatsCount"] == 2


@pytest.mark.asyncio
async def test_a_cabin_only_cafe_is_not_badged_co_op(db_session, monkeypatch):
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    cafe, tier, gamer = await _setup(db_session, monkeypatch, **CABIN)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/api/v1/cafes/{cafe.id}")
    assert resp.status_code == 200, resp.text
    # The café page lists its setups: the cabin says it is a room, and is not a co-op console.
    tiers = resp.json()["data"]["cafe"].get("hardwareTiers") or resp.json()["data"]["cafe"].get("tiers") or []
    cabin = [t for t in tiers if str(t["id"]) == str(tier.id)]
    assert cabin and cabin[0]["isRoom"] is True


@pytest.mark.asyncio
async def test_cabin_does_not_make_a_cafe_show_the_co_op_badge(db_session, monkeypatch):
    from app.repositories.cafe_repository import CafeRepository
    cafe, tier, gamer = await _setup(db_session, monkeypatch, **CABIN)
    rows, _total = await CafeRepository(db_session).flex_search_verified(query=cafe.name, limit=50)
    mine = [r for r in rows if str(r["id"]) == str(cafe.id)]
    assert mine, "café should be listed"
    assert mine[0]["has_coop"] is False

    tier.is_room = False  # the same setup as a shareable console does earn the badge
    await db_session.commit()
    rows, _total = await CafeRepository(db_session).flex_search_verified(query=cafe.name, limit=50)
    assert [r for r in rows if str(r["id"]) == str(cafe.id)][0]["has_coop"] is True


@pytest.mark.asyncio
async def test_quote_does_not_show_a_fixed_price_deal_for_a_five_pc_cabin(db_session, monkeypatch):
    """Checkout's quote must agree with what the booking charges."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from tests.conftest import auth_headers
    cafe, tier, gamer = await _setup(db_session, monkeypatch, **CABIN)
    db_session.add(_fixed(cafe, tier, 3, 400))
    await db_session.commit()

    async def quote(players):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post("/api/v1/bookings/quote", json={
                "cafeId": str(cafe.id), "hardwareTierId": str(tier.id),
                "sessionDate": BASE_DATE.isoformat(), "startTime": "12:00:00",
                "durationHours": 3, "seatsCount": 1, "playersCount": players,
            }, headers=auth_headers(gamer))
        assert r.status_code == 200, r.text
        return r.json()["data"]

    big = await quote(5)
    assert float(big["baseAmount"]) == 3150.0 and float(big["discountAmount"]) == 0.0
    assert big["appliedOffer"] is None
    one = await quote(1)
    assert float(one["baseAmount"]) - float(one["discountAmount"]) == 400.0


@pytest.mark.asyncio
async def test_owner_alert_says_cabin_and_how_many_pcs(db_session, monkeypatch):
    from types import SimpleNamespace
    from app.services.payment_service import PaymentService
    from app.models.booking import Booking
    cafe, tier, gamer = await _setup(db_session, monkeypatch, **CABIN)
    resp = await _book(tier, cafe, gamer, durationHours=1, seatsCount=1, playersCount=5)
    booking = await db_session.get(Booking, uuid.UUID(resp.json()["data"]["booking"]["id"]))
    svc = PaymentService.__new__(PaymentService)
    svc.payment_repo = SimpleNamespace(db=db_session)
    msg = await svc._owner_booking_message(booking)
    assert "Cabin, 5 PCs" in msg and "Booking " in msg and "Aug" in msg
