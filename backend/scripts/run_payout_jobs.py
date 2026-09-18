"""Unattended settlement reconciliation + weekly café payout allocation.

Run inside the backend container, invoked by host cron — never over HTTP, so
there is no new public endpoint/auth surface to secure for the scheduled
path. This calls the exact same service/repository code the admin-triggered
HTTP endpoints use (SettlementService.reconcile_date,
CafePayoutRepository.run_weekly_allocation) — same idempotency guarantees,
same duplicate-allocation protection (CafePayoutItem.platform_fee_id unique
constraint), just a different caller.

Usage (from backend/):
    python -m scripts.run_payout_jobs --reconcile        # daily fallback recon
    python -m scripts.run_payout_jobs --weekly           # force-run allocation regardless of day
    python -m scripts.run_payout_jobs --reconcile --weekly-if-due

--weekly-if-due only actually allocates when today matches
settings.WEEKLY_PAYOUT_WEEKDAY — this is what cron calls daily, so the payout
day is governed by that one config value (not duplicated into the crontab).
Intended crontab: this script runs once a day; --weekly-if-due decides for
itself whether it's also payout day.
"""
import argparse
import asyncio
import logging
import sys
from datetime import datetime, timezone

sys.path.insert(0, ".")

from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.user import User, UserRole

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("payout_jobs")


async def _run_reconcile() -> None:
    from app.services.settlement_service import SettlementService

    target_date = datetime.now(timezone.utc).date()
    async with AsyncSessionLocal() as db:
        result = await SettlementService(db).reconcile_date(target_date)
    if "error" in result:
        logger.error("Settlement reconciliation FAILED: %s", result)
    else:
        logger.info(
            "Settlement reconciliation OK: date=%s matched=%d unmatched=%d",
            result["date"], result["matched"], result["unmatched"],
        )


async def _run_weekly(force: bool) -> None:
    if not force and datetime.now(timezone.utc).weekday() != settings.WEEKLY_PAYOUT_WEEKDAY:
        logger.info(
            "Skipping weekly payout allocation — today is not the configured "
            "payout weekday (WEEKLY_PAYOUT_WEEKDAY=%d).", settings.WEEKLY_PAYOUT_WEEKDAY,
        )
        return

    from app.repositories.cafe_payout_repository import CafePayoutRepository

    async with AsyncSessionLocal() as db:
        # Attribute the batch to the earliest-created admin account so the
        # AdminAuditLog trail has a real user to point at; there's no
        # separate "system" identity in this schema. Refuse to run rather
        # than silently skip attribution if somehow no admin exists.
        admin = (await db.execute(
            select(User).where(User.role == UserRole.ADMIN).order_by(User.created_at.asc())
        )).scalars().first()
        if not admin:
            logger.error("Weekly payout allocation ABORTED: no admin user found to attribute the batch to.")
            return

        try:
            results = await CafePayoutRepository(db).run_weekly_allocation(admin_id=admin.id)
        except Exception:
            logger.error("Weekly payout allocation FAILED", exc_info=True)
            return

    created = [r for r in results if "payoutId" in r]
    skipped = [r for r in results if "skipped" in r]
    logger.info(
        "Weekly payout allocation OK: %d café(s) allocated, %d skipped. Allocated: %s Skipped: %s",
        len(created), len(skipped), created, skipped,
    )


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reconcile", action="store_true", help="Run daily settlement reconciliation for today.")
    parser.add_argument("--weekly", action="store_true", help="Force-run weekly payout allocation regardless of day.")
    parser.add_argument(
        "--weekly-if-due", action="store_true",
        help="Run weekly payout allocation only if today is the configured WEEKLY_PAYOUT_WEEKDAY.",
    )
    args = parser.parse_args()

    if not (args.reconcile or args.weekly or args.weekly_if_due):
        parser.error("Pass at least one of --reconcile, --weekly, --weekly-if-due")

    if args.reconcile:
        await _run_reconcile()
    if args.weekly:
        await _run_weekly(force=True)
    elif args.weekly_if_due:
        await _run_weekly(force=False)


if __name__ == "__main__":
    asyncio.run(main())
