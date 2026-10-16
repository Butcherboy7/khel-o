"""Shared booking-length rules: under 1 hour steps by 15 min, at/above 1
hour steps by 30 min. Used by hardware tier validation, promotion
validation, booking creation, and the pricing/quote calculators so all
four agree on what a "valid length" is."""

MAX_MINUTES = 480  # 8 hours, matches BookingCreateRequest.duration_hours le=8.0


# Lengths an owner can pick as a setup's longest booking, and set a package
# price for (1 hr is the hourly rate itself, so packages start at 1 hr 30).
MAX_BOOKING_CHOICES = list(range(60, MAX_MINUTES + 1, 30))
PACKAGE_LENGTHS = list(range(90, MAX_MINUTES + 1, 30))


def allowed_minutes(min_booking_minutes: int, max_booking_minutes: int | None = None) -> list[int]:
    """Every bookable length (in minutes) for a setup whose shortest
    booking is `min_booking_minutes` (15, 30, or 60) and whose longest is
    `max_booking_minutes` (None = 8 hours)."""
    if min_booking_minutes not in (15, 30, 60):
        raise ValueError("min_booking_minutes must be 15, 30, or 60")
    longest = min(max_booking_minutes or MAX_MINUTES, MAX_MINUTES)
    lengths = [m for m in (15, 30) if m >= min_booking_minutes]
    lengths += list(range(60, MAX_MINUTES + 1, 30))
    return [m for m in lengths if m <= longest]


def tier_allowed_minutes(tier) -> list[int]:
    """allowed_minutes for a hardware tier row (or anything shaped like one)."""
    return allowed_minutes(
        int(getattr(tier, 'min_booking_minutes', None) or 60),
        getattr(tier, 'max_booking_minutes', None),
    )


def length_text(minutes: int) -> str:
    """60 -> "1 hr", 90 -> "1 hr 30", 30 -> "30 min"."""
    if minutes < 60:
        return f"{minutes} min"
    hours, rest = divmod(minutes, 60)
    return f"{hours} hr" + (f" {rest}" if rest else "")


def is_valid_length(minutes: int, min_booking_minutes: int, max_booking_minutes: int | None = None) -> bool:
    return minutes in allowed_minutes(min_booking_minutes, max_booking_minutes)


# Kept private-style alias for schema files that import the underscored name.
_allowed_minutes = allowed_minutes
