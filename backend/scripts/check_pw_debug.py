import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User
from app.core.security import verify_password


async def main():
    async with AsyncSessionLocal() as s:
        r = await s.execute(select(User).where(User.email == "dggamingcafe@khel-o.com"))
        u = r.scalar_one_or_none()
        print("found:", bool(u))
        if u:
            print("is_active:", u.is_active)
            print("hash_prefix:", u.password_hash[:15])
            print("hash_len:", len(u.password_hash))
            print("verify_result:", verify_password("Khelo@KYQuB7dW92", u.password_hash))


asyncio.run(main())
