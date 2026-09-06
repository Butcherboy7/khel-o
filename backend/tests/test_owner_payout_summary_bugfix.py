"""
Regression test: GET /api/v1/owner/payouts/summary must exclude refunded
bookings (and anything already manually paid out via CafePayoutRepository)
from the pendingSettlements figure it reports to the café owner.
"""
import pytest
from datetime import date, timedelta, time
from uuid import uuid4
from httpx import AsyncClient
from sqlalchemy import select

from app.main import app
from app.models.platform_fee import PlatformFee
from app.models.payment import Payment, PaymentStatus
from app.models.cafe import Cafe
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.models.user import User
from tests.conftest import auth_headers
from tests.test_admin_v2_features import _make_gamer, _make_admin, _make_booking_with_payment
from app.repositories.cafe_payout_repository import CafePayoutRepository


@pytest.mark.asyncio
async def test_owner_payout_summary_pending_excludes_refunded(db_session):
    """Both bookings must belong to the SAME café/owner, otherwise this test
    can't actually exercise the bug: `_make_booking_with_payment` creates a
    brand-new owner+café on every call, so two separate calls would never be
    summed together by the owner's own payouts/summary query below. The
    second booking is built manually here, reusing the first café/tier, so
    both fees land under the one owner whose summary we're checking."""
    gamer = await _make_gamer(db_session, "summary_gamer")
    paid_booking, paid_payment = await _make_booking_with_payment(db_session, gamer)

    cafe = (await db_session.execute(select(Cafe).where(Cafe.id == paid_booking.cafe_id))).scalars().first()
    tier = (await db_session.execute(select(HardwareTier).where(HardwareTier.cafe_id == cafe.id))).scalars().first()
    owner = (await db_session.execute(select(User).where(User.id == cafe.owner_id))).scalars().first()

    refunded_booking = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today() + timedelta(days=3),
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=0.0, gateway_fee=0.0, total_amount=100.0,
        convenience_fee=0.0, status=BookingStatus.CONFIRMED,
    )
    db_session.add(refunded_booking)
    await db_session.flush()
    refunded_payment = Payment(
        id=uuid4(), booking_id=refunded_booking.id, razorpay_order_id=f"order_{uuid4().hex}",
        razorpay_payment_id=None, amount=100.0, status=PaymentStatus.CAPTURED,
    )
    db_session.add(refunded_payment)

    db_session.add(PlatformFee(id=uuid4(), booking_id=paid_booking.id, owner_settlement_amount=95.0, gateway_fee=5.0))
    db_session.add(PlatformFee(id=uuid4(), booking_id=refunded_booking.id, owner_settlement_amount=95.0, gateway_fee=5.0))
    refunded_payment.status = PaymentStatus.REFUNDED
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.get("/api/v1/owner/payouts/summary", headers=auth_headers(owner))
        assert res.status_code == 200, res.text
        assert res.json()["data"]["summary"]["pendingSettlements"] == 95.0


@pytest.mark.asyncio
async def test_owner_payout_summary_pending_excludes_already_manually_paid_out(db_session):
    """Mixed-transfer-status regression: a café can simultaneously have (a) a
    booking whose PlatformFee.transfer_status == "transferred" via Razorpay
    Route but which has NEVER been manually paid out, and (b) a booking that
    is still transfer_status == "pending" (Route never transferred it) but
    HAS already been manually paid out via CafePayoutRepository.create_payout.

    A diff-based calculation (summing "not transferred" fees for the café,
    then subtracting the café's whole outstanding-balance total) misattributes
    amounts across these two differently-scoped sets. The fix must compare at
    the booking-id level instead: only a booking that is both non-transferred
    AND absent from get_outstanding_fee_rows counts as "already paid out".

    Booking A (net=200) is manually paid out here while it is the café's only
    booking, so the payout covers exactly A. Booking B (net=100) is created
    afterwards with transfer_status="transferred" and is never manually paid
    out. Expected: pendingSettlements == 0 (A is non-transferred but already
    paid out, so its 200 must be subtracted back out; B is transferred, so it
    counts toward completedSettlements, not pendingSettlements).
    """
    gamer = await _make_gamer(db_session, "mixed_gamer")
    admin = await _make_admin(db_session)

    booking_a, payment_a = await _make_booking_with_payment(db_session, gamer)
    cafe = (await db_session.execute(select(Cafe).where(Cafe.id == booking_a.cafe_id))).scalars().first()
    tier = (await db_session.execute(select(HardwareTier).where(HardwareTier.cafe_id == cafe.id))).scalars().first()
    owner = (await db_session.execute(select(User).where(User.id == cafe.owner_id))).scalars().first()

    db_session.add(PlatformFee(id=uuid4(), booking_id=booking_a.id, owner_settlement_amount=200.0, gateway_fee=5.0))
    await db_session.commit()

    # At this point A is the café's only booking, so this payout covers
    # exactly A's fee — creating a CafePayoutItem for it.
    cafe_payout_repo = CafePayoutRepository(db_session)
    await cafe_payout_repo.create_payout(
        cafe_id=cafe.id, admin_id=admin.id, utr_reference="UTR-TEST-1", payment_method="bank_transfer",
    )

    booking_b = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today() + timedelta(days=4),
        start_time=time(20, 0), end_time=time(21, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=0.0, gateway_fee=0.0, total_amount=100.0,
        convenience_fee=0.0, status=BookingStatus.CONFIRMED,
    )
    db_session.add(booking_b)
    await db_session.flush()
    payment_b = Payment(
        id=uuid4(), booking_id=booking_b.id, razorpay_order_id=f"order_{uuid4().hex}",
        razorpay_payment_id="pay_test", amount=100.0, status=PaymentStatus.CAPTURED,
    )
    db_session.add(payment_b)
    db_session.add(PlatformFee(
        id=uuid4(), booking_id=booking_b.id, owner_settlement_amount=100.0, gateway_fee=5.0,
        transfer_status="transferred", razorpay_transfer_id="trf_test",
    ))
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.get("/api/v1/owner/payouts/summary", headers=auth_headers(owner))
        assert res.status_code == 200, res.text
        summary = res.json()["data"]["summary"]
        assert summary["pendingSettlements"] == 0.0
        assert summary["completedSettlements"] == 100.0
