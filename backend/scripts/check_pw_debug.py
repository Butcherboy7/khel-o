import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User
from app.core.security import verify_password, get_password_hash
import bcrypt


async def main():
    pw = "Khelo@KYQuB7dW92"
    print("literal_len:", len(pw))
    print("literal_repr:", repr(pw))

    fresh_hash = get_password_hash(pw)
    print("roundtrip_verify:", verify_password(pw, fresh_hash))
    print("bcrypt_direct:", bcrypt.checkpw(pw.encode("utf-8"), fresh_hash.encode("utf-8")))

    async with AsyncSessionLocal() as s:
        r = await s.execute(select(User).where(User.email == "dggamingcafe@khel-o.com"))
        u = r.scalar_one_or_none()
        print("found:", bool(u))
        if u:
            print("stored_hash_repr:", repr(u.password_hash))
            print("stored_hash_len:", len(u.password_hash))
            print("verify_against_stored:", verify_password(pw, u.password_hash))


asyncio.run(main())
