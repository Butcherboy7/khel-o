"""A café's own 30-minute co-op price (Rockstar PS5: ₹180 for 30 min with 2
players, ₹260 for an hour) must be charged as set, not derived from the
hourly co-op surcharge."""
from decimal import Decimal
from types import SimpleNamespace

from app.services.pricing_service import base_price_for_minutes


def _ps5(coop_30=180):
    return SimpleNamespace(price_per_hour=140, price_15m=59, price_30m=89,
                           coop_extra_player_price=120, coop_price_30m=coop_30)


def test_two_players_thirty_minutes_uses_the_owner_price():
    assert base_price_for_minutes(_ps5(), 30, players=2, is_coop=True) == Decimal('180.00')


def test_hour_and_solo_lengths_unchanged():
    t = _ps5()
    assert base_price_for_minutes(t, 60, players=2, is_coop=True) == Decimal('260.00')
    assert base_price_for_minutes(t, 30) == Decimal('89.00')
    assert base_price_for_minutes(t, 15, players=2, is_coop=True) == Decimal('89.00')  # 59 + 120/4


def test_each_player_past_the_second_adds_half_the_hourly_extra():
    assert base_price_for_minutes(_ps5(), 30, players=3, is_coop=True) == Decimal('240.00')


def test_unset_keeps_the_old_formula():
    assert base_price_for_minutes(_ps5(None), 30, players=2, is_coop=True) == Decimal('149.00')
