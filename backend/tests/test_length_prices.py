"""Owner-set package prices per length (2 hr = ₹280, 3 hr = ₹400) and a
setup's longest booking: stored on create and edit, shown on the public café
API, and used by the server's quote and booking checks."""
from datetime import date, time, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from httpx import AsyncClient, ASGITransport

from app.core.duration import allowed_minutes
from app.core.security import get_password_hash, create_access_token
from app.database import AsyncSessionLocal
from app.main import app
from app.models.cafe import Cafe, VerificationStatus
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.services.pricing_service import base_price_for_minutes


class _Tier:
    def __init__(self, length_prices=None, coop_extra_player_price=0):
        self.price_per_hour = 150
        self.price_15m = None
        self.price_30m = None
        self.coop_price_30m = None
        self.coop_extra_player_price = coop_extra_player_price
        self.length_prices = length_prices or {}


# ---------------------------------------------------------------- pricing

def test_package_prices_replace_the_hourly_maths_for_their_length():
    t = _Tier({"120": 280, "180": 400})
    assert base_price_for_minutes(t, 60) == Decimal("150.00")
    assert base_price_for_minutes(t, 120) == Decimal("280.00")
    assert base_price_for_minutes(t, 180) == Decimal("400.00")


def test_length_without_a_package_builds_on_the_nearest_shorter_one():
    t = _Tier({"120": 280, "180": 400})
    assert base_price_for_minutes(t, 90) == Decimal("225.00")   # no shorter package: hourly x 1.5
    assert base_price_for_minutes(t, 150) == Decimal("355.00")  # 280 + half an hour
    assert base_price_for_minutes(t, 210) == Decimal("475.00")  # 400 + half an hour, not 525


def test_no_packages_means_the_old_hourly_prices():
    t = _Tier()
    assert base_price_for_minutes(t, 180) == Decimal("450.00")


def test_coop_extra_and_several_consoles_still_apply_on_top_of_a_package():
    t = _Tier({"180": 400}, coop_extra_player_price=50)
    assert base_price_for_minutes(t, 180, players=2, is_coop=True) == Decimal("550.00")
    assert base_price_for_minutes(t, 180, seats=2) == Decimal("800.00")


def test_malformed_stored_packages_are_ignored_not_fatal():
    t = _Tier({"abc": 1, "120": "oops", "180": 400})
    assert base_price_for_minutes(t, 120) == Decimal("300.00")
    assert base_price_for_minutes(t, 180) == Decimal("400.00")


def test_longest_booking_caps_the_lengths():
    assert allowed_minutes(60, 180) == [60, 90, 120, 150, 180]
    assert allowed_minutes(30, None)[-1] == 480


# ---------------------------------------------------------------- API

async def _owner_and_cafe():
    async with AsyncSessionLocal() as db:
        owner = User(id=uuid4(), email=f"lp_{uuid4().hex[:8]}@test.com",
                     password_hash=get_password_hash("testpass123"), full_name="Package Owner",
                     role=UserRole.CAFE_OWNER, is_active=True)
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        cafe = Cafe(id=uuid4(), owner_id=owner.id, name=f"Package Cafe {uuid4().hex[:5]}",
                    address_line1="1 Pad St", city="Hyderabad", state="Telangana", pincode="500001",
                    phone_number="+919000000081", verification_status=VerificationStatus.VERIFIED,
                    is_active=True, opening_time=time(0, 0), closing_time=time(23, 59))
        db.add(cafe)
        await db.commit()
        h = {"Authorization": f"Bearer {create_access_token(subject=str(owner.id), role=owner.role.value)}"}
        return cafe.id, h


PS5 = {"name": "PS5", "specs": {}, "totalSeats": 3, "appBookableSeats": 3, "pricePerHour": 150,
       "platform": "playstation", "model": "PS5"}


