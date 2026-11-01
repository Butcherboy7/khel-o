"""DEV ONLY: give every @example.com account a fresh password (so the old demo
password, which was in git, stops working) and make sure the QA logins exist.

    CONFIRM=anonymize-dev QA_PASSWORD=... python scripts/dev_qa_accounts.py

On the server: bash scripts/ops/dev_python.sh backend/scripts/dev_qa_accounts.py CONFIRM=anonymize-dev QA_PASSWORD=...

Accounts made or reset:
  qa-admin@example.com            admin
  qa-gamer@example.com            player
  qa-gamer2@example.com           player
  qa-adamsden-owner@example.com   the owner of AdamsDen (the café's real owner
                                  account, already anonymized, gets this login)
Same prod guards as anonymize_dev_db.py.
"""
from __future__ import annotations

import asyncio
import importlib.util
import os
import sys
import uuid
from pathlib import Path

from sqlalchemy import select, text

QA = [
    ("qa-admin@example.com", "QA Admin", "admin"),
    ("qa-gamer@example.com", "QA Player", "gamer"),
    ("qa-gamer2@example.com", "QA Player Two", "gamer"),
]
OWNER_EMAIL = "qa-adamsden-owner@example.com"


def _guard_module():
    path = Path(__file__).resolve().parent / "anonymize_dev_db.py"
    if not path.exists():  # dev_python.sh copies this file alone; fall back to the app copy
        path = Path("/app/scripts/anonymize_dev_db.py")
    spec = importlib.util.spec_from_file_location("anonymize_dev_db", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


async def main() -> None:
    from app.config import settings
    from app.core.security import get_password_hash
    from app.database import AsyncSessionLocal
    from app.models.cafe import Cafe
    from app.models.user import User, UserRole
    from app.models.user_role import UserRoleMapping

    guard = _guard_module()
    guard.guard_settings(settings.ENVIRONMENT, settings.DATABASE_URL, settings.FRONTEND_URL)
    password = os.environ.get("QA_PASSWORD") or sys.exit("Set QA_PASSWORD.")
    hashed = get_password_hash(password)

    async with AsyncSessionLocal() as db:
        live = (await db.execute(text("SELECT current_database()"))).scalar_one()
        if "dev" not in live.lower():
            guard.refuse(f"connected database is {live!r}")
        reset = await db.execute(
            text("UPDATE users SET password_hash = :h, sessions_valid_from = now() WHERE email ILIKE '%@example.com'"),
            {"h": hashed},
        )
        print(f"reset passwords on {reset.rowcount} @example.com accounts")

        for email, name, role in QA:
            user = (await db.execute(select(User).where(User.email == email))).scalars().first()
            if user is None:
                user = User(id=uuid.uuid4(), email=email, full_name=name, role=UserRole(role),
                            password_hash=hashed, is_active=True)
                db.add(user)
                await db.flush()
                db.add(UserRoleMapping(id=uuid.uuid4(), user_id=user.id, role=UserRole.GAMER))
                if role != "gamer":
                    db.add(UserRoleMapping(id=uuid.uuid4(), user_id=user.id, role=UserRole(role)))
                print(f"made {email}")
            else:
                user.password_hash, user.is_active = hashed, True

        cafe = (await db.execute(select(Cafe).where(Cafe.name.ilike("adamsden%")))).scalars().first()
        if cafe is None:
            # This dev copy predates AdamsDen. Make a stand-in (placeholder
            # address, nothing copied from prod) so the GTA 6 drop has a café.
            from app.models.cafe import VerificationStatus
            owner = (await db.execute(select(User).where(User.email == OWNER_EMAIL))).scalars().first()
            if owner is None:
                owner = User(id=uuid.uuid4(), email=OWNER_EMAIL, full_name="QA AdamsDen Owner",
                             role=UserRole.CAFE_OWNER, password_hash=hashed, is_active=True)
                db.add(owner)
                await db.flush()
                for r in (UserRole.GAMER, UserRole.CAFE_OWNER):
                    db.add(UserRoleMapping(id=uuid.uuid4(), user_id=owner.id, role=r))
            owner.password_hash, owner.is_active = hashed, True
            cafe = Cafe(owner_id=owner.id, name="AdamsDen", slug="adamsden-hyderabad",
                        address_line1="Dev placeholder address", city="Hyderabad", state="Telangana",
                        pincode="500001", phone_number="0000000000",
                        verification_status=VerificationStatus.VERIFIED, is_active=True)
            db.add(cafe)
            await db.flush()
            print(f"made dev stand-in AdamsDen ({cafe.id}) owner login: {OWNER_EMAIL}")
        else:
            other = (await db.execute(select(User).where(User.email == OWNER_EMAIL))).scalars().first()
            owner = await db.get(User, cafe.owner_id)
            if other is not None and other.id != owner.id:
                other.email = f"old-{other.id.hex[:8]}@example.com"
                await db.flush()
            owner.email, owner.password_hash, owner.is_active = OWNER_EMAIL, hashed, True
            print(f"AdamsDen ({cafe.id}) owner login: {OWNER_EMAIL}")
        await db.commit()
    print("done")


if __name__ == "__main__":
    asyncio.run(main())
