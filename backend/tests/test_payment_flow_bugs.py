"""
Test payment flow bugs - Razorpay modal, cancellation rules, Share Pass gating
"""
import pytest
from datetime import datetime, timedelta, date, time
from httpx import AsyncClient
from uuid import uuid4
from datetime import timezone

from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.booking import Booking, BookingStatus
from app.models.hardware_tier import HardwareTier
from app.models.payment import Payment, PaymentStatus
from app.core.security import get_password_hash
from tests.conftest import auth_headers
from app.main import app

IST = timezone(timedelta(hours=5, minutes=30))


@pytest.mark.asyncio
async def test_pending_payment_booking_can_be_cancelled_immediately(db_session):
    """
    Bug B Fix: A booking with payment_status = PENDING must be cancellable immediately
    with no time window restriction, since no money was captured.
    """
    owner = User(
        id=uuid4(),
        email=f"cancel_pending_owner_{uuid4().hex}@test.com",
        full_name="Owner",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True
    )
    gamer = User(
        id=uuid4(),
        email=f"cancel_pending_gamer_{uuid4().hex}@test.com",
        full_name="Gamer",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.GAMER,
        is_active=True
    )
    db_session.add_all([owner, gamer])
    await db_session.flush()
    
    db_session.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    db_session.add(UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER))
    
    cafe = Cafe(
        id=uuid4(),
        owner_id=owner.id,
        name="Cancel Test Café",
        address_line1="123 Test St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        opening_time=time(9, 0),
        closing_time=time(21, 0),
        bookable_stations=10
    )
    db_session.add(cafe)
    
    tier = HardwareTier(
        id=uuid4(),
        cafe_id=cafe.id,
        name="Standard",
        specs={"gpu": "RTX 3060"},
        price_per_hour=100.0,
        total_seats=10,
        app_bookable_seats=10,
        active_seats_count=10,
        is_active=True
    )
    db_session.add(tier)
    
    # Create booking starting in 30 minutes (less than 2 hours)
    tomorrow = date.today() + timedelta(days=1)
    now_ist = datetime.now(IST)
    slot_time = time(now_ist.hour, 30)  # 30 minutes from now
    
    booking = Booking(
        id=uuid4(),
        booking_reference=f"GC-{uuid4().hex[:8].upper()}",
        gamer_id=gamer.id,
        cafe_id=cafe.id,
        hardware_tier_id=tier.id,
        session_date=tomorrow,
        start_time=slot_time,
        end_time=time((now_ist.hour + 1) % 24, 30),
        duration_hours=1.0,
        base_amount=100.0,
        discount_amount=0.0,
        gateway_fee=0.0,
        total_amount=100.0,
        convenience_fee=0.0,
        status=BookingStatus.PENDING_PAYMENT  # Unpaid booking
    )
    db_session.add(booking)
    
    # Create payment with PENDING status
    payment = Payment(
        id=uuid4(),
        booking_id=booking.id,
        razorpay_order_id=f"order_{uuid4().hex}",
        amount=100.0,
        status=PaymentStatus.CREATED  # Unpaid
    )
    db_session.add(payment)
    
    await db_session.commit()
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        gamer_headers = auth_headers(gamer)
        
        # Cancel booking with < 2 hours to session
        cancel_resp = await client.post(
            f"/api/v1/bookings/{booking.id}/cancel",
            headers=gamer_headers
        )
        
        assert cancel_resp.status_code == 200, f"Unpaid booking should be cancellable: {cancel_resp.json()}"
        data = cancel_resp.json()["data"]["booking"]
        assert data["status"] == "cancelled"


