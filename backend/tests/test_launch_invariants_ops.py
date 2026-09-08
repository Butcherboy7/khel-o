"""Launch-day operational invariants: café suspension and payout safety.

Companion to test_launch_invariants.py (money + permissions). See
docs/LAUNCH_QA_PLAN.md Phase 2, sections D-01..D-04 and AE-02.
"""
import pytest
from datetime import timedelta
from uuid import uuid4

from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.booking import Booking, BookingStatus
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
        id=uuid4(), email=f"inv_admin_{uuid4().hex[:8]}@test.com", full_name="Admin",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.ADMIN, is_active=True,
    )
    db_session.add(admin)
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid4(), user_id=admin.id, role=UserRole.ADMIN))
    await db_session.commit()
    return admin


async def _discovery_ids(async_client):
    res = await async_client.get("/api/v1/cafes")
    assert res.status_code == 200, res.text
    payload = res.json()["data"]
    items = payload["items"] if isinstance(payload, dict) else payload
    return {str(c["id"]) for c in items}


# ---------------------------------------------------------------- D-01 / D-02

@pytest.mark.asyncio
async def test_suspended_cafe_disappears_from_discovery_and_is_unbookable(
    db_session, async_client
):
    """Suspension must remove a café from customer discovery AND block new
    bookings — a café that is hidden but still bookable by direct URL would
    keep taking money it cannot honour."""
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "susp")
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session)

    assert str(cafe.id) in await _discovery_ids(async_client), \
        "café was not discoverable even before suspension"

    res = await async_client.patch(
        f"/api/v1/admin/cafes/{cafe.id}/suspend",
        headers=auth_headers(admin, is_admin=True),
        json={"reason": "QA invariant test"},
    )
    assert res.status_code == 200, res.text

    assert str(cafe.id) not in await _discovery_ids(async_client), \
        "suspended café is still visible in customer discovery"

    tomorrow = now_ist().date() + timedelta(days=1)
    booked = await async_client.post(
        "/api/v1/bookings",
        headers=auth_headers(gamer),
        json={
            "cafeId": str(cafe.id),
            "hardwareTierId": str(tier.id),
            "sessionDate": tomorrow.isoformat(),
            "startTime": "18:00:00",
            "durationHours": 1.0,
            "seatsCount": 1,
        },
    )
    assert booked.status_code not in (200, 201), \
        f"suspended café accepted a new booking ({booked.status_code})"


# ---------------------------------------------------------------- D-03 / D-04

@pytest.mark.asyncio
async def test_suspend_then_reactivate_is_non_destructive_and_idempotent(
    db_session, async_client
):
    """Suspension must be reversible and must never delete history.

    Specific hazard guarded here: suspension and verification share the
    `verification_status` column, so reactivate must restore VERIFIED rather
    than dropping the café back into the PENDING re-verification queue.
    """
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "resume")
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    b, fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.COMPLETED, today, base=100.0)
    db_session.add_all([b, fee])
    await db_session.commit()
    booking_id = b.id
    cafe_id = cafe.id

    hdr = auth_headers(admin, is_admin=True)
    for _ in range(2):  # suspend twice — idempotent, never destructive
        r = await async_client.patch(
            f"/api/v1/admin/cafes/{cafe_id}/suspend", headers=hdr,
            json={"reason": "QA idempotency"},
        )
        assert r.status_code in (200, 400, 409), r.text

    for _ in range(2):  # resume twice
        r = await async_client.patch(f"/api/v1/admin/cafes/{cafe_id}/reactivate", headers=hdr)
        assert r.status_code in (200, 400, 409), r.text

    db_session.expire_all()
    restored = await db_session.get(Cafe, cafe_id)
    assert restored is not None, "café row disappeared across suspend/resume"
    assert restored.verification_status == VerificationStatus.VERIFIED, (
        f"reactivate left café as {restored.verification_status}; it must return to "
        "VERIFIED rather than requiring re-verification"
    )
    assert restored.is_active is True, "reactivated café left inactive"

    surviving = await db_session.get(Booking, booking_id)
    assert surviving is not None, "historical booking destroyed by suspend/resume"
    assert surviving.status == BookingStatus.COMPLETED, "historical booking status mutated"

    assert str(cafe_id) in await _discovery_ids(async_client), \
        "reactivated café did not return to customer discovery"


# ---------------------------------------------------------------- AE-02

@pytest.mark.asyncio
async def test_a_bookings_settlement_cannot_be_paid_out_twice(db_session):
    """CafePayoutItem.platform_fee_id is UNIQUE, and that constraint is the
    only thing preventing KHELO paying a café twice for the same booking."""
    from sqlalchemy.exc import IntegrityError
    from app.models.cafe_payout import CafePayout, CafePayoutStatus
    from app.models.cafe_payout_item import CafePayoutItem

    owner, cafe, tier = await _make_owner_and_cafe(db_session, "payout")
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session)
    today = now_ist().date()

    b, fee = _booking_with_fee(cafe, tier, gamer.id, BookingStatus.COMPLETED, today, base=100.0)
    db_session.add_all([b, fee])
    await db_session.commit()

    def _payout():
        return CafePayout(
            id=uuid4(), cafe_id=cafe.id, amount=100.0,
            utr_reference=f"UTR{uuid4().hex[:10]}", payment_method="bank_transfer",
            status=CafePayoutStatus.PAID, created_by_admin_id=admin.id,
        )

    p1 = _payout()
    db_session.add(p1)
    await db_session.flush()
    db_session.add(CafePayoutItem(
        id=uuid4(), payout_id=p1.id, platform_fee_id=fee.id,
        booking_id=b.id, amount_allocated=100.0,
    ))
    await db_session.commit()

    p2 = _payout()
    db_session.add(p2)
    await db_session.flush()
    db_session.add(CafePayoutItem(
        id=uuid4(), payout_id=p2.id, platform_fee_id=fee.id,
        booking_id=b.id, amount_allocated=100.0,
    ))
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()
