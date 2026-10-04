"""Games a tournament can be created for, with sensible defaults.

Picking a game fills team size, match length and starter rules; the organiser
can change all of them. `colour` drives the generated poster on the frontend.
"""
from __future__ import annotations

GAMES: dict[str, dict] = {
    "ea_fc": {
        "name": "EA SPORTS FC 25", "short": "FC 25", "team_sizes": [1, 2], "team_size": 1, "match_minutes": 15,
        "platform": "PlayStation", "colour": "#16a34a",
        "rules": "6-minute halves, Classic match, any club.\nDraw after 90: extra time, then penalties.\n"
                 "Disconnect in the first 10 minutes: replay. After that, the score stands.\nBring your own controller if you prefer.",
    },
    "tekken": {
        "name": "Tekken 8", "short": "Tekken 8", "team_sizes": [1], "team_size": 1, "match_minutes": 10,
        "platform": "PlayStation", "colour": "#dc2626",
        "rules": "Best of 3 games, 3 rounds each. Grand final best of 5.\nWinner keeps the character; loser may switch.\n"
                 "Default settings, 60 seconds per round.",
    },
    "sf6": {
        "name": "Street Fighter 6", "short": "SF6", "team_sizes": [1], "team_size": 1, "match_minutes": 10,
        "platform": "PlayStation", "colour": "#ea580c",
        "rules": "Best of 3 games, 2 rounds each. Grand final best of 5.\nClassic or Modern controls allowed.\nLoser may switch character.",
    },
    "mk1": {
        "name": "Mortal Kombat 1", "short": "MK1", "team_sizes": [1], "team_size": 1, "match_minutes": 10,
        "platform": "PlayStation", "colour": "#ca8a04",
        "rules": "Best of 3 games, first to 2 rounds each.\nLoser may switch character or Kameo.",
    },
    "rocket_league": {
        "name": "Rocket League", "short": "Rocket League", "team_sizes": [1, 2, 3], "team_size": 2, "match_minutes": 10,
        "platform": "PC / PlayStation", "colour": "#2563eb",
        "rules": "5-minute matches, best of 1 (final best of 3).\nStandard arena, default mutators.\nOvertime until a goal.",
    },
    "valorant": {
        "name": "Valorant", "short": "Valorant", "team_sizes": [5], "team_size": 5, "match_minutes": 45,
        "platform": "PC", "colour": "#e11d48",
        "rules": "Competitive rules, first to 13 rounds. Map veto by captains.\nUse your own accounts.\n"
                 "Technical pause up to 5 minutes per team.",
    },
    "cs2": {
        "name": "Counter-Strike 2", "short": "CS2", "team_sizes": [2, 5], "team_size": 5, "match_minutes": 45,
        "platform": "PC", "colour": "#f59e0b",
        "rules": "MR12, first to 13 rounds. Map veto by captains.\nUse your own accounts.",
    },
    "custom": {
        "name": "Other game", "short": "Tournament", "team_sizes": [1, 2, 3, 4, 5], "team_size": 1, "match_minutes": 15,
        "platform": "", "colour": "#7c3aed",
        "rules": "Single elimination. Report the result to the organiser right after your match.",
    },
}

HOUSE_RULES = (
    "Check in at the counter during the check-in window; players who aren't checked in when the bracket is made can't play.\n"
    "Be at your station within 5 minutes of your match being called, or it's a walkover.\n"
    "The organiser's decision on disputes is final. Respect the café and other players."
)


def game(key: str) -> dict:
    return GAMES.get(key) or GAMES["custom"]


def public_list() -> list[dict]:
    return [{"key": k, **{f: v[f] for f in ("name", "short", "team_sizes", "team_size", "match_minutes", "platform", "colour", "rules")}}
            for k, v in GAMES.items()]
