import base64
import logging
import urllib.request
import urllib.parse
import json
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.payment import Payment, PaymentStatus
from app.models.platform_fee import PlatformFee

logger = logging.getLogger(__name__)


class SettlementService:
    """Maps Razorpay settlements to individual PlatformFee rows.

    Razorpay's `settlement.processed` webhook carries only the settlement
    total (id, amount, utr) — no payment IDs. The actual payment-level
    mapping comes from the settlement recon API
    (GET /v1/settlements/recon/combined), which returns one row per
    payment/refund/transfer/adjustment with a `settled` flag and
    `settlement_id`. This service polls that API for a given date and
    updates PlatformFee.settlement_status accordingly.

    Idempotent by design: re-running for the same date just re-marks
    already-settled rows as settled again (a no-op) and only ever moves
    settlement_status pending_settlement -> settled, never backwards.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    def _recon_request(self, year: int, month: int, day: Optional[int] = None) -> dict:
        auth_str = f"{settings.RAZORPAY_KEY_ID}:{settings.RAZORPAY_KEY_SECRET}"
        encoded_auth = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")
        params = {"year": year, "month": month}
        if day:
            params["day"] = day
        url = "https://api.razorpay.com/v1/settlements/recon/combined?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Basic {encoded_auth}"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))

    async def reconcile_date(self, target_date: date) -> dict:
        """Fetch recon rows for target_date and mark matching PlatformFees settled.

        Returns a summary dict for logging/admin visibility. Never raises on
        a Razorpay API failure — logs and returns an error summary instead,
        since this always has a next scheduled retry (next webhook, or the
        daily fallback cron) and must not crash the request/job that called it.
        """
        try:
            recon = self._recon_request(target_date.year, target_date.month, target_date.day)
        except Exception:
            logger.error("Settlement recon fetch failed for %s", target_date, exc_info=True)
            return {"date": target_date.isoformat(), "error": "recon_fetch_failed", "matched": 0}

        items = recon.get("items", []) if isinstance(recon, dict) else []
        matched = 0
        unmatched_payment_ids = []

        for row in items:
            if row.get("type") != "payment" or not row.get("settled"):
                continue
            razorpay_payment_id = row.get("entity_id")
            settlement_id = row.get("settlement_id")
            settled_at_ts = row.get("settled_at")
            if not razorpay_payment_id or not settlement_id:
                continue

            payment = (await self.db.execute(
                select(Payment).where(
                    Payment.razorpay_payment_id == razorpay_payment_id,
                    Payment.status == PaymentStatus.CAPTURED,
                )
            )).scalars().first()
            if not payment:
                unmatched_payment_ids.append(razorpay_payment_id)
                continue

            fee = (await self.db.execute(
                select(PlatformFee).where(PlatformFee.booking_id == payment.booking_id)
            )).scalars().first()
            if not fee or fee.settlement_status == "settled":
                continue

            fee.settlement_status = "settled"
            fee.razorpay_settlement_id = settlement_id
            fee.settled_at = (
                datetime.fromtimestamp(settled_at_ts, tz=timezone.utc) if settled_at_ts else datetime.now(timezone.utc)
            )
            matched += 1

        await self.db.commit()

        if unmatched_payment_ids:
            logger.info(
                "Settlement recon for %s: %d payment(s) settled at Razorpay but not found "
                "locally (likely a payment we didn't originate): %s",
                target_date, len(unmatched_payment_ids), unmatched_payment_ids,
            )

        return {"date": target_date.isoformat(), "matched": matched, "unmatched": len(unmatched_payment_ids)}
