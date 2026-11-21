"""Referrals and KHEL-O credits: welcome ₹15, community code +₹15, friend reward ₹15.
See services/referrals.py and docs/superpowers/specs/2026-11-21-referrals-design.md."""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal
from app.main import app
from app.models.booking import Booking, BookingStatus
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.notification import Notification
from app.models.platform_fee import PlatformFee
from app.models.referral import Referral, ReferralCredit
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.repositories.platform_settings_repository import PlatformSettingsRepository
from app.services import referrals as R
from app.services.referrals import CreditLine, fit_lines

CODE = "KHELO-TEST"


# ---------------------------------------------------------------- pure

def test_lines_are_trimmed_to_the_ceiling_last_first():
    lines = [CreditLine("welcome", "w", Decimal(15)), CreditLine("community", "c", Decimal(15)), CreditLine("referral", "r", Decimal(15))]
    assert [(l.kind, l.amount) for l in fit_lines(lines, Decimal(30))] == [("welcome", 15), ("community", 15)]
    assert [(l.kind, l.amount) for l in fit_lines(lines, Decimal(20))] == [("welcome", 15), ("community", 5)]
    assert fit_lines(lines, Decimal(0)) == [] and fit_lines(lines, Decimal(-3)) == []


def test_codes_are_matched_ignoring_case_and_spaces():
    class S: community_code = "KHELO-TEST"
    assert R.matches_community_code(S, " khelo-test ") and not R.matches_community_code(S, "KHELO")
    assert R.matches_community_code(S, "KHELOTEST")  # checkout's box drops the dash
    S.community_code = None
    assert not R.matches_community_code(S, "")


# ---------------------------------------------------------------- setup

async def _settings(on=True, code=CODE):
    async with AsyncSessionLocal() as db:
        s = await PlatformSettingsRepository(db).get_or_create()
        s.referrals_on, s.community_code = on, code
        s.welcome_credit = s.community_credit = s.referral_reward = 15
        await db.commit()


@pytest.fixture(autouse=True)
async def _referrals_off_after():
    yield
    await _settings(on=False, code=None)


async def _user(db, phone=None, days_old=0):
    u = User(id=uuid4(), email=f"rf_{uuid4().hex[:8]}@test.com", full_name="Player",
             password_hash=get_password_hash("x12345678"), role=UserRole.GAMER, is_active=True, phone_number=phone,
             created_at=datetime.now(timezone.utc) - timedelta(days=days_old))
    db.add(u)
    await db.flush()
    db.add(UserRoleMapping(id=uuid4(), user_id=u.id, role=UserRole.GAMER))
    return u


async def _cafe(price=150.0):
    async with AsyncSessionLocal() as db:
        owner = User(id=uuid4(), email=f"rf_own_{uuid4().hex[:8]}@test.com", full_name="Owner",
                     password_hash=get_password_hash("x12345678"), role=UserRole.CAFE_OWNER, is_active=True)
        db.add(owner)
        await db.flush()
        cafe = Cafe(id=uuid4(), owner_id=owner.id, name=f"Ref Cafe {uuid4().hex[:5]}", address_line1="1 St",
                    city="Hyderabad", state="Telangana", pincode="500001", phone_number="+919000000092",
                    verification_status=VerificationStatus.VERIFIED, is_active=True,
                    opening_time=time(0, 0), closing_time=time(23, 59), bookable_stations=4)
        db.add(cafe)
        tier = HardwareTier(id=uuid4(), cafe_id=cafe.id, name="PS5", specs={}, price_per_hour=price,
                            total_seats=4, app_bookable_seats=4, active_seats_count=4, is_active=True)
        db.add(tier)
        await db.commit()
        return cafe.id, tier.id


def _body(cafe_id, tier_id, start="12:00:00", code=None):
    b = {"cafeId": str(cafe_id), "hardwareTierId": str(tier_id), "sessionDate": str(date.today() + timedelta(days=3)),
         "startTime": start, "durationHours": 1.0, "seatsCount": 1}
    if code:
        b["promoCode"] = code
    return b


def _h(user):
    return {"Authorization": f"Bearer {create_access_token(subject=str(user.id), role=user.role.value)}"}


