"""Shared booking-length rules: under 1 hour steps by 15 min, at/above 1
hour steps by 30 min. Used by hardware tier validation, promotion
validation, booking creation, and the pricing/quote calculators so all
four agree on what a "valid length" is."""

MAX_MINUTES = 480  # 8 hours, matches BookingCreateRequest.duration_hours le=8.0


def allowed_minutes(min_booking_minutes: int) -> list[int]:
    """Every bookable length (in minutes) for a setup whose shortest
    booking is `min_booking_minutes` (15, 30, or 60)."""
    if min_booking_minutes not in (15, 30, 60):
        raise ValueError("min_booking_minutes must be 15, 30, or 60")
    lengths = [m for m in (15, 30) if m >= min_booking_minutes]
    lengths += list(range(60, MAX_MINUTES + 1, 30))
    return lengths


def is_valid_length(minutes: int, min_booking_minutes: int) -> bool:
    return minutes in allowed_minutes(min_booking_minutes)


# Kept private-style alias for schema files that import the underscored name.
_allowed_minutes = allowed_minutes
