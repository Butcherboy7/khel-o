"""Which offer a setup card advertises, and the co-op line's own deal."""
import uuid
from datetime import datetime, timezone

from app.models.promotion import PromotionType
from app.schemas.promotion import ActivePromotionResponse
from app.services.promotion_service import PromotionService

TIER = uuid.uuid4()


def _p(**kw):
    base = dict(id=uuid.uuid4(), title="x", valid_until=datetime(2030, 1, 1, tzinfo=timezone.utc),
                start_hour=0, end_hour=24, days_of_week=[0, 1, 2, 3, 4, 5, 6], applicable_tier_id=TIER)
    base.update(kw)
    return ActivePromotionResponse(**base)


def _fixed(price, minutes, mode="solo", savings=0):
    return _p(promotion_type=PromotionType.FIXED_PRICE, fixed_price_amount=price,
              min_duration_hours=minutes / 60, play_mode=mode, savings_amount=savings)


def test_equal_saving_prefers_the_one_hour_deal():
    thirty, hour = _fixed(119, 30, savings=30), _fixed(199, 60, savings=30)
    picked = PromotionService.pick_for_tier([thirty, hour], TIER)
    assert picked["id"] == hour.id


def test_coop_offers_never_shown_as_the_card_offer():
    coop = _p(promotion_type=PromotionType.FIXED_AMOUNT, fixed_discount_amount=50, play_mode="coop")
    solo = _p(promotion_type=PromotionType.PERCENTAGE, discount_percentage=34, play_mode="solo")
    assert PromotionService.pick_for_tier([coop, solo], TIER)["id"] == solo.id
    assert PromotionService.pick_for_tier([coop], TIER) is None


def test_coop_line_takes_cheapest_live_one_hour_coop_deal():
    weekend, weekday = _fixed(180, 60, "coop"), _fixed(150, 60, "coop")
    two_hours = _fixed(300, 120, "coop")
    not_live = _fixed(100, 60, "coop").model_copy(update={"is_live_now": False})
    picked = PromotionService.pick_coop_for_tier([weekend, weekday, two_hours, not_live], TIER)
    assert picked["id"] == weekday.id
    assert PromotionService.pick_coop_for_tier([_fixed(119, 60, "solo")], TIER) is None
