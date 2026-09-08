"""Launch-QA fixture seed (see docs/LAUNCH_QA_PLAN.md Phase 0.3).

Creates the data the QA sweep needs that the normal seeds do not provide:

  * Owner A + Owner B — TWO distinct owners. Cross-owner data isolation
    (test B-01) is untestable with the single seeded `owner@example.com`,
    which is why this exists.
  * Café A (Owner A), Café B (Owner B), Café C (Owner A) — the suspend/resume
    matrix needs three cafés under two owners so suspending B can be shown
    not to affect A or C.
  * Café STRESS (Owner A) — 100+ char name with emoji/symbols, for the owner
    portal layout tests (C-01 / B-11 / AG).
  * A second customer, for duplicate-review and booking-isolation tests.

Idempotent: re-running updates the existing rows rather than duplicating.

Run:  "C:/Program Files/Python313/python.exe" -m scripts.seed_qa_fixture
"""
import asyncio
from datetime import time
from uuid import uuid4

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier

PASSWORD = "testpass123"

# A real Google Maps share URL shape, for the F-01 external-link tests.
MAPS_URL = "https://maps.app.goo.gl/QaTeStFixTure123"

STRESS_NAME = (
    "Ultra Mega Super Long Café Name For Layout Stress Testing 🎮🕹️👾 "
    "With Symbols & Ampersands — Em-Dash, \"Quotes\" (Parens) #Hash 100%"
)


async def _upsert_user(db, email: str, full_name: str, role: UserRole) -> User:
    existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing:
        existing.full_name = full_name
        existing.password_hash = get_password_hash(PASSWORD)
        existing.role = role
        existing.is_active = True
        user = existing
    else:
        user = User(
            id=uuid4(), email=email, full_name=full_name,
            password_hash=get_password_hash(PASSWORD), role=role, is_active=True,
        )
        db.add(user)
        await db.flush()

    # Every account carries the gamer mapping as well as its primary role, so
    # the RoleSwitcher has 2+ cyclable roles and Owner<->Gamer is exercisable
    # in both directions (hypothesis H-1 in the QA plan).
    wanted = {UserRole.GAMER, role}
    have = {
        m.role for m in (
            await db.execute(select(UserRoleMapping).where(UserRoleMapping.user_id == user.id))
        ).scalars().all()
    }
    for r in wanted - have:
        db.add(UserRoleMapping(id=uuid4(), user_id=user.id, role=r, cafe_id=None))

    return user


async def _upsert_cafe(db, owner: User, name: str, city: str, seats: int = 10) -> Cafe:
    existing = (await db.execute(select(Cafe).where(Cafe.name == name))).scalar_one_or_none()
    cafe = existing or Cafe(id=uuid4(), name=name)
    cafe.owner_id = owner.id
    cafe.name = name
    cafe.description = f"QA fixture café for {owner.email}"
    cafe.address_line1 = "1 QA Test Street"
    cafe.city = city
    cafe.state = "Karnataka"
    cafe.pincode = "560001"
    cafe.phone_number = "+919876543210"
    cafe.google_maps_url = MAPS_URL
    cafe.verification_status = VerificationStatus.VERIFIED
    cafe.is_active = True
    cafe.is_emergency_mode = False
    cafe.bookings_paused = False
    cafe.opening_time = time(9, 0)
    cafe.closing_time = time(23, 0)
    cafe.total_seats = seats
    cafe.app_bookable_seats = seats
    cafe.bookable_stations = seats
    cafe.amenities = ["WiFi", "AC", "Parking"]
    cafe.supported_games = ["Valorant", "CS2", "FIFA"]
    cafe.photos = []
    cafe.menu_photos = []
    if not existing:
        db.add(cafe)
    await db.flush()

    tier_name = "Standard"
    tier = (
        await db.execute(
            select(HardwareTier).where(
                HardwareTier.cafe_id == cafe.id, HardwareTier.name == tier_name
            )
        )
    ).scalar_one_or_none()
    if not tier:
        db.add(HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name=tier_name,
            specs={"gpu": "RTX 3060", "cpu": "i5-12400"},
            price_per_hour=100.0, total_seats=seats,
            app_bookable_seats=seats, active_seats_count=seats, is_active=True,
        ))
    return cafe


async def main():
    async with AsyncSessionLocal() as db:
        # NOTE: must be a real-looking domain. .test is an IANA-reserved TLD
        # (RFC 2606) that Pydantic's EmailStr correctly rejects at
        # POST /auth/login with "special-use or reserved name" — such a
        # user can be inserted directly via SQLAlchemy (as this script does)
        # but can never log in through the actual API/browser.
        owner_a = await _upsert_user(db, "qa.ownera@example.com", "QA Owner A", UserRole.CAFE_OWNER)
        owner_b = await _upsert_user(db, "qa.ownerb@example.com", "QA Owner B", UserRole.CAFE_OWNER)
        gamer2 = await _upsert_user(db, "qa.gamer2@example.com", "QA Gamer Two", UserRole.GAMER)
        await db.flush()

        cafe_a = await _upsert_cafe(db, owner_a, "QA Café A — Nexus Arena", "Bengaluru")
        cafe_b = await _upsert_cafe(db, owner_b, "QA Café B — Pixel Pit", "Bengaluru")
        cafe_c = await _upsert_cafe(db, owner_a, "QA Café C — Frag Factory", "Mumbai")
        cafe_s = await _upsert_cafe(db, owner_a, STRESS_NAME, "Bengaluru")

        await db.commit()

        print("Seeded QA fixture (password for all: %s)" % PASSWORD)
        for u in (owner_a, owner_b, gamer2):
            print(f"  user  {u.email:24s} role={u.role.value}")
        for c in (cafe_a, cafe_b, cafe_c, cafe_s):
            # The stress café name is deliberately full of emoji/symbols; the
            # Windows console is cp1252 and raises UnicodeEncodeError on it.
            safe = c.name[:60].encode("ascii", "replace").decode("ascii")
            print(f"  cafe  {str(c.id)}  owner={c.owner_id}  {safe}")
        print("\nB-01 cross-owner isolation: Owner B (%s) must NOT reach Café A (%s)"
              % (owner_b.email, cafe_a.id))
        print("D-tests suspend target: Café B = %s" % cafe_b.id)


if __name__ == "__main__":
    asyncio.run(main())
