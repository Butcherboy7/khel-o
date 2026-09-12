"""Remove the invented hardware tiers from the six lead cafés.

bootstrap_lead_cafe_tiers.py gave each café seeded by seed_lead_cafes.py a
placeholder PC tier: 10 seats at Rs 80/hr. Those numbers were never agreed to
by the venues -- they exist only because that script assumed a café without a
tier would be invisible in customer search. It is not (see
tests/test_lead_listings.py::test_zero_tier_cafe_is_listed), so the tiers buy
nothing and advertise a price on behalf of a real business.

A café with no confirmed hardware should carry zero tiers and show
"Hardware coming soon" instead.

Refuses to delete any tier that has bookings against it and reports it rather
than cascading.

Usage:
  python -m scripts.remove_fabricated_tiers            # dry run, changes nothing
  python -m scripts.remove_fabricated_tiers --apply    # actually delete
"""
import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select, func

from app.database import AsyncSessionLocal
from app.models.booking import Booking
from app.models.cafe import Cafe
from app.models.hardware_tier import HardwareTier

# The exact values bootstrap_lead_cafe_tiers.py wrote. Matching on them rather
# than deleting every tier on these cafés means a tier someone has since
# corrected to real specs is left alone.
FABRICATED_PRICE = 80.00
FABRICATED_SEATS = 10


async def run(apply: bool) -> None:
    removed, kept, blocked = 0, 0, 0

    async with AsyncSessionLocal() as session:
        cafes = (await session.execute(
            select(Cafe).where(Cafe.email.like("%@khel-o.com"))
        )).scalars().all()

        if not cafes:
            print("No @khel-o.com cafés found -- nothing to do.")
            return

        print(f"Inspecting {len(cafes)} lead café(s).\n")

        for cafe in cafes:
            tiers = (await session.execute(
                select(HardwareTier).where(HardwareTier.cafe_id == cafe.id)
            )).scalars().all()

            for tier in tiers:
                is_fabricated = (
                    float(tier.price_per_hour) == FABRICATED_PRICE
                    and tier.total_seats == FABRICATED_SEATS
                )
                if not is_fabricated:
                    kept += 1
                    print(f"  KEEP    {cafe.name}: '{tier.name}' "
                          f"({tier.total_seats} seats @ {tier.price_per_hour}) -- not the placeholder")
                    continue

                booking_count = (await session.execute(
                    select(func.count(Booking.id)).where(Booking.hardware_tier_id == tier.id)
                )).scalar() or 0

                if booking_count > 0:
                    blocked += 1
                    print(f"  BLOCKED {cafe.name}: '{tier.name}' has {booking_count} booking(s). "
                          f"Someone booked this price -- resolve by hand, not by cascade.")
                    continue

                removed += 1
                print(f"  REMOVE  {cafe.name}: '{tier.name}' "
                      f"({tier.total_seats} seats @ {tier.price_per_hour})")
                if apply:
                    await session.delete(tier)

            # bookable_stations was initialised from the invented seat count.
            if apply and cafe.bookable_stations:
                cafe.bookable_stations = 0
                cafe.app_bookable_seats = 0

        if apply:
            await session.commit()

    print(f"\n{removed} removed, {kept} kept, {blocked} blocked.")
    if not apply:
        print("Dry run -- nothing was changed. Re-run with --apply to commit.")


if __name__ == "__main__":
    asyncio.run(run(apply="--apply" in sys.argv))
