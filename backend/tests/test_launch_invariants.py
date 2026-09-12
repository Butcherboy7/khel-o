"""Launch-day invariants: money correctness and permission isolation.

See docs/LAUNCH_QA_PLAN.md Phase 2. These assert properties that no existing
test covers, and that would cause irreversible harm on the first real day:
money shown to a café that it will never be paid, and one owner reading
another owner's data.

The money model (booking_service.py):
    subtotal      = base_amount - discount_amount
    gateway_fee   = subtotal * platform_fee_percentage / 100   <- KHELO revenue
    total_amount  = subtotal + gateway_fee                     <- customer pays
    owner_settlement_amount = subtotal                         <- café receives

`gateway_fee` is KHELO's platform revenue despite its name; it is NOT a
Razorpay processing cost. Anything shown to an owner as their "earnings" must
therefore be settlement, never total_amount.
"""
import pytest
from datetime import date, time, timedelta
from uuid import uuid4

from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.models.platform_fee import PlatformFee
from app.core.security import get_password_hash
from app.core.time import now_ist
from tests.conftest import auth_headers


FEE_PCT = 4.0


async def _make_owner_and_cafe(db_session, suffix: str):
    owner = User(
        id=uuid4(), email=f"inv_own_{suffix}_{uuid4().hex[:8]}@test.com",
        full_name=f"Invariant Owner {suffix}",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER, is_active=True,
    )
    db_session.add(owner)
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name=f"Invariant Cafe {suffix}",
        address_line1="1 Test St", city="Bengaluru", state="Karnataka",
        pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db_session.add(cafe)

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Standard", specs={"gpu": "RTX 3060"},
        price_per_hour=100.0, total_seats=10, app_bookable_seats=10,
        active_seats_count=10, is_active=True,
    )
    db_session.add(tier)
    await db_session.commit()
    return owner, cafe, tier


async def _make_gamer(db_session):
    gamer = User(
        id=uuid4(), email=f"inv_gamer_{uuid4().hex[:8]}@test.com", full_name="Gamer",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.GAMER, is_active=True,
    )
    db_session.add(gamer)
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER))
    await db_session.commit()
    return gamer


def _booking_with_fee(cafe, tier, gamer_id, status, session_date, base=100.0, fee_pct=FEE_PCT):
    """Build a booking + its PlatformFee exactly the way booking_service does.

    Returns (booking, platform_fee). base is the subtotal, i.e. what the café
    actually earns; the customer pays base + gateway_fee on top.
    """
    gw = round(base * fee_pct / 100, 2)
    b = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer_id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=session_date,
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=base, discount_amount=0.0, gateway_fee=gw,
        total_amount=base + gw, convenience_fee=0.0, status=status,
    )
    fee = PlatformFee(
        id=uuid4(), booking_id=b.id, convenience_fee=0.0, gateway_fee=gw,
        fee_percentage_applied=fee_pct, tds_amount=0.0,
        owner_settlement_amount=base,
    )
    return b, fee


async def _dashboard(async_client, owner):
    res = await async_client.get("/api/v1/owner/dashboard", headers=auth_headers(owner))
    assert res.status_code == 200, res.text
    return res.json()["data"]


# ---------------------------------------------------------------- M-02 (F-1)

@pytest.mark.asyncio
async def test_todays_earnings_is_settlement_not_gross(db_session, async_client):
    """The owner's "Today's Earnings" must be what the café is actually paid.

    Regression for F-1: sum_revenue_today summed Booking.total_amount, which
    includes KHELO's platform fee, so a ₹100 booking at 4% showed the owner
    ₹104 while their payout was ₹100. The existing earnings test could not
    catch this because its fixtures set gateway_fee=0, making total_amount
    and settlement identical.
    """
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "f1")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    b, fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.CONFIRMED, today, base=100.0)
    db_session.add_all([b, fee])
    await db_session.commit()

    data = await _dashboard(async_client, owner)

    assert data["revenueToday"] == pytest.approx(100.0), (
        f"Owner shown {data['revenueToday']} but café is only paid 100.00 — "
        "earnings must exclude KHELO's platform fee (stored in gateway_fee)."
    )


