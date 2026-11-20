"""Which systems can run a game we sell drops for.

Checked 13 Nov 2026: Rockstar has announced GTA VI only for PS5 (PS5 Pro included)
and Xbox Series X|S, out 19 Nov 2026. No PC version is announced. It does not run
on PS4, Xbox One, Switch, VR headsets or racing rigs.

A game we have no rule for is not checked (the owner knows their own setups).
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from app.core.fps_estimate import console_info

GAME_RULES: List[Dict[str, Any]] = [
    {
        "key": "gta6",
        "label": "GTA 6",
        # Out on 19 Nov 2026. From then, a time inside the café's normal hours is a normal booking
        # (paid in full); only special sessions outside those hours are reserved with the booking fee.
        "liveFrom": "2026-11-19",
        "words": ["gta 6", "gta6", "gta vi", "grand theft auto vi", "grand theft auto 6"],
        "consoles": ["ps5", "ps5pro", "seriesx", "seriess"],
        # A PlayStation/Xbox setup whose model we cannot read: allowed, but the owner is asked to check.
        "families": ["playstation", "xbox"],
        "runsOn": "PS5, PS5 Pro, Xbox Series X and Xbox Series S",
        "notOn": "Not on PC (no PC version yet), PS4, Xbox One, Switch, VR or racing rigs.",
    },
]


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def rule_for(game: Optional[str]) -> Optional[Dict[str, Any]]:
    g = f" {_norm(game or '')} "
    for r in GAME_RULES:
        if any(f" {_norm(w)} " in g for w in r["words"]):
            return r
    return None


def fit(rule: Optional[Dict[str, Any]], platform: Optional[str], specs: Optional[Dict[str, Any]],
        name: Optional[str], model: Optional[str], tier_type: Optional[str] = None) -> str:
    """'yes' it runs, 'no' it cannot, 'check' (a PlayStation/Xbox we cannot identify), 'any' (no rule for this game)."""
    if rule is None:
        return "any"
    if tier_type == "activity":
        return "no"
    c = console_info(platform, specs, name, model)
    if c is not None:
        return "yes" if c["key"] in rule["consoles"] else "no"
    text = _norm(f"{name or ''} {model or ''}")
    if re.search(r"\b(vr|quest|psvr|oculus|rift|vive|sim|simulator|racing|wheel)\b", text):
        return "no"
    if platform in rule["families"]:
        return "check"
    return "no"


def tier_runs_gta6(tier: Any) -> bool:
    """True only when the setup is positively a PS5, PS5 Pro or Xbox Series console. A PlayStation/Xbox we cannot
    identify (say "Gaming Station") is NOT counted: players would be told a PS4 is short of seats because of GTA 6.
    Never for PCs, VR, racing rigs or activities."""
    platform = getattr(tier, "platform", None)
    return fit(rule_for("GTA 6"), platform.value if platform else None, getattr(tier, "specs", None),
               getattr(tier, "name", None), getattr(tier, "model", None), getattr(tier, "tier_type", None)) == "yes"
