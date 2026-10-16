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


def length_prices_of(tier) -> dict[int, Decimal]:
    """The tier's package prices as {minutes: price}. Stored as JSON, so the
    keys come back as strings; anything malformed is ignored, not fatal."""
    out: dict[int, Decimal] = {}
    for key, value in (getattr(tier, 'length_prices', None) or {}).items():
        try:
            minutes, price = int(key), _d(value)
        except (TypeError, ValueError, ArithmeticError):
            continue
        if minutes >= 60 and price > 0:
            out[minutes] = price
    return out


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
    - 60 min and above: the owner's package price for that length when set
      (tier.length_prices, e.g. 3 hr = 400). Otherwise the nearest shorter
      package plus the hourly rate for the extra time (3 hr 30 = 400 + half
      an hour), or hourly * minutes/60 when there's no shorter package.
    - Co-op: coop_extra_player_price is charged per extra player, scaled
      by the same minutes/60 factor as the hourly rate. Exception: a 30-min
      co-op session uses the owner's coop_price_30m (2 players) when set,
      plus the scaled extra for each player past the second.
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
        packages = length_prices_of(tier)
        shorter = [m for m in packages if m < minutes]
        if minutes in packages:
            unit_price = packages[minutes]
        elif shorter:
            base_len = max(shorter)
            unit_price = packages[base_len] + hourly * _d(minutes - base_len) / Decimal('60')
        else:
            unit_price = hourly * minutes_d / Decimal('60')

    coop_30 = getattr(tier, 'coop_price_30m', None)
    if is_coop and minutes == 30 and players >= 2 and coop_30 is not None:
        extra = _d(getattr(tier, 'coop_extra_player_price', 0) or 0)
        total = _d(coop_30) + extra * _d(players - 2) * minutes_d / Decimal('60')
    elif is_coop:
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
