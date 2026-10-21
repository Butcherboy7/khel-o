"""Single-elimination bracket maths for challenges. Pure functions, no database.

Seeds are 1-based (1 = top seed). A field that isn't a power of two gets byes:
the top seeds skip round 1. Matches are addressed by (round, position), both
0-based; the winner of (r, p) plays in (r + 1, p // 2), as side "a" when p is
even and side "b" when p is odd. Round 0 is the first round.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional


def bracket_size(n: int) -> int:
    """Smallest power of two that holds n entrants (at least 2)."""
    return max(2, 1 << max(0, math.ceil(math.log2(max(n, 1)))))


def rounds_for(n: int) -> int:
    return int(math.log2(bracket_size(n)))


def seed_order(size: int) -> list[int]:
    """Standard bracket order: 1 meets 16, and 1 and 2 can only meet in the final.
    size=4 → [1, 4, 2, 3]; size=8 → [1, 8, 4, 5, 2, 7, 3, 6]."""
    order = [1, 2]
    while len(order) < size:
        total = len(order) * 2 + 1
        order = [x for s in order for x in (s, total - s)]
    return order


@dataclass
class Slot:
    round: int
    position: int
    a: Optional[int] = None  # entrant index into the seeded list, None = empty/bye
    b: Optional[int] = None
    is_third_place: bool = False
    bye: bool = False  # one side is a bye: the other side advances without playing


@dataclass
class Plan:
    size: int
    rounds: int
    matches: list[Slot] = field(default_factory=list)


def plan(n: int, third_place: bool = False) -> Plan:
    """Every match of the bracket for n seeded entrants (indexes 0..n-1 = seeds 1..n).
    Round-0 matches with a bye are marked so the caller can advance them at once."""
    if n < 2:
        raise ValueError("A bracket needs at least 2 entrants")
    size = bracket_size(n)
    rounds = int(math.log2(size))
    order = seed_order(size)
    p = Plan(size=size, rounds=rounds)
    for pos in range(size // 2):
        sa, sb = order[2 * pos], order[2 * pos + 1]
        a = sa - 1 if sa <= n else None
        b = sb - 1 if sb <= n else None
        p.matches.append(Slot(0, pos, a, b, bye=(a is None) != (b is None)))
    for r in range(1, rounds):
        for pos in range(size >> (r + 1)):
            p.matches.append(Slot(r, pos))
    if third_place and rounds >= 2:
        p.matches.append(Slot(rounds - 1, 1, is_third_place=True))
    return p


def next_slot(round_: int, position: int) -> tuple[int, int, str]:
    """Where the winner of (round, position) goes: (round, position, side)."""
    return round_ + 1, position // 2, "a" if position % 2 == 0 else "b"


def round_name(round_: int, rounds: int, is_third_place: bool = False) -> str:
    if is_third_place:
        return "3rd place"
    left = rounds - round_
    return {1: "Final", 2: "Semi-final", 3: "Quarter-final"}.get(left, f"Round {round_ + 1}")
