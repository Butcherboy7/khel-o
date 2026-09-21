"""Seed backend/scripts/data/locations_seed.json into the `locations` table.

Locations are normally created on the fly by the location search/create-on-miss
flow (see app/api/v1/locations.py), so the table starts out empty. That means a
fresh/dev database has no rows at all -- searching for "Secunderabad" or
"Nampally" returns nothing not because the search query is wrong, but because
there's no data to match. This script seeds a small, curated set of state
capitals/major metros (all 36 Indian states/UTs) plus a handful of well-known
localities/twin-cities that aren't independent cities (Secunderabad, Nampally,
Gachibowli, Kukatpally, Madhapur, Salt Lake, New Town, Andheri, Bandra, Powai,
Koramangala, Indiranagar, Whitefield, Gomti Nagar) so search actually finds
them. It is intentionally NOT an exhaustive geo import.

Uses the exact same get-or-create shape as POST /locations
(app/api/v1/locations.py:80-128): normalize via normalize_location_name, dedupe
on (name_norm, state), skip rows that already exist. Safe to re-run.
"""
import asyncio
import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.location import Location, normalize_location_name
from app.constants import validate_state

SEED_FILE = Path(__file__).parent / "data" / "locations_seed.json"


def load_seed_data() -> list[dict]:
    with open(SEED_FILE, encoding="utf-8") as f:
        return json.load(f)


async def seed_locations(db: AsyncSession, entries: list[dict]) -> int:
    """Insert each entry using the same get-or-create shape as POST
    /locations (see app/api/v1/locations.py) -- skips anything that already
    exists on (name_norm, state), so this is safe to re-run and safe to run
    against a table that already has owner-created rows."""
    inserted = 0
    for entry in entries:
        name = " ".join(entry["name"].strip().split())
        state = validate_state(entry["state"])
        name_norm = normalize_location_name(name)

        stmt = select(Location).where(Location.name_norm == name_norm, Location.state == state)
        existing = (await db.execute(stmt)).scalars().first()
        if existing:
            continue

        db.add(Location(name=name, name_norm=name_norm, state=state, district=entry.get("district")))
        inserted += 1

    await db.commit()
    return inserted


async def main():
    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        count = await seed_locations(db, load_seed_data())
        print(f"Seeded {count} new locations.")


if __name__ == "__main__":
    asyncio.run(main())
