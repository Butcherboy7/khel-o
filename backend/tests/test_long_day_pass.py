"""Booking past 8 hours: only a setup whose owner set a longer longest booking (a full-day pass)."""
from app.core.duration import allowed_minutes, DEFAULT_LONGEST
from app.services.pricing_service import base_price_for_minutes


class _T:
    price_per_hour = 200
    length_prices = {"660": 999}
    min_booking_minutes = 60
    max_booking_minutes = 660


def test_default_longest_is_still_8_hours():
    assert max(allowed_minutes(60)) == 480 == DEFAULT_LONGEST
    assert max(allowed_minutes(60, 660)) == 660 and 690 not in allowed_minutes(60, 660)


def test_the_day_pass_price_is_charged_for_the_full_day():
    assert base_price_for_minutes(_T(), 660) == 999
    assert base_price_for_minutes(_T(), 300) == 1000  # 5 hr at 200, no pass
