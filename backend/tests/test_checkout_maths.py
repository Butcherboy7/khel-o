"""KHEL-O's ₹1 price drop (₹150 -> ₹149, every booking) and the first-booking
launch offer (no booking fee, till 30 Nov, first 500): the quote and the
booking agree, and the café is still owed its full price."""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.core.security import get_password_hash, create_access_token
from app.database import AsyncSessionLocal
from app.main import app
from app.models.booking import Booking, BookingStatus
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.platform_fee import PlatformFee
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.services import checkout_maths
from app.services.checkout_maths import checkout_money, price_drop


# ---------------------------------------------------------------- maths

def test_round_prices_drop_by_one_rupee_and_others_stay():
    assert price_drop(Decimal("150")) == Decimal("1.00")
    assert price_drop(Decimal("300.00")) == Decimal("1.00")
    assert price_drop(Decimal("155")) == 0
    assert price_drop(Decimal("225")) == 0
    assert price_drop(Decimal("149")) == 0
    assert price_drop(Decimal("187.50")) == 0
    assert price_drop(Decimal("0")) == 0


def test_fee_is_worked_out_on_what_the_customer_pays_for_the_session():
    m = checkout_money(Decimal("150"), Decimal("4"), first_booking_offer=False)
    assert (m.session_price, m.booking_fee, m.total) == (Decimal("149"), Decimal("5.96"), Decimal("154.96"))
    assert m.cafe_price == Decimal("150")  # the café's share is untouched


def test_first_booking_pays_no_fee_and_says_how_much_it_saved():
    m = checkout_money(Decimal("150"), Decimal("4"), first_booking_offer=True)
    assert (m.session_price, m.booking_fee, m.total) == (Decimal("149"), Decimal("0.00"), Decimal("149"))
    assert m.fee_saved == Decimal("5.96")


# ---------------------------------------------------------------- API

async def _setup():
    async with AsyncSessionLocal() as db:
        owner = User(id=uuid4(), email=f"cm_own_{uuid4().hex[:8]}@test.com", full_name="Owner",
                     password_hash=get_password_hash("x12345678"), role=UserRole.CAFE_OWNER, is_active=True)
        gamer = User(id=uuid4(), email=f"cm_gam_{uuid4().hex[:8]}@test.com", full_name="Gamer",
                     password_hash=get_password_hash("x12345678"), role=UserRole.GAMER, is_active=True)
        db.add_all([owner, gamer])
        await db.flush()
        db.add_all([UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER),
                    UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER)])
        cafe = Cafe(id=uuid4(), owner_id=owner.id, name=f"Nine Cafe {uuid4().hex[:5]}",
                    address_line1="9 Nine St", city="Hyderabad", state="Telangana", pincode="500001",
                    phone_number="+919000000091", verification_status=VerificationStatus.VERIFIED,
                    is_active=True, opening_time=time(0, 0), closing_time=time(23, 59), bookable_stations=4)
        db.add(cafe)
        tier = HardwareTier(id=uuid4(), cafe_id=cafe.id, name="PS5", specs={}, price_per_hour=150.0,
                            total_seats=4, app_bookable_seats=4, active_seats_count=4, is_active=True)
        db.add(tier)
        await db.commit()
        return cafe.id, tier.id, gamer


def _body(cafe_id, tier_id, start="12:00:00", hours=1.0):
    return {"cafeId": str(cafe_id), "hardwareTierId": str(tier_id),
            "sessionDate": str(date.today() + timedelta(days=3)), "startTime": start,
            "durationHours": hours, "seatsCount": 1}


def _h(user):
    return {"Authorization": f"Bearer {create_access_token(subject=str(user.id), role=user.role.value)}"}


@pytest.mark.asyncio
async def test_first_booking_is_149_with_no_fee_and_the_cafe_is_still_owed_150():
    cafe_id, tier_id, gamer = await _setup()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        # Signed out: treated as a first booking.
        q = (await c.post("/api/v1/bookings/quote", json=_body(cafe_id, tier_id))).json()["data"]
        assert q["sessionPrice"] == 149 and q["kheloDiscount"] == 1
        assert q["firstBookingOffer"] is True and q["platformFee"] == 0 and q["total"] == 149
        assert q["platformFeeBeforeOffer"] == 5.96

        res = await c.post("/api/v1/bookings", json=_body(cafe_id, tier_id), headers=_h(gamer))
        assert res.status_code == 201, res.text
        b = res.json()["data"]["booking"]
        assert b["totalAmount"] == 149 and b["gatewayFee"] == 0
        assert b["kheloDiscount"] == 1 and b["firstBookingOffer"] is True and b["baseAmount"] == 150

    async with AsyncSessionLocal() as db:
        fee = (await db.execute(select(PlatformFee).where(PlatformFee.booking_id == UUID(b["id"])))).scalars().one()
        assert float(fee.owner_settlement_amount) == 150.0  # KHEL-O pays the café the ₹1


@pytest.mark.asyncio
async def test_after_a_paid_booking_the_fee_is_back_but_the_price_still_ends_in_9():
    cafe_id, tier_id, gamer = await _setup()
    async with AsyncSessionLocal() as db:
        db.add(Booking(id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
                       cafe_id=cafe_id, hardware_tier_id=tier_id, session_date=date.today() - timedelta(days=5),
                       start_time=time(10, 0), end_time=time(11, 0), duration_hours=1.0,
                       base_amount=150, discount_amount=0, gateway_fee=0, total_amount=149,
                       status=BookingStatus.COMPLETED))
        await db.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        q = (await c.post("/api/v1/bookings/quote", json=_body(cafe_id, tier_id, hours=2.0), headers=_h(gamer))).json()["data"]
        assert q["firstBookingOffer"] is False
        assert q["sessionPrice"] == 299 and q["platformFee"] == 11.96 and q["total"] == 310.96


@pytest.mark.asyncio
async def test_an_abandoned_checkout_does_not_use_up_the_first_booking():
    cafe_id, tier_id, gamer = await _setup()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        first = await c.post("/api/v1/bookings", json=_body(cafe_id, tier_id), headers=_h(gamer))
        assert first.json()["data"]["booking"]["firstBookingOffer"] is True
        # Still pending payment, so the next try is still a first booking.
        q = (await c.post("/api/v1/bookings/quote", json=_body(cafe_id, tier_id, start="16:00:00"), headers=_h(gamer))).json()["data"]
        assert q["firstBookingOffer"] is True


@pytest.mark.asyncio
async def test_offer_stops_after_its_end_date_or_cap(monkeypatch):
    cafe_id, tier_id, gamer = await _setup()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        monkeypatch.setattr(checkout_maths, "FIRST_BOOKING_OFFER_CAP", 0)
        q = (await c.post("/api/v1/bookings/quote", json=_body(cafe_id, tier_id), headers=_h(gamer))).json()["data"]
        assert q["firstBookingOffer"] is False and q["total"] == 154.96  # ₹149 + fee; the ₹1 drop stays

        monkeypatch.setattr(checkout_maths, "FIRST_BOOKING_OFFER_CAP", 500)
        monkeypatch.setattr(checkout_maths, "FIRST_BOOKING_OFFER_ENDS", datetime(2020, 1, 1, tzinfo=checkout_maths.IST))
        q = (await c.post("/api/v1/bookings/quote", json=_body(cafe_id, tier_id), headers=_h(gamer))).json()["data"]
        assert q["firstBookingOffer"] is False
