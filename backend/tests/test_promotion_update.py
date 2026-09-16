"""PromotionRepository.update() must apply an explicitly-cleared field
(value None, but present in update_data) — not silently skip it. Regression
test for the bug where clearing "Max Redemptions" or a KHELO code in the
owner UI appeared to succeed but reverted on refetch."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.promotion import Promotion
from app.core.security import get_password_hash
from app.repositories.promotion_repository import PromotionRepository

IST = timezone(timedelta(hours=5, minutes=30))


async def _make_cafe_with_promotion(db):
    owner = User(
        id=uuid.uuid4(), email=f"promo_upd_owner_{uuid.uuid4().hex[:8]}@test.com",
        full_name="Promo Update Owner", password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER, is_active=True,
    )
    db.add(owner)
    await db.flush()
    db.add(UserRoleMapping(id=uuid.uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))

    cafe = Cafe(
        id=uuid.uuid4(), owner_id=owner.id, name="Promo Update Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=None, closing_time=None, bookable_stations=10,
    )
    db.add(cafe)

    now = datetime.now(timezone.utc)
    promo = Promotion(
        id=uuid.uuid4(), cafe_id=cafe.id, title="Weekday Special",
        discount_percentage=20, valid_from=now, valid_until=now + timedelta(days=30),
        days_of_week=[0, 1, 2, 3, 4], start_hour=10, end_hour=18,
        max_uses=5, khelo_code=f"WEEKDAY{uuid.uuid4().hex[:8]}",
    )
    db.add(promo)
    await db.commit()
    return owner, cafe, promo


@pytest.mark.asyncio
async def test_update_applies_explicit_none_to_clear_max_uses_and_khelo_code():
    async with AsyncSessionLocal() as db:
        _owner, _cafe, promo = await _make_cafe_with_promotion(db)
        repo = PromotionRepository(db)

        # Mirrors what PromotionUpdateRequest.model_dump(exclude_unset=True)
        # produces when the owner explicitly blanks these two fields in the
        # edit form — both keys are present with value None.
        updated = await repo.update(promo.id, {"max_uses": None, "khelo_code": None})

        assert updated.max_uses is None
        assert updated.khelo_code is None

        refetched = await repo.get_by_id(promo.id)
        assert refetched.max_uses is None
        assert refetched.khelo_code is None


@pytest.mark.asyncio
async def test_update_still_ignores_fields_not_present_in_update_data():
    """A field genuinely absent from update_data (not sent by the frontend at
    all) must be left untouched — this is the exclude_unset=True contract
    the fix must preserve, not just "always overwrite everything"."""
    async with AsyncSessionLocal() as db:
        _owner, _cafe, promo = await _make_cafe_with_promotion(db)
        repo = PromotionRepository(db)

        original_code = promo.khelo_code
        updated = await repo.update(promo.id, {"title": "Renamed Special"})

        assert updated.title == "Renamed Special"
        assert updated.max_uses == 5
        assert updated.khelo_code == original_code
