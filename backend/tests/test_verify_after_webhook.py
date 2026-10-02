"""The payment.captured webhook and the browser's verify call race to confirm
the same payment. When the webhook wins, the browser's call must still succeed
(the customer paid) instead of showing "Cannot verify payment for booking in
status 'confirmed'". A forged signature must still be rejected."""
import hashlib
import hmac
from uuid import uuid4

import pytest

from app.config import settings
from app.core.time import now_ist
from app.models.booking import BookingStatus
from app.models.payment import Payment, PaymentStatus
from tests.conftest import auth_headers
from tests.test_launch_invariants import _make_owner_and_cafe, _make_gamer, _booking_with_fee


def _sig(order_id, payment_id):
    return hmac.new(settings.RAZORPAY_KEY_SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()


async def _paid_booking(db_session):
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "vwh")
    gamer = await _make_gamer(db_session)
    b, fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.CONFIRMED, now_ist().date())
    pay = Payment(id=uuid4(), booking_id=b.id, razorpay_order_id=f"order_{uuid4().hex[:12]}",
                  razorpay_payment_id=f"pay_{uuid4().hex[:12]}", amount=float(b.total_amount), currency="INR",
                  status=PaymentStatus.CAPTURED)
    db_session.add_all([b, fee])
    await db_session.flush()
    db_session.add(pay)
    await db_session.commit()
    return gamer, pay


@pytest.mark.asyncio
async def test_browser_verify_after_webhook_confirmed_is_success(async_client, db_session):
    gamer, pay = await _paid_booking(db_session)
    body = {"razorpayOrderId": pay.razorpay_order_id, "razorpayPaymentId": pay.razorpay_payment_id,
            "razorpaySignature": _sig(pay.razorpay_order_id, pay.razorpay_payment_id)}
    res = await async_client.post("/api/v1/payments/verify", json=body, headers=auth_headers(gamer))
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_forged_signature_on_confirmed_booking_is_still_rejected(async_client, db_session):
    gamer, pay = await _paid_booking(db_session)
    body = {"razorpayOrderId": pay.razorpay_order_id, "razorpayPaymentId": pay.razorpay_payment_id,
            "razorpaySignature": "forged"}
    res = await async_client.post("/api/v1/payments/verify", json=body, headers=auth_headers(gamer))
    assert res.status_code != 200
