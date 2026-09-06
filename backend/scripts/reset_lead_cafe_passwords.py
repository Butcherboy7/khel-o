"""
Reset passwords for the CAFE_OWNER accounts created by seed_lead_cafes.py.

The original run of that script printed each password once to the console
and it was never captured, so the credentials are unrecoverable (only the
bcrypt hash is stored). This generates fresh unique passwords for the same
6 accounts and prints them once -- copy them out before closing the
terminal.

Usage:
  python -m scripts.reset_lead_cafe_passwords
"""

import asyncio
import secrets
import string
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User
from app.core.security import get_password_hash

EMAILS = [
    "wildgaming.kompally@khel-o.com",
    "gametheory.kompally@khel-o.com",
    "bounce.kompally@khel-o.com",
    "infinitegaming.alwal@khel-o.com",
    "argaming.bowenpally@khel-o.com",
    "ashgaming.bowenpally@khel-o.com",
]


def generate_password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "Khelo@" + "".join(secrets.choice(alphabet) for _ in range(8))


async def reset():
    results = []
    async with AsyncSessionLocal() as session:
        for email in EMAILS:
            user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if not user:
                print(f"Skipping {email} -- no such user.")
                continue

            password = generate_password()
            user.password_hash = get_password_hash(password)
            results.append({"email": email, "name": user.full_name, "password": password})

        await session.commit()

    print("\n=== Reset passwords (copy these now, they are not stored anywhere) ===")
    for r in results:
        print(f"{r['name']}: {r['email']} / {r['password']}")

    return results


if __name__ == "__main__":
    asyncio.run(reset())
