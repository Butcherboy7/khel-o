import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User
from app.core.security import verify_password, get_password_hash

NEW_PASSWORD = "Khelo@DGreset99"


async def main():
    async with AsyncSessionLocal() as s:
        r = await s.execute(select(User).where(User.email == "dggamingcafe@khel-o.com"))
        u = r.scalar_one_or_none()
        print("found:", bool(u))
        if not u:
            return
        print("owner_id:", u.id)
        new_hash = get_password_hash(NEW_PASSWORD)
        u.password_hash = new_hash
        s.add(u)
        await s.commit()
        await s.refresh(u)
        print("post_commit_verify:", verify_password(NEW_PASSWORD, u.password_hash))

        r2 = await s.execute(select(User).where(User.email == "dggamingcafe@khel-o.com"))
        u2 = r2.scalar_one_or_none()
        print("reread_verify:", verify_password(NEW_PASSWORD, u2.password_hash))


asyncio.run(main())
