"""Public multi-café campaign ("KHELO Special Access"): the campaign is a
presentation / badge / tracking layer over ordinary offers. Covers: offers
apply everywhere without a code, the landing page shows real before/after
prices for every café, the badge, share indication, and the money split the
admin sees (fee on the DISCOUNTED price, café share = list - discount)."""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.analytics_event import AnalyticsEvent
from app.models.booking import Booking, BookingStatus
from app.models.platform_fee import PlatformFee
from app.models.promotion import Promotion, OfferCampaign
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from tests.conftest import auth_headers
from tests.test_khelo_promo_codes import _make_cafe_owner_gamer


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        yield c


def _code() -> str:
    return "SPC" + uuid.uuid4().hex[:8].upper()


def _campaign(code, public=True, **kw):
    now = datetime.now(timezone.utc)
    base = dict(id=uuid.uuid4(), cafe_id=None, is_public=public, name="KHELO Special Access", access_code=code,
                max_uses=None, starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=14), is_active=True)
    base.update(kw)
    return OfferCampaign(**base)


def _promo(cafe, tier, campaign, **kw):
    now = datetime.now(timezone.utc)
    base = dict(
        id=uuid.uuid4(), cafe_id=cafe.id, campaign_id=campaign.id, applicable_tier_id=tier.id, title="Special 20",
        discount_percentage=20, min_booking_minutes=60, valid_from=now - timedelta(days=1),
        valid_until=now + timedelta(days=14), days_of_week=[0, 1, 2, 3, 4, 5, 6], start_hour=0, end_hour=24,
        max_uses=None, current_uses=0, is_active=True,
    )
    base.update(kw)
    return Promotion(**base)


def _body(cafe, tier, hour=20, **extra):
    return {
        "cafeId": str(cafe.id), "hardwareTierId": str(tier.id),
        "sessionDate": (date.today() + timedelta(days=1)).isoformat(),
        "startTime": f"{hour:02d}:00:00", "durationHours": 1.0, "seatsCount": 1, **extra,
    }


async def _admin(db):
    a = User(id=uuid.uuid4(), email=f"adm_{uuid.uuid4().hex[:8]}@test.com", full_name="Admin",
             password_hash=get_password_hash("testpass123"), role=UserRole.ADMIN, is_active=True)
    db.add(a)
    await db.commit()
    return a


@pytest.mark.asyncio
async def test_public_campaign_offer_is_listed_and_applies_without_a_code(client):
    code = _code()
    async with AsyncSessionLocal() as db:
        _o, gamer, cafe, tier = await _make_cafe_owner_gamer(db)
        camp = _campaign(code)
        db.add(camp)
        await db.flush()
        db.add(_promo(cafe, tier, camp))
        await db.commit()

    detail = (await client.get(f"/api/v1/cafes/{cafe.id}")).json()["data"]["cafe"]
    assert [p["label"] for p in detail["activePromotions"]] == ["20% off"]

    q = (await client.post("/api/v1/bookings/quote", json=_body(cafe, tier))).json()["data"]
    assert q["appliedOffer"]["title"] == "Special 20" and q["discountAmount"] == 20.0

    res = await client.post("/api/v1/bookings", json=_body(cafe, tier), headers=auth_headers(gamer))
    assert res.status_code == 201, res.text
    assert float(res.json()["data"]["booking"]["discountAmount"]) == 20.0

    # entering the code (the share link / handoff code) changes nothing about price
    q2 = (await client.post("/api/v1/bookings/quote", json=_body(cafe, tier, promoCode=code))).json()["data"]
    assert q2["discountAmount"] == 20.0 and len(q2["availableOffers"]) == 1


@pytest.mark.asyncio
async def test_landing_page_shows_every_cafe_with_real_before_and_after(client):
    code = _code()
    async with AsyncSessionLocal() as db:
        _o, _g, cafe_a, tier_a = await _make_cafe_owner_gamer(db)
        _o2, _g2, cafe_b, tier_b = await _make_cafe_owner_gamer(db)
        camp = _campaign(code)
        db.add(camp)
        await db.flush()
        db.add_all([
            _promo(cafe_a, tier_a, camp, title="A 1hr", promotion_type="fixed_price", discount_percentage=None,
                   min_booking_minutes=None, fixed_price_amount=75, min_duration_hours=1),
            _promo(cafe_b, tier_b, camp, title="B 20%"),
        ])
        await db.commit()

    data = (await client.get(f"/api/v1/promotions/campaign/{code}")).json()["data"]
    assert data["campaign"]["isPublic"] is True and data["campaign"]["maxUses"] is None
    by_cafe = {c["id"]: c for c in data["cafes"]}
    assert set(by_cafe) == {str(cafe_a.id), str(cafe_b.id)}
    a = by_cafe[str(cafe_a.id)]["offers"][0]
    assert (a["regularPrice"], a["price"], a["saved"], a["minutes"], a["exactLength"]) == (100.0, 75.0, 25.0, 60, True)
    b = by_cafe[str(cafe_b.id)]["offers"][0]
    assert (b["regularPrice"], b["price"], b["saved"]) == (100.0, 80.0, 20.0)

    one = (await client.get(f"/api/v1/promotions/campaign/{code}", params={"cafe_id": str(cafe_a.id)})).json()["data"]
    assert [c["id"] for c in one["cafes"]] == [str(cafe_a.id)]


