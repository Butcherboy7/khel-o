"""Drops: public page, early access, deposits, 2-seat limit, 10-minute hold,
seat counts under concurrency, refunds, check-in, waitlist and the café view."""
import asyncio
import hashlib
import hmac
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update

from app.config import settings
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal
from app.main import app
from app.models.cafe import Cafe, VerificationStatus
from app.models.drop import Drop, DropBlock, DropReservation
from app.models.promotion import Promotion, PromotionType
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.services import drop_service as svc

DAY = date.today() + timedelta(days=10)
NOW = lambda: datetime.now(timezone.utc)  # noqa: E731


@pytest.fixture(autouse=True)
def fake_razorpay(monkeypatch):
    calls = []

    def fake_post(path, body):
        calls.append((path, body))
        if path == "orders":
            return {"id": f"order_t_{uuid4().hex[:10]}"}
        return {"id": f"rfnd_t_{uuid4().hex[:8]}"}

    monkeypatch.setattr(svc, "_rzp_post", fake_post)
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "drop-test-secret")
    return calls


def _sign(order_id: str, payment_id: str) -> str:
    return hmac.new(b"drop-test-secret", f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()


def _h(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(subject=str(user.id), role=user.role.value)}"}


async def _user(role=UserRole.GAMER, phone="9876543210") -> User:
    async with AsyncSessionLocal() as db:
        u = User(id=uuid4(), email=f"drop_{uuid4().hex[:8]}@test.com", full_name="Ravi Kumar", phone_number=phone,
                 password_hash=get_password_hash("x12345678"), role=role, is_active=True)
        db.add(u)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=u.id, role=UserRole.GAMER))
        if role != UserRole.GAMER:
            db.add(UserRoleMapping(id=uuid4(), user_id=u.id, role=role))
        await db.commit()
        return u


async def _drop(seats=4, state="open", deposit=99, price=250, code="EARLY1"):
    owner = await _user(UserRole.CAFE_OWNER)
    now = NOW()
    early, public = {
        "open": (now - timedelta(days=2), now - timedelta(days=1)),
        "early": (now - timedelta(hours=1), now + timedelta(days=1)),
        "soon": (now + timedelta(days=1), now + timedelta(days=2)),
    }[state]
    async with AsyncSessionLocal() as db:
        cafe = Cafe(id=uuid4(), owner_id=owner.id, name=f"AdamsDen {uuid4().hex[:4]}", address_line1="KPHB Colony",
                    city="Hyderabad", state="Telangana", pincode="500072", phone_number="+919000000002",
                    verification_status=VerificationStatus.VERIFIED, is_active=True,
                    opening_time=time(10, 0), closing_time=time(23, 59), bookable_stations=4)
        db.add(cafe)
        drop = Drop(id=uuid4(), slug=f"gta6-{uuid4().hex[:8]}", cafe_id=cafe.id, title="GTA 6 Launch Drop", game="GTA 6",
                    price_per_hour=price, deposit_amount=deposit, max_seats_per_user=2, early_access_code=code,
                    early_access_starts_at=early, public_starts_at=public, status="live")
        db.add(drop)
        block = DropBlock(id=uuid4(), drop_id=drop.id, session_date=DAY, start_time=time(18, 0), end_time=time(23, 0),
                          seats_total=seats)
        block2 = DropBlock(id=uuid4(), drop_id=drop.id, session_date=DAY + timedelta(days=2), start_time=time(18, 0),
                           end_time=time(23, 0), seats_total=seats)
        db.add_all([block, block2])
        await db.commit()
        return drop, block, block2, owner, cafe


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _reserve(c, drop, block, user, seats=1, code=None):
    return await c.post(f"/api/v1/drops/{drop.slug}/reserve", json={"blockId": str(block.id), "seats": seats, "code": code},
                        headers=_h(user))


async def _pay(c, user, order_id, payment_id=None):
    payment_id = payment_id or f"pay_t_{uuid4().hex[:8]}"
    return await c.post("/api/v1/drops/reservations/verify", headers=_h(user), json={
        "razorpayOrderId": order_id, "razorpayPaymentId": payment_id, "razorpaySignature": _sign(order_id, payment_id)})


async def _taken(block_id) -> int:
    async with AsyncSessionLocal() as db:
        return (await db.get(DropBlock, block_id)).seats_taken


# ---------------------------------------------------------------- public page

