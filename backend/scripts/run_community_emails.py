"""Send the scheduled community emails that are due.

Run every 5 minutes by host cron on the production box (deploy/cron/khelo-community-emails):

    docker exec -e PYTHONPATH=/app khel_o_backend python scripts/run_community_emails.py

Refuses to send outside production (the dev database holds real customers).
Use --dry-run anywhere to see what is due and how many people it would reach.
"""
import argparse
import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.community import CommunityEmailCampaign
from app.services import community_mailer as mailer


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    async with AsyncSessionLocal() as db:
        if args.dry_run:
            for c in (await db.execute(select(CommunityEmailCampaign).order_by(CommunityEmailCampaign.scheduled_for))).scalars():
                n = len(await mailer.audience(db, c.variant))
                print(f"{c.variant} {c.status:9} at {c.scheduled_for} tested={c.tested_at is not None} would reach {n}", flush=True)
            return
        if settings.ENVIRONMENT != "production":
            print(f"refusing to send in {settings.ENVIRONMENT!r}; use --dry-run", flush=True)
            return
        done = await mailer.run_due(db)
    if done:
        print(f"{datetime.now(timezone.utc).isoformat()} {done}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
