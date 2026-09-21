import re


# City is no longer restricted to a hardcoded picklist (see app/models/location.py
# and app/api/v1/locations.py for the search/create-on-miss flow that replaced
# CITIES_BY_STATE). This just guards against empty/garbage input at the write
# boundary; the location it resolves to is the actual source of truth.
def validate_city(city: str) -> str:
    """Normalize whitespace and reject empty/garbage city strings. Use as a
    Pydantic field_validator on any schema field that sets Cafe.city."""
    cleaned = " ".join(city.strip().split())
    if len(cleaned) < 2 or cleaned.replace(" ", "").isdigit():
        raise ValueError(f"'{city}' is not a valid city.")
    return cleaned


def validate_pincode(pincode: str) -> str:
    """Reject anything that isn't exactly 6 numeric digits. Use as a Pydantic
    field_validator on any schema field that sets Cafe.pincode."""
    cleaned = pincode.strip()
    if not re.match(r"^\d{6}$", cleaned):
        raise ValueError("Pincode must be exactly 6 digits.")
    return cleaned


# Unlike city/town (unbounded — see app/models/location.py), India's states
# and union territories are a small, genuinely closed set defined by the
# Indian government, so a fixed list here is data-quality hardening, not a
# repeat of the CITIES_BY_STATE mistake. Mirrors
# frontend/src/constants/states.ts's INDIAN_STATES exactly.
INDIAN_STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
    "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
    "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
    "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry",
    "Andaman and Nicobar Islands", "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu", "Lakshadweep",
]

_INDIAN_STATES_LOWER = {s.lower(): s for s in INDIAN_STATES}


def validate_state(state: str) -> str:
    """Normalize a state/UT string to its canonical casing, or raise
    ValueError if it isn't one of India's states/UTs. Use as a Pydantic
    field_validator anywhere a Location.state (or Cafe.state) is set."""
    canonical = _INDIAN_STATES_LOWER.get(" ".join(state.strip().split()).lower())
    if canonical is None:
        raise ValueError(f"'{state}' is not a recognized Indian state or union territory.")
    return canonical


_GOOGLE_MAPS_HOSTS = {"maps.app.goo.gl", "google.com", "www.google.com", "maps.google.com", "www.maps.google.com"}
# Google's newer share-link domain (rolled out 2025) for the Maps "Share" button.
# Its paths are opaque tokens (e.g. /thKF4o6D04HisOTdY), not /maps-prefixed, and
# the redirect is client-side JS, so it can't be verified past the host itself.
_GOOGLE_MAPS_SHARE_HOSTS = {"share.google"}


def validate_google_maps_url(url):
    """Validate an owner-pasted Google Maps share link before it's stored.

    Only accepts an allow-list of Google-owned hosts (real Maps share links,
    not arbitrary URLs) so the "Show in Map" button on the café detail page
    can safely open it in a new tab without us fetching or rendering it
    ourselves. Returns the URL unchanged (or None) on success; raises
    ValueError otherwise so it can be used as a Pydantic field_validator."""
    if url is None:
        return None
    from urllib.parse import urlparse
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Google Maps link must start with http:// or https://")
    host = parsed.netloc.lower()
    if host == "maps.app.goo.gl":
        return url
    if host in _GOOGLE_MAPS_SHARE_HOSTS:
        return url
    if host == "goo.gl" and parsed.path.startswith("/maps/"):
        return url
    if host in _GOOGLE_MAPS_HOSTS and parsed.path.startswith("/maps"):
        return url
    raise ValueError(
        "Please paste a Google Maps share link (e.g. https://maps.app.goo.gl/... "
        "from Google Maps' Share button)"
    )


# Platform-first hardware tier configuration (Owner Onboarding V2). A fixed
# picklist per platform, no admin-editable list. "other" has no fixed model
# list — it's free text,
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

# Café gallery photo categories (Phase 8 — Media & admin review). Applies
# only to Cafe.photos, not menu_photos (menu photos are already their own
# semantic category and don't need this generality). Each photo is stored
# as {"url": str, "category": str} with category validated against this
# list at the write boundary (presign + PATCH /cafes/{id}).
PHOTO_CATEGORIES = ["exterior", "entrance", "play_area", "seating", "equipment", "ambience"]