@pytest.mark.asyncio
async def test_page_needs_no_login_and_shows_prices_and_seats():
    drop, block, _, _, _ = await _drop(seats=4)
    async with _client() as c:
        r = await c.get(f"/api/v1/drops/{drop.slug}")
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["state"] == "open" and d["cafe"]["mapsUrl"].startswith("https://www.google.com/maps/")
    b = d["blocks"][0]
    assert b["seatsLeft"] == 4 and b["seatsTotal"] == 4 and b["hours"] == 5
    assert b["pricePerSeat"] == 1250 and b["balancePerSeat"] == 1151
    assert "earlyAccessCode" not in d and d["myReservations"] == []


@pytest.mark.asyncio
async def test_draft_drop_is_hidden_from_the_public():
    drop, *_ = await _drop()
    async with AsyncSessionLocal() as db:
        await db.execute(update(Drop).where(Drop.id == drop.id).values(status="draft"))
        await db.commit()
    async with _client() as c:
        assert (await c.get(f"/api/v1/drops/{drop.slug}")).status_code == 404


# ---------------------------------------------------------------- reserving

@pytest.mark.asyncio
async def test_reserve_pay_and_get_a_qr_pass(fake_razorpay):
    drop, block, _, _, _ = await _drop()
    gamer = await _user()
    async with _client() as c:
        r = await _reserve(c, drop, block, gamer, seats=2)
        assert r.status_code == 201, r.text
        data = r.json()["data"]
        assert data["order"]["amount"] == 198  # 2 x ₹99 deposit
        assert fake_razorpay[0][1]["amount"] == 19800  # paise
        res = data["reservation"]
        assert res["status"] == "pending_payment" and res["qr"] is None
        assert res["blockPrice"] == 2500 and res["balanceDue"] == 2302
        assert await _taken(block.id) == 2

        r = await _pay(c, gamer, data["order"]["orderId"])
        assert r.status_code == 200, r.text
        out = r.json()["data"]
        assert out["outcome"] == "confirmed"
        assert out["reservation"]["status"] == "confirmed" and out["reservation"]["qr"].startswith("data:image/png")
        page = (await c.get(f"/api/v1/drops/{drop.slug}", headers=_h(gamer))).json()["data"]
        assert page["blocks"][0]["seatsLeft"] == 2 and page["myReservations"][0]["passUrl"]


@pytest.mark.asyncio
async def test_forged_signature_does_not_confirm():
    drop, block, *_ = await _drop()
    gamer = await _user()
    async with _client() as c:
        order = (await _reserve(c, drop, block, gamer)).json()["data"]["order"]["orderId"]
        r = await c.post("/api/v1/drops/reservations/verify", headers=_h(gamer), json={
            "razorpayOrderId": order, "razorpayPaymentId": "pay_x", "razorpaySignature": "forged"})
        assert r.status_code == 400
    async with AsyncSessionLocal() as db:
        res = (await db.execute(select(DropReservation).where(DropReservation.razorpay_order_id == order))).scalars().one()
        assert res.status == "pending_payment"


@pytest.mark.asyncio
async def test_two_seats_per_person_per_drop_across_blocks():
    drop, block, block2, *_ = await _drop()
    gamer = await _user()
    async with _client() as c:
        assert (await _reserve(c, drop, block, gamer, seats=3)).status_code == 400
        assert (await _reserve(c, drop, block, gamer, seats=1)).status_code == 201
        assert (await _reserve(c, drop, block2, gamer, seats=1)).status_code == 201
        r = await _reserve(c, drop, block2, gamer, seats=1)
        assert r.status_code == 400 and r.json()["error"]["code"] == "SEAT_LIMIT"


@pytest.mark.asyncio
async def test_sold_out_block_refuses_the_next_person():
    drop, block, *_ = await _drop(seats=1)
    a, b = await _user(), await _user()
    async with _client() as c:
        assert (await _reserve(c, drop, block, a)).status_code == 201
        r = await _reserve(c, drop, block, b)
        assert r.status_code == 400 and r.json()["error"]["code"] == "SOLD_OUT"
    assert await _taken(block.id) == 1


