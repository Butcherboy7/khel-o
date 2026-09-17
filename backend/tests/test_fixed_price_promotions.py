"""
Tests for the FIXED_PRICE promotion type (e.g. "4 hours for ₹360") added
alongside the existing PERCENTAGE type — covers create, apply-to-booking,
duration mismatch rejection, editing (including clearing optional fields),
type-lock-after-redemption, and cross-field date/hour validation on update.
"""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.core.security import get_password_hash
from app.database import AsyncSessionLocal
from tests.conftest import auth_headers


@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


async def _make_cafe_owner(db):
    owner = User(
        id=uuid.uuid4(), email=f"fp_owner_{uuid.uuid4().hex[:8]}@test.com", full_name="FP Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    db.add(owner)
    await db.flush()
    db.add(UserRoleMapping(id=uuid.uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))

    cafe = Cafe(
        id=uuid.uuid4(), owner_id=owner.id, name="Fixed Price Test Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543211",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=None, closing_time=None, bookable_stations=10,
    )
    db.add(cafe)

    tier = HardwareTier(
        id=uuid.uuid4(), cafe_id=cafe.id, name="Standard", specs={"gpu": "RTX 3060"},
        price_per_hour=120.0, total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db.add(tier)
    await db.commit()
    return owner, cafe, tier


def _fixed_price_payload(cafe_id, tier_id, now):
    return {
        "cafeId": str(cafe_id),
        "title": "4 Hours Gaming Deal",
        "promotionType": "fixed_price",
        "fixedPriceAmount": 360,
        "minDurationHours": 4,
        "applicableTierId": str(tier_id),
        "validFrom": (now - timedelta(days=1)).isoformat(),
        "validUntil": (now + timedelta(days=30)).isoformat(),
        "daysOfWeek": [0, 1, 2, 3, 4, 5, 6],
        "startHour": 0,
        "endHour": 24,
    }


@pytest.mark.asyncio
async def test_create_fixed_price_deal_requires_tier(async_client: AsyncClient):
    async with AsyncSessionLocal() as db:
        owner, cafe, tier = await _make_cafe_owner(db)

    now = datetime.now(timezone.utc)
    payload = _fixed_price_payload(cafe.id, tier.id, now)
    payload["applicableTierId"] = None

    resp = await async_client.post("/api/v1/promotions", json=payload, headers=auth_headers(owner))
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "FIXED_PRICE_REQUIRES_TIER"


@pytest.mark.asyncio
async def test_create_and_apply_fixed_price_deal_to_matching_duration(async_client: AsyncClient):
    async with AsyncSessionLocal() as db:
        owner, cafe, tier = await _make_cafe_owner(db)

    now = datetime.now(timezone.utc)
    payload = _fixed_price_payload(cafe.id, tier.id, now)
    resp = await async_client.post("/api/v1/promotions", json=payload, headers=auth_headers(owner))
    assert resp.status_code == 201, resp.text
    promo_id = resp.json()["data"]["promotion"]["id"]

    from app.repositories.promotion_repository import PromotionRepository
    from app.repositories.cafe_repository import CafeRepository
    from app.repositories.hardware_tier_repository import HardwareTierRepository
    from app.services.promotion_service import PromotionService

    async with AsyncSessionLocal() as db:
        service = PromotionService(PromotionRepository(db), CafeRepository(db), HardwareTierRepository(db))
        # 4 hours @ ₹120/hr = ₹480 regular; deal price ₹360 → discount ₹120
        discount = await service.apply_promotion_to_booking(
            promotion_id=uuid.UUID(promo_id),
            cafe_id=cafe.id,
            tier_id=tier.id,
            base_amount=Decimal("480.00"),
            session_datetime=now,
            duration_hours=Decimal("4"),
            seats_count=1,
        )
        assert discount == Decimal("120.00")


@pytest.mark.asyncio
async def test_fixed_price_deal_rejects_non_matching_duration(async_client: AsyncClient):
    async with AsyncSessionLocal() as db:
        owner, cafe, tier = await _make_cafe_owner(db)

    now = datetime.now(timezone.utc)
    payload = _fixed_price_payload(cafe.id, tier.id, now)
    resp = await async_client.post("/api/v1/promotions", json=payload, headers=auth_headers(owner))
    promo_id = resp.json()["data"]["promotion"]["id"]

    from app.repositories.promotion_repository import PromotionRepository
    from app.repositories.cafe_repository import CafeRepository
    from app.repositories.hardware_tier_repository import HardwareTierRepository
    from app.services.promotion_service import PromotionService
    from app.core.exceptions import ValidationException

    async with AsyncSessionLocal() as db:
        service = PromotionService(PromotionRepository(db), CafeRepository(db), HardwareTierRepository(db))
        with pytest.raises(ValidationException) as exc_info:
            await service.apply_promotion_to_booking(
                promotion_id=uuid.UUID(promo_id),
                cafe_id=cafe.id,
                tier_id=tier.id,
                base_amount=Decimal("360.00"),
                session_datetime=now,
                duration_hours=Decimal("3"),
                seats_count=1,
            )
        assert exc_info.value.error_code == "PROMOTION_DURATION_MISMATCH"


@pytest.mark.asyncio
async def test_owner_can_edit_fixed_price_deal_fields(async_client: AsyncClient):
    async with AsyncSessionLocal() as db:
        owner, cafe, tier = await _make_cafe_owner(db)

    now = datetime.now(timezone.utc)
    payload = _fixed_price_payload(cafe.id, tier.id, now)
    resp = await async_client.post("/api/v1/promotions", json=payload, headers=auth_headers(owner))
    promo_id = resp.json()["data"]["promotion"]["id"]

    # Owner drops the price and extends validity — no redemptions yet, so
    # everything (including a later type switch) should still be open.
    patch = {
        "fixedPriceAmount": 320,
        "validUntil": (now + timedelta(days=60)).isoformat(),
        "maxUses": None,
    }
    resp = await async_client.patch(f"/api/v1/promotions/{promo_id}", json=patch, headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    updated = resp.json()["data"]["promotion"]
    assert updated["fixedPriceAmount"] == 320
    assert updated["maxUses"] is None

    # Re-fetch to confirm the cleared max_uses persisted (not just echoed back).
    resp = await async_client.get(f"/api/v1/promotions/{promo_id}")
    assert resp.json()["data"]["promotion"]["maxUses"] is None


@pytest.mark.asyncio
async def test_promotion_type_locked_after_first_redemption(async_client: AsyncClient):
    async with AsyncSessionLocal() as db:
        owner, cafe, tier = await _make_cafe_owner(db)

    now = datetime.now(timezone.utc)
    payload = _fixed_price_payload(cafe.id, tier.id, now)
    resp = await async_client.post("/api/v1/promotions", json=payload, headers=auth_headers(owner))
    promo_id = resp.json()["data"]["promotion"]["id"]

    from app.repositories.promotion_repository import PromotionRepository
    from app.repositories.cafe_repository import CafeRepository
    from app.repositories.hardware_tier_repository import HardwareTierRepository
    from app.services.promotion_service import PromotionService

    async with AsyncSessionLocal() as db:
        service = PromotionService(PromotionRepository(db), CafeRepository(db), HardwareTierRepository(db))
        await service.apply_promotion_to_booking(
            promotion_id=uuid.UUID(promo_id), cafe_id=cafe.id, tier_id=tier.id,
            base_amount=Decimal("480.00"), session_datetime=now,
            duration_hours=Decimal("4"), seats_count=1,
        )
        await db.commit()

    # Type switch now rejected...
    resp = await async_client.patch(
        f"/api/v1/promotions/{promo_id}",
        json={"promotionType": "percentage", "discountPercentage": 20, "fixedPriceAmount": None, "minDurationHours": None},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "PROMOTION_TYPE_LOCKED"

    # ...but every other field remains editable.
    resp = await async_client.patch(
        f"/api/v1/promotions/{promo_id}",
        json={"title": "4 Hour Gaming Deal (Updated)", "fixedPriceAmount": 340},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["promotion"]["fixedPriceAmount"] == 340


@pytest.mark.asyncio
async def test_update_rejects_valid_until_before_valid_from(async_client: AsyncClient):
    async with AsyncSessionLocal() as db:
        owner, cafe, tier = await _make_cafe_owner(db)

    now = datetime.now(timezone.utc)
    payload = _fixed_price_payload(cafe.id, tier.id, now)
    resp = await async_client.post("/api/v1/promotions", json=payload, headers=auth_headers(owner))
    promo_id = resp.json()["data"]["promotion"]["id"]

    resp = await async_client.patch(
        f"/api/v1/promotions/{promo_id}",
        json={"validUntil": (now - timedelta(days=100)).isoformat()},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "INVALID_DATE_RANGE"


@pytest.mark.asyncio
async def test_update_rejects_tier_from_another_cafe(async_client: AsyncClient):
    async with AsyncSessionLocal() as db:
        owner, cafe, tier = await _make_cafe_owner(db)
        _owner2, _cafe2, other_tier = await _make_cafe_owner(db)

    now = datetime.now(timezone.utc)
    payload = _fixed_price_payload(cafe.id, tier.id, now)
    resp = await async_client.post("/api/v1/promotions", json=payload, headers=auth_headers(owner))
    promo_id = resp.json()["data"]["promotion"]["id"]

    resp = await async_client.patch(
        f"/api/v1/promotions/{promo_id}",
        json={"applicableTierId": str(other_tier.id)},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "INVALID_TIER"


@pytest.mark.asyncio
async def test_owner_can_permanently_delete_unredeemed_promotion(async_client: AsyncClient):
    async with AsyncSessionLocal() as db:
        owner, cafe, tier = await _make_cafe_owner(db)

    now = datetime.now(timezone.utc)
    payload = _fixed_price_payload(cafe.id, tier.id, now)
    resp = await async_client.post("/api/v1/promotions", json=payload, headers=auth_headers(owner))
    promo_id = resp.json()["data"]["promotion"]["id"]

    resp = await async_client.delete(f"/api/v1/promotions/{promo_id}", params={"permanent": True}, headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text

    resp = await async_client.get(f"/api/v1/promotions/{promo_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_owner_cannot_permanently_delete_redeemed_promotion(async_client: AsyncClient):
    async with AsyncSessionLocal() as db:
        owner, cafe, tier = await _make_cafe_owner(db)

    now = datetime.now(timezone.utc)
    payload = _fixed_price_payload(cafe.id, tier.id, now)
    resp = await async_client.post("/api/v1/promotions", json=payload, headers=auth_headers(owner))
    promo_id = resp.json()["data"]["promotion"]["id"]

    from app.repositories.promotion_repository import PromotionRepository
    from app.repositories.cafe_repository import CafeRepository
    from app.repositories.hardware_tier_repository import HardwareTierRepository
    from app.services.promotion_service import PromotionService

    async with AsyncSessionLocal() as db:
        service = PromotionService(PromotionRepository(db), CafeRepository(db), HardwareTierRepository(db))
        await service.apply_promotion_to_booking(
            promotion_id=uuid.UUID(promo_id), cafe_id=cafe.id, tier_id=tier.id,
            base_amount=Decimal("480.00"), session_datetime=now,
            duration_hours=Decimal("4"), seats_count=1,
        )
        await db.commit()

    resp = await async_client.delete(f"/api/v1/promotions/{promo_id}", params={"permanent": True}, headers=auth_headers(owner))
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "PROMOTION_HAS_HISTORY"

    # Still there, and pausing (the non-permanent DELETE) still works.
    resp = await async_client.delete(f"/api/v1/promotions/{promo_id}", headers=auth_headers(owner))
    assert resp.status_code == 200

    resp = await async_client.get(f"/api/v1/promotions/{promo_id}")
    assert resp.status_code == 200
    assert resp.json()["data"]["promotion"]["isActive"] is False


@pytest.mark.asyncio
async def test_active_promotions_list_includes_regular_price_and_savings(async_client: AsyncClient):
    async with AsyncSessionLocal() as db:
        owner, cafe, tier = await _make_cafe_owner(db)

    now = datetime.now(timezone.utc)
    payload = _fixed_price_payload(cafe.id, tier.id, now)
    resp = await async_client.post("/api/v1/promotions", json=payload, headers=auth_headers(owner))
    assert resp.status_code == 201

    resp = await async_client.get(f"/api/v1/promotions/cafe/{cafe.id}")
    assert resp.status_code == 200
    promos = resp.json()["data"]["promotions"]
    assert len(promos) == 1
    p = promos[0]
    assert p["regularPrice"] == 480.0
    assert p["savingsAmount"] == 120.0
