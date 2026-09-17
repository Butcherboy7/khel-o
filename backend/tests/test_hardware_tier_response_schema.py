"""HardwareTierResponse must be able to serialize persisted zero-capacity rows.

seed_real_cafes.py intentionally stores total_seats=0 for a tier whose
real-world capacity was never published (see test_seed_real_cafes.py's
test_unknown_seat_count_becomes_zero_not_a_guess). Before this fix,
HardwareTierResponse inherited HardwareTierBase's total_seats: gt=0 -- fine
for a create/update request, but it meant reading any such tier back out of
the DB raised a pydantic ValidationError, 500ing the whole café detail page
for any café with an unpublished-capacity tier (e.g. Gamers Guild).
"""
import datetime
from uuid import uuid4

from app.schemas.hardware_tier import HardwareTierResponse


def _base_row(**overrides):
    row = dict(
        id=uuid4(),
        cafe_id=uuid4(),
        name="PlayStation 5",
        total_seats=0,
        app_bookable_seats=0,
        reserved_walkin_seats=0,
        active_seats_count=0,
        price_per_hour=250,
        is_active=True,
        created_at=datetime.datetime.now(datetime.timezone.utc),
        updated_at=datetime.datetime.now(datetime.timezone.utc),
    )
    row.update(overrides)
    return row


def test_response_serializes_unpublished_zero_capacity_tier():
    resp = HardwareTierResponse.model_validate(_base_row())
    assert resp.total_seats == 0


def test_response_still_serializes_normal_positive_capacity_tier():
    resp = HardwareTierResponse.model_validate(_base_row(total_seats=35, app_bookable_seats=0))
    assert resp.total_seats == 35