@pytest.mark.asyncio
async def test_failed_payment_booking_can_be_cancelled_immediately(db_session):
    """
    Bug B Fix: A booking with status=FAILED must be cancellable immediately
    with no time window restriction.
    """
    owner = User(
        id=uuid4(),
        email=f"cancel_failed_owner_{uuid4().hex}@test.com",
        full_name="Owner",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True
    )
    gamer = User(
        id=uuid4(),
        email=f"cancel_failed_gamer_{uuid4().hex}@test.com",
        full_name="Gamer",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.GAMER,
        is_active=True
    )
    db_session.add_all([owner, gamer])
    await db_session.flush()
    
    db_session.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    db_session.add(UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER))
    
    cafe = Cafe(
        id=uuid4(),
        owner_id=owner.id,
        name="Failed Payment Café",
        address_line1="123 Test St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        opening_time=time(9, 0),
        closing_time=time(21, 0),
        bookable_stations=10
    )
    db_session.add(cafe)
    
    tier = HardwareTier(
        id=uuid4(),
        cafe_id=cafe.id,
        name="Standard",
        specs={"gpu": "RTX 3060"},
        price_per_hour=100.0,
        total_seats=10,
        app_bookable_seats=10,
        active_seats_count=10,
        is_active=True
    )
    db_session.add(tier)
    
    tomorrow = date.today() + timedelta(days=1)
    now_ist = datetime.now(IST)
    slot_time = time(now_ist.hour, 30)
    
    booking = Booking(
        id=uuid4(),
        booking_reference=f"GC-{uuid4().hex[:8].upper()}",
        gamer_id=gamer.id,
        cafe_id=cafe.id,
        hardware_tier_id=tier.id,
        session_date=tomorrow,
        start_time=slot_time,
        end_time=time((now_ist.hour + 1) % 24, 30),
        duration_hours=1.0,
        base_amount=100.0,
        discount_amount=0.0,
        gateway_fee=0.0,
        total_amount=100.0,
        convenience_fee=0.0,
        status=BookingStatus.FAILED  # Failed payment
    )
    db_session.add(booking)
    
    await db_session.commit()
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        gamer_headers = auth_headers(gamer)
        
        cancel_resp = await client.post(
            f"/api/v1/bookings/{booking.id}/cancel",
            headers=gamer_headers
        )
        
        assert cancel_resp.status_code == 200, f"Failed booking should be cancellable: {cancel_resp.json()}"


@pytest.mark.asyncio
async def test_confirmed_booking_rejects_cancellation_under_2_hours(db_session):
    """
    Regression check: Paid bookings (CONFIRMED) must still respect 2-hour cancellation window.
    """
    owner = User(
        id=uuid4(),
        email=f"cancel_confirmed_owner_{uuid4().hex}@test.com",
        full_name="Owner",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True
    )
    gamer = User(
        id=uuid4(),
        email=f"cancel_confirmed_gamer_{uuid4().hex}@test.com",
        full_name="Gamer",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.GAMER,
        is_active=True
    )
    db_session.add_all([owner, gamer])
    await db_session.flush()
    
    db_session.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    db_session.add(UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER))
    
    cafe = Cafe(
        id=uuid4(),
        owner_id=owner.id,
        name="Confirmed Café",
        address_line1="123 Test St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        opening_time=time(9, 0),
        closing_time=time(21, 0),
        bookable_stations=10
    )
    db_session.add(cafe)
    
    tier = HardwareTier(
        id=uuid4(),
        cafe_id=cafe.id,
        name="Standard",
        specs={"gpu": "RTX 3060"},
        price_per_hour=100.0,
        total_seats=10,
        app_bookable_seats=10,
        active_seats_count=10,
        is_active=True
    )
    db_session.add(tier)
    
    tomorrow = date.today()  # Today, not tomorrow
    now_ist = datetime.now(IST)
    slot_hour = (now_ist.hour + 1) % 24  # 1 hour from now (within 2-hour window)
    slot_time = time(slot_hour, 0)
    
    booking = Booking(
        id=uuid4(),
        booking_reference=f"GC-{uuid4().hex[:8].upper()}",
        gamer_id=gamer.id,
        cafe_id=cafe.id,
        hardware_tier_id=tier.id,
        session_date=tomorrow,
        start_time=slot_time,
        end_time=time((now_ist.hour + 1) % 24, 30),
        duration_hours=1.0,
        base_amount=100.0,
        discount_amount=0.0,
        gateway_fee=0.0,
        total_amount=100.0,
        convenience_fee=0.0,
        status=BookingStatus.CONFIRMED,  # Paid booking
        qr_code_url="https://example.com/qr.png"
    )
    db_session.add(booking)
    
    await db_session.commit()
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        gamer_headers = auth_headers(gamer)
        
        cancel_resp = await client.post(
            f"/api/v1/bookings/{booking.id}/cancel",
            headers=gamer_headers
        )
        
        # Should be rejected
        assert cancel_resp.status_code == 422
        assert "CANCELLATION_WINDOW_EXPIRED" in cancel_resp.json().get("error", {}).get("code", "")
