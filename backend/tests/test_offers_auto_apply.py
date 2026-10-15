"""Offers apply on their own: a no-code offer reaches the customer's quote and
is charged at booking, the café page / explore list advertise it (even before
its hours open), and a sold-out offer degrades to a calm full-price quote
instead of an error."""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.promotion import Promotion
from app.database import AsyncSessionLocal
from tests.conftest import auth_headers
from tests.test_khelo_promo_codes import _make_cafe_owner_gamer


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        yield c


def _promo(cafe, **kw):
    now = datetime.now(timezone.utc)
    base = dict(
        id=uuid.uuid4(), cafe_id=cafe.id, title="Auto 20", discount_percentage=20, min_booking_minutes=60,
        valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=30),
        days_of_week=[0, 1, 2, 3, 4, 5, 6], start_hour=0, end_hour=24,
        max_uses=None, current_uses=0, is_active=True, khelo_code=None,
    )
    base.update(kw)
    return Promotion(**base)


def _quote_body(cafe, tier, **extra):
    return {
        "cafeId": str(cafe.id), "hardwareTierId": str(tier.id),
        "sessionDate": (date.today() + timedelta(days=1)).isoformat(),
        "startTime": "20:00:00", "durationHours": 1.0, "seatsCount": 1, **extra,
    }


@pytest.mark.asyncio
async def test_no_code_offer_applies_in_quote_and_is_charged_at_booking(client):
    async with AsyncSessionLocal() as db:
        _owner, gamer, cafe, tier = await _make_cafe_owner_gamer(db)
        db.add(_promo(cafe))
        await db.commit()

    q = (await client.post("/api/v1/bookings/quote", json=_quote_body(cafe, tier))).json()["data"]
    assert q["discountAmount"] == 20.0
    assert q["appliedOffer"]["label"] == "20% off"
    assert [o["label"] for o in q["availableOffers"]] == ["20% off"]

    # Nothing chosen, no code: the server still applies it, same total as the quote.
    res = await client.post("/api/v1/bookings", json=_quote_body(cafe, tier), headers=auth_headers(gamer))
    assert res.status_code == 201, res.text
    booking = res.json()["data"]["booking"]
    assert float(booking["discountAmount"]) == 20.0
    assert float(booking["totalAmount"]) == q["total"]


@pytest.mark.asyncio
async def test_best_offer_wins_and_other_is_listed_to_switch(client):
    async with AsyncSessionLocal() as db:
        _owner, _gamer, cafe, tier = await _make_cafe_owner_gamer(db)
        small = _promo(cafe, title="Small", discount_percentage=10)
        big = _promo(cafe, title="Big", discount_percentage=30)
        db.add_all([small, big])
        await db.commit()

    q = (await client.post("/api/v1/bookings/quote", json=_quote_body(cafe, tier))).json()["data"]
    assert q["appliedOffer"]["title"] == "Big"
    assert [o["title"] for o in q["availableOffers"]] == ["Big", "Small"]

    # Customer taps the smaller one: their choice is honoured.
    q2 = (await client.post("/api/v1/bookings/quote", json=_quote_body(cafe, tier, promotionId=str(small.id)))).json()["data"]
    assert q2["appliedOffer"]["title"] == "Small"
    assert q2["discountAmount"] == 10.0


@pytest.mark.asyncio
async def test_sold_out_offer_gives_calm_full_price_quote(client):
    async with AsyncSessionLocal() as db:
        _owner, _gamer, cafe, tier = await _make_cafe_owner_gamer(db)
        gone = _promo(cafe, title="Gone", max_uses=30, current_uses=30)
        db.add(gone)
        await db.commit()

    # The 31st customer, still holding the old offer id from an open page.
    q = (await client.post("/api/v1/bookings/quote", json=_quote_body(cafe, tier, promotionId=str(gone.id)))).json()["data"]
    assert q["appliedOffer"] is None
    assert q["discountAmount"] == 0
    assert q["offerNote"] == "This offer just ended."

    # And it is no longer advertised on the café page.
    detail = (await client.get(f"/api/v1/cafes/{cafe.id}")).json()["data"]["cafe"]
    assert detail["activePromotions"] == []


@pytest.mark.asyncio
async def test_offer_outside_its_hours_is_advertised_but_not_applied(client):
    async with AsyncSessionLocal() as db:
        _owner, _gamer, cafe, tier = await _make_cafe_owner_gamer(db)
        # Weeknights-style window that excludes the 20:00 quote slot.
        db.add(_promo(cafe, title="Morning only", start_hour=6, end_hour=10))
        await db.commit()

    detail = (await client.get(f"/api/v1/cafes/{cafe.id}")).json()["data"]["cafe"]
    promos = detail["activePromotions"]
    assert len(promos) == 1
    assert promos[0]["label"] == "20% off"
    assert promos[0]["when"] == "6 AM–10 AM"
    tier_json = next(t for t in detail["tiers"] if t["id"] == str(tier.id))
    assert tier_json["activePromotion"]["id"] == str(promos[0]["id"])

    q = (await client.post("/api/v1/bookings/quote", json=_quote_body(cafe, tier))).json()["data"]
    assert q["appliedOffer"] is None
    assert q["discountAmount"] == 0


