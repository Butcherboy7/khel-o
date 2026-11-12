"""Expected FPS for popular games, shown to players on a café's PC setups.

These are ESTIMATES, deliberately rough and rounded: ballpark numbers for 1080p at
competitive / low-medium settings, taken per GPU class (the same classes as
app/services/performance_rating.GPU_SCORES). They exist so a player can tell
"will this feel smooth" at a glance. They are never presented as measured.

The owner can replace any number with one they measured (hardware_tiers.fps_overrides).
An owner number shows without the "estimated" label. A GPU we don't recognise gets
NO estimate at all: we never guess for hardware we can't place.
"""
from typing import Any, Dict, List, Optional


# Display name, key, and ballpark FPS per GPU score band (scores from GPU_SCORES).
# Bands: 1.0 (GTX 1050) 1.5 (1060/1650) 2.5 (1660) 3.0 (2060/3050) 3.5 (3060/4060)
#        4.0 (3070/4060 Ti) 4.5 (3080/4070) 5.0 (3090/4080/4090)
GAMES: List[Dict[str, Any]] = [
    {"key": "valorant", "name": "Valorant",
     "fps": {1.0: 140, 1.5: 200, 2.5: 280, 3.0: 320, 3.5: 400, 4.0: 450, 4.5: 500, 5.0: 550}},
    {"key": "cs2", "name": "CS2",
     "fps": {1.0: 70, 1.5: 100, 2.5: 150, 3.0: 180, 3.5: 220, 4.0: 260, 4.5: 300, 5.0: 350}},
    {"key": "fortnite", "name": "Fortnite",
     "fps": {1.0: 70, 1.5: 100, 2.5: 150, 3.0: 180, 3.5: 220, 4.0: 260, 4.5: 300, 5.0: 360}},
    {"key": "gta5", "name": "GTA V",
     "fps": {1.0: 60, 1.5: 80, 2.5: 110, 3.0: 130, 3.5: 150, 4.0: 170, 4.5: 190, 5.0: 200}},
    {"key": "cyberpunk", "name": "Cyberpunk 2077",
     "fps": {1.0: 25, 1.5: 35, 2.5: 55, 3.0: 65, 3.5: 80, 4.0: 100, 4.5: 115, 5.0: 140}},
]

def _pc_gpu_keys() -> Dict[str, float]:
    # Imported on first use: app.services pulls in the schemas, and the schemas
    # import this module, so a top-level import here would be circular.
    from app.services.performance_rating import GPU_SCORES
    return {k: v for k, v in GPU_SCORES.items() if k.startswith(("gtx", "rtx"))}


def _gpu_score(gpu_name: str) -> Optional[float]:
    """The GPU's score band, or None when it isn't a GPU we know."""
    name = (gpu_name or "").lower().strip()
    # Longest key first so "rtx 4060 ti" beats its prefix "rtx 4060".
    keys = _pc_gpu_keys()
    for key in sorted(keys, key=len, reverse=True):
        if key in name:
            return keys[key]
    return None


def expected_fps(platform: Optional[str], specs: Optional[Dict[str, Any]], overrides: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """[{key, game, fps, estimated}] for a PC setup; empty for anything else.

    An owner override always wins and is marked estimated=False. A game with no
    override and an unrecognised GPU is left out."""
    if platform != "pc":
        return []
    overrides = overrides or {}
    score = _gpu_score((specs or {}).get("gpu", ""))
    out: List[Dict[str, Any]] = []
    for game in GAMES:
        owner = overrides.get(game["key"])
        if isinstance(owner, int) and not isinstance(owner, bool) and owner > 0:
            out.append({"key": game["key"], "game": game["name"], "fps": owner, "estimated": False})
        elif score is not None:
            out.append({"key": game["key"], "game": game["name"], "fps": game["fps"][score], "estimated": True})
    return out
