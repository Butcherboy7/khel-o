"""
Regression lock for the post-midnight booking lead-time validator in
booking_service.create_booking (booking_service.py ~92-100).

This validator combines `session_date + start_time` as IST and compares it
against `datetime.now(IST)`, requiring at least 30 minutes of lead time. That
math is correct; the bug this guards against was in the FRONTEND, which used
to submit the wrong `session_date` for slots after midnight (see
frontend/src/lib/format.ts minutesToTimeString and bookings/new/page.tsx).

These tests exercise the REAL production code path (the actual HTTP booking
endpoint -> BookingService.create_booking), with `datetime.now(IST)` frozen
to a controlled value, so this behavior can never silently regress.
"""
import pytest
from datetime import datetime, date, time, timedelta
from uuid import uuid4

from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.time import IST
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.core.security import get_password_hash
from tests.conftest import auth_headers

import app.services.booking_service as booking_service_module

# Reference date used throughout the matrix — matches the brief's "20 Aug" / "21 Aug".
BASE_DATE = date(2026, 8, 20)
NEXT_DATE = date(2026, 8, 21)


def _freeze_now(monkeypatch, frozen_ist: datetime):
    """Freeze `datetime.now(...)` as seen by booking_service.py, while leaving
    every other datetime classmethod (combine, etc.) behaving normally. We
    subclass datetime rather than mocking the whole module attribute so that
    `datetime.combine(...)` inside booking_service still works unmodified."""

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            if tz is not None:
                return frozen_ist.astimezone(tz)
            return frozen_ist

    monkeypatch.setattr(booking_service_module, "datetime", FrozenDateTime)


async def _setup_cafe_and_gamer(db_session):
    owner = User(
        id=uuid4(),
        email=f"tv_owner_{uuid4().hex}@test.com",
        full_name="Owner",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.CAFE_OWNER,
        is_active=True,
    )
    gamer = User(
        id=uuid4(),
        email=f"tv_gamer_{uuid4().hex}@test.com",
        full_name="Gamer",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.GAMER,
        is_active=True,
    )
    db_session.add_all([owner, gamer])
    await db_session.flush()

    db_session.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    db_session.add(UserRoleMapping(id=uuid4(), user_id=gamer.id, role=UserRole.GAMER))

    cafe = Cafe(
        id=uuid4(),
        owner_id=owner.id,
        name="Time Validation Café",
        address_line1="1 Test St",
        city="Bengaluru",
        state="Karnataka",
        pincode="560001",
        phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED,
        is_active=True,
        # Backend's create_booking never gates on café operating hours (only
        # the frontend timeline does), so hours here are irrelevant to what
        # this test file checks — kept wide open so every matrix row is valid
        # regardless of the time-of-day it uses.
        opening_time=time(0, 0),
        closing_time=time(23, 59),
        bookable_stations=10,
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
        is_active=True,
    )
    db_session.add(tier)

    await db_session.commit()
    return cafe, tier, gamer


MATRIX = [
    # (now_time, session_date, start_time, expected_accepted, id)
    (time(23, 0), BASE_DATE, "23:30:00", True, "20aug_2300_now__20aug_2330_start__accepted"),
    (time(23, 0), NEXT_DATE, "00:00:00", True, "20aug_2300_now__21aug_0000_start__accepted"),
    (time(23, 0), NEXT_DATE, "00:30:00", True, "20aug_2300_now__21aug_0030_start__accepted"),
    (time(23, 45), NEXT_DATE, "00:00:00", False, "20aug_2345_now__21aug_0000_start__rejected_15min"),
    (time(23, 45), NEXT_DATE, "00:15:00", True, "20aug_2345_now__21aug_0015_start__accepted_exactly_30"),
    (time(23, 59), NEXT_DATE, "00:30:00", True, "20aug_2359_now__21aug_0030_start__accepted"),
    (time(10, 0), BASE_DATE, "10:10:00", False, "20aug_1000_now__20aug_1010_start__rejected_10min"),
    (time(23, 0), BASE_DATE, "00:30:00", False, "20aug_2300_now__20aug_0030_start__rejected_same_day_past_time_regression"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "now_time,session_date,start_time,expected_accepted",
    [(m[0], m[1], m[2], m[3]) for m in MATRIX],
    ids=[m[4] for m in MATRIX],
)
async def test_booking_lead_time_matrix(db_session, monkeypatch, now_time, session_date, start_time, expected_accepted):
    cafe, tier, gamer = await _setup_cafe_and_gamer(db_session)

    frozen_ist = datetime.combine(BASE_DATE, now_time).replace(tzinfo=IST)
    _freeze_now(monkeypatch, frozen_ist)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        gamer_headers = auth_headers(gamer)
        resp = await client.post(
            "/api/v1/bookings",
            json={
                "cafeId": str(cafe.id),
                "hardwareTierId": str(tier.id),
                "sessionDate": session_date.isoformat(),
                "startTime": start_time,
                "durationHours": 1,
            },
            headers=gamer_headers,
        )

    if expected_accepted:
        assert resp.status_code == 201, f"Expected acceptance but got {resp.status_code}: {resp.json()}"
    else:
        assert resp.status_code == 422, f"Expected rejection but got {resp.status_code}: {resp.json()}"
        assert resp.json().get("error", {}).get("code") == "INVALID_START_TIME"
