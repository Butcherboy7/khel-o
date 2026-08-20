"""
Regression coverage for the server-side check-in window in
owner_service.checkin_booking (~line 235).

Before this fix, checkin_booking validated ownership, café scoping, and
booking status, but never checked the session's actual time — a booking
dated tomorrow could be checked in today. The fix allows check-in from
CHECKIN_EARLY_GRACE_MINUTES (15) before session start through session end,
consistent with auto_transition_booking's live-session window.

These tests exercise the REAL production code path (the actual HTTP checkin
endpoint -> OwnerService.checkin_booking), with `now_ist()` frozen to a
controlled value (by monkeypatching the `datetime` class inside
app.core.time, whose module globals back both `now_ist()` and
`session_start_ist()` regardless of how they were imported elsewhere), so
these tests never depend on the real wall clock.
"""
import uuid
from datetime import datetime, date, time, timedelta

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.time import IST
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.core.security import get_password_hash

import app.core.time as time_module
import app.services.owner_service as owner_service_module
from tests.conftest import create_test_user, auth_headers

BASE_DATE = date(2026, 8, 20)


def _freeze_now(monkeypatch, frozen_ist: datetime):
    """Freeze `datetime.now(...)` as seen by app.core.time, while leaving
    every other datetime classmethod (combine, etc.) behaving normally.
    `now_ist()` and `session_start_ist()` are defined in app.core.time, so
    their `datetime` name resolves via that module's globals regardless of
    where the functions were imported into (owner_service.py included)."""

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            if tz is not None:
                return frozen_ist.astimezone(tz)
            return frozen_ist

    monkeypatch.setattr(time_module, "datetime", FrozenDateTime)
    # owner_service.py also does `now_utc = datetime.now(timezone.utc)` for
    # its own bookkeeping (checked_in_at, etc.) and for auto_transition_booking's
    # CONFIRMED/CHECKED_IN/ACTIVE lazy-transition comparisons, via a directly
    # imported `datetime` name (not the app.core.time wrapper) — freeze that
    # too, or auto_transition_booking would silently transition statuses using
    # the real wall clock instead of the frozen test time.
    monkeypatch.setattr(owner_service_module, "datetime", FrozenDateTime)


async def _setup_cafe_and_staff(db_session):
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await db_session.commit()

    cafe = Cafe(
        id=uuid.uuid4(),
        owner_id=owner.id,
        name="Checkin Window Café",
        address_line1="1 Test St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number="+919876500000",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
    )
    db_session.add(cafe)

    tier = HardwareTier(
        id=uuid.uuid4(),
        cafe_id=cafe.id,
        name="Standard",
        specs={"gpu": "RTX 3060"},
        price_per_hour=100.0,
        total_seats=10,
        app_bookable_seats=10,
        active_seats_count=10,
        is_active=True,
    )
    db_session.add(tier)

    gamer = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()

    return owner, cafe, tier, gamer


async def _make_booking(db_session, cafe, tier, gamer, session_date, start_time, end_time, status=BookingStatus.CONFIRMED):
    booking = Booking(
        id=uuid.uuid4(),
        booking_reference=f"GC-2026-{uuid.uuid4().hex[:6].upper()}",
        gamer_id=gamer.id,
        cafe_id=cafe.id,
        hardware_tier_id=tier.id,
        session_date=session_date,
        start_time=start_time,
        end_time=end_time,
        duration_hours=2.0,
        base_amount=200.0,
        total_amount=200.0,
        status=status,
    )
    db_session.add(booking)
    await db_session.commit()
    return booking


async def _checkin(async_client: AsyncClient, booking_id, owner):
    return await async_client.post(
        f"/api/v1/owner/bookings/{booking_id}/checkin",
        headers=auth_headers(owner),
    )


