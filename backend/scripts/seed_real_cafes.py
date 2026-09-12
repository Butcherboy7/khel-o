"""Seed the researched real cafes as lead listings.

Task 15 of docs/superpowers/plans/2026-09-10-explore-real-cafes.md.

Each cafe becomes a Cafe row flagged is_lead_listing=True -- visible in Explore
with a "Booking soon" badge, never bookable -- plus one CAFE_OWNER account whose
credentials are handed to the venue when it agrees to list.

Two rules this script exists to enforce:

1. Nothing unconfirmed is written. Unknown hours stay NULL rather than becoming
   a plausible 10:00-22:00; a cafe with no published price gets zero tiers and
   renders "Hardware coming soon". The predecessor script, bootstrap_lead_cafe_
   tiers.py, invented a 10-seat Rs 80/hr tier for six real businesses on the
   false premise that a tier-less cafe is invisible in search. It is not.

2. Generated passwords never touch stdout or git. seed_lead_cafes.py prints
   them, which puts credentials for real businesses into terminal scrollback and
   any captured log. Here they go to scripts/out/, which is gitignored, with
   a single summary line on stdout.

Cafes whose identity is in doubt are excluded outright -- see BLOCKING_CONFLICTS
in scripts/data/real_cafes.py. Listing a venue at an address its own website
contradicts is a claim about a real business we cannot stand behind.

Usage:
  python -m scripts.seed_real_cafes            # dry run, writes nothing
  python -m scripts.seed_real_cafes --apply    # create accounts + listings
"""
import asyncio
import secrets
import string
import sys
import uuid
from datetime import datetime, time, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select

from app.core.security import get_password_hash
from app.database import AsyncSessionLocal
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier, PlatformType
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from scripts.data.real_cafes import (
    ALL_CAFES,
    BLOCKING_CONFLICTS,
    CATEGORY_REVIEW,
    PLACEHOLDER_PHONE,
)

# Credentials land here. Gitignored at .gitignore:44 -- verify that rule still
# exists before running with --apply.
OUT_DIR = BACKEND_DIR / "scripts" / "out"


def excluded_slugs() -> set[str]:
    """Cafes that must not be published.

    Both halves of a duplicate pair are dropped, not just one: if two folders
    share an address we do not know which business is at the premises, and
    guessing publishes a false location for whichever one we got wrong.
    """
    blocked = {slug for c in BLOCKING_CONFLICTS for slug in c["slugs"]}
    return blocked | set(CATEGORY_REVIEW)


def seedable_cafes() -> List[Dict[str, Any]]:
    excluded = excluded_slugs()
    return [c for c in ALL_CAFES if c["slug"] not in excluded]


def parse_time(raw: Optional[str]) -> Optional[time]:
    """'09:00' -> time(9, 0). None stays None -- never a default day."""
    if raw is None:
        return None
    hour, minute = (int(part) for part in raw.split(":"))
    return time(hour, minute)


def platform_for(tier_name: str) -> PlatformType:
    """Map a published tier name onto the platform enum.

    Racing sims and VR have no enum member, so they land on OTHER rather than
    being forced into PC -- a sim seat is not a PC seat for availability.
    """
    name = tier_name.lower()
    if "playstation" in name or "ps5" in name:
        return PlatformType.PLAYSTATION
    if "nintendo" in name or "switch" in name:
        return PlatformType.NINTENDO
    if "xbox" in name:
        return PlatformType.XBOX
    if name.startswith("pc") or "pc " in name:
        return PlatformType.PC
    return PlatformType.OTHER


