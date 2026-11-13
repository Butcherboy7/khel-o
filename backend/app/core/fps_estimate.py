"""Expected FPS for popular games, shown to players on a café's PC setups.

These are ESTIMATES, deliberately rough and rounded: ballpark numbers for 1080p at
competitive / low-medium settings, taken per GPU class (the same classes as
app/services/performance_rating.GPU_SCORES). They exist so a player can tell
"will this feel smooth" at a glance. They are never presented as measured.

The owner can replace any number with one they measured (hardware_tiers.fps_overrides).
An owner number shows without the "estimated" label. A GPU we don't recognise gets
NO estimate at all: we never guess for hardware we can't place.
"""
import re
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


# Consoles. Rounded, "up to" numbers from each console's usual performance mode
# in popular games, plus the headline facts that make one console different from
# another. Estimates only, like the PC table. Order matters: the longest match wins.
CONSOLE_GAMES: List[Dict[str, str]] = [
    {"key": "fortnite", "name": "Fortnite"},
    {"key": "cod", "name": "Call of Duty"},
    {"key": "fc", "name": "EA Sports FC"},
    {"key": "gta5", "name": "GTA V"},
    {"key": "mariokart", "name": "Mario Kart"},
]

CONSOLES: List[Dict[str, Any]] = [
    {"key": "ps5pro", "label": "PS5 Pro", "words": ["ps5 pro", "playstation 5 pro"], "tflops": 16.7, "resolution": "4K", "storage": "2 TB",
     "blurb": "The fastest PlayStation. Sharper picture and steadier frame rates than a PS5.",
     "fps": {"fortnite": 120, "cod": 120, "fc": 60, "gta5": 60}},
    {"key": "ps5", "label": "PS5", "words": ["ps5", "playstation 5", "ps 5"], "tflops": 10.3, "resolution": "4K", "storage": "825 GB",
     "blurb": "Fast and smooth. Most new games run in 4K or at a high frame rate.",
     "fps": {"fortnite": 120, "cod": 120, "fc": 60, "gta5": 60}},
    {"key": "ps4pro", "label": "PS4 Pro", "words": ["ps4 pro", "playstation 4 pro"], "tflops": 4.2, "resolution": "1440p", "storage": "1 TB",
     "blurb": "Older generation, still great for games most people already know.",
     "fps": {"fortnite": 60, "cod": 60, "fc": 60, "gta5": 30}},
    {"key": "ps4", "label": "PS4", "words": ["ps4", "playstation 4", "ps 4"], "tflops": 1.8, "resolution": "1080p", "storage": "500 GB",
     "blurb": "Older generation, good for classic games and casual play.",
     "fps": {"fortnite": 60, "cod": 60, "fc": 60, "gta5": 30}},
    {"key": "seriesx", "label": "Xbox Series X", "words": ["series x"], "tflops": 12.2, "resolution": "4K", "storage": "1 TB",
     "blurb": "Xbox's most powerful console. Very smooth, with the best picture on Xbox.",
     "fps": {"fortnite": 120, "cod": 120, "fc": 60, "gta5": 60}},
    {"key": "seriess", "label": "Xbox Series S", "words": ["series s"], "tflops": 4.0, "resolution": "1440p", "storage": "512 GB",
     "blurb": "Smaller and cheaper than the Series X. Plays the same games at a lower picture quality.",
     "fps": {"fortnite": 120, "cod": 60, "fc": 60, "gta5": 60}},
    {"key": "xboxonex", "label": "Xbox One X", "words": ["xbox one x"], "tflops": 6.0, "resolution": "4K", "storage": "1 TB",
     "blurb": "Older Xbox with a 4K picture.",
     "fps": {"fortnite": 60, "cod": 60, "fc": 60, "gta5": 30}},
    {"key": "xboxone", "label": "Xbox One", "words": ["xbox one"], "tflops": 1.4, "resolution": "900p", "storage": "500 GB",
     "blurb": "Older Xbox, good for classic games.",
     "fps": {"fortnite": 60, "cod": 60, "fc": 60, "gta5": 30}},
    {"key": "switch2", "label": "Nintendo Switch 2", "words": ["switch 2", "switch2"], "tflops": None, "resolution": "1080p TV", "storage": "256 GB",
     "blurb": "Nintendo's newer handheld and TV console, a big step up from the first Switch.",
     "fps": {"fortnite": 60, "mariokart": 60}},
    {"key": "switch", "label": "Nintendo Switch", "words": ["switch"], "tflops": None, "resolution": "720p to 1080p", "storage": "32 to 64 GB",
     "blurb": "Great for party and family games like Mario Kart.",
     "fps": {"fortnite": 30, "mariokart": 60}},
]


def _console_for(platform: Optional[str], specs: Optional[Dict[str, Any]], name: Optional[str], model: Optional[str]) -> Optional[Dict[str, Any]]:
    if platform not in ("playstation", "xbox", "nintendo", "other", None):
        return None
    sp = specs or {}
    text = " ".join(str(x) for x in (name, model, sp.get("console"), sp.get("other")) if x).lower()
    if not text.strip():
        return None
    if platform == "other" and not any(w in text for w in ("ps", "playstation", "xbox", "switch")):
        return None
    for c in CONSOLES:
        # Whole words only, so "ps5" does not match inside another word.
        if any(re.search(r"(?<![a-z0-9])" + re.escape(w) + r"(?![a-z0-9])", text) for w in c["words"]):
            return c
    return None


def console_info(platform: Optional[str], specs: Optional[Dict[str, Any]], name: Optional[str] = None, model: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Plain facts about a recognised console, or None. Never guessed for unknown hardware."""
    if platform == "pc":
        return None
    c = _console_for(platform, specs, name, model)
    if c is None:
        return None
    return {"key": c["key"], "label": c["label"], "tflops": c["tflops"], "resolution": c["resolution"], "storage": c["storage"], "blurb": c["blurb"]}


def expected_fps(platform: Optional[str], specs: Optional[Dict[str, Any]], overrides: Optional[Dict[str, Any]],
                 name: Optional[str] = None, model: Optional[str] = None) -> List[Dict[str, Any]]:
    """[{key, game, fps, estimated}] for a PC or a console we recognise; empty otherwise.

    PC: an owner override always wins and is marked estimated=False. A game with no
    override and an unrecognised GPU is left out. Consoles are estimates only."""
    if platform != "pc":
        c = _console_for(platform, specs, name, model)
        if c is None:
            return []
        names = {g["key"]: g["name"] for g in CONSOLE_GAMES}
        return [{"key": k, "game": names[k], "fps": v, "estimated": True} for k, v in c["fps"].items() if k in names]
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