@pytest.mark.asyncio
async def test_owner_packages_and_longest_booking_reach_customer_and_quote():
    cafe_id, h = await _owner_and_cafe()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        res = await c.post(f"/api/v1/cafes/{cafe_id}/tiers", headers=h, json={
            **PS5, "lengthPrices": {"120": 280, "180": 400}, "maxBookingMinutes": 180,
        })
        assert res.status_code == 201, res.text
        tier = res.json()["data"]["hardwareTier"]
        assert tier["lengthPrices"] == {"120": 280, "180": 400}
        assert tier["maxBookingMinutes"] == 180
        tier_id = tier["id"]

        quote = lambda mins: c.post("/api/v1/bookings/quote", json={
            "cafeId": str(cafe_id), "hardwareTierId": tier_id,
            "sessionDate": str(date.today() + timedelta(days=2)), "startTime": "12:00:00",
            "durationHours": mins / 60, "seatsCount": 1})

        q = (await quote(180)).json()["data"]
        assert q["baseAmount"] == 400
        assert q["allowedMinutes"] == [60, 90, 120, 150, 180]
        assert q["pricesByMinutes"]["120"] == 280

        # Longer than the longest booking: refused with the real limit in words.
        over = await quote(210)
        assert over.status_code == 422
        assert "3 hr" in over.text

        # The public café API (what checkout reads) carries both.
        detail = await c.get(f"/api/v1/cafes/{cafe_id}")
        pub = next(t for t in detail.json()["data"]["cafe"]["tiers"] if t["id"] == tier_id)
        assert pub["lengthPrices"] == {"120": 280, "180": 400}
        assert pub["maxBookingMinutes"] == 180

        # Edit: lift the limit back to 8 hours and change one package.
        upd = await c.patch(f"/api/v1/cafes/{cafe_id}/tiers/{tier_id}", headers=h,
                            json={"maxBookingMinutes": None, "lengthPrices": {"120": 260, "180": 400}})
        assert upd.status_code == 200, upd.text
        assert upd.json()["data"]["hardwareTier"]["maxBookingMinutes"] is None
        assert (await quote(120)).json()["data"]["baseAmount"] == 260
        assert (await quote(240)).json()["data"]["baseAmount"] == 550  # 400 + one hour

        # An edit that only touches the hourly rate keeps the packages.
        await c.patch(f"/api/v1/cafes/{cafe_id}/tiers/{tier_id}", headers=h, json={"pricePerHour": 160})
        assert (await quote(180)).json()["data"]["baseAmount"] == 400


@pytest.mark.asyncio
async def test_cheaper_longer_packages_are_allowed_but_impossible_ones_are_not():
    cafe_id, h = await _owner_and_cafe()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        # A longer session costing less is unusual but allowed (the screen warns).
        ok = await c.post(f"/api/v1/cafes/{cafe_id}/tiers", headers=h,
                          json={**PS5, "lengthPrices": {"120": 300, "180": 250}})
        assert ok.status_code == 201, ok.text
        tier_id = ok.json()["data"]["hardwareTier"]["id"]

        bad_cases = [
            {"lengthPrices": {"200": 300}},                              # not a 30-min step
            {"lengthPrices": {"60": 140}},                               # 1 hr is the hourly rate
            {"lengthPrices": {"240": 500}, "maxBookingMinutes": 180},    # longer than the limit
            {"lengthPrices": {"120": 0}},                                # free
            {"maxBookingMinutes": 100},                                  # not a step
            {"maxBookingMinutes": 120, "defaultBookingMinutes": 180},    # checkout starts past the limit
        ]
        for body in bad_cases:
            r = await c.post(f"/api/v1/cafes/{cafe_id}/tiers", headers=h, json={**PS5, "name": "X", **body})
            assert r.status_code == 422, (body, r.text)

        # Same rules on edit, checked against what the setup would end up with.
        r = await c.patch(f"/api/v1/cafes/{cafe_id}/tiers/{tier_id}", headers=h, json={"maxBookingMinutes": 120})
        assert r.status_code == 422  # its 3 hr package would sit past the new limit
        assert "longer than the longest booking" in r.text


