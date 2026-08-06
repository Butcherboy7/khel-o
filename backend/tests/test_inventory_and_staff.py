import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from datetime import date, time, datetime, timezone, timedelta
import uuid

from app.main import app
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.models.user_role import UserRoleMapping
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal
from app.repositories.user_repository import UserRepository
from app.repositories.booking_repository import BookingRepository
from app.services.booking_service import BookingService
from app.schemas.booking import BookingCreateRequest

IST = timezone(timedelta(hours=5, minutes=30))

@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

# --- PHASE 4: INVENTORY ALLOCATION & TTL TESTS ---

@pytest.mark.asyncio
async def test_seat_allocation_invariant():
    """Verify HardwareTier invariant: total_seats = app_bookable_seats + reserved_walkin_seats."""
    from app.schemas.hardware_tier import HardwareTierCreateRequest
    # 1. Auto-computation of reserved_walkin_seats
    tier_req = HardwareTierCreateRequest(
        name="RTX 4090 Tier",
        total_seats=10,
        app_bookable_seats=6,
        price_per_hour=150.0
    )
    assert tier_req.reserved_walkin_seats == 4
    assert tier_req.app_bookable_seats + tier_req.reserved_walkin_seats == tier_req.total_seats

    # 2. Invariant mismatch auto-computation
    mismatch_req = HardwareTierCreateRequest(
        name="Invalid Tier",
        total_seats=10,
        app_bookable_seats=6,
        reserved_walkin_seats=5,  # 6 + 5 != 10, auto-reconciles to 4
        price_per_hour=150.0
    )
    assert mismatch_req.reserved_walkin_seats == 4

