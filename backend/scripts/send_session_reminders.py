"""Session reminders: email + in-app note about 30 minutes before each booking.

Run every 5 minutes by host cron on the production box (deploy/cron/khelo-reminders):

    docker exec -e PYTHONPATH=/app khel_o_backend python scripts/send_session_reminders.py

Refuses to send outside production: the dev database is a copy of prod with
real customers, so a reminder sent from dev would reach real people. Use
--dry-run there to see how many players would be reminded right now.
"""
import argparse
import asyncio
from datetime import datetime, timezone

from app.background.notification_tasks import send_session_reminders
from app.config import settings
from app.database import AsyncSessionLocal


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="count who would be reminded; send nothing")
    args = parser.parse_args()

    if settings.ENVIRONMENT != "production" and not args.dry_run:
        print(f"refusing to send reminders in {settings.ENVIRONMENT!r}; use --dry-run", flush=True)
        return

    async with AsyncSessionLocal() as db:
        count = await send_session_reminders(db, dry_run=args.dry_run)
    if count or args.dry_run:
        print(f"{datetime.now(timezone.utc).isoformat()} reminders {'would send' if args.dry_run else 'sent'}: {count}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