async def _paid_booking(db, user, cafe_id, tier_id, status=BookingStatus.COMPLETED):
    b = Booking(id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=user.id, cafe_id=cafe_id,
                hardware_tier_id=tier_id, session_date=date.today() - timedelta(days=5), start_time=time(10, 0),
                end_time=time(11, 0), duration_hours=1.0, base_amount=150, discount_amount=0, gateway_fee=0,
                total_amount=149, status=status)
    db.add(b)
    await db.commit()
    return b


# ---------------------------------------------------------------- API

@pytest.mark.asyncio
async def test_switched_off_nothing_changes():
    await _settings(on=False)
    cafe_id, tier_id = await _cafe()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        q = (await c.post("/api/v1/bookings/quote", json=_body(cafe_id, tier_id, code=CODE))).json()["data"]
        assert q["kheloCredit"] == 0 and q["creditLines"] == [] and q["communityHint"] == 0
        offer = (await c.get("/api/v1/referrals/offer")).json()["data"]
        assert offer["on"] is False and "code" not in str(offer).lower().replace("community", "")


@pytest.mark.asyncio
async def test_first_booking_gets_welcome_and_the_community_code_and_the_cafe_is_still_owed_150():
    await _settings()
    cafe_id, tier_id = await _cafe()
    async with AsyncSessionLocal() as db:
        gamer = await _user(db)
        await db.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        q = (await c.post("/api/v1/bookings/quote", json=_body(cafe_id, tier_id))).json()["data"]
        assert q["total"] == 134 and q["kheloCredit"] == 15 and q["communityHint"] == 15
        assert [l["kind"] for l in q["creditLines"]] == ["welcome"]

        # Typed in the normal code box, any case: taken as the community code, not a café promo.
        q = (await c.post("/api/v1/bookings/quote", json=_body(cafe_id, tier_id, code="khelo-test"), headers=_h(gamer))).json()["data"]
        assert q["total"] == 119 and q["kheloCredit"] == 30 and q["communityHint"] == 0 and q["offerNote"] is None
        assert q["kheloDiscount"] == 1 and q["sessionPrice"] == 149

        res = await c.post("/api/v1/bookings", json=_body(cafe_id, tier_id, code="KHELO-TEST"), headers=_h(gamer))
        assert res.status_code == 201, res.text
        b = res.json()["data"]["booking"]
        assert b["totalAmount"] == 119 and b["kheloDiscount"] == 31 and b["kheloCredit"] == 30
        assert b["creditNote"] == "welcome+community"
        # The public offer never gives the code away.
        assert CODE not in (await c.get("/api/v1/referrals/offer")).text
    async with AsyncSessionLocal() as db:
        fee = (await db.execute(select(PlatformFee).where(PlatformFee.booking_id == UUID(b["id"])))).scalars().one()
        assert float(fee.owner_settlement_amount) == 150.0


@pytest.mark.asyncio
async def test_community_code_after_the_first_booking_says_so_and_cheap_sessions_get_nothing():
    await _settings()
    cafe_id, tier_id = await _cafe()
    async with AsyncSessionLocal() as db:
        gamer = await _user(db)
        await _paid_booking(db, gamer, cafe_id, tier_id)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        q = (await c.post("/api/v1/bookings/quote", json=_body(cafe_id, tier_id, code=CODE), headers=_h(gamer))).json()["data"]
        assert q["kheloCredit"] == 0 and "first booking" in q["offerNote"]

    cheap_cafe, cheap_tier = await _cafe(price=40.0)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        q = (await c.post("/api/v1/bookings/quote", json=_body(cheap_cafe, cheap_tier))).json()["data"]
        assert q["kheloCredit"] == 0 and q["total"] == 39  # ₹40 → ₹39 price drop, no credit


@pytest.mark.asyncio
async def test_claiming_a_link_follows_the_rules():
    await _settings()
    async with AsyncSessionLocal() as db:
        a = await _user(db, phone="+91 98480 22338")
        b = await _user(db)
        twin = await _user(db, phone="9848022338")
        old = await _user(db, days_old=30)
        await db.commit()
    code = R.invite_code(a.id)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        claim = lambda u, k=code: c.post("/api/v1/referrals/claim", json={"code": k}, headers=_h(u))
        assert (await claim(a)).json()["data"]["status"] == "own"
        assert (await claim(twin)).json()["data"]["status"] == "own"         # same phone number
        assert (await claim(old)).json()["data"]["status"] == "not_new"
        assert (await claim(b, "zzzzzzzzzz")).json()["data"]["status"] == "not_found"
        assert (await claim(b)).json()["data"]["status"] == "joined"
        assert (await claim(b)).json()["data"]["status"] == "already"
        me = (await c.get("/api/v1/referrals/me", headers=_h(a))).json()["data"]
        assert me["joined"] == 1 and me["played"] == 0 and me["available"] == 0


