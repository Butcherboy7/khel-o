"""Link-only campaigns ("Founders' price"): several offers behind one access
code and one shared spot cap. Hidden from every public surface, unlocked only
by the code, capped by REAL paid/held bookings, never by an invented number."""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.promotion import Promotion, OfferCampaign
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.core.security import get_password_hash
from app.database import AsyncSessionLocal
from tests.conftest import auth_headers
from tests.test_khelo_promo_codes import _make_cafe_owner_gamer


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        yield c


def _code() -> str:
    return "FND" + uuid.uuid4().hex[:8].upper()


def _campaign(cafe, code, max_uses=None, **kw):
    now = datetime.now(timezone.utc)
    base = dict(id=uuid.uuid4(), cafe_id=cafe.id, name="Founders", access_code=code, max_uses=max_uses,
                starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=14), is_active=True)
    base.update(kw)
    return OfferCampaign(**base)


def _promo(cafe, campaign, **kw):
    now = datetime.now(timezone.utc)
    base = dict(
        id=uuid.uuid4(), cafe_id=cafe.id, campaign_id=campaign.id, title="Founders 20", discount_percentage=20,
        min_booking_minutes=60, valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=14),
        days_of_week=[0, 1, 2, 3, 4, 5, 6], start_hour=0, end_hour=24, max_uses=None, current_uses=0, is_active=True,
    )
    base.update(kw)
    return Promotion(**base)


def _body(cafe, tier, hour=20, **extra):
    return {
        "cafeId": str(cafe.id), "hardwareTierId": str(tier.id),
        "sessionDate": (date.today() + timedelta(days=1)).isoformat(),
        "startTime": f"{hour:02d}:00:00", "durationHours": 1.0, "seatsCount": 1, **extra,
    }


async def _second_gamer(db):
    g = User(id=uuid.uuid4(), email=f"fnd_g_{uuid.uuid4().hex[:8]}@test.com", full_name="Second Gamer",
             password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True)
    db.add(g)
    await db.flush()
    db.add(UserRoleMapping(id=uuid.uuid4(), user_id=g.id, role=UserRole.GAMER))
    await db.commit()
    return g


@pytest.mark.asyncio
async def test_campaign_offers_are_invisible_without_the_code(client):
    async with AsyncSessionLocal() as db:
        _o, _g, cafe, tier = await _make_cafe_owner_gamer(db)
        camp = _campaign(cafe, _code())
        db.add(camp)
        await db.flush()
        db.add(_promo(cafe, camp))
        await db.commit()

    detail = (await client.get(f"/api/v1/cafes/{cafe.id}")).json()["data"]["cafe"]
    assert detail["activePromotions"] == []
    assert next(t for t in detail["tiers"] if t["id"] == str(tier.id))["activePromotion"] is None

    q = (await client.post("/api/v1/bookings/quote", json=_body(cafe, tier))).json()["data"]
    assert q["appliedOffer"] is None and q["discountAmount"] == 0 and q["availableOffers"] == []

    listing = (await client.get("/api/v1/cafes", params={"city": "Bengaluru", "limit": 50})).json()["data"]
    items = listing.get("items") or listing.get("cafes")
    mine = next(i for i in items if i["id"] == str(cafe.id))
    assert mine["hasActivePromotion"] is False and mine.get("bestOffer") is None


@pytest.mark.asyncio
async def test_code_unlocks_best_campaign_offer_and_booking_charges_it(client):
    code = _code()
    async with AsyncSessionLocal() as db:
        _o, gamer, cafe, tier = await _make_cafe_owner_gamer(db)
        camp = _campaign(cafe, code)
        db.add(camp)
        await db.flush()
        db.add_all([
            _promo(cafe, camp, title="Percent", discount_percentage=20),
            _promo(cafe, camp, title="Flat", discount_percentage=None, promotion_type="fixed_amount",
                   fixed_discount_amount=30, min_booking_minutes=60),
        ])
        await db.commit()

    # typed in lowercase, as a person would
    q = (await client.post("/api/v1/bookings/quote", json=_body(cafe, tier, promoCode=code.lower()))).json()["data"]
    assert q["appliedOffer"]["title"] == "Flat"
    assert q["discountAmount"] == 30.0
    assert {o["title"] for o in q["availableOffers"]} == {"Percent", "Flat"}

    res = await client.post("/api/v1/bookings", json=_body(cafe, tier, promoCode=code), headers=auth_headers(gamer))
    assert res.status_code == 201, res.text
    b = res.json()["data"]["booking"]
    assert float(b["discountAmount"]) == 30.0
    assert float(b["totalAmount"]) == q["total"]


