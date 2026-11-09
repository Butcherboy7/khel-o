"""Send the six candidate versions of email C to a few inboxes so the owner can pick one.

Run on prod with:  bash scripts/ops/prod_python.sh scripts/ops/send_c_options.py
Uses the owner's own account id, so a test unsubscribe link can only ever affect that account.
Does not touch any campaign or mark anything tested.
"""
import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.user import User
from app.services import community_email_templates as tpl
from app.services import community_mailer as m

OWNER = "uzair042005@gmail.com"
TO = [(OWNER, "Uzair"), ("ashwithreddy406@gmail.com", "ashwith")]


async def main() -> None:
    async with AsyncSessionLocal() as db:
        u = (await db.execute(select(User).where(User.email == OWNER))).scalars().first()
        opts = await m.active_poll_options(db)
        for v in tpl.C_CHOICES:
            for email, name in TO:
                print(v, email, await m.send_one(m.Target(email, name, u.id), v, opts), flush=True)


asyncio.run(main())
