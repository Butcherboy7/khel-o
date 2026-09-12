"""Launch-day webhook idempotency invariants (O-01 / N-01 continued).

test_booking_release.py already proves the primary race: a late
verify_payment or a late webhook against a RELEASED_BY_OWNER booking refunds
rather than confirms. This file covers what happens on the *next* delivery.

Razorpay webhooks are at-least-once. `payment.captured` is retried on any
non-2xx or timeout, and fires independently of the client's own
verify_payment call for the same payment — so the same event genuinely
arrives more than once in normal operation.

The invariant: no repeat delivery may ever move a booking that is finished
(refunded, released, cancelled) back into CONFIRMED. Doing so would hand a
confirmed booking to a customer who has already been refunded, on a slot that
may since have been sold to somebody else.

⚠ SQLite cannot prove the concurrency half of this (see LAUNCH_QA_PLAN §1.6).
These are sequential-logic assertions: LOGIC-PASS / CONCURRENCY-UNVERIFIED.
"""
import hashlib
import hmac
import json
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.config import settings
from app.models.booking import BookingStatus
from app.models.payment import PaymentStatus
from tests.test_booking_release import (
    _install_fake_razorpay_refund,
    _make_pending_booking,
    _payment_service,
)


def _captured_webhook(order_id, razorpay_payment_id, secret=b"whsec_real"):
    body = json.dumps({
        "event": "payment.captured",
        "payload": {"payment": {"entity": {"order_id": order_id, "id": razorpay_payment_id}}},
    }).encode("utf-8")
    signature = hmac.new(secret, body, hashlib.sha256).hexdigest()
    return body, signature


def _configure_razorpay(monkeypatch):
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", "whsec_real")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "real-secret-key")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "rzp_test_real")


# ---------------------------------------------------------------- O-01

@pytest.mark.asyncio
async def test_duplicate_webhook_after_release_refund_does_not_resurrect_booking(
    db_session, monkeypatch
):
    """A retried payment.captured must not un-do a release refund.

    After the first late webhook the booking is CANCELLED and the payment
    REFUNDED — so the handler's `already_confirmed` guard (payment CAPTURED or
    booking CONFIRMED) no longer matches, and the RELEASED_BY_OWNER branch no
    longer matches either. Nothing may fall through to the confirmation block:
    the slot has already been released and may now belong to another customer.
    """
    _configure_razorpay(monkeypatch)
    call_log = []
    _install_fake_razorpay_refund(monkeypatch, call_log)

    owner, _other, _gamer, _cafe, _tier, booking, payment = await _make_pending_booking(
        db_session, minutes_ago=1
    )
    booking.status = BookingStatus.RELEASED_BY_OWNER
    booking.released_by = owner.id
    booking.released_at = datetime.now(timezone.utc)
    booking.release_reason = "Released by owner"
    await db_session.commit()

    service = _payment_service(db_session)
    body, signature = _captured_webhook(payment.razorpay_order_id, f"pay_{uuid4().hex}")

    first = await service.handle_webhook(raw_body_bytes=body, signature=signature)
    assert first["status"] == "released_refunded"

    # Razorpay redelivers the identical event.
    second = await service.handle_webhook(raw_body_bytes=body, signature=signature)

    await db_session.refresh(booking)
    await db_session.refresh(payment)

    assert booking.status != BookingStatus.CONFIRMED, (
        f"A duplicate webhook resurrected a released+refunded booking into "
        f"{booking.status}. The customer was refunded and the slot released — "
        f"confirming it here can produce two valid bookings for one slot. "
        f"(handler returned {second})"
    )
    assert payment.status == PaymentStatus.REFUNDED, (
        f"Duplicate webhook rewrote a REFUNDED payment to {payment.status}"
    )
    assert len(call_log) == 1, (
        f"Refund was issued {len(call_log)} times for one booking — a duplicate "
        "webhook must not trigger a second refund."
    )


@pytest.mark.asyncio
async def test_late_webhook_does_not_confirm_a_cancelled_booking(db_session, monkeypatch):
    """A payment that captures after the customer cancelled must not confirm.

    This is the everyday version of the same hazard: the customer cancels, and
    their payment settles a moment later. The booking is CANCELLED and the
    slot is back on sale, so confirming it would double-sell the slot.
    """
    _configure_razorpay(monkeypatch)
    call_log = []
    _install_fake_razorpay_refund(monkeypatch, call_log)

    _owner, _other, _gamer, _cafe, _tier, booking, payment = await _make_pending_booking(
        db_session, minutes_ago=1
    )
    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = datetime.now(timezone.utc)
    booking.cancellation_reason = "Customer cancelled before paying"
    await db_session.commit()

    service = _payment_service(db_session)
    body, signature = _captured_webhook(payment.razorpay_order_id, f"pay_{uuid4().hex}")
    result = await service.handle_webhook(raw_body_bytes=body, signature=signature)

    await db_session.refresh(booking)
    assert booking.status != BookingStatus.CONFIRMED, (
        f"A late payment.captured webhook confirmed a CANCELLED booking "
        f"(handler returned {result}). The slot was already back on sale."
    )