@pytest.mark.asyncio
async def test_wrong_cafe_or_unknown_code_unlocks_nothing(client):
    code = _code()
    async with AsyncSessionLocal() as db:
        _o, _g, cafe, tier = await _make_cafe_owner_gamer(db)
        _o2, _g2, other_cafe, other_tier = await _make_cafe_owner_gamer(db)
        camp = _campaign(cafe, code)
        db.add(camp)
        await db.flush()
        db.add(_promo(cafe, camp))
        await db.commit()

    other = (await client.post("/api/v1/bookings/quote", json=_body(other_cafe, other_tier, promoCode=code))).json()["data"]
    assert other["appliedOffer"] is None and other["discountAmount"] == 0
    assert other["offerNote"]

    bogus = (await client.post("/api/v1/bookings/quote", json=_body(cafe, tier, promoCode="NOPE1234"))).json()["data"]
    assert bogus["appliedOffer"] is None and bogus["offerNote"]


@pytest.mark.asyncio
async def test_campaign_offer_id_alone_cannot_be_used_without_the_code(client):
    code = _code()
    async with AsyncSessionLocal() as db:
        _o, gamer, cafe, tier = await _make_cafe_owner_gamer(db)
        camp = _campaign(cafe, code)
        db.add(camp)
        await db.flush()
        promo = _promo(cafe, camp)
        db.add(promo)
        await db.commit()

    res = await client.post("/api/v1/bookings", json=_body(cafe, tier, promotionId=str(promo.id)), headers=auth_headers(gamer))
    assert res.status_code != 201
    assert res.json()["error"]["code"] == "PROMOTION_CODE_REQUIRED"


@pytest.mark.asyncio
async def test_shared_cap_counts_real_bookings_and_closes_for_the_next_person(client):
    code = _code()
    async with AsyncSessionLocal() as db:
        _o, gamer1, cafe, tier = await _make_cafe_owner_gamer(db)
        gamer2 = await _second_gamer(db)
        gamer3 = await _second_gamer(db)
        camp = _campaign(cafe, code, max_uses=2)
        db.add(camp)
        await db.flush()
        db.add(_promo(cafe, camp))
        await db.commit()

    pub = (await client.get(f"/api/v1/promotions/campaign/{code}", params={"cafe_id": str(cafe.id)})).json()["data"]
    assert pub["campaign"]["claimed"] == 0 and pub["campaign"]["remaining"] == 2 and pub["campaign"]["full"] is False
    assert [o["label"] for o in pub["offers"]] == ["20% off"]

    for gamer, hour in ((gamer1, 18), (gamer2, 19)):
        r = await client.post("/api/v1/bookings", json=_body(cafe, tier, hour=hour, promoCode=code), headers=auth_headers(gamer))
        assert r.status_code == 201, r.text

    # two people hold the two spots (unpaid but inside their payment window)
    pub = (await client.get(f"/api/v1/promotions/campaign/{code}")).json()["data"]
    assert pub["campaign"]["remaining"] == 0 and pub["campaign"]["full"] is True

    q = (await client.post("/api/v1/bookings/quote", json=_body(cafe, tier, hour=21, promoCode=code))).json()["data"]
    assert q["appliedOffer"] is None and q["discountAmount"] == 0
    assert "claimed" in q["offerNote"]

    third = await client.post("/api/v1/bookings", json=_body(cafe, tier, hour=21, promoCode=code), headers=auth_headers(gamer3))
    assert third.status_code != 201
    assert third.json()["error"]["code"] == "PROMOTION_EXHAUSTED"


@pytest.mark.asyncio
async def test_unknown_campaign_code_is_a_plain_404(client):
    res = await client.get("/api/v1/promotions/campaign/NOSUCHCODE")
    assert res.status_code == 404
