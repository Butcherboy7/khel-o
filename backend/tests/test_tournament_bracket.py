"""Single-elimination bracket maths."""
import pytest

from app.services import tournament_bracket as tb


def test_sizes_and_seed_order():
    assert [tb.bracket_size(n) for n in (2, 3, 4, 5, 8, 9, 33)] == [2, 4, 4, 8, 8, 16, 64]
    assert tb.seed_order(4) == [1, 4, 2, 3]
    assert tb.seed_order(8) == [1, 8, 4, 5, 2, 7, 3, 6]
    order = tb.seed_order(16)
    assert sorted(order) == list(range(1, 17))
    # 1 and 2 sit in opposite halves, so they can only meet in the final.
    assert order.index(1) < 8 <= order.index(2)


@pytest.mark.parametrize("n", range(2, 34))
def test_plan_has_every_entrant_once_and_right_match_count(n):
    p = tb.plan(n)
    first = [m for m in p.matches if m.round == 0]
    seen = [x for m in first for x in (m.a, m.b) if x is not None]
    assert sorted(seen) == list(range(n))
    assert len(p.matches) == p.size - 1
    assert sum(m.bye for m in first) == p.size - n
    # Byes go to the top seeds.
    bye_seeds = sorted((m.a if m.a is not None else m.b) for m in first if m.bye)
    assert bye_seeds == list(range(p.size - n))


def test_third_place_and_round_names():
    p = tb.plan(8, third_place=True)
    third = [m for m in p.matches if m.is_third_place]
    assert len(third) == 1 and third[0].round == 2
    assert tb.round_name(2, 3) == "Final" and tb.round_name(1, 3) == "Semi-final"
    assert tb.round_name(0, 3) == "Quarter-final" and tb.round_name(0, 5) == "Round 1"
    assert tb.round_name(2, 3, is_third_place=True) == "3rd place"
    assert tb.next_slot(0, 0) == (1, 0, "a") and tb.next_slot(0, 3) == (1, 1, "b")


def test_capacity_estimates_for_four_consoles():
    # 32 players, 4 PS4s, 12-min FIFA + 5 min changeover: 16+8+4+2+1 matches in 4+2+1+1+1 waves.
    assert tb.estimate_minutes(32, 4, 12) == 9 * 17
    # 100 players can't fit an evening on 4 consoles; about 32–40 can in 3 hours.
    assert tb.estimate_minutes(100, 4, 12) > 6 * 60
    fit = tb.max_entrants_within(180, 4, 12)
    assert 32 <= fit < 64
    assert tb.estimate_minutes(fit, 4, 12) <= 180 < tb.estimate_minutes(fit + 1, 4, 12)


def test_points():
    assert [tb.points_for(p) for p in (1, 2, 3, 4, 5, 8, 9, None)] == [100, 70, 45, 45, 25, 25, 10, 10]
