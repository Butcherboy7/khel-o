"""Is a result possible, and is the whole bracket consistent? Pure checks, no
database: challenge_day calls them when a result is entered and before Finish.

Result types (Challenge.result_type, None = 'games'):

- games (Tekken and other fighting games): the score is games won. With a
  score, the winner has exactly the majority of the match's best-of (2 in a
  best of 3) and the loser fewer. No draws, no tiebreak.
- goals (EA SPORTS FC): one game per match. Goals 0–30; the winner has more
  goals, or the goals are level and the winner won a penalty shoot-out
  (tiebreak='penalties', both penalty scores, winner has more).

In both, the score may be left out (winner only), but never half-entered.
"""
from __future__ import annotations

from typing import Optional

from app.services import challenge_bracket as bracket

RESULT_TYPES = ("games", "goals")
MAX_GOALS = 30
MAX_PENALTIES = 30


class ResultError(Exception):
    def __init__(self, message: str, code: str = "INVALID_RESULT"):
        super().__init__(message)
        self.message = message
        self.code = code


def result_type(ch) -> str:
    return ch.result_type if ch.result_type in RESULT_TYPES else "games"


def match_best_of(ch, rounds: int, m) -> int:
    """The final has its own best-of; every other match, the 3rd-place one too, uses best_of."""
    return ch.final_best_of if (m.round == rounds - 1 and not m.is_third_place) else ch.best_of


def check_result(
    kind: str, best_of: int, winner: str, score_a: Optional[int], score_b: Optional[int],
    tiebreak: Optional[str] = None, tiebreak_a: Optional[int] = None, tiebreak_b: Optional[int] = None,
) -> None:
    """Raise ResultError if this result can't have happened. winner is 'a' or 'b'."""
    if winner not in ("a", "b"):
        raise ResultError("Pick who won.", "INVALID_WINNER")
    if (score_a is None) != (score_b is None):
        raise ResultError("Enter both scores, or leave both empty.")
    has_tb = tiebreak is not None or tiebreak_a is not None or tiebreak_b is not None
    if score_a is None:
        if has_tb:
            raise ResultError("A penalty shoot-out needs the match score too.")
        return
    win, lose = (score_a, score_b) if winner == "a" else (score_b, score_a)

    if kind == "games":
        if has_tb:
            raise ResultError("Games-won results have no tiebreak.")
        need = best_of // 2 + 1
        if not (0 <= lose < need and win == need):
            raise ResultError(
                f"In a best of {best_of} the winner wins {need} game{'s' if need > 1 else ''} "
                f"and the other player fewer, like {need}–{max(need - 1, 0)}."
            )
        return

    # goals
    if not (0 <= score_a <= MAX_GOALS and 0 <= score_b <= MAX_GOALS):
        raise ResultError(f"Goals go from 0 to {MAX_GOALS}.")
    if win > lose:
        if has_tb:
            raise ResultError("Penalties only settle a level score.")
        return
    if win < lose:
        raise ResultError("The winner can't have fewer goals.")
    # Level on goals: only penalties can decide it.
    if tiebreak != "penalties" or tiebreak_a is None or tiebreak_b is None:
        raise ResultError("A level score needs the penalty shoot-out result.", "TIEBREAK_NEEDED")
    if not (0 <= tiebreak_a <= MAX_PENALTIES and 0 <= tiebreak_b <= MAX_PENALTIES):
        raise ResultError(f"Penalties go from 0 to {MAX_PENALTIES}.")
    pw, pl = (tiebreak_a, tiebreak_b) if winner == "a" else (tiebreak_b, tiebreak_a)
    if pw <= pl:
        raise ResultError("The winner must have scored more penalties.")


def _side(m) -> Optional[str]:
    if m.winner_entry_id is None:
        return None
    if m.winner_entry_id == m.entry_a_id:
        return "a"
    if m.winner_entry_id == m.entry_b_id:
        return "b"
    return "?"


def _loser(m):
    if m.winner_entry_id is None or m.bye:
        return None
    return m.entry_b_id if m.winner_entry_id == m.entry_a_id else m.entry_a_id


def bracket_problems(ch, rows: list) -> list[str]:
    """Everything that stops this bracket being a finished, consistent single
    elimination. Empty list = ready to finish."""
    problems: list[str] = []
    main = [m for m in rows if not m.is_third_place]
    if not main:
        return ["There's no bracket yet: make the draw first."]
    rounds = max(m.round for m in main) + 1
    kind = result_type(ch)

    def name(m) -> str:
        return bracket.round_name(m.round, rounds, m.is_third_place) + (f" {m.position + 1}" if not m.is_third_place and m.round < rounds - 2 else "")

    by_slot = {(m.round, m.position): m for m in main}
    for r in range(rounds):
        expected = 2 ** (rounds - 1 - r)
        have = sorted(p for (rr, p) in by_slot if rr == r)
        if have != list(range(expected)):
            problems.append(f"Round {r + 1} should have {expected} matches.")

    for m in rows:
        side = _side(m)
        if m.bye:
            players = [p for p in (m.entry_a_id, m.entry_b_id) if p is not None]
            if len(players) != 1 or m.winner_entry_id != players[0]:
                problems.append(f"{name(m)}: a bye must have one player, who goes through.")
            continue
        if m.entry_a_id is None or m.entry_b_id is None:
            problems.append(f"{name(m)}: both players aren't known yet.")
            continue
        if m.entry_a_id == m.entry_b_id:
            problems.append(f"{name(m)}: the same player is on both sides.")
            continue
        if side is None:
            problems.append(f"{name(m)}: no result yet.")
            continue
        if side == "?":
            problems.append(f"{name(m)}: the winner isn't one of its two players.")
            continue
        try:
            check_result(kind, match_best_of(ch, rounds, m), side, m.score_a, m.score_b, m.tiebreak, m.tiebreak_a, m.tiebreak_b)
        except ResultError as e:
            problems.append(f"{name(m)}: {e.message}")

    # Each winner is the one who plays on in the next round.
    for m in main:
        if m.round >= rounds - 1 or m.winner_entry_id is None:
            continue
        r, p, slot = bracket.next_slot(m.round, m.position)
        nxt = by_slot.get((r, p))
        if nxt is not None and getattr(nxt, f"entry_{slot}_id") != m.winner_entry_id:
            problems.append(f"{name(nxt)}: a player in it didn't win the match before.")

    # Nobody plays twice in one round.
    for r in range(rounds):
        seen: set = set()
        for m in (x for x in main if x.round == r):
            for p in (m.entry_a_id, m.entry_b_id):
                if p is None:
                    continue
                if p in seen:
                    problems.append(f"Round {r + 1}: a player is in two matches.")
                seen.add(p)

    third = next((m for m in rows if m.is_third_place), None)
    if rounds >= 2:
        semis = [by_slot.get((rounds - 2, 0)), by_slot.get((rounds - 2, 1))]
        losers = {x for x in (_loser(s) for s in semis if s is not None) if x is not None}
        if losers:
            if third is None:
                problems.append("The 3rd-place match is missing.")
            elif {p for p in (third.entry_a_id, third.entry_b_id) if p is not None} != losers:
                problems.append("3rd place: its players must be the two semi-final losers.")

    final = by_slot.get((rounds - 1, 0))
    if final is not None and final.winner_entry_id is not None and not problems:
        podium = [final.winner_entry_id, _loser(final)]
        if third is not None and third.winner_entry_id is not None:
            podium.append(third.winner_entry_id)
        podium = [p for p in podium if p is not None]
        if len(set(podium)) != len(podium):
            problems.append("The same player is in two podium places.")
    return problems
