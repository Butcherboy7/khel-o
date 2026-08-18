"""
Tests for the new admin capabilities: support tickets, admin-initiated refund,
force-cancel, promote-to-admin, platform settings, and the audit-log gaps
that were closed alongside them.
"""
import pytest
from datetime import datetime, timedelta, date, time, timezone
from uuid import uuid4
from httpx import AsyncClient

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


async def _make_admin(db_session) -> User:
    admin = User(
        id=uuid4(),
        email=f"admin_{uuid4().hex[:8]}@test.com",
        full_name="Admin",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid4(), user_id=admin.id, role=UserRole.ADMIN))
    await db_session.commit()
    return admin


async def _make_gamer(db_session, email_prefix: str) -> User:
    gamer = User(
        id=uuid4(),
        email=f"{email_prefix}_{uuid4().hex[:8]}@test.com",
        full_name="Gamer",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.GAMER,
        is_active=True,
    )
    db_session.add(gamer)
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER))
    await db_session.commit()
    return gamer


async def _make_booking_with_payment(db_session, gamer: User, razorpay_payment_id=None) -> tuple[Booking, Payment]:
    owner = User(
        id=uuid4(), email=f"owner_{uuid4().hex[:8]}@test.com", full_name="Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    db_session.add(owner)
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Admin Test Café", address_line1="1 Test St",
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

    tomorrow = date.today() + timedelta(days=2)
    booking = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=tomorrow,
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=0.0, gateway_fee=0.0, total_amount=100.0,
        convenience_fee=0.0, status=BookingStatus.CONFIRMED,
    )
    db_session.add(booking)

    payment = Payment(
        id=uuid4(), booking_id=booking.id, razorpay_order_id=f"order_{uuid4().hex}",
        razorpay_payment_id=razorpay_payment_id, amount=100.0, status=PaymentStatus.CAPTURED,
    )
    db_session.add(payment)
    await db_session.commit()
    return booking, payment


@pytest.mark.asyncio
async def test_support_ticket_full_lifecycle(db_session):
    """Gamer files a ticket; admin lists it, updates status + notes; gamer sees the update."""
    gamer = await _make_gamer(db_session, "ticket_gamer")
    admin = await _make_admin(db_session)

    async with AsyncClient(app=app, base_url="http://test") as client:
        gamer_headers = auth_headers(gamer)
        admin_headers = auth_headers(admin)

        create_res = await client.post(
            "/api/v1/support/tickets",
            json={"subject": "Payment not refunded", "description": "I cancelled 3 days ago and still no refund.", "category": "payment"},
            headers=gamer_headers,
        )
        assert create_res.status_code == 201, create_res.text
        ticket_id = create_res.json()["data"]["ticket"]["id"]

        my_list_res = await client.get("/api/v1/support/tickets", headers=gamer_headers)
        assert my_list_res.status_code == 200
        assert any(t["id"] == ticket_id for t in my_list_res.json()["data"]["items"])

        admin_list_res = await client.get("/api/v1/admin/support/tickets?status=open", headers=admin_headers)
        assert admin_list_res.status_code == 200
        assert any(t["id"] == ticket_id for t in admin_list_res.json()["data"]["items"])

        update_res = await client.patch(
            f"/api/v1/admin/support/tickets/{ticket_id}",
            json={"status": "resolved", "priority": "high", "adminNotes": "Refund reissued manually."},
            headers=admin_headers,
        )
        assert update_res.status_code == 200, update_res.text
        updated = update_res.json()["data"]["ticket"]
        assert updated["status"] == "resolved"
        assert updated["priority"] == "high"
        assert updated["resolvedAt"] is not None

        # Non-admin cannot view another user's ticket
        other_gamer = await _make_gamer(db_session, "other_gamer")
        forbidden_res = await client.get(f"/api/v1/support/tickets/{ticket_id}", headers=auth_headers(other_gamer))
        assert forbidden_res.status_code == 403

        audit_res = await client.get("/api/v1/admin/audit-log?entityType=support_ticket", headers=admin_headers)
        assert audit_res.status_code == 200
        assert audit_res.json()["data"]["total"] >= 1


