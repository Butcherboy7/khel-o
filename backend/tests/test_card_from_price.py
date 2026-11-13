"""The "from" price on a café card follows a live offer, including one that covers every setup."""
import pytest
from datetime import datetime, timedelta, timezone

from app.models.promotion import Promotion, PromotionType
from app.repositories.promotion_repository import PromotionRepository
from app.services.promotion_service import PromotionService
from tests.test_booking_time_validation import _setup_cafe_and_gamer


def _promo(cafe, **kw):
    now = datetime.now(timezone.utc)
    base = dict(
        cafe_id=cafe.id, title="HAPPY HOUR", promotion_type=PromotionType.PERCENTAGE, discount_percentage=20,
        start_hour=0, end_hour=24, days_of_week=[0, 1, 2, 3, 4, 5, 6], valid_from=now - timedelta(days=1),
        valid_until=now + timedelta(days=5), is_active=True, play_mode="any", min_booking_minutes=60,
    )
    base.update(kw)
    return Promotion(**base)


@pytest.mark.asyncio
async def test_offer_for_every_setup_lowers_the_cards_from_price(db_session):
    cafe, tier, _ = await _setup_cafe_and_gamer(db_session)
    db_session.add(_promo(cafe))
    await db_session.commit()
    out = await PromotionService(PromotionRepository(db_session)).best_offers_for_cafes([cafe.id])
    assert out[cafe.id]["fromPrice"] == round(float(tier.price_per_hour) * 0.8)


@pytest.mark.asyncio
async def test_link_only_campaign_offers_never_change_the_public_price(db_session):
    import uuid
    cafe, tier, _ = await _setup_cafe_and_gamer(db_session)
    p = _promo(cafe, campaign_id=uuid.uuid4())
    db_session.add(p)
    try:
        await db_session.commit()
    except Exception:
        await db_session.rollback()
        pytest.skip("campaign FK enforced in this test DB")
    out = await PromotionService(PromotionRepository(db_session)).best_offers_for_cafes([cafe.id])
    assert out.get(cafe.id, {}).get("fromPrice") is None
