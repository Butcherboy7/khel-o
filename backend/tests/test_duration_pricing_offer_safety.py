"""Tests for the 15/30/60 duration ladder, per-length pricing, co-op
scaling, and the offer-safety rules from
docs/superpowers/specs/2026-09-28-duration-pricing-offer-safety-design.md.
"""
import pytest
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.core.duration import allowed_minutes, is_valid_length
from app.services.pricing_service import base_price_for_minutes, base_price
from app.models.promotion import Promotion, PromotionType
from app.core.time import now_ist
from app.core.exceptions import ValidationException
from tests.test_launch_invariants import _make_owner_and_cafe


class _FakeTier:
    """Minimal stand-in for a HardwareTier row — only the attributes
    base_price_for_minutes reads."""
    def __init__(self, price_per_hour, price_15m=None, price_30m=None, coop_extra_player_price=0):
        self.price_per_hour = price_per_hour
        self.price_15m = price_15m
        self.price_30m = price_30m
        self.coop_extra_player_price = coop_extra_player_price


# ---------------------------------------------------------------- duration ladder

def test_allowed_minutes_for_15_min_minimum():
    lengths = allowed_minutes(15)
    assert lengths[:4] == [15, 30, 60, 90]
    assert 45 not in lengths
    assert 75 not in lengths
    assert lengths[-1] == 480


def test_allowed_minutes_for_60_min_minimum_excludes_15_and_30():
    lengths = allowed_minutes(60)
    assert 15 not in lengths
    assert 30 not in lengths
    assert lengths[0] == 60
    assert 90 in lengths


def test_is_valid_length_rejects_45_even_on_15_min_setup():
    assert is_valid_length(45, 15) is False
    assert is_valid_length(15, 15) is True
    assert is_valid_length(90, 15) is True


def test_allowed_minutes_rejects_invalid_minimum():
    with pytest.raises(ValueError):
        allowed_minutes(45)


# ---------------------------------------------------------------- pricing

def test_base_price_uses_owner_set_15_and_30_min_prices():
    tier = _FakeTier(price_per_hour=360, price_15m=90, price_30m=180)
    assert base_price_for_minutes(tier, 15) == Decimal("90.00")
    assert base_price_for_minutes(tier, 30) == Decimal("180.00")
    assert base_price_for_minutes(tier, 60) == Decimal("360.00")


def test_base_price_falls_back_to_proportional_when_owner_hasnt_set_it():
    tier = _FakeTier(price_per_hour=300)
    assert base_price_for_minutes(tier, 15) == Decimal("75.00")
    assert base_price_for_minutes(tier, 30) == Decimal("150.00")


def test_base_price_above_one_hour_scales_off_hourly_rate():
    tier = _FakeTier(price_per_hour=100)
    assert base_price_for_minutes(tier, 90) == Decimal("150.00")
    assert base_price_for_minutes(tier, 120) == Decimal("200.00")
    assert base_price_for_minutes(tier, 150) == Decimal("250.00")


def test_base_price_never_uses_owner_price_for_wrong_length():
    # price_15m must only be used for an exact 15-min booking, never bleed
    # into 30/60/90+ pricing.
    tier = _FakeTier(price_per_hour=300, price_15m=1)
    assert base_price_for_minutes(tier, 30) == Decimal("150.00")
    assert base_price_for_minutes(tier, 60) == Decimal("300.00")


def test_base_price_coop_extra_scales_with_minutes():
    tier = _FakeTier(price_per_hour=300, price_15m=90, price_30m=180, coop_extra_player_price=60)
    # 2 players, 15 min: unit price 90 + (60 * 1 * 15/60) = 90 + 15
    assert base_price_for_minutes(tier, 15, players=2, is_coop=True) == Decimal("105.00")
    # 2 players, 30 min: 180 + (60 * 1 * 30/60) = 180 + 30
    assert base_price_for_minutes(tier, 30, players=2, is_coop=True) == Decimal("210.00")
    # 3 players, 60 min: 300 + (60 * 2 * 1) = 420
    assert base_price_for_minutes(tier, 60, players=3, is_coop=True) == Decimal("420.00")


def test_base_price_solo_multiplies_by_seats():
    tier = _FakeTier(price_per_hour=100)
    assert base_price(tier, 1.0, seats=3) == Decimal("300.00")


# ---------------------------------------------------------------- offer safety

def _make_promo(**kw):
    now = datetime.now(timezone.utc)
    defaults = dict(
        id=uuid4(), cafe_id=uuid4(), title="Test offer",
        promotion_type=PromotionType.FIXED_AMOUNT,
        fixed_discount_amount=60, min_booking_minutes=60,
        valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=30),
        days_of_week=[0, 1, 2, 3, 4, 5, 6], start_hour=0, end_hour=24,
        is_active=True, current_uses=0, applicable_tier_id=None, play_mode='any',
        max_uses=None,
    )
    defaults.update(kw)
    return Promotion(**defaults)