@pytest.mark.asyncio
async def test_need_phone_before_reserving():
    drop, block, *_ = await _drop()
    gamer = await _user(phone=None)
    async with _client() as c:
        r = await _reserve(c, drop, block, gamer)
        assert r.status_code == 400 and r.json()["error"]["code"] == "NEED_PHONE"
        r = await c.post(f"/api/v1/drops/{drop.slug}/reserve", headers=_h(gamer),
                         json={"blockId": str(block.id), "seats": 1, "phone": "98765 43210"})
        assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_no_coupon_or_cafe_offer_touches_a_drop():
    drop, block, _, _, cafe = await _drop()
    async with AsyncSessionLocal() as db:
        db.add(Promotion(id=uuid4(), cafe_id=cafe.id, title="Everything 50% off", promotion_type=PromotionType.PERCENTAGE,
                         discount_percentage=50, valid_from=NOW() - timedelta(days=1), valid_until=NOW() + timedelta(days=30),
                         is_active=True, khelo_code="HALF", start_hour=0, end_hour=24,
                         days_of_week=[0, 1, 2, 3, 4, 5, 6], current_uses=0))
        await db.commit()
    gamer = await _user()
    async with _client() as c:
        r = await c.post(f"/api/v1/drops/{drop.slug}/reserve", headers=_h(gamer),
                         json={"blockId": str(block.id), "seats": 1, "promoCode": "HALF", "code": "HALF"})
    assert r.status_code == 201
    res = r.json()["data"]["reservation"]
    assert res["blockPrice"] == 1250 and res["deposit"] == 99 and res["balanceDue"] == 1151


# ---------------------------------------------------------------- early access

@pytest.mark.asyncio
async def test_early_access_needs_the_code():
    drop, block, *_ = await _drop(state="early", code="KHELO6")
    gamer = await _user()
    async with _client() as c:
        r = await _reserve(c, drop, block, gamer)
        assert r.status_code == 400 and r.json()["error"]["code"] == "EARLY_ACCESS_CODE"
        assert (await _reserve(c, drop, block, gamer, code="wrong")).status_code == 400
        r = await _reserve(c, drop, block, gamer, code=" khelo6 ")
        assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_before_early_access_nobody_can_reserve_but_can_join_the_waitlist():
    drop, block, *_ = await _drop(state="soon", code="KHELO6")
    gamer = await _user()
    async with _client() as c:
        r = await _reserve(c, drop, block, gamer, code="KHELO6")
        assert r.status_code == 400 and r.json()["error"]["code"] == "DROP_NOT_OPEN"
        r1 = await c.post(f"/api/v1/drops/{drop.slug}/waitlist", json={"phone": "+91 98765 43210"})
        r2 = await c.post(f"/api/v1/drops/{drop.slug}/waitlist", json={"phone": "9876543210"})
        r3 = await c.post(f"/api/v1/drops/{drop.slug}/waitlist", json={"phone": "9123456780"})
        assert r1.status_code == 201 and r2.json()["data"] == {"count": 1, "added": False}
        assert r3.json()["data"]["count"] == 2
        assert (await c.post(f"/api/v1/drops/{drop.slug}/waitlist", json={"phone": "12345"})).status_code in (400, 422)


# ---------------------------------------------------------------- 10-minute hold

async def _expire(order_id):
    async with AsyncSessionLocal() as db:
        await db.execute(update(DropReservation).where(DropReservation.razorpay_order_id == order_id)
                         .values(expires_at=NOW() - timedelta(minutes=1)))
        await db.commit()


@pytest.mark.asyncio
async def test_unpaid_seat_is_released_after_ten_minutes():
    drop, block, *_ = await _drop(seats=1)
    a, b = await _user(), await _user()
    async with _client() as c:
        order = (await _reserve(c, drop, block, a)).json()["data"]["order"]["orderId"]
        assert (await _reserve(c, drop, block, b)).json()["error"]["code"] == "SOLD_OUT"
        await _expire(order)
        page = (await c.get(f"/api/v1/drops/{drop.slug}")).json()["data"]
        assert page["blocks"][0]["seatsLeft"] == 1
        assert (await _reserve(c, drop, block, b)).status_code == 201
    assert await _taken(block.id) == 1


@pytest.mark.asyncio
async def test_late_payment_takes_a_free_seat():
    drop, block, *_ = await _drop(seats=2)
    a = await _user()
    async with _client() as c:
        order = (await _reserve(c, drop, block, a)).json()["data"]["order"]["orderId"]
        await _expire(order)
        await c.get(f"/api/v1/drops/{drop.slug}")  # releases it
        assert await _taken(block.id) == 0
        r = await _pay(c, a, order)
        assert r.json()["data"]["outcome"] == "confirmed_late"
    assert await _taken(block.id) == 1


@pytest.mark.asyncio
async def test_late_payment_when_the_seat_is_gone_is_refunded(fake_razorpay):
    drop, block, *_ = await _drop(seats=1)
    a, b = await _user(), await _user()
    async with _client() as c:
        order = (await _reserve(c, drop, block, a)).json()["data"]["order"]["orderId"]
        await _expire(order)
        order_b = (await _reserve(c, drop, block, b)).json()["data"]["order"]["orderId"]
        await _pay(c, b, order_b)
        r = await _pay(c, a, order)
        assert r.json()["data"]["outcome"] == "refunded_late"
        assert r.json()["data"]["reservation"]["status"] == "refunded"
    assert any(p.endswith("/refund") for p, _ in fake_razorpay)
    assert await _taken(block.id) == 1


