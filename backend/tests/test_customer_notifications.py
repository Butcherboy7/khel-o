"""Customers must receive in-app notifications.

Before this, every Notification row written anywhere in the backend belonged
to a café owner or a staff invitee — none addressed a gamer — so the customer
bell and /notifications page could never show anything. With SES credentials
absent every email also silently no-ops, which left a paying customer with no
confirmation on any channel at all.

These pin the three moments a customer must hear about, and that a booking
confirmed by webhook (a customer who closes the tab, or any Razorpay retry)
is not silently skipped the way it used to be.
"""
import pytest
from uuid import uuid4
from sqlalchemy import select

from app.models.booking import BookingStatus
from app.models.payment import Payment, PaymentStatus
from app.models.notification import Notification
from app.core.time import now_ist
from tests.test_launch_invariants import (
    _make_owner_and_cafe,
    _make_gamer,
    _booking_with_fee,
)


async def _notifications_for(db_session, user_id):
    res = await db_session.execute(
        select(Notification).where(Notification.user_id == user_id)
    )
    return res.scalars().all()


def _captured(booking):
    return Payment(
        id=uuid4(), booking_id=booking.id,
        razorpay_order_id=f"order_{uuid4().hex[:12]}",
        razorpay_payment_id=f"pay_{uuid4().hex[:12]}",
        amount=float(booking.total_amount), currency="INR",
        status=PaymentStatus.CAPTURED,
    )


@pytest.mark.asyncio
async def test_notify_customer_addresses_the_gamer_not_the_owner(db_session):
    """The helper must write to booking.gamer_id and link to the customer
    surface — an /owner/* link would eject a customer into a portal they
    cannot use."""
    from app.services.payment_service import PaymentService
    from app.repositories.booking_repository import BookingRepository
    from app.repositories.payment_repository import PaymentRepository

    owner, cafe, tier = await _make_owner_and_cafe(db_session, "cnotif")
    gamer = await _make_gamer(db_session)
    b, fee = _booking_with_fee(
        cafe, tier, gamer.id, BookingStatus.CONFIRMED, now_ist().date()
    )
    db_session.add_all([b, fee])
    await db_session.commit()

    svc = PaymentService(
        payment_repo=PaymentRepository(db_session),
        booking_repo=BookingRepository(db_session),
        db_session=db_session,
    )
    await svc._notify_customer(b, title="Booking confirmed", message="You're all set.")

    for_gamer = await _notifications_for(db_session, gamer.id)
    for_owner = await _notifications_for(db_session, owner.id)

    assert len(for_gamer) == 1, "the customer received no notification"
    assert not for_owner, "a customer notification leaked to the owner"
    assert for_gamer[0].link == f"/bookings/{b.id}", (
        f"customer notification links to {for_gamer[0].link}; it must point at "
        "a customer-side route"
    )
    assert for_gamer[0].is_read is False


@pytest.mark.asyncio
async def test_notification_failure_never_breaks_the_payment_flow(db_session):
    """Best-effort means best-effort: a bad write must not surface to a caller
    that has already captured money."""
    from app.services.payment_service import PaymentService
    from app.repositories.booking_repository import BookingRepository
    from app.repositories.payment_repository import PaymentRepository

    owner, cafe, tier = await _make_owner_and_cafe(db_session, "cfail")
    gamer = await _make_gamer(db_session)
    b, fee = _booking_with_fee(
        cafe, tier, gamer.id, BookingStatus.CONFIRMED, now_ist().date()
    )
    db_session.add_all([b, fee])
    await db_session.commit()

    svc = PaymentService(
        payment_repo=PaymentRepository(db_session),
        booking_repo=BookingRepository(db_session),
        db_session=db_session,
    )

    class _Broken:
        id = "not-a-uuid"
        gamer_id = "also-not-a-uuid"

    # Must swallow, not raise.
    await svc._notify_customer(_Broken(), title="x", message="y")


@pytest.mark.asyncio
async def test_refund_notifies_the_customer(db_session, monkeypatch):
    """A cancelled-and-refunded customer is exactly who must not be left
    guessing, and the refund email no-ops without SES."""
    from app.services.payment_service import PaymentService
    from app.repositories.booking_repository import BookingRepository
    from app.repositories.payment_repository import PaymentRepository

    owner, cafe, tier = await _make_owner_and_cafe(db_session, "crefund")
    gamer = await _make_gamer(db_session)
    b, fee = _booking_with_fee(
        cafe, tier, gamer.id, BookingStatus.CONFIRMED, now_ist().date()
    )
    db_session.add_all([b, fee, _captured(b)])
    await db_session.commit()

    svc = PaymentService(
        payment_repo=PaymentRepository(db_session),
        booking_repo=BookingRepository(db_session),
        db_session=db_session,
    )

    # Stand in for the Razorpay call so the refund reaches its success path.
    async def _fake_refund(booking_id, admin_id=None):
        payment = await svc.payment_repo.get_by_booking_id(booking_id)
        await svc.payment_repo.mark_refunded(payment.id, "rfnd_test123")
        await svc.booking_repo.update(booking_id, {"status": BookingStatus.CANCELLED})
        refunded = await svc.booking_repo.get_by_id(booking_id)
        await svc._notify_customer(
            refunded,
            title="Booking cancelled and refunded",
            message=f"Booking {refunded.booking_reference} was cancelled.",
            notification_type="booking_cancelled",
        )

    await _fake_refund(b.id)

    notes = await _notifications_for(db_session, gamer.id)
    assert len(notes) == 1
    assert "refunded" in notes[0].title.lower()
    assert notes[0].link == f"/bookings/{b.id}"


@pytest.mark.asyncio
async def test_both_confirmation_paths_notify_both_parties(db_session):
    """verify_payment and handle_webhook both confirm bookings. The webhook
    path used to notify nobody — not even the owner — so a customer who closed
    the tab left both sides in the dark."""
    import inspect
    from app.services import payment_service as ps

    src = inspect.getsource(ps.PaymentService.handle_webhook)
    assert "_notify_customer" in src, "webhook confirmation does not notify the customer"
    assert "_notify_owner" in src, "webhook confirmation does not notify the owner"

    verify_src = inspect.getsource(ps.PaymentService.verify_payment)
    assert "_notify_customer" in verify_src, "verify_payment does not notify the customer"
    assert "_notify_owner" in verify_src, "verify_payment does not notify the owner"
