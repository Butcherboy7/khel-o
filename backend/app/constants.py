# Cities KHEL-O accepts a café's address in, grouped by state. Mirrors
# frontend/src/constants/cities.ts — keep both in sync; keys must match
# frontend/src/constants/states.ts's INDIAN_STATES exactly.
# City must never be accepted as arbitrary free text: the discovery filter
# (app/repositories/cafe_repository.py) matches a café's stored `city`
# exactly (case-insensitively) against one of these values. A café whose
# city doesn't match one of these exactly will show under "All Cities" (no
# filter applied there) but silently vanish from its own city's filter —
# this list plus validate_city() is what prevents that.
CITIES_BY_STATE = {
    "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Tirupati", "Kakinada", "Rajahmundry", "Kurnool"],
    "Arunachal Pradesh": ["Itanagar", "Naharlagun", "Pasighat"],
    "Assam": ["Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Tezpur"],
    "Bihar": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga"],
    "Chhattisgarh": ["Raipur", "Bhilai", "Bilaspur", "Durg", "Korba"],
    "Goa": ["Panaji", "Margao", "Vasco da Gama", "Mapusa"],
    "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", "Gandhinagar"],
    "Haryana": ["Gurugram", "Faridabad", "Panipat", "Ambala", "Karnal", "Hisar"],
    "Himachal Pradesh": ["Shimla", "Manali", "Dharamshala", "Solan"],
    "Jharkhand": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro"],
    "Karnataka": ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Belagavi", "Kalaburagi"],
    "Kerala": ["Kochi", "Thiruvananthapuram", "Kozhikode", "Thrissur", "Kollam"],
    "Madhya Pradesh": ["Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain"],
    "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad", "Thane", "Navi Mumbai", "Kolhapur"],
    "Manipur": ["Imphal"],
    "Meghalaya": ["Shillong"],
    "Mizoram": ["Aizawl"],
    "Nagaland": ["Kohima", "Dimapur"],
    "Odisha": ["Bhubaneswar", "Cuttack", "Rourkela", "Puri"],
    "Punjab": ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Mohali"],
    "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner"],
    "Sikkim": ["Gangtok"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli"],
    "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar"],
    "Tripura": ["Agartala"],
    "Uttar Pradesh": ["Lucknow", "Kanpur", "Noida", "Ghaziabad", "Agra", "Varanasi", "Meerut", "Prayagraj"],
    "Uttarakhand": ["Dehradun", "Haridwar", "Rishikesh", "Nainital", "Haldwani"],
    "West Bengal": ["Kolkata", "Howrah", "Durgapur", "Siliguri", "Asansol"],
    "Delhi": ["Delhi"],
    "Jammu and Kashmir": ["Srinagar", "Jammu"],
    "Ladakh": ["Leh", "Kargil"],
    "Puducherry": ["Puducherry"],
    "Andaman and Nicobar Islands": ["Port Blair"],
    "Chandigarh": ["Chandigarh"],
    "Dadra and Nagar Haveli and Daman and Diu": ["Daman", "Silvassa"],
    "Lakshadweep": ["Kavaratti"],
}

SUPPORTED_CITIES = sorted({city for cities in CITIES_BY_STATE.values() for city in cities})

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

# Café gallery photo categories (Phase 8 — Media & admin review). Applies
# only to Cafe.photos, not menu_photos (menu photos are already their own
# semantic category and don't need this generality). Each photo is stored
# as {"url": str, "category": str} with category validated against this
# list at the write boundary (presign + PATCH /cafes/{id}).
PHOTO_CATEGORIES = ["exterior", "entrance", "play_area", "seating", "equipment", "ambience"]
