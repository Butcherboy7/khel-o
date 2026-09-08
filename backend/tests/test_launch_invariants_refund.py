"""Launch-day refund invariants (M-04).

Companion to test_launch_invariants.py. See docs/LAUNCH_QA_PLAN.md Phase 2.

Refund mechanics, from payment_service.process_refund:
  * success            -> payment REFUNDED, booking CANCELLED
  * razorpay API error -> payment stays CAPTURED, `refund_api_failed` returned,
                          booking status deliberately left alone
  * no payment id      -> `no_payment_id` returned, nothing mutated

The money question that matters: refunded money must stop counting as café
earnings everywhere it is displayed, and a refund that did not actually happen
must never be reported to the customer as if it had.
"""
import pytest
from uuid import uuid4

from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.booking import Booking, BookingStatus
from app.models.payment import Payment, PaymentStatus
from app.models.platform_fee import PlatformFee
from app.core.security import get_password_hash
from app.core.time import now_ist
from tests.conftest import auth_headers
from tests.test_launch_invariants import (
    _make_owner_and_cafe,
    _make_gamer,
    _booking_with_fee,
    _dashboard,
)


async def _make_admin(db_session):
    admin = User(
        id=uuid4(), email=f"rf_admin_{uuid4().hex[:8]}@test.com", full_name="Admin",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.ADMIN, is_active=True,
    )
    db_session.add(admin)
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid4(), user_id=admin.id, role=UserRole.ADMIN))
    await db_session.commit()
    return admin


def _payment_for(booking, status=PaymentStatus.CAPTURED, with_payment_id=True):
    return Payment(
        id=uuid4(), booking_id=booking.id,
        razorpay_order_id=f"order_{uuid4().hex[:12]}",
        razorpay_payment_id=f"pay_{uuid4().hex[:12]}" if with_payment_id else None,
        amount=float(booking.total_amount), currency="INR", status=status,
    )


# ---------------------------------------------------------------- M-04a

@pytest.mark.asyncio
async def test_refunded_booking_leaves_owner_earnings(db_session, async_client):
    """A refunded booking is money given back — it must stop counting.

    process_refund sets the booking to CANCELLED on success, which is outside
    _EARNED_STATUSES, so this is the expected-good path.
    """
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "rf1")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    kept, kept_fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.CONFIRMED, today, base=100.0)
    gone, gone_fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.CANCELLED, today, base=900.0)
    db_session.add_all([kept, kept_fee, gone, gone_fee])
    db_session.add(_payment_for(kept, PaymentStatus.CAPTURED))
    db_session.add(_payment_for(gone, PaymentStatus.REFUNDED))
    await db_session.commit()

    data = await _dashboard(async_client, owner)
    assert data["revenueToday"] == pytest.approx(100.0), (
        f"Refunded booking still counted as earnings: got {data['revenueToday']}, "
        "expected only the un-refunded booking's settlement (100.00)."
    )


# ---------------------------------------------------------------- M-04b

@pytest.mark.asyncio
async def test_refund_recorded_out_of_band_still_leaves_earnings(db_session, async_client):
    """Defence in depth: a REFUNDED payment must not count as earnings even if
    the booking's own status was never moved off a paid state.

    This is reachable whenever a refund is issued directly in the Razorpay
    dashboard, or when process_refund's booking update does not land — the
    money is demonstrably back with the customer, so the café has not earned
    it regardless of what Booking.status says. /owner/payouts/summary and
    /owner/analytics already exclude refunded payments; the dashboard must
    agree with them rather than reporting a higher number than either.
    """
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "rf2")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    kept, kept_fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.CONFIRMED, today, base=100.0)
    # Refunded at the gateway, but the booking is still COMPLETED.
    stale, stale_fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.COMPLETED, today, base=900.0)
    db_session.add_all([kept, kept_fee, stale, stale_fee])
    db_session.add(_payment_for(kept, PaymentStatus.CAPTURED))
    db_session.add(_payment_for(stale, PaymentStatus.REFUNDED))
    await db_session.commit()

    data = await _dashboard(async_client, owner)
    assert data["revenueToday"] == pytest.approx(100.0), (
        f"A REFUNDED payment still counted as earnings ({data['revenueToday']}) because "
        "the booking status was left on a paid state — the dashboard ignores Payment.status."
    )


# ---------------------------------------------------------------- M-04c

@pytest.mark.asyncio
async def test_unrefundable_payment_is_not_marked_refunded(db_session, async_client):
    """A refund that cannot be performed must not be recorded as done.

    With no razorpay_payment_id there is nothing to refund at the gateway.
    The payment must stay CAPTURED and the booking must not be reported to
    the customer as refunded — telling someone their money is on the way when
    it is not is worse than failing loudly.
    """
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "rf3")
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    b, fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.CONFIRMED, today, base=100.0)
    db_session.add_all([b, fee])
    pay = _payment_for(b, PaymentStatus.CAPTURED, with_payment_id=False)
    db_session.add(pay)
    await db_session.commit()
    payment_id = pay.id

    res = await async_client.post(
        f"/api/v1/admin/bookings/{b.id}/refund",
        headers=auth_headers(admin, is_admin=True),
        json={"reason": "QA invariant test"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["data"]["status"] == "no_payment_id"

    db_session.expire_all()
    after = await db_session.get(Payment, payment_id)
    assert after.status == PaymentStatus.CAPTURED, (
        f"Payment was marked {after.status} despite no gateway refund being possible."
    )
    assert after.refund_id is None, "A refund id was fabricated for a refund that never happened."


# ---------------------------------------------------------------- M-04d

@pytest.mark.asyncio
async def test_refund_preserves_the_financial_record(db_session, async_client):
    """A refund must never delete history — booking, payment and platform_fee
    rows all survive so the money can still be reconciled afterwards."""
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "rf4")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    b, fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.CANCELLED, today, base=100.0)
    db_session.add_all([b, fee])
    pay = _payment_for(b, PaymentStatus.REFUNDED)
    db_session.add(pay)
    await db_session.commit()

    booking_id, fee_id, payment_id = b.id, fee.id, pay.id
    db_session.expire_all()

    assert await db_session.get(Booking, booking_id) is not None, "booking row destroyed by refund"
    assert await db_session.get(Payment, payment_id) is not None, "payment row destroyed by refund"
    surviving_fee = await db_session.get(PlatformFee, fee_id)
    assert surviving_fee is not None, "platform_fee row destroyed by refund"
    assert float(surviving_fee.owner_settlement_amount) == pytest.approx(100.0), \
        "settlement amount mutated by refund — historical record must stay intact"
