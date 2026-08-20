"""
Regression coverage for CRITICAL 1 and CRITICAL 2 of the 2026-08-20
production-readiness audit.

CRITICAL 1: `booking_service._expire_if_past_due` and
`owner_service.auto_transition_booking` used to compute an overnight
session's end as `datetime.combine(session_date, end_time)` with NO
rollover, so for e.g. 22:30 -> 00:30 the computed "end" landed ~22 hours
BEFORE the session even started. Any read of a confirmed overnight booking
(a customer simply opening their bookings list) would then auto-flip it to
NO_SHOW mid-session. This already happened in production
(GC-2026-V9Y06I, 22:30->00:30, flipped to no_show on 2026-08-20).

Both call sites must now go through `app.core.time.session_end_ist`, which
applies the `end <= start -> end += timedelta(days=1)` rollover exactly like
the pre-existing, correct `checkin_booking` did.

CRITICAL 2: until the capacity overlap query is made date-aware, creating a
booking whose computed end_time <= start_time (i.e. it would cross
midnight) must be rejected outright with OVERNIGHT_BOOKING_UNSUPPORTED,
rather than silently accepted and risking an oversell.

These tests exercise the real service methods with `datetime.now(...)`
frozen the same way test_checkin_window.py and test_booking_time_validation.py
do — subclassing `datetime` and monkeypatching the specific module-level
`datetime` name each production code path actually reads "now" from, so
these tests are never wall-clock dependent AND the freeze technique stays
compatible with test_booking_time_validation.py's own patch of
`booking_service.datetime`.
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
from app.repositories.booking_repository import BookingRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.services.booking_service import BookingService
from app.services.owner_service import OwnerService

import app.services.booking_service as booking_service_module
import app.services.owner_service as owner_service_module
from tests.conftest import auth_headers, create_test_user

BASE_DATE = date(2026, 8, 20)


def _freeze(monkeypatch, module, frozen_ist: datetime):
    """Freeze `datetime.now(...)` as read by `module`'s own `datetime` name,
    leaving `datetime.combine` (used inside app.core.time helpers) working
    on the real class — matches the pattern already established in
    test_checkin_window.py and test_booking_time_validation.py."""

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            if tz is not None:
                return frozen_ist.astimezone(tz)
            return frozen_ist

    monkeypatch.setattr(module, "datetime", FrozenDateTime)


async def _setup_cafe_and_gamer(db_session):
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    gamer = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()

    cafe = Cafe(
        id=uuid.uuid4(),
        owner_id=owner.id,
        name="Overnight Rollover Café",
        address_line1="1 Test St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        opening_time=time(9, 30),
        closing_time=time(2, 0),
        bookable_stations=10,
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

    await db_session.commit()
    return owner, cafe, tier, gamer


async def _make_overnight_booking(db_session, cafe, tier, gamer, status=BookingStatus.CONFIRMED):
    """Mirrors the real production booking that already fired
    (GC-2026-V9Y06I, 22:30 -> 00:30). Built directly via the model — not
    through create_booking — because CRITICAL 2 now refuses to create this
    shape of booking via the API; this reproduces the state that
    already-existing overnight bookings (created before this fix, or
    inserted directly) can be in."""
    booking = Booking(
        id=uuid.uuid4(),
        booking_reference=f"GC-TEST-{uuid.uuid4().hex[:6].upper()}",
        gamer_id=gamer.id,
        cafe_id=cafe.id,
        hardware_tier_id=tier.id,
        session_date=BASE_DATE,
        start_time=time(22, 30),
        end_time=time(0, 30),
        duration_hours=2.0,
        base_amount=200.0,
        total_amount=200.0,
        status=status,
    )
    db_session.add(booking)
    await db_session.commit()
    return booking


# ── CRITICAL 1a: booking_service._expire_if_past_due ───────────────────────

@pytest.mark.asyncio
async def test_expire_if_past_due_does_not_flip_overnight_booking_mid_session(db_session, monkeypatch):
    """The exact failure mode that already fired in production: a CONFIRMED
    22:30->00:30 booking, read while the session is still genuinely
    underway (just after midnight, before the rolled-over 00:30 end), must
    NOT be auto-expired to NO_SHOW."""
    owner, cafe, tier, gamer = await _setup_cafe_and_gamer(db_session)
    booking = await _make_overnight_booking(db_session, cafe, tier, gamer)

    # "Now" = BASE_DATE+1 00:10 — after midnight, still mid-session (session
    # truly ends at BASE_DATE+1 00:30, plus a 15-min grace period).
    frozen = datetime.combine(BASE_DATE + timedelta(days=1), time(0, 10)).replace(tzinfo=IST)
    _freeze(monkeypatch, booking_service_module, frozen)

    booking_repo = BookingRepository(db_session)
    service = BookingService(booking_repo)

    await service._expire_if_past_due(booking)

    assert booking.status == BookingStatus.CONFIRMED
    refreshed = await booking_repo.get_by_id(booking.id)
    assert refreshed.status == BookingStatus.CONFIRMED


@pytest.mark.asyncio
async def test_expire_if_past_due_still_expires_after_rolled_over_end_and_grace(db_session, monkeypatch):
    """Proof the rollover is genuinely applied (not just skipped): once
    "now" is past the ROLLED-OVER end (BASE_DATE+1 00:30) plus the 15-minute
    grace period, the booking must still correctly expire to NO_SHOW."""
    owner, cafe, tier, gamer = await _setup_cafe_and_gamer(db_session)
    booking = await _make_overnight_booking(db_session, cafe, tier, gamer)

    # 00:30 (rolled-over end) + 15 min grace + 1 min margin.
    frozen = datetime.combine(BASE_DATE + timedelta(days=1), time(0, 46)).replace(tzinfo=IST)
    _freeze(monkeypatch, booking_service_module, frozen)

    booking_repo = BookingRepository(db_session)
    service = BookingService(booking_repo)

    await service._expire_if_past_due(booking)

    assert booking.status == BookingStatus.NO_SHOW


# ── CRITICAL 1b: owner_service.auto_transition_booking ─────────────────────

@pytest.mark.asyncio
async def test_auto_transition_does_not_flip_overnight_booking_mid_session(db_session, monkeypatch):
    """Same scenario via the owner-dashboard lazy-transition path."""
    owner, cafe, tier, gamer = await _setup_cafe_and_gamer(db_session)
    booking = await _make_overnight_booking(db_session, cafe, tier, gamer)

    frozen = datetime.combine(BASE_DATE + timedelta(days=1), time(0, 10)).replace(tzinfo=IST)
    _freeze(monkeypatch, owner_service_module, frozen)

    booking_repo = BookingRepository(db_session)
    cafe_repo = CafeRepository(db_session)
    service = OwnerService(booking_repo, cafe_repo)

    updated = await service.auto_transition_booking(booking)

    assert updated.status == BookingStatus.CONFIRMED


@pytest.mark.asyncio
async def test_auto_transition_expires_after_rolled_over_end(db_session, monkeypatch):
    """auto_transition_booking has no grace period (unlike
    _expire_if_past_due) — it transitions CONFIRMED -> NO_SHOW as soon as
    `now >= session_end`. Confirm the rolled-over end is used."""
    owner, cafe, tier, gamer = await _setup_cafe_and_gamer(db_session)
    booking = await _make_overnight_booking(db_session, cafe, tier, gamer)

    frozen = datetime.combine(BASE_DATE + timedelta(days=1), time(0, 30)).replace(tzinfo=IST)
    _freeze(monkeypatch, owner_service_module, frozen)

    booking_repo = BookingRepository(db_session)
    cafe_repo = CafeRepository(db_session)
    service = OwnerService(booking_repo, cafe_repo)

    updated = await service.auto_transition_booking(booking)

    assert updated.status == BookingStatus.NO_SHOW


# ── CRITICAL 2: overnight bookings rejected at creation time ───────────────

@pytest.mark.asyncio
async def test_create_booking_rejects_session_crossing_midnight(async_client: AsyncClient, db_session):
    """A booking request whose computed end_time <= start_time (crosses
    midnight, e.g. 22:30 for 2 hours -> 00:30) must be refused with a clear,
    non-blaming error rather than silently accepted — the overlap query
    can't yet detect collisions across the date boundary, so accepting this
    risks an oversell."""
    owner, cafe, tier, gamer = await _setup_cafe_and_gamer(db_session)

    resp = await async_client.post(
        "/api/v1/bookings",
        json={
            "cafeId": str(cafe.id),
            "hardwareTierId": str(tier.id),
            "sessionDate": (date.today() + timedelta(days=1)).isoformat(),
            "startTime": "22:30:00",
            "durationHours": 2,
        },
        headers=auth_headers(gamer),
    )

    assert resp.status_code == 422, resp.json()
    assert resp.json()["error"]["code"] == "OVERNIGHT_BOOKING_UNSUPPORTED"


@pytest.mark.asyncio
async def test_create_booking_accepts_post_midnight_start_that_stays_same_day(async_client: AsyncClient, db_session):
    """A booking that STARTS after midnight (e.g. 00:30 -> 02:00, stored
    under the next day) does NOT cross midnight itself and must still be
    accepted — CRITICAL 2's guard is specifically about end_time <=
    start_time, not about post-midnight start times in general."""
    owner, cafe, tier, gamer = await _setup_cafe_and_gamer(db_session)

    resp = await async_client.post(
        "/api/v1/bookings",
        json={
            "cafeId": str(cafe.id),
            "hardwareTierId": str(tier.id),
            "sessionDate": (date.today() + timedelta(days=2)).isoformat(),
            "startTime": "00:30:00",
            "durationHours": 1.5,
        },
        headers=auth_headers(gamer),
    )

    assert resp.status_code == 201, resp.json()