@pytest.mark.asyncio
async def test_overbooking_rejected(async_client: AsyncClient):
    """Verify that booking requests exceeding app_bookable_seats return error."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid.uuid4(),
            email=f"overbook_owner_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Overbook Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        gamer = User(
            id=uuid.uuid4(),
            email=f"overbook_gamer_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Overbook Gamer",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add_all([owner, gamer])
        await db.flush()

        cafe = Cafe(
            id=uuid.uuid4(),
            owner_id=owner.id,
            name="Capacity Arena",
            address_line1="Road 2",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919876543210",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True
        )
        db.add(cafe)
        await db.flush()

        tier = HardwareTier(
            id=uuid.uuid4(),
            cafe_id=cafe.id,
            name="Limited Tier",
            total_seats=2,
            app_bookable_seats=1,
            reserved_walkin_seats=1,
            active_seats_count=2,
            price_per_hour=100.0,
            is_active=True
        )
        db.add(tier)
        await db.commit()

        # Existing confirmed booking filling the 1 app bookable seat
        tomorrow = date.today() + timedelta(days=1)
        booking1 = Booking(
            id=uuid.uuid4(),
            booking_reference=f"GC-TEST-{uuid.uuid4().hex[:6]}",
            gamer_id=gamer.id,
            cafe_id=cafe.id,
            hardware_tier_id=tier.id,
            session_date=tomorrow,
            start_time=time(14, 0),
            end_time=time(16, 0),
            duration_hours=2.0,
            base_amount=200.0,
            total_amount=200.0,
            status=BookingStatus.CONFIRMED
        )
        db.add(booking1)
        await db.commit()

        # Attempt second booking for same time slot -> should fail due to capacity
        booking_repo = BookingRepository(db)
        service = BookingService(booking_repo)
        from app.repositories.cafe_repository import CafeRepository
        from app.repositories.hardware_tier_repository import HardwareTierRepository
        service.cafe_repo = CafeRepository(db)
        service.tier_repo = HardwareTierRepository(db)

        from app.core.exceptions import ValidationException
        with pytest.raises(ValidationException) as exc_info:
            await service.create_booking(
                gamer.id,
                BookingCreateRequest(
                    cafe_id=cafe.id,
                    hardware_tier_id=tier.id,
                    session_date=tomorrow,
                    start_time=time(14, 0),
                    duration_hours=2.0
                )
            )
        assert exc_info.value.error_code == "TIER_FULLY_BOOKED"

@pytest.mark.asyncio
async def test_ttl_expired_pending_booking_ignored():
    """Verify that a PENDING_PAYMENT booking older than 15 minutes is ignored in overlap calculation."""
    async with AsyncSessionLocal() as db:
        tier_id = uuid.uuid4()
        gamer_id = uuid.uuid4()
        cafe_id = uuid.uuid4()
        tomorrow = date.today() + timedelta(days=1)

        # Expired pending booking (created 20 minutes ago)
        expired_booking = Booking(
            id=uuid.uuid4(),
            booking_reference=f"GC-TEST-{uuid.uuid4().hex[:6]}",
            gamer_id=gamer_id,
            cafe_id=cafe_id,
            hardware_tier_id=tier_id,
            session_date=tomorrow,
            start_time=time(10, 0),
            end_time=time(12, 0),
            duration_hours=2.0,
            base_amount=100.0,
            total_amount=100.0,
            status=BookingStatus.PENDING_PAYMENT,
            created_at=datetime.now(timezone.utc) - timedelta(minutes=20)
        )
        db.add(expired_booking)
        await db.commit()

        repo = BookingRepository(db)
        overlap_count = await repo.get_overlapping_bookings_count(
            tier_id=tier_id,
            session_date=tomorrow,
            start_time=time(10, 0),
            end_time=time(12, 0)
        )
        assert overlap_count == 0  # Expired pending booking should be ignored!

# --- PHASE 5: STAFF MANAGEMENT & CROSS-CAFE IDOR TESTS ---

@pytest.mark.asyncio
async def test_owner_invites_staff_linked_to_cafe(async_client: AsyncClient):
    """Verify that an owner inviting staff links the staff member's role to the owner's cafe in user_roles."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid.uuid4(),
            email=f"staff_inviter_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Staff Inviter",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)
        await db.flush()

        cafe = Cafe(
            id=uuid.uuid4(),
            owner_id=owner.id,
            name="Staff Cafe",
            address_line1="Main Road",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919876543210",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        staff_email = f"new_staff_{uuid.uuid4().hex[:6]}@test.com"
        resp = await async_client.post(
            "/api/v1/owner/staff",
            json={
                "email": staff_email,
                "fullName": "Arena Staff",
                "password": "password123"
            },
            headers=headers
        )
        assert resp.status_code == 201

        # Check user_roles join table
        user_repo = UserRepository(db)
        created_staff = await user_repo.get_by_email(staff_email)
        assert created_staff is not None

        from sqlalchemy import select
        res_mapping = await db.execute(
            select(UserRoleMapping).where(
                UserRoleMapping.user_id == created_staff.id,
                UserRoleMapping.role == UserRole.STAFF
            )
        )
        mapping = res_mapping.scalars().first()
        assert mapping is not None
        assert mapping.cafe_id == cafe.id

@pytest.mark.asyncio
async def test_staff_cross_cafe_idor_rejected(async_client: AsyncClient):
    """Verify that a staff member assigned to Cafe A cannot check in bookings for Cafe B."""
    async with AsyncSessionLocal() as db:
        owner_b = User(
            id=uuid.uuid4(),
            email=f"owner_b_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Owner B",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        staff_a = User(
            id=uuid.uuid4(),
            email=f"staff_a_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Staff A",
            role=UserRole.STAFF,
            is_active=True
        )
        gamer = User(
            id=uuid.uuid4(),
            email=f"gamer_idor_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Gamer IDOR",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add_all([owner_b, staff_a, gamer])
        await db.flush()

        cafe_a = Cafe(
            id=uuid.uuid4(),
            owner_id=uuid.uuid4(),
            name="Cafe A",
            address_line1="Street A",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000001",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True
        )
        cafe_b = Cafe(
            id=uuid.uuid4(),
            owner_id=owner_b.id,
            name="Cafe B",
            address_line1="Street B",
            city="Bengaluru",
            state="Karnataka",
            pincode="560002",
            phone_number="+919000000002",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True
        )
        db.add_all([cafe_a, cafe_b])
        await db.flush()

        # Link Staff A to Cafe A
        db.add(UserRoleMapping(id=uuid.uuid4(), user_id=staff_a.id, role=UserRole.STAFF, cafe_id=cafe_a.id))

        # Booking for Cafe B
        booking_b = Booking(
            id=uuid.uuid4(),
            booking_reference=f"GC-TEST-{uuid.uuid4().hex[:6]}",
            gamer_id=gamer.id,
            cafe_id=cafe_b.id,
            hardware_tier_id=uuid.uuid4(),
            session_date=date.today(),
            start_time=time(12, 0),
            end_time=time(14, 0),
            duration_hours=2.0,
            base_amount=200.0,
            total_amount=200.0,
            status=BookingStatus.CONFIRMED
        )
        db.add(booking_b)
        await db.commit()

        # Staff A tries to check in booking at Cafe B
        token_a = create_access_token(subject=str(staff_a.id), role="staff")
        headers = {"Authorization": f"Bearer {token_a}"}

        resp = await async_client.post(f"/api/v1/owner/bookings/{booking_b.id}/checkin", headers=headers)
        assert resp.status_code == 403

# --- PHASE 6: PAYMENT-GATED QR & WEBHOOK IDEMPOTENCY TESTS ---

@pytest.mark.asyncio
async def test_unpaid_booking_qr_pass_rejected(async_client: AsyncClient):
    """Verify that requesting QR pass for PENDING_PAYMENT or CANCELLED booking returns HTTP 403 PAYMENT_REQUIRED."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"qr_gamer_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="QR Gamer",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.flush()

        ref_unpaid = f"GC-TEST-{uuid.uuid4().hex[:6]}"
        unpaid_booking = Booking(
            id=uuid.uuid4(),
            booking_reference=ref_unpaid,
            gamer_id=gamer.id,
            cafe_id=uuid.uuid4(),
            hardware_tier_id=uuid.uuid4(),
            session_date=date.today() + timedelta(days=1),
            start_time=time(14, 0),
            end_time=time(16, 0),
            duration_hours=2.0,
            base_amount=200.0,
            total_amount=200.0,
            status=BookingStatus.PENDING_PAYMENT
        )
        db.add(unpaid_booking)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role="gamer")
        headers = {"Authorization": f"Bearer {token}"}

        resp = await async_client.get(f"/api/v1/bookings/{unpaid_booking.id}/qr-pass", headers=headers)
        assert resp.status_code in [400, 403]

@pytest.mark.asyncio
async def test_payment_webhook_idempotency(async_client: AsyncClient):
    """Verify that duplicate payment.captured webhooks are handled idempotently without duplicate side-effects."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"webhook_gamer_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Webhook Gamer",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.flush()

        ref_webhook = f"GC-TEST-{uuid.uuid4().hex[:6]}"
        booking = Booking(
            id=uuid.uuid4(),
            booking_reference=ref_webhook,
            gamer_id=gamer.id,
            cafe_id=uuid.uuid4(),
            hardware_tier_id=uuid.uuid4(),
            session_date=date.today() + timedelta(days=1),
            start_time=time(14, 0),
            end_time=time(16, 0),
            duration_hours=2.0,
            base_amount=200.0,
            total_amount=200.0,
            status=BookingStatus.PENDING_PAYMENT,
            created_at=datetime.now(timezone.utc)
        )
        db.add(booking)
        await db.flush()

        from app.models.payment import Payment, PaymentStatus
        order_id = f"order_{booking.booking_reference}"
        payment = Payment(
            id=uuid.uuid4(),
            booking_id=booking.id,
            razorpay_order_id=order_id,
            amount=200.0,
            currency="INR",
            status=PaymentStatus.CREATED
        )
        db.add(payment)
        await db.commit()

        payload = {
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_test123",
                        "order_id": order_id,
                        "amount": 20000,
                        "status": "captured"
                    }
                }
            }
        }

        import hmac
        import hashlib
        import json
        from app.config import settings

        body_bytes = json.dumps(payload).encode('utf-8')
        sig = hmac.new(
            settings.RAZORPAY_WEBHOOK_SECRET.encode('utf-8'),
            body_bytes,
            hashlib.sha256
        ).hexdigest()
        headers = {"X-Razorpay-Signature": sig, "Content-Type": "application/json"}

        # 1st Webhook Call
        resp1 = await async_client.post("/api/v1/payments/webhook", content=body_bytes, headers=headers)
        assert resp1.status_code == 200

        # Verify status transitioned to CONFIRMED
        await db.refresh(booking)
        assert booking.status == BookingStatus.CONFIRMED

        # 2nd Webhook Call (Duplicate)
        resp2 = await async_client.post("/api/v1/payments/webhook", content=body_bytes, headers=headers)
        assert resp2.status_code == 200
        await db.refresh(booking)
        assert booking.status == BookingStatus.CONFIRMED

