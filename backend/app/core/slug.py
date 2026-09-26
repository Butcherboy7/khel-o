import re
import unicodedata


def slugify(text: str) -> str:
    """ASCII, lowercase, hyphen-separated: 'DG Gaming Café!' -> 'dg-gaming-cafe'."""
    ascii_text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
    return slug or "cafe"


def cafe_base_slug(name: str, city: str) -> str:
    """Name plus city (what people search: 'dg gaming cafe hyderabad'), without
    repeating the city when the name already carries it."""
    name_slug, city_slug = slugify(name), slugify(city)
    if city_slug in name_slug.split("-") or name_slug.endswith(city_slug):
        return name_slug[:150]
    return f"{name_slug}-{city_slug}"[:150]


def unique_slug(base: str, taken: set[str]) -> str:
    if base not in taken:
        return base
    n = 2
    while f"{base}-{n}" in taken:
        n += 1
    return f"{base}-{n}"