@pytest.mark.asyncio
async def test_flat_amount_offer_rejected_on_booking_shorter_than_its_minimum(db_session):
    from app.services.promotion_service import PromotionService
    from app.repositories.promotion_repository import PromotionRepository

    owner, cafe, tier = await _make_owner_and_cafe(db_session, "offer_len")
    promo = _make_promo(cafe_id=cafe.id, min_booking_minutes=60)
    db_session.add(promo)
    await db_session.commit()

    service = PromotionService(PromotionRepository(db_session), db_session)
    session_dt = now_ist().replace(hour=18, minute=0, second=0, microsecond=0) + timedelta(days=1)

    with pytest.raises(ValidationException) as exc_info:
        await service.apply_promotion_to_booking(
            promotion_id=promo.id, cafe_id=cafe.id, tier_id=tier.id,
            base_amount=Decimal("90.00"), session_datetime=session_dt,
            duration_hours=Decimal("0.25"),  # 15 min — below the offer's 60-min floor
        )
    assert exc_info.value.error_code == "PROMOTION_DURATION_TOO_SHORT"


@pytest.mark.asyncio
async def test_flat_amount_offer_applies_once_booking_meets_its_minimum(db_session):
    from app.services.promotion_service import PromotionService
    from app.repositories.promotion_repository import PromotionRepository

    owner, cafe, tier = await _make_owner_and_cafe(db_session, "offer_len2")
    promo = _make_promo(cafe_id=cafe.id, fixed_discount_amount=60, min_booking_minutes=60)
    db_session.add(promo)
    await db_session.commit()

    service = PromotionService(PromotionRepository(db_session), db_session)
    session_dt = now_ist().replace(hour=18, minute=0, second=0, microsecond=0) + timedelta(days=1)

    discount = await service.apply_promotion_to_booking(
        promotion_id=promo.id, cafe_id=cafe.id, tier_id=tier.id,
        base_amount=Decimal("300.00"), session_datetime=session_dt,
        duration_hours=Decimal("1"),
    )
    assert discount == Decimal("60.00")


@pytest.mark.asyncio
async def test_offer_never_makes_a_booking_free(db_session):
    """The exact PS5 bug this fixes: a ₹60-off offer against a ₹50 booking
    must not apply at all (and definitely not clamp to a ₹0 total)."""
    from app.services.promotion_service import PromotionService
    from app.repositories.promotion_repository import PromotionRepository

    owner, cafe, tier = await _make_owner_and_cafe(db_session, "offer_zero")
    # min_booking_minutes=15 so the length check itself doesn't block this —
    # isolating the never-free rule specifically.
    promo = _make_promo(cafe_id=cafe.id, fixed_discount_amount=60, min_booking_minutes=15)
    db_session.add(promo)
    await db_session.commit()

    service = PromotionService(PromotionRepository(db_session), db_session)
    session_dt = now_ist().replace(hour=18, minute=0, second=0, microsecond=0) + timedelta(days=1)

    with pytest.raises(ValidationException) as exc_info:
        await service.apply_promotion_to_booking(
            promotion_id=promo.id, cafe_id=cafe.id, tier_id=tier.id,
            base_amount=Decimal("50.00"), session_datetime=session_dt,
            duration_hours=Decimal("0.25"),
        )
    assert exc_info.value.error_code == "PROMOTION_WOULD_ZERO"


@pytest.mark.asyncio
async def test_offer_hour_window_checked_in_ist_not_utc(db_session):
    """A 6pm-11pm (IST) offer must be active at 6:30pm IST, which is
    1:00pm UTC — the exact bug where the café-listing filter compared
    against UTC and made every evening offer invisible until after
    midnight IST."""
    from app.services.promotion_service import PromotionService
    from app.repositories.promotion_repository import PromotionRepository

    owner, cafe, tier = await _make_owner_and_cafe(db_session, "offer_ist")
    promo = _make_promo(cafe_id=cafe.id, start_hour=18, end_hour=23)
    db_session.add(promo)
    await db_session.commit()

    service = PromotionService(PromotionRepository(db_session), db_session)
    # 6:30 PM IST on a fixed date, expressed as its UTC equivalent (13:00 UTC).
    utc_moment = datetime(2026, 9, 29, 13, 0, tzinfo=timezone.utc)
    assert service._is_promotion_active(promo, utc_moment) is True

    # And the reverse: 6:30pm UTC is *not* inside 6-11pm IST (it's ~midnight
    # IST) — this used to pass under the old UTC-only check.
    utc_moment_wrong = datetime(2026, 9, 29, 18, 30, tzinfo=timezone.utc)
    assert service._is_promotion_active(promo, utc_moment_wrong) is False
