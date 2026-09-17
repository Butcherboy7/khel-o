"""One-off fix: DG Gaming Cafe's owner was onboarded via onboard_dg_gaming_cafe.py
before that script granted a GAMER UserRoleMapping alongside CAFE_OWNER, so the
account couldn't switch into gamer mode. Adds the missing mapping, mirroring
submit_onboarding_application (owner.py)."""
import asyncio
import uuid

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping

EMAIL = "dggamingcafe@khel-o.com"


async def main():
    async with AsyncSessionLocal() as s:
        r = await s.execute(select(User).where(User.email == EMAIL))
        u = r.scalar_one_or_none()
        if not u:
            print("user not found")
            return

        existing = await s.execute(
            select(UserRoleMapping).where(
                UserRoleMapping.user_id == u.id,
                UserRoleMapping.role == UserRole.GAMER,
                UserRoleMapping.cafe_id.is_(None),
            )
        )
        if existing.scalars().first():
            print("GAMER mapping already exists, nothing to do")
            return

        s.add(UserRoleMapping(id=uuid.uuid4(), user_id=u.id, role=UserRole.GAMER, cafe_id=None))
        await s.commit()
        print("added GAMER role mapping for", u.id)


asyncio.run(main())