@pytest.mark.asyncio
async def test_webhook_confirms_and_repeats_are_harmless():
    drop, block, *_ = await _drop()
    a = await _user()
    async with _client() as c:
        order = (await _reserve(c, drop, block, a)).json()["data"]["order"]["orderId"]
    async with AsyncSessionLocal() as db:
        assert await svc.handle_webhook_capture(db, order, "pay_w1") == "confirmed"
    async with AsyncSessionLocal() as db:
        assert await svc.handle_webhook_capture(db, order, "pay_w1") == "already_paid"
        assert await svc.handle_webhook_capture(db, "order_unknown", "pay_w1") is None
    assert await _taken(block.id) == 1


# ---------------------------------------------------------------- concurrency

@pytest.mark.asyncio
async def test_many_people_at_once_never_oversell():
    drop, block, *_ = await _drop(seats=4)
    people = [await _user() for _ in range(10)]
    async with _client() as c:
        results = await asyncio.gather(*[_reserve(c, drop, block, p) for p in people], return_exceptions=True)
    codes = [r.status_code for r in results if not isinstance(r, Exception)]
    assert codes.count(201) == 4, codes
    assert await _taken(block.id) == 4
    async with AsyncSessionLocal() as db:
        held = (await db.execute(select(DropReservation).where(DropReservation.block_id == block.id))).scalars().all()
        assert sum(r.seats for r in held) == 4


@pytest.mark.asyncio
async def test_seat_take_is_atomic_even_from_a_stale_read():
    """Two sessions both 'see' one seat left; only one conditional UPDATE wins."""
    drop, block, *_ = await _drop(seats=1)
    async with AsyncSessionLocal() as s1, AsyncSessionLocal() as s2:
        b1, b2 = await s1.get(DropBlock, block.id), await s2.get(DropBlock, block.id)
        assert b1.seats_taken == b2.seats_taken == 0  # both think it's free
        first = await svc._take(s1, block.id, 1)
        await s1.commit()
        second = await svc._take(s2, block.id, 1)
        await s2.commit()
    assert (first, second) == (True, False)
    assert await _taken(block.id) == 1


@pytest.mark.asyncio
async def test_release_expired_gives_a_seat_back_only_once():
    drop, block, *_ = await _drop(seats=2)
    a = await _user()
    async with _client() as c:
        order = (await _reserve(c, drop, block, a)).json()["data"]["order"]["orderId"]
    await _expire(order)
    async with AsyncSessionLocal() as s1, AsyncSessionLocal() as s2:
        n = await svc.release_expired(s1, drop.id) + await svc.release_expired(s2, drop.id)
    assert n == 1 and await _taken(block.id) == 0


# ---------------------------------------------------------------- café side

@pytest.mark.asyncio
async def test_cafe_sees_reservations_checks_in_and_exports_csv():
    drop, block, _, owner, _ = await _drop()
    gamer, stranger = await _user(), await _user(UserRole.CAFE_OWNER)
    async with _client() as c:
        order = (await _reserve(c, drop, block, gamer)).json()["data"]["order"]["orderId"]
        res = (await _pay(c, gamer, order)).json()["data"]["reservation"]
        token = res["passUrl"].rsplit("/", 1)[-1]

        assert (await c.get(f"/api/v1/owner/drops/{drop.id}", headers=_h(stranger))).status_code == 403
        assert (await c.post("/api/v1/owner/drops/check-in", json={"token": token}, headers=_h(stranger))).status_code == 403
        assert (await c.post("/api/v1/owner/drops/check-in", json={"token": token}, headers=_h(gamer))).status_code == 403

        seen = (await c.get(f"/api/v1/drops/{drop.slug}/pass/{token}", headers=_h(owner))).json()["data"]
        assert seen["canCheckIn"] is True and seen["holderName"] == "Ravi Kumar"
        anon = (await c.get(f"/api/v1/drops/{drop.slug}/pass/{token}")).json()["data"]
        assert anon["valid"] is True and "holderPhone" not in anon

        r = await c.post("/api/v1/owner/drops/check-in", json={"token": res["passUrl"]}, headers=_h(owner))
        assert r.status_code == 200 and r.json()["data"]["outcome"] == "checked_in"
        r = await c.post("/api/v1/owner/drops/check-in", json={"token": token}, headers=_h(owner))
        assert r.json()["data"]["outcome"] == "already"

        detail = (await c.get(f"/api/v1/owner/drops/{drop.id}", headers=_h(owner))).json()["data"]
        assert detail["totals"]["checkedIn"] == 1 and detail["totals"]["depositsCollected"] == 99
        assert detail["blocks"][0]["reservations"][0]["status"] == "checked_in"
        assert detail["earlyAccessCode"] == "EARLY1"
        assert detail["funnel"]["paymentStarted"] == 1 and detail["funnel"]["paymentSuccess"] == 1

        csv = await c.get(f"/api/v1/owner/drops/{drop.id}/export.csv", headers=_h(owner))
        assert csv.status_code == 200 and "Ravi Kumar" in csv.text and "9876543210" in csv.text