@pytest.mark.asyncio
async def test_month_revenue_is_settlement_not_gross(db_session, async_client):
    """Same as above for the monthly figure."""
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "f1m")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    b, fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.CONFIRMED, today, base=250.0)
    db_session.add_all([b, fee])
    await db_session.commit()

    data = await _dashboard(async_client, owner)
    assert data["revenueThisMonth"] == pytest.approx(250.0), (
        f"Owner shown {data['revenueThisMonth']} but café is only paid 250.00."
    )


# ---------------------------------------------------------------- M-01

@pytest.mark.asyncio
async def test_earnings_exclude_unpaid_and_released_states(db_session, async_client):
    """Only genuinely-paid bookings may contribute to owner earnings.

    PENDING_PAYMENT / FAILED / CANCELLED / RELEASED_BY_OWNER represent money
    that was never captured (or was given back), and must never appear as
    earnings.
    """
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "m1")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    rows = []
    for st in (
        BookingStatus.PENDING_PAYMENT,
        BookingStatus.FAILED,
        BookingStatus.CANCELLED,
        BookingStatus.RELEASED_BY_OWNER,
        BookingStatus.NO_SHOW,
    ):
        b, fee = _booking_with_fee(cafe, tier, gamer.id, st, today, base=500.0)
        rows += [b, fee]

    paid, paid_fee = _booking_with_fee(
        cafe, tier, gamer.id, BookingStatus.CONFIRMED, today, base=100.0
    )
    rows += [paid, paid_fee]
    db_session.add_all(rows)
    await db_session.commit()

    data = await _dashboard(async_client, owner)
    assert data["revenueToday"] == pytest.approx(100.0), (
        f"Unpaid/released bookings leaked into earnings: got {data['revenueToday']}, "
        "expected only the single CONFIRMED booking's settlement (100.00)."
    )


# ---------------------------------------------------------------- M-03 (F-2)

@pytest.mark.asyncio
async def test_live_sessions_count_consistently_today_and_this_month(db_session, async_client):
    """CHECKED_IN / ACTIVE are paid, live sessions and must count in BOTH figures.

    Regression for F-2: sum_revenue_today counted CONFIRMED/CHECKED_IN/ACTIVE/
    COMPLETED, while sum_revenue_this_month and count_bookings_this_month
    counted only CONFIRMED/COMPLETED — so a session that had been checked in
    inflated "today" but vanished from "this month".
    """
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "f2")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    b1, f1 = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.CHECKED_IN, today, base=100.0)
    b2, f2 = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.ACTIVE, today, base=200.0)
    db_session.add_all([b1, f1, b2, f2])
    await db_session.commit()

    data = await _dashboard(async_client, owner)

    assert data["revenueToday"] == pytest.approx(300.0)
    assert data["revenueThisMonth"] == pytest.approx(300.0), (
        f"Live sessions counted today ({data['revenueToday']}) but not this month "
        f"({data['revenueThisMonth']}) — the two figures use different status filters."
    )
    assert data["totalBookingsThisMonth"] == 2, (
        f"Live sessions missing from the monthly booking count: "
        f"got {data['totalBookingsThisMonth']}, expected 2."
    )


# ---------------------------------------------------------------- L-01 / L-02

@pytest.mark.asyncio
async def test_fee_rate_change_does_not_alter_past_bookings(db_session, async_client):
    """A Super Admin rate change must never rewrite history.

    PlatformFee.fee_percentage_applied snapshots the rate used, so an old
    booking keeps showing what the customer actually paid.
    """
    from app.repositories.platform_settings_repository import PlatformSettingsRepository

    owner, cafe, tier = await _make_owner_and_cafe(db_session, "l1")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    settings_repo = PlatformSettingsRepository(db_session)
    ps = await settings_repo.get_or_create()
    ps.platform_fee_percentage = 4.0
    await db_session.commit()

    b, fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.CONFIRMED, today,
                              base=100.0, fee_pct=4.0)
    db_session.add_all([b, fee])
    await db_session.commit()

    original_total = float(b.total_amount)
    original_gateway = float(b.gateway_fee)

    # Super Admin raises the platform fee afterwards.
    ps = await settings_repo.get_or_create()
    ps.platform_fee_percentage = 5.0
    await db_session.commit()
    await db_session.refresh(b)
    await db_session.refresh(fee)

    assert float(b.total_amount) == pytest.approx(original_total), \
        "Historical booking total changed after an admin fee-rate change."
    assert float(b.gateway_fee) == pytest.approx(original_gateway), \
        "Historical booking fee changed after an admin fee-rate change."
    assert float(fee.fee_percentage_applied) == pytest.approx(4.0), \
        "Snapshotted fee percentage was overwritten by the new live rate."