@pytest.mark.asyncio
async def test_owner_can_clear_short_prices_and_checkout_start_back_to_default():
    """These used to be impossible to clear: the save skipped every null."""
    cafe_id, h = await _owner_and_cafe()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        res = await c.post(f"/api/v1/cafes/{cafe_id}/tiers", headers=h, json={
            **PS5, "minBookingMinutes": 30, "price30m": 90, "defaultBookingMinutes": 120,
        })
        assert res.status_code == 201, res.text
        tier_id = res.json()["data"]["hardwareTier"]["id"]
        upd = await c.patch(f"/api/v1/cafes/{cafe_id}/tiers/{tier_id}", headers=h,
                            json={"price30m": None, "defaultBookingMinutes": None})
        assert upd.status_code == 200, upd.text
        t = upd.json()["data"]["hardwareTier"]
        assert t["price30m"] is None and t["defaultBookingMinutes"] is None


def _deal(cafe_id, tier_id, hours, **extra):
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    return {
        "cafeId": str(cafe_id), "title": f"{hours} Hours Deal", "promotionType": "fixed_price",
        "fixedPriceAmount": 300, "minDurationHours": hours, "applicableTierId": str(tier_id),
        "validFrom": (now - timedelta(days=1)).isoformat(), "validUntil": (now + timedelta(days=30)).isoformat(),
        "daysOfWeek": [0, 1, 2, 3, 4, 5, 6], "startHour": 0, "endHour": 24, **extra,
    }


@pytest.mark.asyncio
async def test_offers_must_fit_the_setups_longest_booking_both_ways():
    cafe_id, h = await _owner_and_cafe()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        res = await c.post(f"/api/v1/cafes/{cafe_id}/tiers", headers=h, json={**PS5, "maxBookingMinutes": 180})
        tier_id = res.json()["data"]["hardwareTier"]["id"]

        # A 4-hour deal on a setup booked for 3 hours at most could never be used.
        bad = await c.post("/api/v1/promotions", headers=h, json=_deal(cafe_id, tier_id, 4))
        assert bad.status_code == 422, bad.text
        assert bad.json()["error"]["code"] == "OFFER_LENGTH_NOT_BOOKABLE"
        assert "3 hr at most" in bad.json()["error"]["message"]

        # A % offer for 4 hr+ bookings, same.
        pct = _deal(cafe_id, tier_id, None, promotionType="percentage", discountPercentage=10, minBookingMinutes=240)
        pct.pop("fixedPriceAmount"); pct.pop("minDurationHours")
        assert (await c.post("/api/v1/promotions", headers=h, json=pct)).status_code == 422

        # A 3-hour deal fits; editing it to 4 hours is refused.
        ok = await c.post("/api/v1/promotions", headers=h, json=_deal(cafe_id, tier_id, 3))
        assert ok.status_code == 201, ok.text
        promo_id = ok.json()["data"]["promotion"]["id"]
        edit = await c.patch(f"/api/v1/promotions/{promo_id}", headers=h, json={"minDurationHours": 4})
        assert edit.status_code == 422

        # The other way round: the setup's limit can't drop below a running deal.
        lower = await c.patch(f"/api/v1/cafes/{cafe_id}/tiers/{tier_id}", headers=h, json={"maxBookingMinutes": 120})
        assert lower.status_code == 422
        assert lower.json()["error"]["code"] == "OFFER_NEEDS_LONGER_BOOKING"
        assert "3 Hours Deal" in lower.json()["error"]["message"]
        # Raising it is always fine.
        assert (await c.patch(f"/api/v1/cafes/{cafe_id}/tiers/{tier_id}", headers=h, json={"maxBookingMinutes": 240})).status_code == 200
