"""
Create one CAFE_OWNER account + one Cafe row per outreach lead found in
Kompally/Bowenpally/Alwal (see docs/audit/2026-09-05 conversation notes).

These are real venues found via web search, not yet confirmed/onboarded --
each gets its own login (khel-o.com placeholder email + generated password)
so KHEL-O staff can populate/test the profile and hand credentials to the
owner once they agree to list.

Usage:
  python -m scripts.seed_lead_cafes
"""

import asyncio
import secrets
import string
import sys
import uuid
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.core.security import get_password_hash

PLACEHOLDER_PHONE = "0000000000"  # phone not confirmed yet -- update before contacting/going live

LEADS = [
    {
        "slug": "wildgaming.kompally",
        "name": "Wild Gaming Cafe",
        "address_line1": "2nd Floor, Vaishnavi Lamani Arcade, 209, Doolapally Rd, above Ratnadeep Supermarket, Devender Colony",
        "address_line2": "Kompally",
        "city": "Hyderabad",
        "state": "Telangana",
        "pincode": "500100",
        "phone_number": "09381923198",
        "phone_confirmed": True,
    },
    {
        "slug": "gametheory.kompally",
        "name": "Cafe Game Theory",
        "address_line1": "Plot 162/P, Jayabheri Park Rd, near Cine Planet",
        "address_line2": "Kompally",
        "city": "Hyderabad",
        "state": "Telangana",
        "pincode": "500100",
        "phone_number": "+917799420720",
        "phone_confirmed": True,
    },
    {
        "slug": "bounce.kompally",
        "name": "Bounce (Food-Games-Chill)",
        "address_line1": "2nd & 5th Floor, Ratna Arcade, above Croma",
        "address_line2": "Kompally",
        "city": "Hyderabad",
        "state": "Telangana",
        "pincode": "500100",
        "phone_number": "+919989405502",
        "phone_confirmed": True,
    },
    {
        "slug": "infinitegaming.alwal",
        "name": "Infinite Gaming Cafe",
        "address_line1": "3rd Floor, SV Enclave, H.No 1, 5-1118/19, HT Road",
        "address_line2": "Alwal",
        "city": "Hyderabad",
        "state": "Telangana",
        "pincode": "500010",
        "phone_number": "+919177042828",
        "phone_confirmed": True,
    },
    {
        "slug": "argaming.bowenpally",
        "name": "A R Gaming Zone",
        "address_line1": "H.No 751, Nagarjuna Colony, Goutham Nagar, near Hanuman Temple, Old Airport Rd",
        "address_line2": "Bowenpally",
        "city": "Hyderabad",
        "state": "Telangana",
        "pincode": "500011",
        "phone_number": PLACEHOLDER_PHONE,
        "phone_confirmed": False,
    },
    {
        "slug": "ashgaming.bowenpally",
        "name": "ASH Gaming Food Zone",
        "address_line1": "Sunair Basthi, Dhanalaxmi Colony, Brig Syed Rd, New Bowenpally",
        "address_line2": "Bowenpally",
        "city": "Hyderabad",
        "state": "Telangana",
        "pincode": "500011",
        "phone_number": PLACEHOLDER_PHONE,
        "phone_confirmed": False,
    },
]


def generate_password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "Khelo@" + "".join(secrets.choice(alphabet) for _ in range(8))


async def seed():
    created = []
    async with AsyncSessionLocal() as session:
        for lead in LEADS:
            email = f"{lead['slug']}@khel-o.com"
            password = generate_password()

            existing = await session.execute(select(User).where(User.email == email))
            if existing.scalar_one_or_none():
                print(f"Skipping {email} -- already exists.")
                continue

            owner = User(
                id=uuid.uuid4(),
                email=email,
                phone_number=lead["phone_number"],
                password_hash=get_password_hash(password),
                full_name=lead["name"],
                role=UserRole.CAFE_OWNER,
                is_active=True,
            )
            session.add(owner)
            session.add(UserRoleMapping(id=uuid.uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER, cafe_id=None))
            await session.flush()

            cafe = Cafe(
                id=uuid.uuid4(),
                owner_id=owner.id,
                name=lead["name"],
                address_line1=lead["address_line1"],
                address_line2=lead["address_line2"],
                city=lead["city"],
                state=lead["state"],
                pincode=lead["pincode"],
                phone_number=lead["phone_number"],
                email=email,
                verification_status=VerificationStatus.VERIFIED,
                is_active=True,
                amenities=[],
                photos=[],
                supported_games=[],
                menu_photos=[],
                house_rules=[],
                social_links={},
            )
            session.add(cafe)

            created.append({
                "name": lead["name"],
                "email": email,
                "password": password,
                "phone": lead["phone_number"],
                "phone_confirmed": lead["phone_confirmed"],
                "cafe_id": str(cafe.id),
            })

        await session.commit()

    print("\n=== Created accounts ===")
    for c in created:
        flag = "" if c["phone_confirmed"] else "  [PHONE NOT CONFIRMED -- placeholder, fix before outreach]"
        print(f"{c['name']}: {c['email']} / {c['password']}  (cafe_id={c['cafe_id']}){flag}")

    return created


if __name__ == "__main__":
    asyncio.run(seed())