@pytest.mark.asyncio
async def test_cannot_checkin_before_window(async_client, db_session, monkeypatch):
    """A booking whose session starts tomorrow must be refused today."""
    owner, cafe, tier, gamer = await _setup_cafe_and_staff(db_session)
    frozen = datetime.combine(BASE_DATE, time(9, 0)).replace(tzinfo=IST)
    _freeze_now(monkeypatch, frozen)

    booking = await _make_booking(
        db_session, cafe, tier, gamer,
        session_date=BASE_DATE + timedelta(days=1),
        start_time=time(10, 0),
        end_time=time(12, 0),
    )

    resp = await _checkin(async_client, booking.id, owner)
    assert resp.status_code == 422, resp.json()
    assert resp.json()["error"]["code"] == "CHECKIN_TOO_EARLY"


@pytest.mark.asyncio
async def test_can_checkin_within_15_min_grace(async_client, db_session, monkeypatch):
    """10 minutes before session start is inside the 15-minute grace window."""
    owner, cafe, tier, gamer = await _setup_cafe_and_staff(db_session)
    session_start = time(10, 0)
    frozen = datetime.combine(BASE_DATE, time(9, 50)).replace(tzinfo=IST)  # 10 min before start
    _freeze_now(monkeypatch, frozen)

    booking = await _make_booking(
        db_session, cafe, tier, gamer,
        session_date=BASE_DATE,
        start_time=session_start,
        end_time=time(12, 0),
    )

    resp = await _checkin(async_client, booking.id, owner)
    assert resp.status_code == 200, resp.json()
    assert resp.json()["data"]["booking"]["status"] == "checked_in"


@pytest.mark.asyncio
async def test_can_checkin_mid_session(async_client, db_session, monkeypatch):
    """Check-in while the session is actively underway must succeed. The
    window check accepts it as CHECKED_IN; auto_transition_booking (run
    immediately after, unrelated to this fix) then lazily bumps it straight
    to ACTIVE because `now` is already >= session_start — so the response
    correctly reflects 'active', not a rejection."""
    owner, cafe, tier, gamer = await _setup_cafe_and_staff(db_session)
    frozen = datetime.combine(BASE_DATE, time(11, 0)).replace(tzinfo=IST)  # mid 10:00-12:00
    _freeze_now(monkeypatch, frozen)

    booking = await _make_booking(
        db_session, cafe, tier, gamer,
        session_date=BASE_DATE,
        start_time=time(10, 0),
        end_time=time(12, 0),
    )

    resp = await _checkin(async_client, booking.id, owner)
    assert resp.status_code == 200, resp.json()
    assert resp.json()["data"]["booking"]["status"] == "active"


@pytest.mark.asyncio
async def test_cannot_checkin_after_session_ended(async_client, db_session, monkeypatch):
    """Check-in attempted after the session has already ended is refused."""
    owner, cafe, tier, gamer = await _setup_cafe_and_staff(db_session)
    frozen = datetime.combine(BASE_DATE, time(13, 0)).replace(tzinfo=IST)  # after 10:00-12:00 ended
    _freeze_now(monkeypatch, frozen)

    booking = await _make_booking(
        db_session, cafe, tier, gamer,
        session_date=BASE_DATE,
        start_time=time(10, 0),
        end_time=time(12, 0),
    )

    resp = await _checkin(async_client, booking.id, owner)
    assert resp.status_code == 422, resp.json()
    assert resp.json()["error"]["code"] == "CHECKIN_WINDOW_CLOSED"


@pytest.mark.asyncio
async def test_cancelled_booking_cannot_checkin(async_client, db_session, monkeypatch):
    """Cancelled bookings are rejected regardless of the time window (status check runs first)."""
    owner, cafe, tier, gamer = await _setup_cafe_and_staff(db_session)
    frozen = datetime.combine(BASE_DATE, time(11, 0)).replace(tzinfo=IST)  # would be inside window
    _freeze_now(monkeypatch, frozen)

    booking = await _make_booking(
        db_session, cafe, tier, gamer,
        session_date=BASE_DATE,
        start_time=time(10, 0),
        end_time=time(12, 0),
        status=BookingStatus.CANCELLED,
    )

    resp = await _checkin(async_client, booking.id, owner)
    assert resp.status_code == 422, resp.json()
    assert resp.json()["error"]["code"] == "INVALID_BOOKING_STATUS"


