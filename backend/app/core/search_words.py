"""Words in a café search that mean "a café where I can play GTA 6"."""
import re

_GTA6 = re.compile(
    r"\b(?:gta|grand\s+theft\s+auto)\s*(?:6|vi|six)?\b|\bgta6\b|\bgtavi\b",
    re.IGNORECASE,
)
# Filler people type around it ("gta 6 cafe near me") that no café name holds.
_FILLER = {"cafe", "cafes", "café", "cafés", "near", "me", "play", "game", "gaming", "where", "to", "in", "at", "ps5"}


def strip_gta6_words(query: str) -> tuple[str, bool]:
    """("gta 6 cafe kukatpally") -> ("kukatpally", True); ("rockstar") -> ("rockstar", False).

    GTA V ("gta 5", "gta v") is a different game and is left alone."""
    if re.search(r"\bgta\s*(?:5|v)\b", query, re.IGNORECASE):
        return query, False
    if not _GTA6.search(query):
        return query, False
    rest = _GTA6.sub(" ", query)
    words = [w for w in rest.split() if w.lower() not in _FILLER]
    return " ".join(words), True