@pytest.mark.asyncio
async def test_friend_plays_referrer_gets_15_off_which_is_used_once_and_comes_back_on_cancel():
    await _settings()
    cafe_id, tier_id = await _cafe()
    async with AsyncSessionLocal() as db:
        a = await _user(db)
        b = await _user(db)
        await _paid_booking(db, a, cafe_id, tier_id)  # A is a returning player: no welcome
        db.add(Referral(id=uuid4(), referrer_id=a.id, referred_id=b.id, code=R.invite_code(a.id), status="joined"))
        await db.commit()
        friend_booking = await _paid_booking(db, b, cafe_id, tier_id, status=BookingStatus.CHECKED_IN)
        assert await R.on_checked_in(db, friend_booking) == "rewarded"
        assert await R.on_checked_in(db, friend_booking) is None  # only once
        notes = (await db.execute(select(Notification).where(Notification.user_id == a.id))).scalars().all()
        assert any("₹15 off" in n.title for n in notes)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        q = (await c.post("/api/v1/bookings/quote", json=_body(cafe_id, tier_id), headers=_h(a))).json()["data"]
        assert [l["kind"] for l in q["creditLines"]] == ["referral"] and q["kheloCredit"] == 15
        res = await c.post("/api/v1/bookings", json=_body(cafe_id, tier_id, start="15:00:00"), headers=_h(a))
        bk = res.json()["data"]["booking"]
        assert bk["kheloCredit"] == 15 and bk["creditNote"] == "referral"

    async with AsyncSessionLocal() as db:
        booking = await db.get(Booking, UUID(bk["id"]))
        await R.on_paid(db, booking)
        credit = (await db.execute(select(ReferralCredit).where(ReferralCredit.user_id == a.id))).scalar_one()
        assert credit.status == "used" and credit.used_booking_id == booking.id
        assert await R.available_credit(db, a.id) is None
        await R.on_cancelled(db, booking.id)
        await db.refresh(credit)
        assert credit.status == "available" and credit.used_booking_id is None


@pytest.mark.asyncio
async def test_referrer_cap_and_admin_void():
    await _settings()
    cafe_id, tier_id = await _cafe()
    async with AsyncSessionLocal() as db:
        a = await _user(db)
        friends = [await _user(db) for _ in range(R.REFERRER_CAP + 1)]
        for f in friends:
            db.add(Referral(id=uuid4(), referrer_id=a.id, referred_id=f.id, code=R.invite_code(a.id), status="joined"))
        await db.commit()
        results = []
        for f in friends:
            results.append(await R.on_checked_in(db, await _paid_booking(db, f, cafe_id, tier_id, status=BookingStatus.CHECKED_IN)))
        assert results.count("rewarded") == R.REFERRER_CAP and results[-1] == "capped"
        admin = User(id=uuid4(), email=f"rf_adm_{uuid4().hex[:6]}@test.com", full_name="Admin",
                     password_hash=get_password_hash("x12345678"), role=UserRole.ADMIN, is_active=True)
        db.add(admin)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=admin.id, role=UserRole.ADMIN))
        await db.commit()
        ref_id = (await db.execute(select(Referral.id).where(Referral.referred_id == friends[0].id))).scalar_one()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = (await c.post(f"/api/v1/admin/referrals/{ref_id}/void", json={"reason": "same person"}, headers=_h(admin))).json()["data"]
        assert r["creditsVoided"] == 1
        page = (await c.get("/api/v1/admin/referrals", headers=_h(admin))).json()["data"]
        assert page["settings"]["communityCode"] == CODE and page["referrals"]["void"] >= 1
        bad = await c.put("/api/v1/admin/referrals/settings", json={"communityCode": "a b!"}, headers=_h(admin))
        assert bad.status_code == 422 or bad.json()["success"] is False
        ok = (await c.put("/api/v1/admin/referrals/settings", json={"communityCode": "gta-squad"}, headers=_h(admin))).json()["data"]
        assert ok["communityCode"] == "GTA-SQUAD"
        # Non-admins can't see it.
        assert (await c.get("/api/v1/admin/referrals", headers=_h(friends[1]))).status_code in (401, 403)
