"""Team challenge emails: captain nudges (24h, 72h, and the last day before
sign-ups close), plus the evening-before and match-day-morning emails.

Run every 30 minutes by host cron (deploy/cron/khelo-team-challenge):

    docker exec -e PYTHONPATH=/app khel_o_backend python scripts/send_team_challenge_mail.py

Each email goes to each person once. Outside production the email layer only
reaches EMAIL_ALLOWLIST, so this is safe to run on dev. --dry-run counts only.
"""
import argparse
import asyncio
from datetime import datetime, timezone

from app.database import AsyncSessionLocal
from app.services import challenge_team_mail


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="count what would be sent; send nothing")
    args = parser.parse_args()
    async with AsyncSessionLocal() as db:
        out = await challenge_team_mail.run_all(db, dry_run=args.dry_run)
    if any(out.values()) or args.dry_run:
        print(f"{datetime.now(timezone.utc).isoformat()} team mail {'would send' if args.dry_run else 'sent'}: {out}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
