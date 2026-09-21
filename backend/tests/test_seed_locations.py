from sqlalchemy import select

from app.models.location import Location, normalize_location_name
from app.constants import validate_state
from scripts.seed_locations import seed_locations, load_seed_data


async def test_seed_locations_inserts_expected_rows(db_session):
    data = load_seed_data()
    await seed_locations(db_session, data)

    stmt = select(Location).where(Location.name_norm == "secunderabad")
    res = await db_session.execute(stmt)
    row = res.scalars().first()
    assert row is not None
    assert row.state == "Telangana"

    stmt = select(Location).where(Location.name_norm == "nampally")
    res = await db_session.execute(stmt)
    row = res.scalars().first()
    assert row is not None
    assert row.state == "Telangana"


async def test_seed_locations_is_idempotent(db_session):
    data = load_seed_data()
    await seed_locations(db_session, data)
    count_stmt = select(Location)
    first_count = len((await db_session.execute(count_stmt)).scalars().all())

    await seed_locations(db_session, data)  # run again
    second_count = len((await db_session.execute(count_stmt)).scalars().all())

    assert first_count == second_count  # no duplicates


async def test_seed_locations_skips_preexisting_owner_created_row(db_session):
    """Reproduces the real ordering the plan calls out: an owner searches and
    creates a city/town via POST /locations (get-or-create) *before* this
    seed script is ever run. The seed script's dedup SELECT must be
    provenance-agnostic -- it doesn't matter whether the existing
    (name_norm, state) row came from an owner or from a previous seed run --
    so seeding afterward must not duplicate it or raise IntegrityError.

    Note: the test DB is session-scoped (see conftest.py's `init_test_database`,
    autouse + scope="session"), shared across every test in this module's run,
    so another test in this file may have already seeded this exact row. We
    don't assume a clean table -- we only assume a row for this
    (name_norm, state) exists (owner-created if not already present, seed-
    created if it is) and record its id before calling seed_locations, which
    is precisely the provenance-agnostic guarantee this test is proving."""
    data = load_seed_data()
    target = next(e for e in data if e["name"] == "Pune" and e["state"] == "Maharashtra")
    state = validate_state(target["state"])
    name_norm = normalize_location_name(target["name"])
    stmt = select(Location).where(Location.name_norm == name_norm, Location.state == state)

    existing = (await db_session.execute(stmt)).scalars().first()
    if existing is None:
        # Pre-create the row using the exact same shape POST /locations
        # uses (app/api/v1/locations.py:101-109), simulating an owner
        # creating this city before the seed script ever runs.
        existing = Location(name=target["name"], name_norm=name_norm, state=state)
        db_session.add(existing)
        await db_session.commit()
    existing_id = existing.id

    # Should not raise, and should not create a duplicate.
    await seed_locations(db_session, data)

    rows = (await db_session.execute(stmt)).scalars().all()
    assert len(rows) == 1
    assert rows[0].id == existing_id
