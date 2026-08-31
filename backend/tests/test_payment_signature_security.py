"""
P0-A4 / P0-A6 regression: payment signature verification must fail closed
in every environment, not just production.

Before this fix, PaymentService.verify_payment accepted ANY signature string
whenever settings.ENVIRONMENT != "production" (it just logged a warning and
proceeded). That means if ENVIRONMENT was ever misconfigured (e.g. staging
pointed at a production database, or the var was simply unset), a completely
made-up signature would confirm a booking and mark a payment CAPTURED with no
proof Razorpay ever charged anyone.

Covers both payment paths that check a signature:
  - PaymentService.verify_payment   (client-driven confirmation, A6)
  - PaymentService.handle_webhook   (Razorpay-driven, A4)
"""
import hashlib
import hmac
import json
from datetime import date, time, timedelta
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


async def _make_pending_booking_and_payment(db, amount=100.0):
    owner = User(
        id=uuid4(),
        email=f"sig_owner_{uuid4().hex}@test.com",
        full_name="Owner",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True,
    )
    gamer = User(
        id=uuid4(),
        email=f"sig_gamer_{uuid4().hex}@test.com",
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
        name="Signature Test Cafe",
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
@pytest.mark.parametrize("environment", ["development", "staging", "production"])
async def test_forged_signature_rejected_in_every_environment(db_session, monkeypatch, environment):
    """A signature that doesn't match the HMAC must be rejected regardless of
    ENVIRONMENT. Before the fix, non-production environments accepted it."""
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "real-secret-key")

    booking, payment, gamer = await _make_pending_booking_and_payment(db_session)
    service = _service(db_session)

    payload = PaymentVerifyRequest(
        razorpay_order_id=payment.razorpay_order_id,
        razorpay_payment_id=f"pay_{uuid4().hex}",
        razorpay_signature="completely-made-up-signature-not-hmac-derived",
    )

    with pytest.raises(ValidationException):
        await service.verify_payment(payload, gamer_id=gamer.id)

    await db_session.refresh(booking)
    assert booking.status == BookingStatus.PENDING_PAYMENT, (
        "A forged signature must never confirm a booking"
    )


@pytest.mark.asyncio
async def test_valid_signature_is_accepted(db_session, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "real-secret-key")

    booking, payment, gamer = await _make_pending_booking_and_payment(db_session)
    service = _service(db_session)

    razorpay_payment_id = f"pay_{uuid4().hex}"
    message = f"{payment.razorpay_order_id}|{razorpay_payment_id}"
    valid_signature = hmac.new(b"real-secret-key", message.encode("utf-8"), hashlib.sha256).hexdigest()

    payload = PaymentVerifyRequest(
        razorpay_order_id=payment.razorpay_order_id,
        razorpay_payment_id=razorpay_payment_id,
        razorpay_signature=valid_signature,
    )

    result = await service.verify_payment(payload, gamer_id=gamer.id)
    assert result.status == PaymentStatus.CAPTURED

    await db_session.refresh(booking)
    assert booking.status == BookingStatus.CONFIRMED


# Webhook (A4)

def _webhook_body(order_id, payment_id):
    return json.dumps({
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "order_id": order_id,
                    "id": payment_id,
                }
            }
        },
    }).encode("utf-8")


@pytest.mark.asyncio
async def test_webhook_valid_signature_is_processed(db_session, monkeypatch):
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", "whsec_real")
    booking, payment, _ = await _make_pending_booking_and_payment(db_session)
    service = _service(db_session)

    body = _webhook_body(payment.razorpay_order_id, f"pay_{uuid4().hex}")
    signature = hmac.new(b"whsec_real", body, hashlib.sha256).hexdigest()

    await service.handle_webhook(raw_body_bytes=body, signature=signature)

    await db_session.refresh(booking)
    assert booking.status == BookingStatus.CONFIRMED


@pytest.mark.asyncio
async def test_webhook_invalid_signature_is_rejected(db_session, monkeypatch):
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", "whsec_real")
    booking, payment, _ = await _make_pending_booking_and_payment(db_session)
    service = _service(db_session)

    body = _webhook_body(payment.razorpay_order_id, f"pay_{uuid4().hex}")

    await service.handle_webhook(raw_body_bytes=body, signature="totally-wrong-signature")

    await db_session.refresh(booking)
    assert booking.status == BookingStatus.PENDING_PAYMENT, "Invalid signature must not confirm the booking"


@pytest.mark.asyncio
async def test_webhook_tampered_payload_is_rejected(db_session, monkeypatch):
    """Signature computed over the original body must not validate a payload
    that was altered after signing (e.g. amount or order_id tampering)."""
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", "whsec_real")
    booking, payment, _ = await _make_pending_booking_and_payment(db_session)
    service = _service(db_session)

    original_body = _webhook_body(payment.razorpay_order_id, f"pay_{uuid4().hex}")
    signature = hmac.new(b"whsec_real", original_body, hashlib.sha256).hexdigest()

    tampered_body = _webhook_body(payment.razorpay_order_id, "pay_attacker_substituted")

    await service.handle_webhook(raw_body_bytes=tampered_body, signature=signature)

    await db_session.refresh(booking)
    assert booking.status == BookingStatus.PENDING_PAYMENT, "Tampered payload must not confirm the booking"


@pytest.mark.asyncio
async def test_webhook_missing_signature_is_rejected(db_session, monkeypatch):
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", "whsec_real")
    booking, payment, _ = await _make_pending_booking_and_payment(db_session)
    service = _service(db_session)

    body = _webhook_body(payment.razorpay_order_id, f"pay_{uuid4().hex}")

    await service.handle_webhook(raw_body_bytes=body, signature=None)

    await db_session.refresh(booking)
    assert booking.status == BookingStatus.PENDING_PAYMENT, "Missing signature must not confirm the booking"
