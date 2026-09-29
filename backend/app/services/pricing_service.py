"""Single source of truth for what a booking costs before any offer is
applied. Used by BookingService.create_booking, the /bookings/quote
endpoint, and PromotionService (to derive a fixed-price deal's "regular
price"). Keeping this in one place is what fixes the customer-side/
server-side price mismatch — see docs/superpowers/specs/
2026-09-28-duration-pricing-offer-safety-design.md.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional


def _d(value) -> Decimal:
    return Decimal(str(value))


def base_price_for_minutes(
    tier,
    minutes: int,
    players: int = 1,
    is_coop: bool = False,
    seats: int = 1,
) -> Decimal:
    """The price for one booking of this length, before any offer.

    - Under 60 min: the setup's own 15/30-min price, or hourly/4 and
      hourly/2 when the owner hasn't set one.
    - 60 min and above: hourly * minutes/60 (so 90 min = 1.5x hourly).
    - Co-op: coop_extra_player_price is charged per extra player, scaled
      by the same minutes/60 factor as the hourly rate.
    - Solo with multiple consoles: multiplied by `seats`.
    """
    hourly = _d(tier.price_per_hour)
    minutes_d = _d(minutes)

    if minutes == 15 and getattr(tier, 'price_15m', None) is not None:
        unit_price = _d(tier.price_15m)
    elif minutes == 30 and getattr(tier, 'price_30m', None) is not None:
        unit_price = _d(tier.price_30m)
    elif minutes == 15:
        unit_price = (hourly / Decimal('4'))
    elif minutes == 30:
        unit_price = (hourly / Decimal('2'))
    else:
        unit_price = hourly * minutes_d / Decimal('60')

    if is_coop:
        extra = _d(getattr(tier, 'coop_extra_player_price', 0) or 0)
        extra_total = extra * _d(max(players - 1, 0)) * minutes_d / Decimal('60')
        total = unit_price + extra_total
    else:
        total = unit_price * _d(seats)

    return total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def base_price(
    tier,
    duration_hours,
    players: int = 1,
    is_coop: bool = False,
    seats: int = 1,
) -> Decimal:
    """Same as base_price_for_minutes, taking hours (as create_booking's
    duration_hours does) instead of minutes."""
    minutes = round(float(duration_hours) * 60)
    return base_price_for_minutes(tier, minutes, players=players, is_coop=is_coop, seats=seats)