@pytest.mark.asyncio
async def test_money_split_uses_the_discounted_price_not_the_list_price(client):
    code = _code()
    async with AsyncSessionLocal() as db:
        _o, gamer, cafe, tier = await _make_cafe_owner_gamer(db)
        admin = await _admin(db)
        camp = _campaign(code)
        db.add(camp)
        await db.flush()
        db.add(_promo(cafe, tier, camp))
        await db.commit()

    res = await client.post("/api/v1/bookings", json=_body(cafe, tier), headers=auth_headers(gamer))
    assert res.status_code == 201, res.text
    b = res.json()["data"]["booking"]
    assert float(b["baseAmount"]) == 100.0 and float(b["discountAmount"]) == 20.0

    async with AsyncSessionLocal() as db:
        booking = (await db.execute(select(Booking).where(Booking.id == uuid.UUID(b["id"])))).scalars().first()
        fee = (await db.execute(select(PlatformFee).where(PlatformFee.booking_id == booking.id))).scalars().first()
        pct = float(fee.fee_percentage_applied)
        # KHELO's fee is a % of what the customer pays for the game (80), not of the list price (100)
        assert float(fee.gateway_fee) == round(80 * pct / 100, 2)
        # the café is owed list - discount, and the customer pays café share + KHELO fee
        assert float(fee.owner_settlement_amount) == 80.0
        assert round(float(fee.owner_settlement_amount) + float(fee.gateway_fee), 2) == float(booking.total_amount)
        booking.status = BookingStatus.CONFIRMED
        await db.commit()

    lst = (await client.get("/api/v1/admin/bookings", params={"campaignOnly": "true"}, headers=auth_headers(admin))).json()["data"]
    row = next(i for i in lst["items"] if i["id"] == b["id"])
    assert row["campaignName"] == "KHELO Special Access" and row["offerTitle"] == "Special 20"
    assert row["baseAmount"] == 100.0 and row["discountAmount"] == 20.0
    assert row["ownerSettlementAmount"] == 80.0 and row["platformFeeAmount"] == float(fee.gateway_fee)
    assert round(row["ownerSettlementAmount"] + row["platformFeeAmount"], 2) == row["totalAmount"]

    rev = (await client.get("/api/v1/admin/analytics/revenue", headers=auth_headers(admin))).json()["data"]
    c = next(x for x in rev["campaigns"] if x["campaign"] == "KHELO Special Access")
    assert c["bookings"] >= 1 and c["discount"] >= 20.0
    assert round(c["cafeShare"] + c["kheloFee"], 2) == round(c["customerPaid"], 2)


@pytest.mark.asyncio
async def test_badge_is_granted_once_shows_in_rewards_and_counts_shares(client):
    code = _code()
    async with AsyncSessionLocal() as db:
        _o, gamer, cafe, tier = await _make_cafe_owner_gamer(db)
        camp = _campaign(code)
        db.add(camp)
        await db.flush()
        db.add(_promo(cafe, tier, camp))
        # one campaign share by this gamer, opened by two different visitors
        db.add(AnalyticsEvent(session_id="s-owner", user_id=gamer.id, event_type="share_created",
                              event_metadata={"sid": "abc123", "channel": "whatsapp", "context": "campaign"}))
        db.add(AnalyticsEvent(session_id="s-friend-1", event_type="share_opened", event_metadata={"sid": "abc123"}))
        db.add(AnalyticsEvent(session_id="s-friend-2", event_type="share_opened", event_metadata={"sid": "abc123"}))
        await db.commit()

    anon = await client.post(f"/api/v1/promotions/campaign/{code}/claim")
    assert anon.status_code in (401, 403)

    first = (await client.post(f"/api/v1/promotions/campaign/{code}/claim", headers=auth_headers(gamer))).json()["data"]
    assert first["newlyEarned"] is True and first["badge"]["name"] == "Day One"
    assert first["shares"] == {"shared": 1, "opened": 2}
    again = (await client.post(f"/api/v1/promotions/campaign/{code}/claim", headers=auth_headers(gamer))).json()["data"]
    assert again["newlyEarned"] is False

    rewards = (await client.get("/api/v1/rewards", headers=auth_headers(gamer))).json()["data"]
    badge = next(a for a in rewards["achievements"] if a["id"] == "special_access")
    assert badge["isUnlocked"] is True and rewards["xp"] == 100
    assert badge["title"] == "Day One" and badge["grantedAt"]
    assert badge["campaignCode"] == code
    assert badge["memberNumber"] == 1

    bogus = await client.post("/api/v1/promotions/campaign/NOSUCHCODE/claim", headers=auth_headers(gamer))
    assert bogus.status_code == 404


@pytest.mark.asyncio
async def test_owner_sees_campaign_offer_with_regular_and_offer_price(client):
    code = _code()
    async with AsyncSessionLocal() as db:
        owner, _g, cafe, tier = await _make_cafe_owner_gamer(db)
        camp = _campaign(code)
        db.add(camp)
        await db.flush()
        db.add(_promo(cafe, tier, camp))
        await db.commit()

    res = await client.get(f"/api/v1/promotions/owner/cafe/{cafe.id}", headers=auth_headers(owner))
    assert res.status_code == 200, res.text
    items = res.json()["data"]
    items = items.get("promotions", items) if isinstance(items, dict) else items
    p = next(i for i in items if i["title"] == "Special 20")
    assert p["campaignName"] == "KHELO Special Access" and p["tierName"] == "Standard"
    assert (p["regularPrice"], p["offerPrice"], p["offerMinutes"]) == (100.0, 80.0, 60)