@pytest.mark.asyncio
async def test_tier_badge_uses_the_offer_made_for_that_setup_not_first_in_list(client):
    async with AsyncSessionLocal() as db:
        _owner, _gamer, cafe, tier = await _make_cafe_owner_gamer(db)
        # Another tier's offer would previously win as "first name match".
        db.add(_promo(cafe, title="All setups", discount_percentage=10))
        db.add(_promo(cafe, title="Just this one", discount_percentage=15, applicable_tier_id=tier.id))
        await db.commit()

    detail = (await client.get(f"/api/v1/cafes/{cafe.id}")).json()["data"]["cafe"]
    tier_json = next(t for t in detail["tiers"] if t["id"] == str(tier.id))
    assert tier_json["activePromotion"]["title"] == "Just this one"


@pytest.mark.asyncio
async def test_explore_card_carries_the_best_deal(client):
    async with AsyncSessionLocal() as db:
        _owner, _gamer, cafe, _tier = await _make_cafe_owner_gamer(db)
        db.add(_promo(cafe, title="Card deal", discount_percentage=25, max_uses=5, current_uses=1))
        await db.commit()

    res = await client.get("/api/v1/cafes", params={"city": "Bengaluru", "limit": 50})
    items = res.json()["data"]["items"] if "items" in res.json().get("data", {}) else res.json()["data"]["cafes"]
    mine = next(i for i in items if i["id"] == str(cafe.id))
    assert mine["hasActivePromotion"] is True
    assert mine["bestOffer"]["label"] == "25% off"
    assert mine["bestOffer"]["slotsRemaining"] == 4
    assert mine["bestOffer"]["isLiveNow"] is True


@pytest.mark.asyncio
async def test_explore_card_picks_the_cheapest_deal_not_the_oldest_fixed_price(client):
    """Rockstar's card showed "₹300 for 1 hr" (VR, its oldest offer) while a
    "₹119 for 1 hr" PS5 deal existed: fixed-price deals all scored 0."""
    from app.models.hardware_tier import HardwareTier
    from app.models.promotion import PromotionType

    async with AsyncSessionLocal() as db:
        _owner, _gamer, cafe, ps5 = await _make_cafe_owner_gamer(db)
        ps5.price_per_hour = 140.0
        vr = HardwareTier(
            id=uuid.uuid4(), cafe_id=cafe.id, name="VR", price_per_hour=349.0, total_seats=2,
            app_bookable_seats=2, active_seats_count=2, is_active=True,
        )
        db.add(vr)
        await db.flush()

        def fixed(tier, price, hours, mode="solo", title="deal"):
            return _promo(
                cafe, title=title, discount_percentage=None, promotion_type=PromotionType.FIXED_PRICE,
                fixed_price_amount=price, min_duration_hours=hours, applicable_tier_id=tier.id, play_mode=mode,
            )

        db.add(fixed(vr, 300, 1, mode="any", title="1HR SPECIAL"))   # oldest, smallest saving
        await db.commit()
        db.add_all([
            fixed(vr, 299, 1), fixed(ps5, 119, 1), fixed(ps5, 69, 0.5),
            fixed(ps5, 220, 1, mode="coop"),  # shared console: not the per-person card price
        ])
        await db.commit()

    res = await client.get("/api/v1/cafes", params={"city": "Bengaluru", "limit": 50})
    items = res.json()["data"]["items"] if "items" in res.json().get("data", {}) else res.json()["data"]["cafes"]
    mine = next(i for i in items if i["id"] == str(cafe.id))
    assert mine["bestOffer"]["label"] == "₹119 for 1 hr"
    # The card's "from" price follows the best solo hourly deal, as the café page does.
    assert mine["bestOffer"]["fromPrice"] == 119


@pytest.mark.asyncio
async def test_near_miss_hint_says_which_length_unlocks_the_offer(client):
    async with AsyncSessionLocal() as db:
        _owner, _gamer, cafe, tier = await _make_cafe_owner_gamer(db)
        db.add(_promo(cafe, title="Hour+ only", min_booking_minutes=120))
        await db.commit()

    # 1 hour booked, offer needs 2 hours: no discount, but a one-tap fix is offered.
    q = (await client.post("/api/v1/bookings/quote", json=_quote_body(cafe, tier))).json()["data"]
    assert q["appliedOffer"] is None
    assert q["offerHint"]["suggestedMinutes"] == 120
    assert "2 hr" in q["offerHint"]["message"]