@pytest.mark.asyncio
async def test_already_checked_in_live_session_returns_cleanly(async_client, db_session, monkeypatch):
    """Re-scanning a pass already checked in for a currently-live session must
    still return cleanly (the idempotent duplicate-scan early return), not
    fail the window check — this must never regress."""
    owner, cafe, tier, gamer = await _setup_cafe_and_staff(db_session)
    frozen = datetime.combine(BASE_DATE, time(11, 0)).replace(tzinfo=IST)  # mid-session, well within window
    _freeze_now(monkeypatch, frozen)

    booking = await _make_booking(
        db_session, cafe, tier, gamer,
        session_date=BASE_DATE,
        start_time=time(10, 0),
        end_time=time(12, 0),
        status=BookingStatus.CHECKED_IN,
    )

    resp = await _checkin(async_client, booking.id, owner)
    assert resp.status_code == 200, resp.json()
    assert resp.json()["data"]["booking"]["status"] == "checked_in"


@pytest.mark.asyncio
async def test_already_checked_in_far_outside_window_still_returns_cleanly(async_client, db_session, monkeypatch):
    """Even long after a session ended, a duplicate scan of an
    already-CHECKED_IN booking must short-circuit before the window check —
    the early-return in checkin_booking is unconditional on status, not on
    the current time."""
    owner, cafe, tier, gamer = await _setup_cafe_and_staff(db_session)
    frozen = datetime.combine(BASE_DATE, time(23, 0)).replace(tzinfo=IST)  # long after session ended
    _freeze_now(monkeypatch, frozen)

    booking = await _make_booking(
        db_session, cafe, tier, gamer,
        session_date=BASE_DATE,
        start_time=time(10, 0),
        end_time=time(12, 0),
        status=BookingStatus.CHECKED_IN,
    )

    resp = await _checkin(async_client, booking.id, owner)
    assert resp.status_code == 200, resp.json()
    assert resp.json()["data"]["booking"]["status"] == "checked_in"


@pytest.mark.asyncio
async def test_overnight_session_checkin_after_midnight(async_client, db_session, monkeypatch):
    """An overnight session (23:00 -> 01:00) must remain checkin-able after
    midnight, before its (rolled-over) end time."""
    owner, cafe, tier, gamer = await _setup_cafe_and_staff(db_session)
    # Session dated BASE_DATE 23:00 -> 01:00 (rolls to BASE_DATE+1 01:00).
    # "Now" is BASE_DATE+1 00:30 — after midnight, still within the session.
    frozen = datetime.combine(BASE_DATE + timedelta(days=1), time(0, 30)).replace(tzinfo=IST)
    _freeze_now(monkeypatch, frozen)

    booking = await _make_booking(
        db_session, cafe, tier, gamer,
        session_date=BASE_DATE,
        start_time=time(23, 0),
        end_time=time(1, 0),
    )

    resp = await _checkin(async_client, booking.id, owner)
    assert resp.status_code == 200, resp.json()
    # Session already started ("now" is past its 23:00 start) so
    # auto_transition_booking immediately lazily bumps CHECKED_IN -> ACTIVE.
    assert resp.json()["data"]["booking"]["status"] == "active"


@pytest.mark.asyncio
async def test_overnight_session_checkin_closed_after_rolled_over_end(async_client, db_session, monkeypatch):
    """The same overnight session must be refused once past its rolled-over
    end time (BASE_DATE+1 01:00) — proof the +timedelta(days=1) rollover is
    actually applied rather than the window silently already having closed
    at BASE_DATE's naive 01:00."""
    owner, cafe, tier, gamer = await _setup_cafe_and_staff(db_session)
    frozen = datetime.combine(BASE_DATE + timedelta(days=1), time(2, 0)).replace(tzinfo=IST)
    _freeze_now(monkeypatch, frozen)

    booking = await _make_booking(
        db_session, cafe, tier, gamer,
        session_date=BASE_DATE,
        start_time=time(23, 0),
        end_time=time(1, 0),
    )

    resp = await _checkin(async_client, booking.id, owner)
    assert resp.status_code == 422, resp.json()
    assert resp.json()["error"]["code"] == "CHECKIN_WINDOW_CLOSED"
