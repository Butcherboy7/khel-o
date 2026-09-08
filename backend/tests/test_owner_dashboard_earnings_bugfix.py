"""
Regression test: GET /api/v1/owner/dashboard must never let bookings with a
pending or failed payment contribute to the owner's earnings figures.

Booking.status only ever reaches CONFIRMED (and its later CHECKED_IN/ACTIVE/
COMPLETED states) once payment_service.py has recorded the Razorpay payment
as PaymentStatus.CAPTURED (see verify_payment / handle_webhook) — a booking
still in PENDING_PAYMENT, or one whose payment FAILED (booking moved to
BookingStatus.FAILED), must never be summed into revenueThisMonth or
revenueToday.
"""
import pytest
from datetime import date, time
from uuid import uuid4

from app.main import app
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.models.payment import Payment, PaymentStatus
from app.core.security import get_password_hash
from tests.conftest import auth_headers
from httpx import AsyncClient


async def _make_owner_and_cafe(db_session, suffix: str):
    owner = User(
        id=uuid4(),
        email=f"owner_earn_{suffix}_{uuid4().hex[:8]}@test.com",
        full_name="Owner Earnings",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True,
    )
    db_session.add(owner)
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Earnings Test Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db_session.add(cafe)

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Standard", specs={"gpu": "RTX 3060"},
        price_per_hour=100.0, total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db_session.add(tier)
    await db_session.commit()
    return owner, cafe, tier


def _make_booking(cafe, tier, gamer_id, booking_status, session_date, amount=100.0):
    return Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer_id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=session_date,
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=amount, discount_amount=0.0, gateway_fee=0.0, total_amount=amount,
        convenience_fee=0.0, status=booking_status,
    )


@pytest.mark.asyncio
async def test_dashboard_earnings_exclude_pending_and_failed_bookings(db_session):
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "pf")

    gamer = User(
        id=uuid4(), email=f"gamer_earn_{uuid4().hex[:8]}@test.com", full_name="Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    db_session.add(gamer)
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER))
    await db_session.commit()

    today = date.today()

    # Successfully paid booking today — must count.
    confirmed_booking = _make_booking(cafe, tier, gamer.id, BookingStatus.CONFIRMED, today, amount=150.0)
    db_session.add(confirmed_booking)
    await db_session.flush()
    db_session.add(Payment(
        id=uuid4(), booking_id=confirmed_booking.id, razorpay_order_id=f"order_{uuid4().hex}",
        razorpay_payment_id="pay_confirmed", amount=150.0, status=PaymentStatus.CAPTURED,
    ))

    # Still awaiting payment today — must NOT count.
    pending_booking = _make_booking(cafe, tier, gamer.id, BookingStatus.PENDING_PAYMENT, today, amount=500.0)
    db_session.add(pending_booking)
    await db_session.flush()
    db_session.add(Payment(
        id=uuid4(), booking_id=pending_booking.id, razorpay_order_id=f"order_{uuid4().hex}",
        razorpay_payment_id=None, amount=500.0, status=PaymentStatus.CREATED,
    ))

    # Payment failed today — must NOT count.
    failed_booking = _make_booking(cafe, tier, gamer.id, BookingStatus.FAILED, today, amount=300.0)
    db_session.add(failed_booking)
    await db_session.flush()
    db_session.add(Payment(
        id=uuid4(), booking_id=failed_booking.id, razorpay_order_id=f"order_{uuid4().hex}",
        razorpay_payment_id="pay_failed", amount=300.0, status=PaymentStatus.FAILED,
    ))

    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.get("/api/v1/owner/dashboard", headers=auth_headers(owner))
        assert res.status_code == 200, res.text
        data = res.json()["data"]
        assert data["revenueToday"] == 150.0, (
            f"revenueToday must only include the captured/confirmed booking, got {data['revenueToday']}"
        )
        assert data["revenueThisMonth"] == 150.0, (
            f"revenueThisMonth must only include the captured/confirmed booking, got {data['revenueThisMonth']}"
        )
