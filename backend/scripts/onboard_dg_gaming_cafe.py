"""One-off onboarding for DG Gaming Cafe (Kompally) -- KHEL-O's first real,
fully bookable café listing.

Unlike seed_real_cafes.py, every field here comes directly from the owner
(Tanmay Raj) via a completed onboarding questionnaire, not web research, so
this cafe is created VERIFIED, is_active, and bookable immediately -- not a
lead listing. Photos are pending and will be added by the owner after login.

Per the seed_real_cafes.py lesson: the generated password is never printed to
stdout. It goes to scripts/out/ (gitignored, see .gitignore:47), which the
caller must hand to the owner over a private channel and then delete.

Usage:
  python -m scripts.onboard_dg_gaming_cafe            # dry run
  python -m scripts.onboard_dg_gaming_cafe --apply    # create account + listing
"""
import asyncio
import secrets
import string
import sys
import uuid
from datetime import datetime, time, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select

from app.core.security import get_password_hash
from app.core.payout_encryption import encrypt_bank_account_number
from app.database import AsyncSessionLocal
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier, PlatformType
from app.models.owner_payout_account import OwnerPayoutAccount
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping

OUT_DIR = BACKEND_DIR / "scripts" / "out"

EMAIL = "dggamingcafe@khel-o.com"
OWNER_NAME = "Tanmay Raj"
PRIMARY_PHONE = "+916304536178"
SECONDARY_PHONE = "+917671907792"
CONTACT_EMAIL = "Tanmairajtinku@gmail.com"

CAFE_DESCRIPTION = (
    "4 gaming stations: 1x PS4, 2x PS5, 1x racing simulator. Console play is "
    "Rs 120/hr for 1 member or Rs 180/hr combined for 2; play 3 hours and get "
    "a 4th hour free. Hosts gaming tournaments. Biryani available with at "
    "least a day's pre-order. Secondary contact: " + SECONDARY_PHONE + "."
)

AMENITIES = [
    "Air Conditioning",
    "High-Speed Wi-Fi",
    "Snacks & Beverages",
    "Parking",
    "Ergonomic Chairs",
    "Tournament Area",
]


def generate_password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "Khelo@" + "".join(secrets.choice(alphabet) for _ in range(10))


def _write_credentials(row: dict) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = OUT_DIR / f"dg_gaming_cafe_credentials_{stamp}.csv"
    lines = [
        "# KHEL-O cafe-owner credentials -- PLAINTEXT PASSWORD.",
        "# Hand this to the venue over a channel they control, then delete this file.",
        "# Never commit, paste into chat or a doc, or attach to a ticket.",
        "slug,name,email,password,cafe_id",
        f"{row['slug']},\"{row['name']}\",{row['email']},{row['password']},{row['cafe_id']}",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


async def onboard(apply: bool) -> None:
    async with AsyncSessionLocal() as session:
        existing = await session.execute(select(User).where(User.email == EMAIL))
        if existing.scalar_one_or_none():
            print(f"SKIP -- account already exists for {EMAIL}")
            return

        print("CREATE  DG Gaming Cafe -- 3 hardware tier(s), verified, bookable")
        if not apply:
            print("\nDry run -- nothing was written. Re-run with --apply to create.")
            return

        password = generate_password()
        owner = User(
            id=uuid.uuid4(),
            email=EMAIL,
            phone_number=PRIMARY_PHONE,
            password_hash=get_password_hash(password),
            full_name=OWNER_NAME,
            role=UserRole.CAFE_OWNER,
            is_active=True,
        )
        session.add(owner)
        # Mirrors submit_onboarding_application (owner.py): every owner keeps a
        # GAMER mapping too, so they can still switch into gamer mode in the UI
        # instead of being stuck cafe-owner-only.
        session.add(UserRoleMapping(
            id=uuid.uuid4(), user_id=owner.id,
            role=UserRole.GAMER, cafe_id=None,
        ))
        session.add(UserRoleMapping(
            id=uuid.uuid4(), user_id=owner.id,
            role=UserRole.CAFE_OWNER, cafe_id=None,
        ))
        await session.flush()

        cafe = Cafe(
            id=uuid.uuid4(),
            owner_id=owner.id,
            name="DG Gaming Cafe",
            description=CAFE_DESCRIPTION,
            address_line1="DG Gaming Cafe, Kompally",
            address_line2=None,
            city="Hyderabad",
            state="Telangana",
            pincode="500100",
            google_maps_url="https://share.google/thKF4o6D04HisOTdY",
            phone_number=PRIMARY_PHONE,
            email=CONTACT_EMAIL,
            opening_time=time(10, 0),
            closing_time=time(23, 30),
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
            is_lead_listing=False,
            total_seats=4,
            app_bookable_seats=4,
            bookable_stations=4,
            amenities=AMENITIES,
            photos=[],
            supported_games={
                "titles": [
                    "FIFA", "Valorant", "GTA 5", "Mortal Kombat",
                    "Ghost of Tsushima", "Spider-Man: Miles Morales",
                    "Need for Speed",
                ]
            },
            menu_photos=[],
            house_rules=[],
            social_links={},
        )
        session.add(cafe)
        await session.flush()

        tiers = [
            {
                "name": "PlayStation 4",
                "platform": PlatformType.PLAYSTATION,
                "price_per_hour": 120,
                "total_seats": 1,
                "app_bookable_seats": 1,
                "description": "Rs 120/hr for 1 member, Rs 180/hr combined for 2. "
                                "3-hour play gets a 4th hour free.",
            },
            {
                "name": "PlayStation 5",
                "platform": PlatformType.PLAYSTATION,
                "price_per_hour": 120,
                "total_seats": 2,
                "app_bookable_seats": 2,
                "description": "Rs 120/hr for 1 member, Rs 180/hr combined for 2. "
                                "3-hour play gets a 4th hour free.",
            },
            {
                "name": "Racing Simulator",
                "tier_type": "activity",
                "activity_kind": "Racing Simulator",
                "price_per_hour": 150,
                "total_seats": 1,
                "app_bookable_seats": 1,
                "description": "Most-played title: Need for Speed.",
            },
        ]
        for t in tiers:
            session.add(HardwareTier(id=uuid.uuid4(), cafe_id=cafe.id, **t))

        bank_account_number = "1720120020000231"
        session.add(OwnerPayoutAccount(
            id=uuid.uuid4(),
            owner_id=owner.id,
            upi_vpa="8096713190-2@ybl",
            bank_account_number_encrypted=encrypt_bank_account_number(bank_account_number),
            bank_account_number_masked=f"••••{bank_account_number[-4:]}",
            bank_ifsc="UJVN0001720",
            bank_name="Ujjivan Small Finance Bank Limited",
            account_holder_name=OWNER_NAME,
            account_type="savings",
            payout_verification_status="unverified",
            submitted_at=datetime.now(timezone.utc),
        ))

        await session.commit()

        path = _write_credentials({
            "slug": "dg-gaming-cafe",
            "name": "DG Gaming Cafe",
            "email": EMAIL,
            "password": password,
            "cafe_id": str(cafe.id),
        })
        print(f"\nCreated. Credentials written to {path}")
        print("Hand them to the owner over a private channel, then delete the file. "
              "Passwords are not recoverable from the DB.")


if __name__ == "__main__":
    asyncio.run(onboard(apply="--apply" in sys.argv))
