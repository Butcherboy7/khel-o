import pytest
from decimal import Decimal
from app.models.cafe_payout_adjustment import CafePayoutAdjustment


@pytest.mark.asyncio
async def test_cafe_payout_adjustment_persists_negative_amount(db_session):
    from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "adjtest")
    booking, _payment = await _make_booking_with_payment(db_session, gamer)

    adj = CafePayoutAdjustment(
        cafe_id=booking.cafe_id,
        booking_id=booking.id,
        amount=Decimal("-960.00"),
        reason="Refunded after payout: booking " + booking.booking_reference,
        created_by_admin_id=admin.id,
    )
    db_session.add(adj)
    await db_session.commit()
    await db_session.refresh(adj)

    assert adj.id is not None
    assert float(adj.amount) == -960.00
    assert adj.created_at is not None
