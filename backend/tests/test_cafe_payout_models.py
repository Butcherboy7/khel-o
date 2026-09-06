import pytest
from uuid import uuid4
from datetime import date, time, timedelta

from app.models.cafe_payout import CafePayout, CafePayoutStatus
from app.models.cafe_payout_item import CafePayoutItem
from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment


@pytest.mark.asyncio
async def test_cafe_payout_and_item_roundtrip(db_session):
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "payout_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    from app.models.platform_fee import PlatformFee
    fee = PlatformFee(
        id=uuid4(), booking_id=booking.id, convenience_fee=5.0, gateway_fee=5.0,
        tds_amount=0.0, owner_settlement_amount=95.0,
    )
    db_session.add(fee)
    await db_session.commit()

    payout = CafePayout(
        id=uuid4(), cafe_id=booking.cafe_id, amount=95.0, utr_reference="UTR123",
        payment_method="neft", status=CafePayoutStatus.PAID, created_by_admin_id=admin.id,
    )
    db_session.add(payout)
    await db_session.flush()

    item = CafePayoutItem(
        id=uuid4(), payout_id=payout.id, platform_fee_id=fee.id,
        booking_id=booking.id, amount_allocated=95.0,
    )
    db_session.add(item)
    await db_session.commit()

    assert payout.status == CafePayoutStatus.PAID
    assert item.amount_allocated == 95.0
