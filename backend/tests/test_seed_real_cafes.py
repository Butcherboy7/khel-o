"""Selection and mapping rules for seeding the 22 real cafes.

The risk this file guards is publishing something false about a real business.
The seed is allowed to list a cafe with almost nothing filled in; it is not
allowed to list one whose identity is in doubt, invent a price, or make a
lead listing bookable.

See docs/superpowers/plans/2026-09-10-explore-real-cafes.md Task 15
"""
import pytest

from scripts.data.real_cafes import ALL_CAFES, BLOCKING_CONFLICTS, CATEGORY_REVIEW
from scripts.seed_real_cafes import (
    PLACEHOLDER_PHONE,
    excluded_slugs,
    generate_password,
    parse_time,
    platform_for,
    seedable_cafes,
    tier_rows_for,
)


def test_every_blocking_cafe_is_excluded():
    """A cafe whose identity is in doubt must never reach Explore."""
    blocked = {s for c in BLOCKING_CONFLICTS for s in c["slugs"]}
    assert blocked, "fixture sanity: expected recorded conflicts"
    assert blocked <= excluded_slugs()


def test_category_review_cafes_are_excluded():
    """Arcade/bowling chains are not independent gaming cafes."""
    assert set(CATEGORY_REVIEW) <= excluded_slugs()


def test_seedable_set_is_the_remainder():
    seedable = seedable_cafes()
    assert len(seedable) == len(ALL_CAFES) - len(excluded_slugs())
    assert len(seedable) == 14, "16 minus the 2 category-review venues"
    assert not {c["slug"] for c in seedable} & excluded_slugs()


def test_both_halves_of_each_duplicate_pair_are_excluded():
    """Dropping only one half still leaves a card whose address we doubt.

    For the Sainikpuri pair the evidence points at Quantum, but Rebellion's own
    site contradicting the address means we do not know the premises is not
    shared -- so neither is published until a human confirms.
    """
    slugs = {c["slug"] for c in seedable_cafes()}
    for pair in (
        {"megagamerz.vignannagar", "megagaming.events"},
        {"quantum.sainikpuri", "rebellion.sainikpuri"},
    ):
        assert not (pair & slugs), f"{pair} must be fully excluded, not half-seeded"


def test_seedable_cafes_keep_the_well_documented_ones():
    """The exclusions must not quietly drop the cafes we actually researched."""
    slugs = {c["slug"] for c in seedable_cafes()}
    assert "gamersguild.banjarahills" in slugs
    assert "clashofconsoles.vanasthalipuram" in slugs
    assert "blitz.rajajinagar" in slugs


# --- price / hardware mapping -------------------------------------------------

def test_tier_rows_only_exist_where_a_price_was_confirmed():
    for cafe in seedable_cafes():
        rows = tier_rows_for(cafe)
        assert len(rows) == len(cafe["tiers"])
        for row in rows:
            assert row["price_per_hour"] > 0, "a tier with no real price must not be created"


def test_no_cafe_without_confirmed_tiers_gets_one_invented():
    """The failure mode that shipped before: a placeholder Rs 80/hr tier."""
    for cafe in seedable_cafes():
        if not cafe["tiers"]:
            assert tier_rows_for(cafe) == []


def test_tiers_are_never_app_bookable():
    """A lead listing is listed, not bookable -- seats stay at zero even when
    the venue publishes a capacity."""
    for cafe in seedable_cafes():
        for row in tier_rows_for(cafe):
            assert row["app_bookable_seats"] == 0


def test_unknown_seat_count_becomes_zero_not_a_guess():
    guild = next(c for c in ALL_CAFES if c["slug"] == "gamersguild.banjarahills")
    rows = {r["name"]: r for r in tier_rows_for(guild)}
    assert rows["PC (RTX 4060)"]["total_seats"] == 35, "published capacity is kept"
    assert rows["PlayStation 5"]["total_seats"] == 0, "unpublished capacity must be 0"


def test_platform_mapping():
    assert platform_for("PC (RTX 4060)").value == "pc"
    assert platform_for("PlayStation 5").value == "playstation"
    assert platform_for("PS5").value == "playstation"
    assert platform_for("Nintendo Switch").value == "nintendo"
    # Sims and VR have no enum member of their own.
    assert platform_for("Racing Simulator").value == "other"
    assert platform_for("VR (Meta Quest 3)").value == "other"


# --- small helpers -----------------------------------------------------------

@pytest.mark.parametrize("raw,expected", [("09:00", (9, 0)), ("23:00", (23, 0)), ("10:00", (10, 0))])
def test_parse_time(raw, expected):
    parsed = parse_time(raw)
    assert (parsed.hour, parsed.minute) == expected


def test_parse_time_passes_none_through():
    """Unknown hours must stay unknown rather than defaulting to a plausible day."""
    assert parse_time(None) is None


def test_unconfirmed_phone_stays_the_placeholder():
    for cafe in seedable_cafes():
        if not cafe["phone_confirmed"]:
            assert cafe["phone_number"] == PLACEHOLDER_PHONE


def test_generated_passwords_are_unique_and_not_trivial():
    passwords = {generate_password() for _ in range(200)}
    assert len(passwords) == 200, "generated passwords must not collide"
    for pw in list(passwords)[:10]:
        assert len(pw) >= 12
