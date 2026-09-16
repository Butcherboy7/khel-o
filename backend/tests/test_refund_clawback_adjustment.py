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


@pytest.mark.asyncio
async def test_refund_after_payout_writes_clawback_adjustment(db_session):
    from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "clawback")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    fee = PlatformFee(booking_id=booking.id, owner_settlement_amount=Decimal("900.00"))
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

    adjustments = (await db_session.execute(
        select(CafePayoutAdjustment).where(CafePayoutAdjustment.booking_id == booking.id)
    )).scalars().all()
    assert len(adjustments) == 1
    assert float(adjustments[0].amount) == -900.00
    assert booking.booking_reference in adjustments[0].reason
