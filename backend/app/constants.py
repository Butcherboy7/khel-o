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


# Platform-first hardware tier configuration (Owner Onboarding V2). Mirrors
# the SUPPORTED_CITIES pattern above: a fixed picklist per platform, no
# admin-editable list. "other" has no fixed model list — it's free text,
# same escape-hatch convention as "Custom CPU (type below)" used elsewhere
# in this codebase before this redesign.
PLATFORM_MODELS = {
    "pc": ["RTX 4090", "RTX 4070", "RTX 3060", "Budget", "Custom"],
    "playstation": ["PS5 Pro", "PS5", "PS4 Pro", "PS4", "Custom"],
    "xbox": ["Series X", "Series S", "One X", "One S", "Custom"],
    "nintendo": ["Switch OLED", "Switch", "Switch Lite", "Custom"],
}

_PC_GPU_LABELS = {
    "RTX 4090": "NVIDIA RTX 4090",
    "RTX 4070": "NVIDIA RTX 4070",
    "RTX 3060": "NVIDIA RTX 3060",
    "Budget": "Entry-level GPU",
}

_CONSOLE_LABELS = {
    "PS5 Pro": "PlayStation 5 Pro",
    "PS5": "PlayStation 5",
    "PS4 Pro": "PlayStation 4 Pro",
    "PS4": "PlayStation 4",
    "Series X": "Xbox Series X",
    "Series S": "Xbox Series S",
    "One X": "Xbox One X",
    "One S": "Xbox One S",
    "Switch OLED": "Nintendo Switch OLED",
    "Switch": "Nintendo Switch",
    "Switch Lite": "Nintendo Switch Lite",
}
