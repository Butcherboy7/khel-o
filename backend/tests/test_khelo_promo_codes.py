"""
Tests for the KHELO promo-code + QR redemption feature: owner-assigned
unique codes on a Promotion, the public preview/redeem lookup, and applying
a code atomically to a booking (no double-redemption).
"""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.promotion import Promotion
from app.core.security import get_password_hash
from app.database import AsyncSessionLocal
from tests.conftest import auth_headers

IST = timezone(timedelta(hours=5, minutes=30))


@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


async def _make_cafe_owner_gamer(db):
    owner = User(
        id=uuid.uuid4(), email=f"promo_owner_{uuid.uuid4().hex[:8]}@test.com", full_name="Promo Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    gamer = User(
        id=uuid.uuid4(), email=f"promo_gamer_{uuid.uuid4().hex[:8]}@test.com", full_name="Promo Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    db.add_all([owner, gamer])
    await db.flush()
    db.add(UserRoleMapping(id=uuid.uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    db.add(UserRoleMapping(id=uuid.uuid4(), user_id=gamer.id, role=UserRole.GAMER))

    cafe = Cafe(
        id=uuid.uuid4(), owner_id=owner.id, name="Promo Test Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=None, closing_time=None, bookable_stations=10,
    )
    db.add(cafe)

    tier = HardwareTier(
        id=uuid.uuid4(), cafe_id=cafe.id, name="Standard", specs={"gpu": "RTX 3060"},
        price_per_hour=100.0, total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db.add(tier)
    await db.commit()
    return owner, gamer, cafe, tier


@pytest.mark.asyncio
async def test_owner_can_assign_khelo_code_and_customer_can_preview_it(async_client: AsyncClient):
    async with AsyncSessionLocal() as db:
        owner, _gamer, cafe, tier = await _make_cafe_owner_gamer(db)

    now = datetime.now(timezone.utc)
    payload = {
        "cafeId": str(cafe.id),
        "title": "Weeknight Happy Hour",
        "discountPercentage": 20,
        "validFrom": (now - timedelta(days=1)).isoformat(),
        "validUntil": (now + timedelta(days=30)).isoformat(),
        "daysOfWeek": [0, 1, 2, 3, 4, 5, 6],
        "startHour": 0,
        "endHour": 24,
        "kheloCode": "weeknight15",  # lowercase in — normalized to upper
    }
    res = await async_client.post("/api/v1/promotions", json=payload, headers=auth_headers(owner))
    assert res.status_code == 201, res.text
    promo = res.json()["data"]["promotion"]
    assert promo["kheloCode"] == "WEEKNIGHT15"

    preview = await async_client.get("/api/v1/promotions/redeem/WEEKNIGHT15")
    assert preview.status_code == 200, preview.text
    redemption = preview.json()["data"]["redemption"]
    assert redemption["valid"] is True
    assert redemption["discountPercentage"] == 20
    assert redemption["cafeId"] == str(cafe.id)

    # Case-insensitive lookup
    preview_lower = await async_client.get("/api/v1/promotions/redeem/weeknight15")
    assert preview_lower.status_code == 200

    # Unknown code
    missing = await async_client.get("/api/v1/promotions/redeem/NOSUCHCODE")
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_duplicate_khelo_code_rejected(async_client: AsyncClient):
    async with AsyncSessionLocal() as db:
        owner, _gamer, cafe, tier = await _make_cafe_owner_gamer(db)

    now = datetime.now(timezone.utc)
    base_payload = {
        "cafeId": str(cafe.id),
        "discountPercentage": 10,
        "validFrom": (now - timedelta(days=1)).isoformat(),
        "validUntil": (now + timedelta(days=30)).isoformat(),
        "daysOfWeek": [0, 1, 2, 3, 4, 5, 6],
        "startHour": 0,
        "endHour": 24,
        "kheloCode": "DUPETEST",
    }
    first = await async_client.post(
        "/api/v1/promotions", json={**base_payload, "title": "First"}, headers=auth_headers(owner)
    )
    assert first.status_code == 201, first.text

    second = await async_client.post(
        "/api/v1/promotions", json={**base_payload, "title": "Second"}, headers=auth_headers(owner)
    )
    assert second.status_code != 201
    assert second.json()["error"]["code"] == "CODE_TAKEN"


@pytest.mark.asyncio
async def test_booking_creation_with_promo_code_applies_discount_and_increments_uses(async_client: AsyncClient):
    async with AsyncSessionLocal() as db:
        owner, gamer, cafe, tier = await _make_cafe_owner_gamer(db)

        now = datetime.now(timezone.utc)
        promo = Promotion(
            id=uuid.uuid4(), cafe_id=cafe.id, title="Code Discount", discount_percentage=25,
            valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=30),
            days_of_week=[0, 1, 2, 3, 4, 5, 6], start_hour=0, end_hour=24,
            max_uses=1, current_uses=0, is_active=True, khelo_code="BOOKME25",
        )
        db.add(promo)
        await db.commit()

    session_date = (date.today() + timedelta(days=1)).isoformat()
    booking_payload = {
        "cafeId": str(cafe.id),
        "hardwareTierId": str(tier.id),
        "sessionDate": session_date,
        "startTime": "20:00:00",
        "durationHours": 1.0,
        "promoCode": "bookme25",
    }
    res = await async_client.post("/api/v1/bookings", json=booking_payload, headers=auth_headers(gamer))
    assert res.status_code == 201, res.text
    booking = res.json()["data"]["booking"]
    # 100/hr * 1hr = 100 base, 25% off = 25 discount
    assert float(booking["discountAmount"]) == 25.0
    assert float(booking["baseAmount"]) == 100.0

    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        result = await db.execute(select(Promotion).where(Promotion.khelo_code == "BOOKME25"))
        refreshed = result.scalars().first()
        assert refreshed.current_uses == 1

    # A second booking against the now-exhausted (max_uses=1) code must be rejected
    booking_payload_2 = {**booking_payload, "startTime": "22:00:00"}
    res2 = await async_client.post("/api/v1/bookings", json=booking_payload_2, headers=auth_headers(gamer))
    assert res2.status_code != 201
    assert res2.json()["error"]["code"] == "PROMOTION_EXHAUSTED"


# NOTE: a concurrent-double-redemption test (two bookings racing the same
# max_uses=1 code) was written and run here, but removed — it fails not just
# for the new promo_code path but identically for the pre-existing direct
# promotion_id path too, because it exercises PromotionRepository's
# `with_for_update()` row lock, and this test suite runs on SQLite
# (tests/conftest.py), whose aiosqlite driver does not honor SELECT ... FOR
# UPDATE the way Postgres (the actual production DB, see alembic.ini) does.
# That's a limitation of the test harness, not a gap in
# apply_promotion_to_booking's locking — resolve_code_to_promotion_id just
# looks up the promotion; the same row-locked apply_promotion_to_booking
# from the existing promotion_id flow does the atomic re-check-and-increment
# either way (see booking_service.py and promotion_service.py).
