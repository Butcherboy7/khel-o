"""
Owner "Release Slot" feature: an owner can free a still-PENDING_PAYMENT
booking's held seat before the natural 15-minute TTL, without waiting.

The dangerous part is the race with Razorpay: a customer's payment can
still succeed (webhook or client verify_payment arriving late) after the
owner has released the slot and someone else may have rebooked it. This
must never confirm the released booking — it must refund the captured
payment and leave the booking auditable (released_by/released_at/
release_reason persisted, never deleted), following the exact same
refund path already used for TTL-expired late payments.
"""
import hashlib
import hmac
import json
from datetime import date, time, timedelta, datetime, timezone
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.core.exceptions import ValidationException
from app.config import settings
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.booking import Booking, BookingStatus
from app.models.hardware_tier import HardwareTier
from app.models.payment import Payment, PaymentStatus
from app.core.security import get_password_hash
from app.repositories.payment_repository import PaymentRepository
from app.repositories.booking_repository import BookingRepository
from app.services.payment_service import PaymentService
from app.schemas.payment import PaymentVerifyRequest
from tests.conftest import auth_headers
from app.main import app


class _FakeRazorpayResponse:
    def __init__(self, body: dict):
        self._body = json.dumps(body).encode("utf-8")

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def _install_fake_razorpay_refund(monkeypatch, call_log):
    def fake_urlopen(req, timeout=10):
        call_log.append(req.full_url)
        return _FakeRazorpayResponse({"id": f"rfnd_{uuid4().hex[:10]}", "status": "processed"})

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)


async def _make_pending_booking(db, amount=100.0, minutes_ago=1, with_payment=True):
    owner = User(
        id=uuid4(), email=f"release_owner_{uuid4().hex}@test.com", full_name="Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    other_owner = User(
        id=uuid4(), email=f"release_other_owner_{uuid4().hex}@test.com", full_name="Other Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    gamer = User(
        id=uuid4(), email=f"release_gamer_{uuid4().hex}@test.com", full_name="Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    db.add_all([owner, other_owner, gamer])
    await db.flush()
    db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    db.add(UserRoleMapping(id=uuid4(), user_id=other_owner.id, role=UserRole.CAFE_OWNER))
    db.add(UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER))

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Release Test Cafe", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(21, 0), bookable_stations=1,
    )
    db.add(cafe)

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Standard", specs={"gpu": "RTX 3060"},
        price_per_hour=100.0, total_seats=1, app_bookable_seats=1, active_seats_count=1, is_active=True,
    )
    db.add(tier)

    created_at = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    booking = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today() + timedelta(days=1),
        start_time=time(10, 0), end_time=time(11, 0), duration_hours=1.0,
        base_amount=amount, discount_amount=0.0, gateway_fee=0.0, total_amount=amount,
        convenience_fee=0.0, status=BookingStatus.PENDING_PAYMENT, created_at=created_at,
    )
    db.add(booking)

    payment = None
    if with_payment:
        payment = Payment(
            id=uuid4(), booking_id=booking.id, razorpay_order_id=f"order_{uuid4().hex}",
            amount=amount, status=PaymentStatus.CREATED,
        )
        db.add(payment)

    await db.commit()
    return owner, other_owner, gamer, cafe, tier, booking, payment


def _payment_service(db):
    return PaymentService(PaymentRepository(db), BookingRepository(db), db)


@pytest.mark.asyncio
async def test_owner_can_release_own_pending_booking(db_session):
    owner, _other, _gamer, _cafe, _tier, booking, _payment = await _make_pending_booking(db_session)

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/owner/bookings/{booking.id}/release",
            json={"reason": "Customer walked away without paying"},
            headers=auth_headers(owner),
        )
        assert res.status_code == 200, res.text
        data = res.json()["data"]["booking"]
        assert data["status"] == "released_by_owner"

    await db_session.refresh(booking)
    assert booking.status == BookingStatus.RELEASED_BY_OWNER
    assert booking.released_by == owner.id
    assert booking.released_at is not None
    assert booking.release_reason == "Customer walked away without paying"


@pytest.mark.asyncio
async def test_admin_can_release_any_cafes_pending_booking(db_session):
    """Admin override — must work even though the admin doesn't own the café."""
    _owner, _other, gamer, _cafe, _tier, booking, _payment = await _make_pending_booking(db_session)
    admin = User(
        id=uuid4(), email=f"release_admin_{uuid4().hex}@test.com", full_name="Admin",
        password_hash=get_password_hash("testpass123"), role=UserRole.ADMIN, is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/admin/bookings/{booking.id}/release",
            json={"reason": "Support ticket #42"},
            headers=auth_headers(admin, is_admin=True),
        )
        assert res.status_code == 200, res.text
        assert res.json()["data"]["booking"]["status"] == "released_by_owner"

    await db_session.refresh(booking)
    assert booking.status == BookingStatus.RELEASED_BY_OWNER
    assert booking.released_by == admin.id
    assert booking.release_reason == "Support ticket #42"

    from sqlalchemy import select as _select
    from app.models.admin_audit_log import AdminAuditLog
    audit = (await db_session.execute(
        _select(AdminAuditLog).where(AdminAuditLog.entity_id == str(booking.id))
    )).scalars().first()
    assert audit is not None
    assert audit.action == "booking.release"


