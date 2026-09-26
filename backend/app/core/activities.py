"""One vocabulary for "what can you play here", derived from hardware tiers.

Gaming tiers map to a platform activity (PC, console); activity tiers carry
an owner-set `activity_kind` (Snooker, Bowling, ...). Known kinds get a
stable key, label and rank from CATALOG; anything else an owner types is
still surfaced under its slug, so adding Pool, VR or a racing simulator
needs no frontend change — just a tier with that activity_kind.
"""
from dataclasses import dataclass
from typing import Iterable

from app.core.slug import slugify


@dataclass(frozen=True)
class ActivityDef:
    key: str
    label: str
    group: str  # "gaming" (core identity, listed first) or "more"
    rank: int


CATALOG: tuple[ActivityDef, ...] = (
    ActivityDef("pc-gaming", "PC Gaming", "gaming", 0),
    ActivityDef("console", "PlayStation / Console", "gaming", 1),
    ActivityDef("racing-simulator", "Racing Simulator", "gaming", 2),
    ActivityDef("vr", "VR", "gaming", 3),
    ActivityDef("snooker", "Snooker", "more", 10),
    ActivityDef("pool", "Pool", "more", 11),
    ActivityDef("bowling", "Bowling", "more", 12),
)
_BY_KEY = {a.key: a for a in CATALOG}

# Owner free text -> catalog key, for spellings that should merge.
_ALIASES = {
    "eight-ball-pool": "pool",
    "8-ball-pool": "pool",
    "billiards": "pool",
    "pool-table": "pool",
    "vr-gaming": "vr",
    "virtual-reality": "vr",
    "racing-sim": "racing-simulator",
    "sim-racing": "racing-simulator",
}

_CONSOLE_PLATFORMS = {"playstation", "xbox", "nintendo"}
_CONSOLE_WORDS = ("ps5", "ps4", "playstation", "xbox", "switch", "nintendo", "console")


def activity_key(kind: str) -> str:
    slug = slugify(kind)
    return _ALIASES.get(slug, slug)


def activity_def(key: str, raw_label: str | None = None) -> ActivityDef:
    return _BY_KEY.get(key) or ActivityDef(key, (raw_label or key).strip().title(), "more", 100)


def _value(v) -> str | None:
    return getattr(v, "value", v)


def tier_activity(tier) -> tuple[str, str] | None:
    """(key, raw label) for one tier, or None if it can't be classified."""
    if _value(tier.tier_type) == "activity":
        kind = (tier.activity_kind or "").strip()
        return (activity_key(kind), kind) if kind else None
    platform = _value(tier.platform)
    if platform == "pc":
        return "pc-gaming", "PC Gaming"
    if platform in _CONSOLE_PLATFORMS:
        return "console", "Console"
    if platform is not None:
        return None
    # Legacy tier with no confirmed platform: same name fallback the
    # frontend used (lib/platformTags.ts) — console words, else a PC rig.
    name = (tier.name or "").lower()
    if any(w in name for w in _CONSOLE_WORDS):
        return "console", "Console"
    return "pc-gaming", "PC Gaming"


def cafe_activities(tiers: Iterable) -> dict[str, str]:
    """key -> raw label for every activity a café's active tiers offer.

    A café with no tiers yet (e.g. a Booking Soon listing) is a gaming café
    by default, matching how it has always been shown under PC.
    """
    found: dict[str, str] = {}
    any_tier = False
    for t in tiers:
        any_tier = True
        a = tier_activity(t)
        if a:
            found.setdefault(*a)
    if not any_tier:
        found["pc-gaming"] = "PC Gaming"
    return found


def sort_keys(keys: Iterable[str]) -> list[str]:
    return sorted(keys, key=lambda k: (activity_def(k).rank, k))