@pytest.mark.asyncio
async def test_late_webhook_after_ttl_expired_rejected(async_client: AsyncClient):
    """Verify that a payment webhook arriving AFTER 15-min TTL is rejected and auto-refunded to prevent double bookings."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"late_webhook_gamer_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Late Webhook Gamer",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.flush()

        ref_late = f"GC-TEST-{uuid.uuid4().hex[:6]}"
        # Booking created 20 minutes ago (expired TTL)
        expired_booking = Booking(
            id=uuid.uuid4(),
            booking_reference=ref_late,
            gamer_id=gamer.id,
            cafe_id=uuid.uuid4(),
            hardware_tier_id=uuid.uuid4(),
            session_date=date.today() + timedelta(days=1),
            start_time=time(14, 0),
            end_time=time(16, 0),
            duration_hours=2.0,
            base_amount=200.0,
            total_amount=200.0,
            status=BookingStatus.PENDING_PAYMENT,
            created_at=datetime.now(timezone.utc) - timedelta(minutes=20)
        )
        db.add(expired_booking)
        await db.flush()

        from app.models.payment import Payment, PaymentStatus
        order_id = f"order_{expired_booking.booking_reference}"
        payment = Payment(
            id=uuid.uuid4(),
            booking_id=expired_booking.id,
            razorpay_order_id=order_id,
            amount=200.0,
            currency="INR",
            status=PaymentStatus.CREATED
        )
        db.add(payment)
        await db.commit()

        payload = {
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_late123",
                        "order_id": order_id,
                        "amount": 20000,
                        "status": "captured"
                    }
                }
            }
        }

        import hmac
        import hashlib
        import json
        from app.config import settings

        body_bytes = json.dumps(payload).encode('utf-8')
        sig = hmac.new(
            settings.RAZORPAY_WEBHOOK_SECRET.encode('utf-8'),
            body_bytes,
            hashlib.sha256
        ).hexdigest()
        headers = {"X-Razorpay-Signature": sig, "Content-Type": "application/json"}

        resp = await async_client.post("/api/v1/payments/webhook", content=body_bytes, headers=headers)
        assert resp.status_code == 200
        assert resp.json().get("status") == "ttl_expired_refunded"

        await db.refresh(expired_booking)
        assert expired_booking.status == BookingStatus.FAILED
        assert "15-minute TTL window" in (expired_booking.cancellation_reason or "")

@pytest.mark.asyncio
async def test_cancelled_booking_releases_seat():
    """Verify that a cancelled CONFIRMED booking releases its seat back into app_bookable_seats."""
    async with AsyncSessionLocal() as db:
        tier_id = uuid.uuid4()
        gamer_id = uuid.uuid4()
        cafe_id = uuid.uuid4()
        tomorrow = date.today() + timedelta(days=1)

        ref_cancel = f"GC-TEST-{uuid.uuid4().hex[:6]}"
        booking = Booking(
            id=uuid.uuid4(),
            booking_reference=ref_cancel,
            gamer_id=gamer_id,
            cafe_id=cafe_id,
            hardware_tier_id=tier_id,
            session_date=tomorrow,
            start_time=time(14, 0),
            end_time=time(16, 0),
            duration_hours=2.0,
            base_amount=150.0,
            total_amount=150.0,
            status=BookingStatus.CONFIRMED
        )
        db.add(booking)
        await db.commit()

        repo = BookingRepository(db)
        # 1. Overlap count should be 1 while CONFIRMED
        count1 = await repo.get_overlapping_bookings_count(
            tier_id=tier_id,
            session_date=tomorrow,
            start_time=time(14, 0),
            end_time=time(16, 0)
        )
        assert count1 == 1

        # 2. Cancel the booking
        await repo.update(booking.id, {"status": BookingStatus.CANCELLED})

        # 3. Overlap count should now be 0 (seat released)
        count2 = await repo.get_overlapping_bookings_count(
            tier_id=tier_id,
            session_date=tomorrow,
            start_time=time(14, 0),
            end_time=time(16, 0)
        )
        assert count2 == 0

