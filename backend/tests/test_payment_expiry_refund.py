"""
P0-B4 regression: a payment Razorpay actually captured must never be left
captured while KHEL-O treats the booking as expired/failed with no refund.

Before this fix, both TTL-expiry paths (the client-driven verify_payment call
arriving late, and the webhook's payment.captured arriving late) marked the
payment FAILED and the booking FAILED/expired WITHOUT calling Razorpay's
refund API — despite one message literally saying "Auto-refund initiated"
and a webhook status string literally saying "ttl_expired_refunded". The
customer's money stayed captured with no refund and no record of one.

Also covers: process_refund must be idempotent, since a retried call (e.g.
from a duplicate cron tick or a retried webhook) must not attempt a second
real refund against Razorpay.
"""
import hashlib
import hmac
import json
from datetime import date, time, timedelta, datetime, timezone
from uuid import uuid4

import pytest

from app.core.exceptions import ValidationException
from app.config import settings
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.booking import Booking, BookingStatus
from app.models.hardware_tier import HardwareTier
from app.models.payment import Payment, PaymentStatus
from app.core.security import get_password_hash
from app.repositories.payment_repository import PaymentRepository
from app.repositories.booking_repository import BookingRepository
from app.services.payment_service import PaymentService
from app.schemas.payment import PaymentVerifyRequest


class _FakeRazorpayResponse:
    def __init__(self, body: dict):
        self._body = json.dumps(body).encode("utf-8")

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def _install_fake_razorpay_refund(monkeypatch, call_log):
    def fake_urlopen(req, timeout=10):
        call_log.append(req.full_url)
        return _FakeRazorpayResponse({"id": f"rfnd_{uuid4().hex[:10]}", "status": "processed"})

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)


async def _make_expired_pending_booking(db, amount=100.0, minutes_ago=20):
    owner = User(
        id=uuid4(),
        email=f"expiry_owner_{uuid4().hex}@test.com",
        full_name="Owner",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True,
    )
    gamer = User(
        id=uuid4(),
        email=f"expiry_gamer_{uuid4().hex}@test.com",
        full_name="Gamer",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.GAMER,
        is_active=True,
    )
    db.add_all([owner, gamer])
    await db.flush()

    db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    db.add(UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER))

    cafe = Cafe(
        id=uuid4(),
        owner_id=owner.id,
        name="Expiry Test Cafe",
        address_line1="123 Test St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        opening_time=time(9, 0),
        closing_time=time(21, 0),
        bookable_stations=10,
    )
    db.add(cafe)

    tier = HardwareTier(
        id=uuid4(),
        cafe_id=cafe.id,
        name="Standard",
        specs={"gpu": "RTX 3060"},
        price_per_hour=100.0,
        total_seats=10,
        app_bookable_seats=10,
        active_seats_count=10,
        is_active=True,
    )
    db.add(tier)

    created_at = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    booking = Booking(
        id=uuid4(),
        booking_reference=f"GC-{uuid4().hex[:8].upper()}",
        gamer_id=gamer.id,
        cafe_id=cafe.id,
        hardware_tier_id=tier.id,
        session_date=date.today() + timedelta(days=1),
        start_time=time(10, 0),
        end_time=time(11, 0),
        duration_hours=1.0,
        base_amount=amount,
        discount_amount=0.0,
        gateway_fee=0.0,
        total_amount=amount,
        convenience_fee=0.0,
        status=BookingStatus.PENDING_PAYMENT,
        created_at=created_at,
    )
    db.add(booking)

    order_id = f"order_{uuid4().hex}"
    payment = Payment(
        id=uuid4(),
        booking_id=booking.id,
        razorpay_order_id=order_id,
        amount=amount,
        status=PaymentStatus.CREATED,
    )
    db.add(payment)
    await db.commit()
    return booking, payment, gamer


def _service(db):
    return PaymentService(PaymentRepository(db), BookingRepository(db), db)


