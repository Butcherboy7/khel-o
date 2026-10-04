"""Razorpay order creation and signature checks for payments that are not
bookings (tournament entries). Same calls and rules as PaymentService, which
keeps its own inline copy for bookings.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import urllib.request
from uuid import uuid4

from app.config import settings
from app.core.logging import logger


def create_order(amount_inr: float, receipt: str, notes: dict | None = None) -> str:
    """Razorpay order id for `amount_inr`. Without keys (local/tests) or when the
    API call fails, a local id is returned, as the booking flow does."""
    if settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET:
        try:
            auth = base64.b64encode(f"{settings.RAZORPAY_KEY_ID}:{settings.RAZORPAY_KEY_SECRET}".encode()).decode()
            body = json.dumps({
                "amount": int(round(float(amount_inr) * 100)),
                "currency": "INR",
                "receipt": receipt[:40],
                "notes": notes or {},
            }).encode()
            req = urllib.request.Request(
                "https://api.razorpay.com/v1/orders", data=body, method="POST",
                headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                order_id = json.loads(resp.read().decode()).get("id")
                if order_id:
                    return order_id
        except Exception as e:  # pragma: no cover - network
            logger.warning("razorpay_order_create_failed", error=str(e), receipt=receipt)
    return f"order_{receipt}_{uuid4().hex[:6]}"


def signature_ok(order_id: str, payment_id: str, signature: str) -> bool:
    """Fail closed. The only bypass is the explicit sandbox flag, as for bookings."""
    if signature == "mock_signature_valid" and settings.ENABLE_SANDBOX_MOCK_PAYMENTS:
        return True
    if not settings.RAZORPAY_KEY_SECRET:
        return False
    expected = hmac.new(settings.RAZORPAY_KEY_SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def public_key() -> str | None:
    return settings.RAZORPAY_KEY_ID or None
