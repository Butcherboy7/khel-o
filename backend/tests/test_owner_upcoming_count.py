"""Owner badge: paid bookings still waiting for check-in time, per owner."""
from datetime import date, time, timedelta

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.booking import BookingStatus
from app.services.owner_service import IST
from datetime import datetime
from tests.conftest import auth_headers
from tests.test_booking_release import _make_pending_booking


async def _count(owner):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/api/v1/owner/upcoming-bookings-count", headers=auth_headers(owner))
    assert r.status_code == 200, r.text
    return r.json()["data"]["count"]


@pytest.mark.asyncio
async def test_count_follows_status_and_check_in_time(db_session):
    owner, other, _g, _c, _t, booking, _p = await _make_pending_booking(db_session)

    assert await _count(owner) == 0          # unpaid holds don't count

    booking.status = BookingStatus.CONFIRMED  # tomorrow 10:00
    await db_session.commit()
    assert await _count(owner) == 1
    assert await _count(other) == 0          # another owner never sees it

    now = datetime.now(IST)
    booking.session_date = now.date()
    booking.start_time = (now - timedelta(minutes=5)).time().replace(tzinfo=None)
    await db_session.commit()
    if (now - timedelta(minutes=5)).date() == now.date():  # skip the first 5 min after midnight
        assert await _count(owner) == 0      # check-in time passed: drops off

    booking.session_date = date.today() + timedelta(days=1)
    booking.status = BookingStatus.CANCELLED
    await db_session.commit()
    assert await _count(owner) == 0