@pytest.mark.asyncio
async def test_owner_creates_a_drop_and_blocks_must_end_before_midnight():
    owner = await _user(UserRole.CAFE_OWNER)
    async with AsyncSessionLocal() as db:
        cafe = Cafe(id=uuid4(), owner_id=owner.id, name="Make Drop Cafe", address_line1="1 Rd", city="Hyderabad",
                    state="Telangana", pincode="500072", phone_number="+919000000003",
                    verification_status=VerificationStatus.VERIFIED, is_active=True,
                    opening_time=time(10, 0), closing_time=time(23, 59), bookable_stations=4)
        db.add(cafe)
        await db.commit()
    body = {"cafeId": str(cafe.id), "title": "GTA 6 Launch Drop", "game": "GTA 6", "pricePerHour": 300,
            "earlyAccessStartsAt": NOW().isoformat(), "publicStartsAt": (NOW() + timedelta(days=1)).isoformat(),
            "earlyAccessCode": "khelo6", "status": "live",
            "blocks": [{"date": str(DAY), "startTime": "18:00", "endTime": "23:00", "seats": 4}]}
    async with _client() as c:
        r = await c.post("/api/v1/owner/drops", json=body, headers=_h(owner))
        assert r.status_code == 201, r.text
        d = r.json()["data"]
        assert d["deposit"] == 99 and d["state"] == "early" and d["slug"].startswith("gta-6-launch-drop")
        bad = {**body, "blocks": [{"date": str(DAY), "startTime": "22:00", "endTime": "01:00", "seats": 4}]}
        assert (await c.post("/api/v1/owner/drops", json=bad, headers=_h(owner))).status_code == 422
        listed = (await c.get("/api/v1/owner/drops", headers=_h(owner))).json()["data"]
        assert listed["suggestedPrice"] == [250, 300] and len(listed["drops"]) == 1
        # seats can't go below what's reserved
        gamer = await _user()
        drop = (await c.get(f"/api/v1/drops/{d['slug']}")).json()["data"]
        await c.post(f"/api/v1/drops/{d['slug']}/reserve", headers=_h(gamer),
                     json={"blockId": drop["blocks"][0]["id"], "seats": 2, "code": "KHELO6"})
        r = await c.patch(f"/api/v1/owner/drops/{d['id']}/blocks/{drop['blocks'][0]['id']}", json={"seats": 1}, headers=_h(owner))
        assert r.status_code == 400
        # Prices can change while live; the existing reservation keeps the price it was made at.
        r = await c.patch(f"/api/v1/owner/drops/{d['id']}", json={"pricePerHour": 200}, headers=_h(owner))
        assert r.status_code == 200, r.text
        mine = (await c.get(f"/api/v1/drops/{d['slug']}", headers=_h(gamer))).json()["data"]
        assert mine["pricePerHour"] == 200 and mine["myReservations"][0]["blockPrice"] == 3000  # made at 300 an hour


# ---------------------------------------------------------------- refunds

@pytest.mark.asyncio
async def test_bulk_refund_dry_run_then_real(fake_razorpay):
    drop, block, *_ = await _drop()
    a, b = await _user(), await _user()
    async with _client() as c:
        for p in (a, b):
            order = (await _reserve(c, drop, block, p)).json()["data"]["order"]["orderId"]
            await _pay(c, p, order)
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(DropReservation).where(DropReservation.drop_id == drop.id))).scalars().all()
        assert [await svc.refund(db, r, "Game delayed", dry_run=True) for r in rows] == ["would_refund"] * 2
    assert not any(p.endswith("/refund") for p, _ in fake_razorpay)
    assert await _taken(block.id) == 2
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(DropReservation).where(DropReservation.drop_id == drop.id))).scalars().all()
        assert [await svc.refund(db, r, "Game delayed") for r in rows] == ["refunded"] * 2
        assert [await svc.refund(db, r, "Game delayed") for r in rows] == ["already_refunded"] * 2
    assert sum(p.endswith("/refund") for p, _ in fake_razorpay) == 2
    assert await _taken(block.id) == 0
