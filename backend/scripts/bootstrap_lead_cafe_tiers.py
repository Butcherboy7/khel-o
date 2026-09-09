"""
Give each lead café (seed_lead_cafes.py) a minimal real listing so it
actually shows up and is bookable in customer search:

- one default PC HardwareTier (placeholder specs/price -- owner or staff
  should edit these to the real setup before going live)
- total_seats / bookable_stations initialized the same way the real
  approval flow does (70% of seats), since these cafés were inserted
  directly as VERIFIED/active and skipped that step

Usage:
  python -m scripts.bootstrap_lead_cafe_tiers
"""

import asyncio
import sys
import uuid
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.cafe import Cafe
from app.models.hardware_tier import HardwareTier, PlatformType

EMAILS = [
    "wildgaming.kompally@khel-o.com",
    "gametheory.kompally@khel-o.com",
    "bounce.kompally@khel-o.com",
    "infinitegaming.alwal@khel-o.com",
    "argaming.bowenpally@khel-o.com",
    "ashgaming.bowenpally@khel-o.com",
]

DEFAULT_TOTAL_SEATS = 10
DEFAULT_PRICE_PER_HOUR = 80.00


async def bootstrap():
    results = []
    async with AsyncSessionLocal() as session:
        for email in EMAILS:
            cafe = (await session.execute(select(Cafe).where(Cafe.email == email))).scalar_one_or_none()
            if not cafe:
                print(f"Skipping {email} -- no such café.")
                continue

            existing_tiers = (await session.execute(
                select(HardwareTier).where(HardwareTier.cafe_id == cafe.id)
            )).scalars().all()
            if existing_tiers:
                print(f"Skipping {cafe.name} -- already has {len(existing_tiers)} tier(s).")
                continue

            bookable = max(1, round(DEFAULT_TOTAL_SEATS * 0.7))

            tier = HardwareTier(
                id=uuid.uuid4(),
                cafe_id=cafe.id,
                name="Standard PC",
                description="Placeholder tier -- update specs/price before listing goes live.",
                specs={"cpu": "TBD", "gpu": "TBD", "ram": "TBD"},
                total_seats=DEFAULT_TOTAL_SEATS,
                app_bookable_seats=bookable,
                reserved_walkin_seats=DEFAULT_TOTAL_SEATS - bookable,
                active_seats_count=bookable,
                platform=PlatformType.PC,
                preset_category="standard",
                price_per_hour=DEFAULT_PRICE_PER_HOUR,
                is_active=True,
            )
            session.add(tier)

            cafe.total_seats = DEFAULT_TOTAL_SEATS
            cafe.bookable_stations = bookable
            cafe.app_bookable_seats = bookable

            results.append({
                "name": cafe.name,
                "email": email,
                "total_seats": DEFAULT_TOTAL_SEATS,
                "bookable_stations": bookable,
                "price_per_hour": DEFAULT_PRICE_PER_HOUR,
            })

        await session.commit()

    print("\n=== Bootstrapped tiers ===")
    for r in results:
        print(
            f"{r['name']} ({r['email']}): 1 tier, "
            f"{r['bookable_stations']}/{r['total_seats']} bookable seats @ Rs.{r['price_per_hour']}/hr"
        )

    return results


if __name__ == "__main__":
    asyncio.run(bootstrap())
