import pytest
from decimal import Decimal
from sqlalchemy import select
from app.models.platform_fee import PlatformFee
from app.models.cafe_payout import CafePayout, CafePayoutStatus
from app.models.cafe_payout_item import CafePayoutItem
from app.models.cafe_payout_adjustment import CafePayoutAdjustment
from app.models.owner_payout_account import OwnerPayoutAccount
from app.services.payment_service import PaymentService
from app.repositories.payment_repository import PaymentRepository
from app.repositories.booking_repository import BookingRepository
from app.config import settings
from tests.test_payment_expiry_refund import _install_fake_razorpay_refund


@pytest.mark.asyncio
async def test_refund_after_payout_writes_clawback_adjustment(db_session, monkeypatch):
    from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "real-secret-key")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "rzp_test_real")
    _install_fake_razorpay_refund(monkeypatch, [])
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "clawback")
    # A razorpay_payment_id is required for the refund to actually reach
    # mark_refunded (see test_refund_clawback_adjustment_not_written_when_no_payment_id
    # below for the path where it's absent and no refund occurs).
    booking, payment = await _make_booking_with_payment(db_session, gamer, razorpay_payment_id="pay_test_clawback")

    fee = PlatformFee(settlement_status="settled", booking_id=booking.id, owner_settlement_amount=Decimal("900.00"))
    db_session.add(fee)
    await db_session.flush()

    payout = CafePayout(
        cafe_id=booking.cafe_id, amount=Decimal("900.00"), utr_reference="UTR1",
        payment_method="upi", status=CafePayoutStatus.PAID, created_by_admin_id=admin.id,
    )
    db_session.add(payout)
    await db_session.flush()
    db_session.add(CafePayoutItem(
        payout_id=payout.id, platform_fee_id=fee.id, booking_id=booking.id,
        amount_allocated=Decimal("900.00"),
    ))
    await db_session.commit()

    service = PaymentService(PaymentRepository(db_session), BookingRepository(db_session))
    await service.process_refund(booking.id, admin_id=admin.id)

    # Prove durability, not just same-transaction visibility: close this
    # session (which would implicitly roll back anything left uncommitted)
    # and re-query from a brand-new session/connection.
    await db_session.close()

    from tests.conftest import TestAsyncSessionLocal
    async with TestAsyncSessionLocal() as fresh_session:
        adjustments = (await fresh_session.execute(
            select(CafePayoutAdjustment).where(CafePayoutAdjustment.booking_id == booking.id)
        )).scalars().all()
        assert len(adjustments) == 1
        assert float(adjustments[0].amount) == -900.00
        assert booking.booking_reference in adjustments[0].reason


@pytest.mark.asyncio
async def test_no_clawback_adjustment_written_when_no_payment_id(db_session):
    """When a payment has no razorpay_payment_id, process_refund returns the
    'no_payment_id' status without ever refunding anything — so no clawback
    adjustment must be written either, even if the platform fee was already
    paid out to the café. Writing the adjustment here would durably reduce
    the café's payable for a refund that never happened."""
    from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "clawback_nopid")
    booking, payment = await _make_booking_with_payment(db_session, gamer, razorpay_payment_id=None)

    fee = PlatformFee(settlement_status="settled", booking_id=booking.id, owner_settlement_amount=Decimal("900.00"))
    db_session.add(fee)
    await db_session.flush()

    payout = CafePayout(
        cafe_id=booking.cafe_id, amount=Decimal("900.00"), utr_reference="UTR2",
        payment_method="upi", status=CafePayoutStatus.PAID, created_by_admin_id=admin.id,
    )
    db_session.add(payout)
    await db_session.flush()
    db_session.add(CafePayoutItem(
        payout_id=payout.id, platform_fee_id=fee.id, booking_id=booking.id,
        amount_allocated=Decimal("900.00"),
    ))
    await db_session.commit()

    service = PaymentService(PaymentRepository(db_session), BookingRepository(db_session))
    result = await service.process_refund(booking.id, admin_id=admin.id)
    assert result["status"] == "no_payment_id"

    await db_session.close()
    from tests.conftest import TestAsyncSessionLocal
    async with TestAsyncSessionLocal() as fresh_session:
        adjustments = (await fresh_session.execute(
            select(CafePayoutAdjustment).where(CafePayoutAdjustment.booking_id == booking.id)
        )).scalars().all()
        assert len(adjustments) == 0


@pytest.mark.asyncio
async def test_no_clawback_adjustment_written_when_refund_api_fails(db_session, monkeypatch):
    """When the Razorpay refund API call itself fails, the payment is
    deliberately left CAPTURED (not refunded) and process_refund returns
    'refund_api_failed'. No clawback adjustment should be written since no
    refund actually happened."""
    from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment

    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "clawback_apifail")
    booking, payment = await _make_booking_with_payment(db_session, gamer, razorpay_payment_id="pay_will_fail")

    fee = PlatformFee(settlement_status="settled", booking_id=booking.id, owner_settlement_amount=Decimal("900.00"))
    db_session.add(fee)
    await db_session.flush()

    payout = CafePayout(
        cafe_id=booking.cafe_id, amount=Decimal("900.00"), utr_reference="UTR3",
        payment_method="upi", status=CafePayoutStatus.PAID, created_by_admin_id=admin.id,
    )
    db_session.add(payout)
    await db_session.flush()
    db_session.add(CafePayoutItem(
        payout_id=payout.id, platform_fee_id=fee.id, booking_id=booking.id,
        amount_allocated=Decimal("900.00"),
    ))
    await db_session.commit()

    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "rzp_test_fake")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "fake_secret")

    def _boom(*args, **kwargs):
        raise RuntimeError("network unreachable")
    monkeypatch.setattr("urllib.request.urlopen", _boom)

    service = PaymentService(PaymentRepository(db_session), BookingRepository(db_session))
    result = await service.process_refund(booking.id, admin_id=admin.id)
    assert result["status"] == "refund_api_failed"

    await db_session.close()
    from tests.conftest import TestAsyncSessionLocal
    async with TestAsyncSessionLocal() as fresh_session:
        adjustments = (await fresh_session.execute(
            select(CafePayoutAdjustment).where(CafePayoutAdjustment.booking_id == booking.id)
        )).scalars().all()
        assert len(adjustments) == 0