# ---------------------------------------------------------------- B-01

# Every owner route that takes someone else's resource id. Owner B must not be
# able to touch Owner A's café through any of them. See LAUNCH_QA_PLAN §1.3.
FOREIGN_CAFE_ROUTES = [
    ("POST",   "/api/v1/owner/cafes/{cafe_id}/emergency-close"),
    ("PATCH",  "/api/v1/owner/cafes/{cafe_id}/emergency-mode"),
    ("PATCH",  "/api/v1/owner/cafes/{cafe_id}/booking-controls"),
    ("POST",   "/api/v1/owner/cafes/{cafe_id}/pause-bookings"),
    ("POST",   "/api/v1/owner/cafes/{cafe_id}/resume-bookings"),
    ("PATCH",  "/api/v1/owner/cafes/{cafe_id}/hours"),
    ("PATCH",  "/api/v1/owner/cafes/{cafe_id}/pricing"),
    ("PATCH",  "/api/v1/owner/cafes/{cafe_id}/details"),
    ("POST",   "/api/v1/owner/cafes/{cafe_id}/photos/presign"),
    ("DELETE", "/api/v1/owner/cafes/{cafe_id}/photos"),
    ("POST",   "/api/v1/owner/cafes/{cafe_id}/menu-photos/presign"),
    ("DELETE", "/api/v1/owner/cafes/{cafe_id}/menu-photos"),
]


@pytest.mark.parametrize("method,path", FOREIGN_CAFE_ROUTES)
@pytest.mark.asyncio
async def test_owner_cannot_reach_another_owners_cafe(db_session, async_client, method, path):
    """Cross-café data isolation. A 2xx here is a P0 data-exposure bug."""
    owner_a, cafe_a, _ = await _make_owner_and_cafe(db_session, f"a_{uuid4().hex[:4]}")
    owner_b, _, _ = await _make_owner_and_cafe(db_session, f"b_{uuid4().hex[:4]}")

    url = path.format(cafe_id=cafe_a.id)
    res = await async_client.request(method, url, headers=auth_headers(owner_b), json={})

    assert res.status_code not in (200, 201, 204), (
        f"IDOR: {method} {path} returned {res.status_code} — Owner B reached Owner A's café."
    )
    assert res.status_code in (400, 403, 404, 422), (
        f"{method} {path} returned unexpected {res.status_code}: {res.text[:200]}"
    )


@pytest.mark.asyncio
async def test_owner_dashboard_only_reports_own_cafes(db_session, async_client):
    """Owner B's dashboard must not include a single rupee of Owner A's money."""
    owner_a, cafe_a, tier_a = await _make_owner_and_cafe(db_session, "iso_a")
    owner_b, _, _ = await _make_owner_and_cafe(db_session, "iso_b")
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    b, fee = _booking_with_fee(cafe_a, tier_a, gamer.id, BookingStatus.CONFIRMED, today, base=750.0)
    db_session.add_all([b, fee])
    await db_session.commit()

    data_b = await _dashboard(async_client, owner_b)
    assert data_b["revenueToday"] == pytest.approx(0.0), \
        "Owner B's dashboard includes revenue from Owner A's café."
    assert data_b["totalCafes"] == 1


@pytest.mark.asyncio
async def test_gamer_cannot_reach_owner_dashboard(db_session, async_client):
    gamer = await _make_gamer(db_session)
    res = await async_client.get("/api/v1/owner/dashboard", headers=auth_headers(gamer))
    assert res.status_code in (401, 403), \
        f"Gamer reached the owner dashboard: {res.status_code}"


@pytest.mark.asyncio
async def test_owner_cannot_change_platform_fee(db_session, async_client):
    """An owner who can set the platform fee could set it to zero."""
    owner, _, _ = await _make_owner_and_cafe(db_session, "feeguard")
    res = await async_client.patch(
        "/api/v1/admin/settings",
        headers=auth_headers(owner),
        json={"platformFeePercentage": 0.0},
    )
    assert res.status_code in (401, 403), \
        f"Café owner was able to call admin settings: {res.status_code}"
