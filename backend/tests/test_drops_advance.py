"""Pre-booking takes at least half the price up front (people were booking and not turning up)."""
from decimal import Decimal

from app.services.drop_service import advance_due


def test_half_up_front_rounded_up_to_the_rupee():
    assert advance_due(Decimal("500"), Decimal("100")) == Decimal("250.00")
    assert advance_due(Decimal("499"), Decimal("99")) == Decimal("250.00")
    assert advance_due(Decimal("1250"), Decimal("99")) == Decimal("625.00")


def test_a_higher_owner_fee_still_applies_but_never_more_than_the_price():
    assert advance_due(Decimal("200"), Decimal("150")) == Decimal("150.00")
    assert advance_due(Decimal("100"), Decimal("300")) == Decimal("100.00")
