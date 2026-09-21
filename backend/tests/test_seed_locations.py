import pytest
from sqlalchemy import select

from app.models.location import Location
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
