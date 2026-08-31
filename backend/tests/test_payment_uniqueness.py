"""
P0-A1 regression: a booking must never have more than one payment row.

Without a DB-level UNIQUE constraint on payments.booking_id, the
check-then-insert in PaymentService.create_razorpay_order races: two
concurrent requests both see "no existing payment" and both insert,
charging the customer twice for one booking.
"""
import pytest
from datetime import date, time, timedelta
from uuid import uuid4

from sqlalchemy.exc import IntegrityError

from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.booking import Booking, BookingStatus
from app.models.hardware_tier import HardwareTier
from app.models.payment import Payment, PaymentStatus
from app.core.security import get_password_hash


async def _make_booking(db):
    owner = User(
        id=uuid4(),
        email=f"dup_pay_owner_{uuid4().hex}@test.com",
        full_name="Owner",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True,
    )
    gamer = User(
        id=uuid4(),
        email=f"dup_pay_gamer_{uuid4().hex}@test.com",
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
        name="Duplicate Payment Café",
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
        base_amount=100.0,
        discount_amount=0.0,
        gateway_fee=0.0,
        total_amount=100.0,
        convenience_fee=0.0,
        status=BookingStatus.PENDING_PAYMENT,
    )
    db.add(booking)
    await db.commit()
    return booking


@pytest.mark.asyncio
async def test_second_payment_for_same_booking_is_rejected_by_database(db_session):
    """The database itself must refuse a second payment row for one booking."""
    booking = await _make_booking(db_session)

    db_session.add(Payment(
        id=uuid4(),
        booking_id=booking.id,
        razorpay_order_id=f"order_{uuid4().hex}",
        amount=100.0,
        status=PaymentStatus.CREATED,
    ))
    await db_session.commit()

    # Second payment for the SAME booking — distinct order id, so only a
    # UNIQUE(booking_id) constraint can stop it.
    db_session.add(Payment(
        id=uuid4(),
        booking_id=booking.id,
        razorpay_order_id=f"order_{uuid4().hex}",
        amount=100.0,
        status=PaymentStatus.CREATED,
    ))

    with pytest.raises(IntegrityError):
        await db_session.commit()

    await db_session.rollback()


@pytest.mark.asyncio
async def test_concurrent_order_creation_returns_existing_payment(db_session, monkeypatch):
    """
    The loser of the create-order race must get the existing order back, not a
    500. Simulates the race by making the duplicate check read stale (None)
    while a payment row already exists in the database.
    """
    from app.repositories.payment_repository import PaymentRepository
    from app.repositories.booking_repository import BookingRepository
    from app.services.payment_service import PaymentService

    booking = await _make_booking(db_session)

    winner_order_id = f"order_{uuid4().hex}"
    db_session.add(Payment(
        id=uuid4(),
        booking_id=booking.id,
        razorpay_order_id=winner_order_id,
        amount=100.0,
        status=PaymentStatus.CREATED,
    ))
    await db_session.commit()

    booking_id, gamer_id = booking.id, booking.gamer_id
    payment_repo = PaymentRepository(db_session)
    service = PaymentService(payment_repo, BookingRepository(db_session), db_session)

    # Stale read: the racing request saw no payment before the winner committed.
    stale = {"first": True}
    real_get = payment_repo.get_by_booking_id

    async def stale_get_by_booking_id(booking_id):
        if stale["first"]:
            stale["first"] = False
            return None
        return await real_get(booking_id)

    monkeypatch.setattr(payment_repo, "get_by_booking_id", stale_get_by_booking_id)
    monkeypatch.setattr("app.services.payment_service.settings.RAZORPAY_KEY_ID", "", raising=False)
    monkeypatch.setattr("app.services.payment_service.settings.RAZORPAY_KEY_SECRET", "", raising=False)

    response = await service.create_razorpay_order(booking_id, gamer_id)

    assert response.razorpay_order_id == winner_order_id

    result = await db_session.execute(
        Payment.__table__.select().where(Payment.__table__.c.booking_id == booking_id)
    )
    assert len(result.fetchall()) == 1, "Race must not create a second payment row"
