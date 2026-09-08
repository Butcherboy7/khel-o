"""Launch-day ledger and role-guard invariants (AE-01, B-03, B-05).

See docs/LAUNCH_QA_PLAN.md Phase 2.

AE-01 asks that GMV, customer payment, KHELO commission, café payable, café
paid and café outstanding all stay distinct, and specifically that no
payment-processing cost is ever counted as café earnings.
"""
import pytest
from uuid import uuid4

from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.payment import Payment, PaymentStatus
from app.models.booking import BookingStatus
from app.core.security import get_password_hash
from app.core.time import now_ist
from tests.conftest import auth_headers
from tests.test_launch_invariants import (
    _make_owner_and_cafe,
    _make_gamer,
    _booking_with_fee,
)


async def _make_admin(db_session):
    admin = User(
        id=uuid4(), email=f"ldg_admin_{uuid4().hex[:8]}@test.com", full_name="Admin",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.ADMIN, is_active=True,
    )
    db_session.add(admin)
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid4(), user_id=admin.id, role=UserRole.ADMIN))
    await db_session.commit()
    return admin


# ---------------------------------------------------------------- AE-01

@pytest.mark.asyncio
async def test_ledger_lines_stay_distinct_and_fee_never_becomes_cafe_earnings(
    db_session, async_client
):
    """The café's payable must never absorb KHELO's fee, and the three money
    lines must reconcile exactly.

    ₹100 session at 4%: customer pays ₹104 (gross), café is owed ₹100
    (settlement), KHELO keeps ₹4 (platform fee). gross == settlement + fee,
    and settlement is strictly less than gross.
    """
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "ledger")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    b, fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.COMPLETED, today, base=100.0)
    db_session.add_all([b, fee])
    db_session.add(Payment(
        id=uuid4(), booking_id=b.id,
        razorpay_order_id=f"order_{uuid4().hex[:12]}",
        razorpay_payment_id=f"pay_{uuid4().hex[:12]}",
        amount=float(b.total_amount), currency="INR", status=PaymentStatus.CAPTURED,
    ))
    await db_session.commit()

    res = await async_client.get("/api/v1/owner/payouts/summary", headers=auth_headers(owner))
    assert res.status_code == 200, res.text
    s = res.json()["data"]["summary"]

    gross = s["totalEarnings"]
    settlement = s["netSettlement"]
    platform_fee = s["totalPlatformFees"]

    assert gross == pytest.approx(104.0), f"customer payment (GMV) wrong: {gross}"
    assert settlement == pytest.approx(100.0), f"café payable wrong: {settlement}"
    assert platform_fee == pytest.approx(4.0), f"KHELO commission wrong: {platform_fee}"

    assert settlement < gross, (
        "café payable equals gross — KHELO's fee has been counted as café earnings"
    )
    assert gross == pytest.approx(settlement + platform_fee), (
        f"ledger does not reconcile: gross {gross} != settlement {settlement} "
        f"+ fee {platform_fee}"
    )

    # Paid vs outstanding are tracked separately from what is owed. Nothing has
    # been transferred for this booking, so it is outstanding, not paid.
    assert s["completedSettlements"] == pytest.approx(0.0), \
        "an untransferred settlement was reported as already paid to the café"
    assert s["pendingSettlements"] == pytest.approx(100.0), \
        "café outstanding should equal the unpaid settlement"


@pytest.mark.asyncio
async def test_refunded_booking_is_excluded_from_cafe_payable(db_session, async_client):
    """A refunded session must not sit in the café's outstanding balance —
    otherwise KHELO would eventually pay out money it gave back."""
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "ledger_rf")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    b, fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.COMPLETED, today, base=100.0)
    db_session.add_all([b, fee])
    db_session.add(Payment(
        id=uuid4(), booking_id=b.id,
        razorpay_order_id=f"order_{uuid4().hex[:12]}",
        razorpay_payment_id=f"pay_{uuid4().hex[:12]}",
        amount=float(b.total_amount), currency="INR", status=PaymentStatus.REFUNDED,
    ))
    await db_session.commit()

    res = await async_client.get("/api/v1/owner/payouts/summary", headers=auth_headers(owner))
    s = res.json()["data"]["summary"]

    assert s["pendingSettlements"] == pytest.approx(0.0), (
        f"refunded booking still owed to the café: {s['pendingSettlements']}"
    )
    assert s["completedSettlements"] == pytest.approx(0.0)


# ---------------------------------------------------------------- B-03 / B-05

ADMIN_ROUTES = [
    ("GET", "/api/v1/admin/dashboard"),
    ("GET", "/api/v1/admin/cafes"),
    ("GET", "/api/v1/admin/users"),
    ("GET", "/api/v1/admin/bookings"),
    ("GET", "/api/v1/admin/payments"),
    ("GET", "/api/v1/admin/payouts"),
    ("GET", "/api/v1/admin/audit-log"),
    ("GET", "/api/v1/admin/settings"),
]


@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
@pytest.mark.asyncio
async def test_gamer_cannot_reach_admin_routes(db_session, async_client, method, path):
    """B-03: a customer must not read platform-wide users, bookings or money."""
    gamer = await _make_gamer(db_session)
    res = await async_client.request(method, path, headers=auth_headers(gamer))
    assert res.status_code in (401, 403), (
        f"Gamer reached {method} {path} ({res.status_code}) — platform-wide data exposed"
    )


@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
@pytest.mark.asyncio
async def test_owner_cannot_reach_admin_routes(db_session, async_client, method, path):
    """B-04 extended: an owner must not read other cafés' data via admin routes."""
    owner, _, _ = await _make_owner_and_cafe(db_session, f"adm_{uuid4().hex[:4]}")
    res = await async_client.request(method, path, headers=auth_headers(owner))
    assert res.status_code in (401, 403), (
        f"Café owner reached {method} {path} ({res.status_code}) — every café's data exposed"
    )


@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
@pytest.mark.asyncio
async def test_admin_can_reach_admin_routes(db_session, async_client, method, path):
    """B-05: the guards must not be so tight that a real admin is locked out."""
    admin = await _make_admin(db_session)
    res = await async_client.request(method, path, headers=auth_headers(admin, is_admin=True))
    assert res.status_code == 200, (
        f"Admin blocked from {method} {path} ({res.status_code}): {res.text[:200]}"
    )
