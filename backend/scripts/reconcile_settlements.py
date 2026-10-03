"""Daily settlement reconciliation: backstop for a missed `settlement.processed` webhook.

Asks Razorpay's recon API which payments were settled yesterday and today (UTC)
and marks the matching platform fees settled. Safe to run repeatedly.

    docker exec -e PYTHONPATH=/app khel_o_backend python scripts/reconcile_settlements.py
"""
import asyncio
from datetime import datetime, timedelta, timezone

from app.database import AsyncSessionLocal
from app.services.settlement_service import SettlementService


async def main() -> None:
    today = datetime.now(timezone.utc).date()
    async with AsyncSessionLocal() as db:
        for day in (today - timedelta(days=1), today):
            result = await SettlementService(db).reconcile_date(day)
            print(f"{datetime.now(timezone.utc).isoformat()} reconcile {result}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
