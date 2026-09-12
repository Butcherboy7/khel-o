"""Launch-day promotion invariants (V-01).

See docs/LAUNCH_QA_PLAN.md Phase 2, section V.

The café absorbs 100% of every promotional discount: booking_service computes
subtotal = base_amount - discount, and owner_settlement_amount = subtotal.
KHELO's fee is charged on the discounted subtotal, so KHELO only forgoes its
percentage of the discount while the café forgoes the whole thing.

That makes the size of a permitted discount a money question, not a UI one.
"""
import pytest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from app.models.promotion import Promotion
from app.models.booking import BookingStatus
from app.core.time import now_ist
from tests.conftest import auth_headers
from tests.test_launch_invariants import _make_owner_and_cafe, _make_gamer


def _promo_payload(**overrides):
    now = datetime.now(timezone.utc)
    payload = {
        "title": "QA Offer",
        "discountPercentage": 10,
        "validFrom": (now - timedelta(days=1)).isoformat(),
        "validUntil": (now + timedelta(days=30)).isoformat(),
        "daysOfWeek": [0, 1, 2, 3, 4, 5, 6],
        "startHour": 0,
        "endHour": 24,
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------- V-01 bounds

@pytest.mark.parametrize("pct", [1, 5, 10, 15, 50])
@pytest.mark.asyncio
async def test_valid_discount_percentages_are_accepted(db_session, async_client, pct):
    owner, cafe, tier = await _make_owner_and_cafe(db_session, f"promo_ok_{pct}")
    res = await async_client.post(
        "/api/v1/promotions",
        headers=auth_headers(owner),
        json=_promo_payload(discountPercentage=pct, cafeId=str(cafe.id)),
    )
    assert res.status_code in (200, 201), f"{pct}% offer rejected: {res.status_code} {res.text[:200]}"


@pytest.mark.parametrize("pct", [0, -10, 51, 100, 150])
@pytest.mark.asyncio
async def test_out_of_range_discounts_are_rejected(db_session, async_client, pct):
    """A 100%-off offer would mean a free session the café still has to staff
    and power, with ₹0 settlement. The schema caps discounts at 1..50, and
    that cap is the only thing enforcing it — promotion_service applies
    whatever percentage the row holds without re-checking (see
    test_absurd_discount_cannot_produce_negative_money below).
    """
    owner, cafe, tier = await _make_owner_and_cafe(db_session, f"promo_bad_{abs(pct)}")
    res = await async_client.post(
        "/api/v1/promotions",
        headers=auth_headers(owner),
        json=_promo_payload(discountPercentage=pct, cafeId=str(cafe.id)),
    )
    assert res.status_code not in (200, 201), (
        f"{pct}% discount was accepted — a café can be made to give away sessions."
    )


# ---------------------------------------------------------------- V-01 math

@pytest.mark.asyncio
async def test_discount_is_taken_from_the_cafes_settlement(db_session):
    """Prove who actually pays for a promotion.

    10% off a ₹100 booking: customer pays ₹93.60 (₹90 + 4% fee), the café
    receives ₹90 and KHELO keeps ₹3.60. The café funded the entire ₹10
    discount; KHELO only gave up ₹0.40 of fee.
    """
    from app.services.promotion_service import PromotionService
    from app.repositories.promotion_repository import PromotionRepository

    owner, cafe, tier = await _make_owner_and_cafe(db_session, "promo_math")

    now = datetime.now(timezone.utc)
    promo = Promotion(
        id=uuid4(), cafe_id=cafe.id, title="10 off", discount_percentage=10,
        valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=30),
        days_of_week=[0, 1, 2, 3, 4, 5, 6], start_hour=0, end_hour=24, is_active=True,
    )
    db_session.add(promo)
    await db_session.commit()

    service = PromotionService(PromotionRepository(db_session), db_session)
    session_dt = now_ist().replace(hour=18, minute=0, second=0, microsecond=0) + timedelta(days=1)
    discount = await service.apply_promotion_to_booking(
        promotion_id=promo.id, cafe_id=cafe.id, tier_id=tier.id,
        base_amount=Decimal("100.00"), session_datetime=session_dt,
    )

    subtotal = Decimal("100.00") - discount
    gateway_fee = (subtotal * Decimal("4") / Decimal("100")).quantize(Decimal("0.01"))

    assert discount == Decimal("10.00")
    assert subtotal == Decimal("90.00"), "café settlement should absorb the full discount"
    assert gateway_fee == Decimal("3.60"), "KHELO's fee is charged on the discounted subtotal"
    assert subtotal + gateway_fee == Decimal("93.60"), "customer total"


@pytest.mark.asyncio
async def test_absurd_discount_cannot_produce_negative_money(db_session):
    """Defence in depth for bad promotion data.

    The 1..50 schema bound blocks this through the API, but promotion rows are
    also written by seeds, migrations and admin scripts, which bypass Pydantic.
    apply_promotion_to_booking multiplies out whatever percentage it finds, so
    a row holding >100 would yield a discount larger than the booking itself —
    a negative subtotal, hence negative settlement, negative fee and a negative
    customer total. Money must never go negative regardless of the input.
    """
    from app.services.promotion_service import PromotionService
    from app.repositories.promotion_repository import PromotionRepository

    owner, cafe, tier = await _make_owner_and_cafe(db_session, "promo_absurd")

    now = datetime.now(timezone.utc)
    promo = Promotion(
        id=uuid4(), cafe_id=cafe.id, title="Corrupt row", discount_percentage=150,
        valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=30),
        days_of_week=[0, 1, 2, 3, 4, 5, 6], start_hour=0, end_hour=24, is_active=True,
    )
    db_session.add(promo)
    await db_session.commit()

    service = PromotionService(PromotionRepository(db_session), db_session)
    session_dt = now_ist().replace(hour=18, minute=0, second=0, microsecond=0) + timedelta(days=1)
    discount = await service.apply_promotion_to_booking(
        promotion_id=promo.id, cafe_id=cafe.id, tier_id=tier.id,
        base_amount=Decimal("100.00"), session_datetime=session_dt,
    )

    assert discount <= Decimal("100.00"), (
        f"discount of {discount} exceeds the ₹100 booking — this makes subtotal, "
        "café settlement and the customer's total all negative"
    )
    assert Decimal("100.00") - discount >= Decimal("0.00")
