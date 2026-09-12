"""
Final-review fix #5: spec's Edge Cases section commits to logging a warning
for manual follow-up at refund time when a booking's platform_fee_id already
has a CafePayoutItem (i.e. the café was already manually paid out for it).
Phase 1 cannot claw that money back automatically, so the warning is the only
signal ops staff get. This is purely additive: no refund behavior changes.
"""
import json
from uuid import uuid4

import pytest
from sqlalchemy import update as sa_update

from app.config import settings
from app.models.payment import Payment, PaymentStatus
from app.models.platform_fee import PlatformFee
from app.models.cafe_payout import CafePayout, CafePayoutStatus
from app.models.cafe_payout_item import CafePayoutItem
from app.repositories.payment_repository import PaymentRepository
from app.repositories.booking_repository import BookingRepository
from app.services.payment_service import PaymentService
from tests.test_payment_expiry_refund import (
    _make_expired_pending_booking,
    _install_fake_razorpay_refund,
)


def _service(db):
    return PaymentService(PaymentRepository(db), BookingRepository(db), db)


async def _mark_captured(db, payment):
    await db.execute(
        sa_update(Payment)
        .where(Payment.id == payment.id)
        .values(status=PaymentStatus.CAPTURED, razorpay_payment_id=f"pay_{uuid4().hex}")
    )
    await db.commit()


@pytest.mark.asyncio
async def test_refund_on_already_paid_out_booking_logs_warning(db_session, monkeypatch, caplog):
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "real-secret-key")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "rzp_test_real")
    _install_fake_razorpay_refund(monkeypatch, [])

    booking, payment, _ = await _make_expired_pending_booking(db_session, minutes_ago=1)
    await _mark_captured(db_session, payment)

    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
    await db_session.flush()

    payout = CafePayout(
        id=uuid4(),
        cafe_id=booking.cafe_id,
        amount=95.0,
        utr_reference="UTR-ALREADY-PAID",
        payment_method="neft",
        status=CafePayoutStatus.PAID,
        created_by_admin_id=uuid4(),
    )
    db_session.add(payout)
    await db_session.flush()
    db_session.add(CafePayoutItem(
        id=uuid4(),
        payout_id=payout.id,
        platform_fee_id=fee.id,
        booking_id=booking.id,
        amount_allocated=95.0,
    ))
    await db_session.commit()

    service = _service(db_session)

    with caplog.at_level("WARNING"):
        result = await service.process_refund(booking.id, admin_id=uuid4())

    assert result["status"] == "processed"
    assert any(
        "already manually paid out via CafePayout" in rec.message
        for rec in caplog.records
    ), "Expected a warning about the already-paid-out CafePayoutItem"


@pytest.mark.asyncio
async def test_normal_refund_not_paid_out_does_not_log_payout_warning(db_session, monkeypatch, caplog):
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "real-secret-key")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "rzp_test_real")
    _install_fake_razorpay_refund(monkeypatch, [])

    booking, payment, _ = await _make_expired_pending_booking(db_session, minutes_ago=1)
    await _mark_captured(db_session, payment)

    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
    await db_session.commit()

    service = _service(db_session)

    with caplog.at_level("WARNING"):
        result = await service.process_refund(booking.id, admin_id=uuid4())

    assert result["status"] == "processed"
    assert not any(
        "already manually paid out via CafePayout" in rec.message
        for rec in caplog.records
    ), "A normal (not-paid-out) refund must not fire the payout warning"