@pytest.mark.asyncio
async def test_late_verify_payment_issues_real_refund(db_session, monkeypatch):
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "real-secret-key")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "rzp_test_real")
    call_log = []
    _install_fake_razorpay_refund(monkeypatch, call_log)

    booking, payment, gamer = await _make_expired_pending_booking(db_session, minutes_ago=20)
    service = _service(db_session)

    razorpay_payment_id = f"pay_{uuid4().hex}"
    message = f"{payment.razorpay_order_id}|{razorpay_payment_id}"
    valid_signature = hmac.new(b"real-secret-key", message.encode("utf-8"), hashlib.sha256).hexdigest()

    payload = PaymentVerifyRequest(
        razorpay_order_id=payment.razorpay_order_id,
        razorpay_payment_id=razorpay_payment_id,
        razorpay_signature=valid_signature,
    )

    with pytest.raises(ValidationException):
        await service.verify_payment(payload, gamer_id=gamer.id)

    await db_session.refresh(payment)
    assert payment.status == PaymentStatus.REFUNDED, (
        "Razorpay captured this payment (signature was valid) — expiring the "
        "booking must actually refund it, not just relabel it FAILED"
    )
    assert payment.refund_id is not None
    assert len(call_log) == 1, "Expected exactly one real refund API call"


@pytest.mark.asyncio
async def test_late_webhook_capture_issues_real_refund(db_session, monkeypatch):
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", "whsec_real")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "real-secret-key")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "rzp_test_real")
    call_log = []
    _install_fake_razorpay_refund(monkeypatch, call_log)

    booking, payment, _ = await _make_expired_pending_booking(db_session, minutes_ago=20)
    service = _service(db_session)

    razorpay_payment_id = f"pay_{uuid4().hex}"
    body = json.dumps({
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "order_id": payment.razorpay_order_id,
                    "id": razorpay_payment_id,
                }
            }
        },
    }).encode("utf-8")
    signature = hmac.new(b"whsec_real", body, hashlib.sha256).hexdigest()

    await service.handle_webhook(raw_body_bytes=body, signature=signature)

    await db_session.refresh(payment)
    assert payment.status == PaymentStatus.REFUNDED, (
        "A payment.captured webhook arriving after the TTL window must trigger "
        "a real refund, not just mark the booking FAILED"
    )
    assert payment.refund_id is not None
    assert len(call_log) == 1


@pytest.mark.asyncio
async def test_process_refund_is_idempotent(db_session, monkeypatch):
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "real-secret-key")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "rzp_test_real")
    call_log = []
    _install_fake_razorpay_refund(monkeypatch, call_log)

    booking, payment, _ = await _make_expired_pending_booking(db_session, minutes_ago=1)
    await db_session.refresh(payment)
    from sqlalchemy import update as sa_update
    await db_session.execute(
        sa_update(Payment)
        .where(Payment.id == payment.id)
        .values(status=PaymentStatus.CAPTURED, razorpay_payment_id=f"pay_{uuid4().hex}")
    )
    await db_session.commit()

    service = _service(db_session)

    first = await service.process_refund(booking.id, admin_id=uuid4())
    second = await service.process_refund(booking.id, admin_id=uuid4())

    assert len(call_log) == 1, "A retried refund must not call Razorpay a second time"
    assert first["refundId"] == second["refundId"]


@pytest.mark.asyncio
async def test_late_capture_refund_api_failure_does_not_strand_booking(db_session, monkeypatch):
    """If Razorpay's refund API call itself fails, the booking must not be
    silently left in PENDING_PAYMENT (money captured, booking looks like it's
    still awaiting payment, nothing for support to find) — it must land in a
    terminal FAILED state flagging manual refund is needed."""
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", "whsec_real")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "real-secret-key")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "rzp_test_real")

    def failing_urlopen(req, timeout=10):
        raise RuntimeError("simulated Razorpay outage")

    monkeypatch.setattr("urllib.request.urlopen", failing_urlopen)

    booking, payment, _ = await _make_expired_pending_booking(db_session, minutes_ago=20)
    service = _service(db_session)

    razorpay_payment_id = f"pay_{uuid4().hex}"
    body = json.dumps({
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "order_id": payment.razorpay_order_id,
                    "id": razorpay_payment_id,
                }
            }
        },
    }).encode("utf-8")
    signature = hmac.new(b"whsec_real", body, hashlib.sha256).hexdigest()

    await service.handle_webhook(raw_body_bytes=body, signature=signature)

    await db_session.refresh(booking)
    await db_session.refresh(payment)
    assert booking.status == BookingStatus.FAILED
    assert "manual refund" in booking.cancellation_reason
    assert payment.status == PaymentStatus.CAPTURED, (
        "Must not falsely mark the payment REFUNDED when the API call failed"
    )
