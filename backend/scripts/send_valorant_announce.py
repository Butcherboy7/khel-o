"""Announce the Valorant 5v5 challenge to every account (bell + one plain email each).

Run on prod:  prod_python.sh send_valorant_announce.py MODE=dry|test|send [CONFIRM=<emails>]
  dry  : count only (default)
  test : one test email to the admin named Uzair, nothing else
  send : bell + email to everyone; refused unless CONFIRM equals the email count shown by a dry run
Safe to re-run: nobody is announced to twice.
"""
import asyncio
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.api.deps import get_user_roles
from app.database import AsyncSessionLocal
from app.models.marketing_campaign import MarketingCampaign
from app.models.user import User
from app.services import valorant_announce as va


async def ensure_campaign(db) -> None:
    if (await db.execute(select(MarketingCampaign).where(MarketingCampaign.slug == "valorant-email"))).scalar_one_or_none():
        return
    today = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()
    db.add(MarketingCampaign(slug="valorant-email", name="Valorant 5v5 · announcement email", channel="other", paid=False,
                             landing_path="/challenge/valorant-5v5-xqz", utm_source="email", utm_medium="announce",
                             status="live", started_on=today))
    await db.commit()


async def main() -> None:
    mode = os.environ.get("MODE", "dry")
    async with AsyncSessionLocal() as db:
        aud = await va.audience(db)
        print(f"audience: bell {len(aud['bell'])}, email {len(aud['mail'])}")
        if mode == "dry":
            return
        await ensure_campaign(db)
        if mode == "test":
            admins = [u for u in (await db.execute(select(User).where(User.full_name.ilike("Uzair%")))).scalars().all()
                      if "admin" in await get_user_roles(u.id, db)]
            print("test:", await va.send_test(db, admins[0]) if admins else "no admin found")
            return
        if mode == "send":
            if os.environ.get("CONFIRM") != str(len(aud["mail"])):
                print("REFUSED: CONFIRM must equal the email count above")
                return
            print("sent:", await va.send_all(db))


asyncio.run(main())