def tier_rows_for(cafe: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Build HardwareTier kwargs from confirmed tiers only.

    app_bookable_seats is always 0: the price and capacity may be public, but
    the venue has not agreed to take bookings through KHEL-O. total_seats falls
    back to 0 when the capacity was never published -- 0 is "we don't know",
    not a guess at the room size.
    """
    rows = []
    for tier in cafe["tiers"]:
        rows.append({
            "name": tier["name"],
            "price_per_hour": tier["price_per_hour"],
            "total_seats": tier["total_seats"] or 0,
            "app_bookable_seats": 0,
            "platform": platform_for(tier["name"]),
            "description": f"Published rate, see {tier['source']}",
        })
    return rows


def generate_password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "Khelo@" + "".join(secrets.choice(alphabet) for _ in range(10))


def _write_credentials(rows: List[Dict[str, str]]) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = OUT_DIR / f"real_cafe_credentials_{stamp}.csv"
    lines = [
        "# KHEL-O cafe-owner credentials -- PLAINTEXT PASSWORDS.",
        "# Hand each row to its venue over a channel they control, then delete this file.",
        "# Never commit, paste into chat or a doc, or attach to a ticket.",
        "slug,name,email,password,cafe_id,phone_confirmed",
    ]
    for row in rows:
        lines.append(
            f"{row['slug']},\"{row['name']}\",{row['email']},{row['password']},"
            f"{row['cafe_id']},{row['phone_confirmed']}"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


async def seed(apply: bool) -> None:
    cafes = seedable_cafes()
    excluded = excluded_slugs()

    print(f"{len(ALL_CAFES)} researched cafes, {len(excluded)} excluded, "
          f"{len(cafes)} to seed.\n")
    for slug in sorted(excluded):
        print(f"  EXCLUDE {slug}")
    print()

    created: List[Dict[str, str]] = []
    skipped = 0

    async with AsyncSessionLocal() as session:
        for cafe_data in cafes:
            email = f"{cafe_data['slug']}@khel-o.com"

            existing = await session.execute(select(User).where(User.email == email))
            if existing.scalar_one_or_none():
                print(f"  SKIP    {cafe_data['slug']} -- account already exists")
                skipped += 1
                continue

            tier_rows = tier_rows_for(cafe_data)
            hours = "hours" if cafe_data["opening_time"] else "no hours"
            phone = "phone" if cafe_data["phone_confirmed"] else "no phone"
            print(f"  CREATE  {cafe_data['slug']:<32} "
                  f"{len(tier_rows)} tier(s), {hours}, {phone}")

            if not apply:
                continue

            password = generate_password()
            owner = User(
                id=uuid.uuid4(),
                email=email,
                phone_number=cafe_data["phone_number"],
                password_hash=get_password_hash(password),
                full_name=cafe_data["name"],
                role=UserRole.CAFE_OWNER,
                is_active=True,
            )
            session.add(owner)
            session.add(UserRoleMapping(
                id=uuid.uuid4(), user_id=owner.id,
                role=UserRole.CAFE_OWNER, cafe_id=None,
            ))
            await session.flush()

            cafe = Cafe(
                id=uuid.uuid4(),
                owner_id=owner.id,
                name=cafe_data["name"],
                address_line1=cafe_data["address_line1"],
                address_line2=cafe_data["address_line2"],
                city=cafe_data["city"],
                state=cafe_data["state"],
                pincode=cafe_data["pincode"],
                phone_number=cafe_data["phone_number"],
                email=email,
                opening_time=parse_time(cafe_data["opening_time"]),
                closing_time=parse_time(cafe_data["closing_time"]),
                verification_status=VerificationStatus.VERIFIED,
                is_active=True,
                # The flag that makes this listed-but-not-bookable. Deliberately
                # not bookings_paused: the customer search query hard-filters
                # that to False, which would hide every one of these cafes.
                is_lead_listing=True,
                bookable_stations=0,
                app_bookable_seats=0,
                amenities=[],
                photos=[],
                supported_games=[],
                menu_photos=[],
                house_rules=[],
                social_links={},
            )
            session.add(cafe)
            await session.flush()

            for row in tier_rows:
                session.add(HardwareTier(id=uuid.uuid4(), cafe_id=cafe.id, **row))

            created.append({
                "slug": cafe_data["slug"],
                "name": cafe_data["name"],
                "email": email,
                "password": password,
                "cafe_id": str(cafe.id),
                "phone_confirmed": str(cafe_data["phone_confirmed"]).lower(),
            })

        if apply:
            await session.commit()

    print()
    if not apply:
        print("Dry run -- nothing was written. Re-run with --apply to create.")
        return

    print(f"{len(created)} created, {skipped} skipped.")
    if created:
        path = _write_credentials(created)
        # The path, never the credentials.
        print(f"Credentials written to {path}")
        print("Hand them over, then delete the file. Passwords are not recoverable "
              "from the DB -- use scripts/reset_lead_cafe_passwords.py if lost.")
        unconfirmed = [c["slug"] for c in created if c["phone_confirmed"] == "false"]
        if unconfirmed:
            print(f"\n{len(unconfirmed)} of {len(created)} have a placeholder phone "
                  f"({PLACEHOLDER_PHONE}); confirm before any outreach:")
            for slug in unconfirmed:
                print(f"  {slug}")


if __name__ == "__main__":
    asyncio.run(seed(apply="--apply" in sys.argv))