@pytest.mark.asyncio
async def test_owner_cannot_release_someone_elses_cafe_booking(db_session):
    _owner, other_owner, _gamer, _cafe, _tier, booking, _payment = await _make_pending_booking(db_session)

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/owner/bookings/{booking.id}/release",
            json={},
            headers=auth_headers(other_owner),
        )
        assert res.status_code == 403, res.text


@pytest.mark.asyncio
async def test_cannot_release_a_confirmed_booking(db_session):
    owner, _other, _gamer, _cafe, _tier, booking, _payment = await _make_pending_booking(db_session)
    booking.status = BookingStatus.CONFIRMED
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/owner/bookings/{booking.id}/release",
            json={},
            headers=auth_headers(owner),
        )
        assert res.status_code == 400, res.text

    await db_session.refresh(booking)
    assert booking.status == BookingStatus.CONFIRMED, "A confirmed (paid) booking must never be released"


@pytest.mark.asyncio
async def test_released_booking_stops_counting_toward_capacity(db_session):
    _owner, _other, _gamer, _cafe, tier, booking, _payment = await _make_pending_booking(db_session)
    repo = BookingRepository(db_session)

    before = await repo.get_overlapping_bookings_count(
        tier_id=tier.id, session_date=booking.session_date,
        start_time=booking.start_time, end_time=booking.end_time,
    )
    assert before == 1

    booking.status = BookingStatus.RELEASED_BY_OWNER
    await db_session.commit()

    after = await repo.get_overlapping_bookings_count(
        tier_id=tier.id, session_date=booking.session_date,
        start_time=booking.start_time, end_time=booking.end_time,
    )
    assert after == 0


@pytest.mark.asyncio
async def test_late_verify_payment_after_release_refunds_not_confirms(db_session, monkeypatch):
    """Owner released the slot; the customer's Razorpay payment still succeeds
    and their browser calls verify_payment after that. Must refund, never
    confirm — someone else may already hold this slot."""
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "real-secret-key")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "rzp_test_real")
    call_log = []
    _install_fake_razorpay_refund(monkeypatch, call_log)

    owner, _other, gamer, _cafe, _tier, booking, payment = await _make_pending_booking(db_session, minutes_ago=1)

    booking.status = BookingStatus.RELEASED_BY_OWNER
    booking.released_by = owner.id
    booking.released_at = datetime.now(timezone.utc)
    booking.release_reason = "Released by owner"
    await db_session.commit()

    service = _payment_service(db_session)
    razorpay_payment_id = f"pay_{uuid4().hex}"
    message = f"{payment.razorpay_order_id}|{razorpay_payment_id}"
    valid_signature = hmac.new(b"real-secret-key", message.encode("utf-8"), hashlib.sha256).hexdigest()

    payload = PaymentVerifyRequest(
        razorpay_order_id=payment.razorpay_order_id,
        razorpay_payment_id=razorpay_payment_id,
        razorpay_signature=valid_signature,
    )

    with pytest.raises(ValidationException) as exc_info:
        await service.verify_payment(payload, gamer_id=gamer.id)
    assert exc_info.value.error_code == "SLOT_RELEASED_REFUNDED"

    await db_session.refresh(payment)
    await db_session.refresh(booking)
    assert payment.status == PaymentStatus.REFUNDED
    assert payment.refund_id is not None
    assert len(call_log) == 1
    assert booking.status != BookingStatus.CONFIRMED
    assert booking.released_by == owner.id, "released_by/at/reason must survive the refund resolution"


@pytest.mark.asyncio
async def test_late_webhook_after_release_refunds_not_confirms(db_session, monkeypatch):
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", "whsec_real")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "real-secret-key")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "rzp_test_real")
    call_log = []
    _install_fake_razorpay_refund(monkeypatch, call_log)

    owner, _other, _gamer, _cafe, _tier, booking, payment = await _make_pending_booking(db_session, minutes_ago=1)

    booking.status = BookingStatus.RELEASED_BY_OWNER
    booking.released_by = owner.id
    booking.released_at = datetime.now(timezone.utc)
    booking.release_reason = "Released by owner"
    await db_session.commit()

    service = _payment_service(db_session)
    razorpay_payment_id = f"pay_{uuid4().hex}"
    body = json.dumps({
        "event": "payment.captured",
        "payload": {"payment": {"entity": {"order_id": payment.razorpay_order_id, "id": razorpay_payment_id}}},
    }).encode("utf-8")
    signature = hmac.new(b"whsec_real", body, hashlib.sha256).hexdigest()

    result = await service.handle_webhook(raw_body_bytes=body, signature=signature)
    assert result["status"] == "released_refunded"

    await db_session.refresh(payment)
    await db_session.refresh(booking)
    assert payment.status == PaymentStatus.REFUNDED
    assert payment.refund_id is not None
    assert len(call_log) == 1
    assert booking.status != BookingStatus.CONFIRMED
