"""Owner "close the café for a day": every booking that day is cancelled.

The service used `select` without importing it, so this endpoint raised a
NameError (500) every time and cancelled nothing.
"""
from tests.conftest import auth_headers
from tests.test_booking_release import _make_pending_booking


async def test_emergency_close_cancels_that_days_bookings(db_session, async_client):
    owner, _other, _gamer, cafe, _tier, booking, _payment = await _make_pending_booking(db_session)

    r = await async_client.post(
        f"/api/v1/owner/cafes/{cafe.id}/emergency-close",
        params={"date": booking.session_date.isoformat()},
        headers=auth_headers(owner),
    )
    assert r.status_code == 200, r.text
    cancelled = r.json()["data"]["cancelledBookings"]
    assert [b["id"] for b in cancelled] == [str(booking.id)]
    assert cancelled[0]["status"] == "cancelled"


async def test_emergency_close_refuses_another_owners_cafe(db_session, async_client):
    _owner, other_owner, _gamer, cafe, _tier, booking, _payment = await _make_pending_booking(db_session)

    r = await async_client.post(
        f"/api/v1/owner/cafes/{cafe.id}/emergency-close",
        params={"date": booking.session_date.isoformat()},
        headers=auth_headers(other_owner),
    )
    assert r.status_code == 403, r.text


async def test_upcoming_today_uses_india_time(db_session, monkeypatch):
    """23:00 UTC is 04:30 the next day in India: a 10:00 IST session that day
    is upcoming, even though UTC still says it is the previous date."""
    from datetime import datetime, time, timedelta
    from app.core.time import IST
    from app.repositories import booking_repository as br
    from app.repositories.booking_repository import BookingRepository

    _owner, _other, _gamer, cafe, _tier, booking, _payment = await _make_pending_booking(db_session)
    fake_now = datetime.combine(booking.session_date, time(4, 30), tzinfo=IST)
    monkeypatch.setattr(br, "now_ist", lambda: fake_now)
    booking.status = "confirmed"
    await db_session.commit()

    assert await BookingRepository(db_session).count_upcoming_today([cafe.id]) == 1
    monkeypatch.setattr(br, "now_ist", lambda: fake_now + timedelta(hours=6))  # 10:30, started
    assert await BookingRepository(db_session).count_upcoming_today([cafe.id]) == 0
