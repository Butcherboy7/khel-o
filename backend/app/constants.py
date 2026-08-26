# Single source of truth for cities KHEL-O currently operates in.
# City must never be accepted as arbitrary free text: the discovery filter
# (app/repositories/cafe_repository.py) matches a café's stored `city`
# exactly (case-insensitively) against one of these values. A café whose
# city doesn't match one of these exactly will show under "All Cities" (no
# filter applied there) but silently vanish from its own city's filter —
# this list plus validate_city() is what prevents that.
SUPPORTED_CITIES = ["Bengaluru", "Delhi", "Hyderabad", "Mumbai", "Pune"]

_SUPPORTED_CITIES_LOWER = {c.lower(): c for c in SUPPORTED_CITIES}


def validate_city(city: str) -> str:
    """Normalize a city string to its canonical casing, or raise ValueError
    if it doesn't match a supported city. Use as a Pydantic field_validator
    on any schema field that sets Cafe.city."""
    canonical = _SUPPORTED_CITIES_LOWER.get(city.strip().lower())
    if canonical is None:
        raise ValueError(
            f"'{city}' is not a supported city. Supported cities: {', '.join(SUPPORTED_CITIES)}"
        )
    return canonical