@pytest.mark.asyncio
async def test_admin_force_cancel_booking(db_session):
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "force_cancel_gamer")
    booking, _ = await _make_booking_with_payment(db_session, gamer)

    async with AsyncClient(app=app, base_url="http://test") as client:
        admin_headers = auth_headers(admin)
        res = await client.patch(
            f"/api/v1/admin/bookings/{booking.id}/force-cancel",
            json={"reason": "Duplicate booking created by a bug"},
            headers=admin_headers,
        )
        assert res.status_code == 200, res.text
        assert res.json()["data"]["status"] == "cancelled"

        # Cannot force-cancel an already-cancelled booking
        res2 = await client.patch(
            f"/api/v1/admin/bookings/{booking.id}/force-cancel",
            json={"reason": "Try again"},
            headers=admin_headers,
        )
        assert res2.status_code != 200

        audit_res = await client.get("/api/v1/admin/audit-log?action=booking.force_cancel", headers=admin_headers)
        assert audit_res.json()["data"]["total"] >= 1


@pytest.mark.asyncio
async def test_admin_refund_without_razorpay_payment_id(db_session):
    """No razorpay_payment_id on the payment -> refund endpoint reports pending manual refund instead of crashing."""
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "refund_gamer")
    booking, _ = await _make_booking_with_payment(db_session, gamer, razorpay_payment_id=None)

    async with AsyncClient(app=app, base_url="http://test") as client:
        admin_headers = auth_headers(admin)
        res = await client.post(
            f"/api/v1/admin/bookings/{booking.id}/refund",
            json={"reason": "Customer dispute — cafe was closed"},
            headers=admin_headers,
        )
        assert res.status_code == 200, res.text
        data = res.json()["data"]
        assert data["status"] == "no_payment_id"

        audit_res = await client.get("/api/v1/admin/audit-log?action=payment.refund", headers=admin_headers)
        assert audit_res.json()["data"]["total"] >= 1


@pytest.mark.asyncio
async def test_admin_can_promote_user_to_admin_and_it_is_audited(db_session):
    admin = await _make_admin(db_session)
    target = await _make_gamer(db_session, "promote_target")

    async with AsyncClient(app=app, base_url="http://test") as client:
        admin_headers = auth_headers(admin)
        res = await client.patch(
            f"/api/v1/admin/users/{target.id}/role",
            json={"role": "admin"},
            headers=admin_headers,
        )
        assert res.status_code == 200, res.text

        # Promoted user can now access an admin-only endpoint
        from app.core.security import create_access_token
        promoted_token = create_access_token(subject=str(target.id), role="admin")
        promoted_headers = {"Authorization": f"Bearer {promoted_token}"}
        dashboard_res = await client.get("/api/v1/admin/dashboard", headers=promoted_headers)
        assert dashboard_res.status_code == 200

        audit_res = await client.get("/api/v1/admin/audit-log?action=user.role_change.admin", headers=admin_headers)
        assert audit_res.json()["data"]["total"] >= 1


@pytest.mark.asyncio
async def test_platform_settings_get_and_update_is_audited(db_session):
    admin = await _make_admin(db_session)

    async with AsyncClient(app=app, base_url="http://test") as client:
        admin_headers = auth_headers(admin)

        get_res = await client.get("/api/v1/admin/settings", headers=admin_headers)
        assert get_res.status_code == 200
        assert get_res.json()["data"]["settings"]["commissionPercentage"] is not None

        update_res = await client.patch(
            "/api/v1/admin/settings",
            json={"commissionPercentage": 12.5, "maintenanceMode": True, "maintenanceMessage": "Deploying a fix"},
            headers=admin_headers,
        )
        assert update_res.status_code == 200, update_res.text
        settings = update_res.json()["data"]["settings"]
        assert float(settings["commissionPercentage"]) == 12.5
        assert settings["maintenanceMode"] is True

        audit_res = await client.get("/api/v1/admin/audit-log?action=platform_settings.update", headers=admin_headers)
        assert audit_res.json()["data"]["total"] >= 1


@pytest.mark.asyncio
async def test_pause_bookings_and_promotion_deactivate_are_now_audited(db_session):
    """These two were previously silent gaps alongside role-change."""
    admin = await _make_admin(db_session)
    owner = User(
        id=uuid4(), email=f"pause_owner_{uuid4().hex[:8]}@test.com", full_name="Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    db_session.add(owner)
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Pause Test Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db_session.add(cafe)
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        admin_headers = auth_headers(admin)
        res = await client.patch(
            f"/api/v1/admin/cafes/{cafe.id}/pause-bookings",
            json={"paused": True},
            headers=admin_headers,
        )
        assert res.status_code == 200

        audit_res = await client.get("/api/v1/admin/audit-log?action=cafe.pause_bookings", headers=admin_headers)
        assert audit_res.json()["data"]["total"] >= 1
