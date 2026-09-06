import pytest
from decimal import Decimal
from uuid import uuid4

from app.repositories.cafe_payout_repository import CafePayoutRepository
from app.models.payment import Payment, PaymentStatus
from app.models.platform_fee import PlatformFee
from tests.test_admin_v2_features import _make_gamer, _make_booking_with_payment


@pytest.mark.asyncio
async def test_outstanding_amount_excludes_refunded_booking(db_session):
    gamer = await _make_gamer(db_session, "refund_gamer")
    paid_booking, paid_payment = await _make_booking_with_payment(db_session, gamer)
    refunded_booking, refunded_payment = await _make_booking_with_payment(db_session, gamer)

    fee1 = PlatformFee(id=uuid4(), booking_id=paid_booking.id, owner_settlement_amount=95.0)
    fee2 = PlatformFee(id=uuid4(), booking_id=refunded_booking.id, owner_settlement_amount=95.0)
    db_session.add_all([fee1, fee2])

    refunded_payment.status = PaymentStatus.REFUNDED
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    outstanding = await repo.get_outstanding_amount(paid_booking.cafe_id)

    assert outstanding == Decimal("95.00")


@pytest.mark.asyncio
async def test_outstanding_amount_excludes_already_paid_out(db_session):
    gamer = await _make_gamer(db_session, "paid_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    assert await repo.get_outstanding_amount(booking.cafe_id) == Decimal("95.00")

    payout = await repo.create_payout(
        cafe_id=booking.cafe_id, admin_id=uuid4(), utr_reference="UTR1", payment_method="neft",
    )
    assert payout.amount == 95.0

    assert await repo.get_outstanding_amount(booking.cafe_id) == Decimal("0")


import asyncio
from tests.conftest import TestAsyncSessionLocal


@pytest.mark.asyncio
async def test_concurrent_payout_creation_does_not_double_pay(db_session):
    gamer = await _make_gamer(db_session, "race_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
    await db_session.commit()
    cafe_id = booking.cafe_id
    admin_id = uuid4()

    async def attempt():
        async with TestAsyncSessionLocal() as session:
            repo = CafePayoutRepository(session)
            try:
                return await repo.create_payout(cafe_id, admin_id, "UTR-RACE", "neft")
            except Exception:
                return None

    results = await asyncio.gather(attempt(), attempt())
    successes = [r for r in results if r is not None]
    assert len(successes) == 1, "exactly one of the two concurrent payouts must succeed"

    repo = CafePayoutRepository(db_session)
    assert await repo.get_outstanding_amount(cafe_id) == Decimal("0")
