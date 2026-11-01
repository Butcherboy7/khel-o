"""Refund every deposit of one drop (game delayed, café cancelled).

DRY RUN by default: lists what would be refunded and changes nothing.

    DROP_SLUG=gta-6-launch-drop-adamsden REASON="GTA 6 release moved" python scripts/refund_drop.py
    DROP_SLUG=... REASON="..." APPLY=1 python scripts/refund_drop.py            # refund for real
    DROP_SLUG=... REASON="..." APPLY=1 CANCEL=1 python scripts/refund_drop.py   # and close the drop

On a server: bash scripts/ops/dev_python.sh backend/scripts/refund_drop.py DROP_SLUG=... REASON=... [APPLY=1]

Safe to run again: already-refunded reservations are skipped. A failed refund is
printed and marked "REFUND FAILED" on the reservation for a manual retry.
"""
import asyncio
import os
import sys

from sqlalchemy import select


async def main() -> None:
    from app.database import AsyncSessionLocal
    from app.models.drop import Drop, DropReservation
    from app.services import drop_service as svc

    slug = os.environ.get("DROP_SLUG") or sys.exit("Set DROP_SLUG.")
    reason = os.environ.get("REASON") or sys.exit("Set REASON (shown to the customer's bank as the refund note).")
    apply = os.environ.get("APPLY") == "1"
    async with AsyncSessionLocal() as db:
        drop = (await db.execute(select(Drop).where(Drop.slug == slug))).scalars().first()
        if drop is None:
            sys.exit(f"No drop called {slug!r}.")
        rows = (await db.execute(
            select(DropReservation).where(DropReservation.drop_id == drop.id).order_by(DropReservation.created_at)
        )).scalars().all()
        print(f"{drop.title} ({slug}): {len(rows)} reservations, mode={'APPLY' if apply else 'DRY RUN'}")
        totals: dict[str, float] = {}
        for r in rows:
            outcome = await svc.refund(db, r, reason, dry_run=not apply)
            if outcome in ("would_refund", "refunded", "failed"):
                totals[outcome] = totals.get(outcome, 0) + float(r.deposit_amount)
            print(f"  {r.reference}  {r.status:<15} Rs {float(r.deposit_amount):>8.2f}  -> {outcome}")
        if apply and os.environ.get("CANCEL") == "1":
            drop.status, drop.cancelled_at, drop.cancel_reason = "cancelled", svc.now_utc(), reason
            await db.commit()
            print("drop closed (status=cancelled)")
        print("totals:", {k: round(v, 2) for k, v in totals.items()} or "nothing to refund")


if __name__ == "__main__":
    asyncio.run(main())
