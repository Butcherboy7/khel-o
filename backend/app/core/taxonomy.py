"""Activity taxonomy: Category -> Activity -> Style -> Attributes.

The data lives in taxonomy.json (see docs/superpowers/specs/2026-10-01-
activity-taxonomy-design.md for the rules). A hardware tier carries one
`taxonomy_key` pointing at an activity ("snooker") or a style
("pool.american") plus an `attributes` dict of details. Everything here is
informational/classification only — pricing and booking never read it.
"""
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

_PATH = Path(__file__).with_name("taxonomy.json")


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


@lru_cache(maxsize=1)
def load() -> dict[str, Any]:
    return json.loads(_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _index() -> dict[str, Any]:
    data = load()
    nodes: dict[str, dict] = {}   # key -> {"activity": act, "style": style|None}
    aliases: dict[str, str] = {}  # normalised alias/label -> key
    for act in data["activities"]:
        nodes[act["key"]] = {"activity": act, "style": None}
        for w in [act["label"], *act.get("aliases", [])]:
            aliases.setdefault(_norm(w), act["key"])
        for st in act.get("styles", []):
            nodes[st["key"]] = {"activity": act, "style": st}
            for w in [st["label"], *st.get("aliases", [])]:
                aliases.setdefault(_norm(w), st["key"])
    return {"nodes": nodes, "aliases": aliases}


def node(key: str | None) -> dict | None:
    return _index()["nodes"].get(key) if key else None


def activity_key_for(taxonomy_key: str | None) -> str | None:
    n = node(taxonomy_key)
    return n["activity"]["key"] if n else None


def public_tree() -> dict[str, Any]:
    """The taxonomy without the internal rules, for GET /taxonomy."""
    data = load()
    return {
        "version": data["version"],
        "categories": data["categories"],
        "activities": data["activities"],
    }


def classify_name(name: str | None, activity_kind: str | None = None) -> str | None:
    """Best taxonomy key for a tier's free-text name/kind, or None.

    Longest alias wins, so "sim racing motion rig" lands on the motion style
    rather than the bare activity. Anything ambiguous returns None — the
    owner picks; we never guess ("Snooker / Pool" mentions both).
    """
    idx = _index()
    for text in (activity_kind, name):
        n = f" {_norm(text or '')} "
        if not n.strip():
            continue
        hits = {
            key
            for al, key in idx["aliases"].items()
            if al and f" {al} " in n
        }
        acts = {idx["nodes"][k]["activity"]["key"] for k in hits}
        if len(acts) > 1:
            return None
        if hits:
            # prefer the most specific (a style over its parent activity)
            return max(hits, key=lambda k: ("." in k, len(k)))
    return None


_PC_WORDS = re.compile(r"\b(rtx|gtx|\d{3}hz|esports|competitive|streamer|creator)\b")


def classify_gaming_tier(name: str | None, platform: str | None) -> str | None:
    """Backfill rule for gaming-type tiers (platform wins over the name)."""
    if platform == "pc":
        return "pc-gaming"
    if platform == "playstation":
        return "console.playstation"
    if platform == "xbox":
        return "console.xbox"
    if platform == "nintendo":
        return "console.nintendo"
    by_name = classify_name(name)
    if by_name:
        return by_name
    if _PC_WORDS.search(_norm(name or "")):
        return "pc-gaming"
    return None


def validate_attributes(taxonomy_key: str | None, attributes: dict | None) -> dict:
    """Return cleaned attributes, or raise ValueError.

    Unknown keys are rejected, enum values must be listed, ints must be
    ints, and None / "" means "Don't know" and is dropped. Optional
    attributes can always be left out.
    """
    attrs = attributes or {}
    if not attrs:
        return {}
    n = node(taxonomy_key)
    if not n:
        raise ValueError("attributes need a valid taxonomyKey")
    spec = {a["key"]: a for a in n["activity"].get("attributes", [])}
    out: dict[str, Any] = {}
    for k, v in attrs.items():
        a = spec.get(k)
        if a is None:
            raise ValueError(f"unknown attribute '{k}' for {n['activity']['key']}")
        if v is None or v == "" or v == []:
            continue  # "Don't know"
        t = a["type"]
        if t == "enum":
            if str(v) not in a["options"]:
                raise ValueError(f"'{k}' must be one of {a['options']}")
            out[k] = str(v)
        elif t == "multi":
            if not isinstance(v, list) or any(str(x) not in a["options"] for x in v):
                raise ValueError(f"'{k}' must be a list drawn from {a['options']}")
            out[k] = [str(x) for x in v]
        elif t == "int":
            if isinstance(v, bool) or not isinstance(v, int) or not 0 < v <= 10000:
                raise ValueError(f"'{k}' must be a whole number")
            out[k] = v
        elif t == "bool":
            if not isinstance(v, bool):
                raise ValueError(f"'{k}' must be true or false")
            out[k] = v
        else:  # text
            s = str(v).strip()
            if len(s) > 120:
                raise ValueError(f"'{k}' is too long")
            if s:
                out[k] = s
    return out


def validate_key(taxonomy_key: str | None) -> str | None:
    if taxonomy_key in (None, ""):
        return None
    if node(taxonomy_key) is None:
        raise ValueError(f"unknown taxonomyKey '{taxonomy_key}'")
    return taxonomy_key


# Attribute keys that hold "how many people fit on one unit" for each kind of
# activity (table, lane, room, rig). A unit's price never depends on the group
# size; this cap only limits how many people may be booked onto it.
PLAYER_CAP_KEYS = ("players_max", "players_per_lane", "room_capacity", "players")


def players_cap(attributes: dict | None) -> int | None:
    """Most people one unit can take, as set by the owner; None = not set."""
    for k in PLAYER_CAP_KEYS:
        v = (attributes or {}).get(k)
        try:
            n = int(v)
        except (TypeError, ValueError):
            continue
        if n > 0:
            return n
    return None


def missing_required(taxonomy_key: str | None, attributes: dict | None) -> list[str]:
    """Labels of required attributes the owner has not filled in."""
    n = node(taxonomy_key)
    if not n:
        return []
    attrs = attributes or {}
    return [a["label"] for a in n["activity"].get("attributes", [])
            if a.get("level") == "required" and attrs.get(a["key"]) in (None, "", [])]
