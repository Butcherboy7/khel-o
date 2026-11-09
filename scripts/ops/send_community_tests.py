"""Send the three community emails as tests to a few inboxes, through the real send path.

Run on prod with:  bash scripts/ops/prod_python.sh scripts/ops/send_community_tests.py
Both tests use the owner's own account id, so the unsubscribe link in a test can only ever
affect that one account, never a customer. Marks each campaign as tested.
"""
import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.community import CommunityEmailCampaign
from app.models.user import User
from app.services import community_mailer as m

OWNER = "uzair042005@gmail.com"
TO = [(OWNER, "Uzair"), ("ashwithreddy406@gmail.com", "ashwith")]


async def main() -> None:
    async with AsyncSessionLocal() as db:
        u = (await db.execute(select(User).where(User.email == OWNER))).scalars().first()
        opts = await m.active_poll_options(db)
        for v in "abc":
            for email, name in TO:
                print(v, email, await m.send_one(m.Target(email, name, u.id), v, opts), flush=True)
            c = (await db.execute(select(CommunityEmailCampaign).where(CommunityEmailCampaign.variant == v))).scalar_one()
            c.tested_at = datetime.now(timezone.utc)
            await db.commit()


asyncio.run(main())
