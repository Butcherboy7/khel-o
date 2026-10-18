"""Session reminders (scripts/send_session_reminders.py, every 5 min by cron).

The job used to read session times as UTC (they're naive IST), so a reminder
would have gone out 5.5 hours off, and nothing ever scheduled it. These pin
the window, the IST maths, the midnight rollover, and who must never get one.
"""
import pytest
from datetime import datetime, time, timedelta, timezone
from sqlalchemy import select

from app.background import notification_tasks
from app.background.notification_tasks import send_session_reminders
from app.core.time import IST
from app.models.booking import BookingStatus
from app.models.notification import Notification, NotificationType
from app.services.notification_service import NotificationService, format_session_time
from tests.test_launch_invariants import _make_owner_and_cafe, _make_gamer, _booking_with_fee

# A fixed far-future evening so other tests' bookings never fall in the window.
NOW = datetime(2031, 3, 14, 18, 0, tzinfo=IST)


@pytest.fixture
def sent_emails(monkeypatch):
    sent = []

    async def fake_send(self, to_email, subject, html_body, booking_ref):
        sent.append({"to": to_email, "subject": subject, "html": html_body})
        return True

    monkeypatch.setattr(NotificationService, "_send_resend_email", fake_send)
    return sent


async def _booking(db, cafe, tier, gamer, start, booked_before=timedelta(days=2), status=BookingStatus.CONFIRMED):
    b, fee = _booking_with_fee(cafe, tier, gamer.id, status, start.date())
    b.start_time = start.time().replace(tzinfo=None)
    b.end_time = (start + timedelta(hours=1)).time().replace(tzinfo=None)
    b.created_at = (start - booked_before).astimezone(timezone.utc)
    db.add_all([b, fee])
    await db.commit()
    return b


async def _notes(db, user_id):
    rows = await db.execute(select(Notification).where(Notification.user_id == user_id))
    return rows.scalars().all()


@pytest.mark.asyncio
async def test_reminds_30_minutes_before_in_ist_once(db_session, sent_emails):
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "remind")
    gamer = await _make_gamer(db_session)
    b = await _booking(db_session, cafe, tier, gamer, NOW + timedelta(minutes=30))

    assert await send_session_reminders(db_session, now=NOW) >= 1
    await db_session.refresh(b)
    assert b.reminder_sent is True

    mine = [e for e in sent_emails if e["to"] == gamer.email]
    assert len(mine) == 1
    assert "6:30 PM" in mine[0]["subject"] and "30 min" in mine[0]["subject"]
    assert f"/bookings/{b.id}" in mine[0]["html"]

    notes = await _notes(db_session, gamer.id)
    assert len(notes) == 1
    assert notes[0].notification_type == NotificationType.BOOKING_REMINDER
    assert notes[0].link == f"/bookings/{b.id}"

    # The next cron run five minutes later must not repeat it.
    await send_session_reminders(db_session, now=NOW + timedelta(minutes=5))
    assert len([e for e in sent_emails if e["to"] == gamer.email]) == 1
    assert len(await _notes(db_session, gamer.id)) == 1


@pytest.mark.asyncio
async def test_session_time_is_read_as_ist_not_utc(db_session, sent_emails):
    """A session whose wall-clock time is 30 min ahead of *UTC* now is really
    5 hours away in IST: no reminder yet."""
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "remutc")
    gamer = await _make_gamer(db_session)
    utc_wall = (NOW.astimezone(timezone.utc) + timedelta(minutes=30)).replace(tzinfo=IST)
    b = await _booking(db_session, cafe, tier, gamer, utc_wall)

    await send_session_reminders(db_session, now=NOW)
    await db_session.refresh(b)
    assert b.reminder_sent is False
    assert not [e for e in sent_emails if e["to"] == gamer.email]


@pytest.mark.asyncio
@pytest.mark.parametrize("minutes_away", [120, 40, 5, -15])
async def test_outside_the_window_waits_or_skips(db_session, sent_emails, minutes_away):
    owner, cafe, tier = await _make_owner_and_cafe(db_session, f"remwin{minutes_away}")
    gamer = await _make_gamer(db_session)
    b = await _booking(db_session, cafe, tier, gamer, NOW + timedelta(minutes=minutes_away))

    await send_session_reminders(db_session, now=NOW)
    await db_session.refresh(b)
    assert b.reminder_sent is False
    assert not [e for e in sent_emails if e["to"] == gamer.email]


@pytest.mark.asyncio
async def test_just_after_midnight_session_is_reminded_the_evening_before(db_session, sent_emails):
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "remmid")
    gamer = await _make_gamer(db_session)
    late = datetime(2031, 3, 14, 23, 45, tzinfo=IST)
    b = await _booking(db_session, cafe, tier, gamer, late + timedelta(minutes=30))  # 00:15 on the 15th
    assert b.session_date.day == 15

    await send_session_reminders(db_session, now=late)
    await db_session.refresh(b)
    assert b.reminder_sent is True
    assert "12:15 AM" in [e for e in sent_emails if e["to"] == gamer.email][0]["subject"]


@pytest.mark.asyncio
async def test_booked_minutes_ago_gets_no_second_message(db_session, sent_emails):
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "remfresh")
    gamer = await _make_gamer(db_session)
    b = await _booking(db_session, cafe, tier, gamer, NOW + timedelta(minutes=30), booked_before=timedelta(minutes=40))

    await send_session_reminders(db_session, now=NOW)
    await db_session.refresh(b)
    assert b.reminder_sent is False
    assert not [e for e in sent_emails if e["to"] == gamer.email]


@pytest.mark.asyncio
async def test_unpaid_or_cancelled_bookings_are_not_reminded(db_session, sent_emails):
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "remstat")
    gamer = await _make_gamer(db_session)
    for status in (BookingStatus.PENDING_PAYMENT, BookingStatus.CANCELLED):
        await _booking(db_session, cafe, tier, gamer, NOW + timedelta(minutes=30), status=status)

    await send_session_reminders(db_session, now=NOW)
    assert not [e for e in sent_emails if e["to"] == gamer.email]
    assert not await _notes(db_session, gamer.id)


@pytest.mark.asyncio
async def test_demo_cafe_is_never_reminded(db_session, sent_emails):
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "remdemo")
    cafe.slug = "khelo-demo-remind-test"
    gamer = await _make_gamer(db_session)
    b = await _booking(db_session, cafe, tier, gamer, NOW + timedelta(minutes=30))

    await send_session_reminders(db_session, now=NOW)
    await db_session.refresh(b)
    assert b.reminder_sent is False
    assert not [e for e in sent_emails if e["to"] == gamer.email]


@pytest.mark.asyncio
async def test_placeholder_address_gets_the_in_app_note_but_no_email(db_session, sent_emails):
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "remplace")
    gamer = await _make_gamer(db_session)
    gamer.email = f"placeholder-{gamer.id.hex[:8]}@example.com"
    await db_session.commit()
    b = await _booking(db_session, cafe, tier, gamer, NOW + timedelta(minutes=30))

    await send_session_reminders(db_session, now=NOW)
    await db_session.refresh(b)
    assert b.reminder_sent is True
    assert len(await _notes(db_session, gamer.id)) == 1
    assert not [e for e in sent_emails if e["to"] == gamer.email]


@pytest.mark.asyncio
async def test_dry_run_counts_but_sends_and_marks_nothing(db_session, sent_emails):
    owner, cafe, tier = await _make_owner_and_cafe(db_session, "remdry")
    gamer = await _make_gamer(db_session)
    b = await _booking(db_session, cafe, tier, gamer, NOW + timedelta(minutes=30))

    assert await send_session_reminders(db_session, now=NOW, dry_run=True) >= 1
    await db_session.refresh(b)
    assert b.reminder_sent is False
    assert not [e for e in sent_emails if e["to"] == gamer.email]
    assert not await _notes(db_session, gamer.id)


def test_can_email_rejects_placeholder_domains():
    can = notification_tasks._can_email
    assert can("player@gmail.com") and can("owner@test.com")
    for bad in ("khelo.demo.gamer01@example.com", "hello@levelup-arena.example",
                "x@foo.test", "x@nowhere.invalid", "deleted-ab12@deleted.khel-o.com"):
        assert not can(bad), bad


def test_format_session_time():
    assert format_session_time(time(18, 30)) == "6:30 PM"
    assert format_session_time(time(0, 15)) == "12:15 AM"
    assert format_session_time(time(12, 0)) == "12:00 PM"
    assert format_session_time(time(9, 5)) == "9:05 AM"


@pytest.mark.asyncio
async def test_script_refuses_to_send_outside_production(monkeypatch, capsys):
    """Dev's database is a copy of prod with real customers."""
    import sys
    from scripts import send_session_reminders as script

    called = []

    async def fake(db, dry_run=False):
        called.append(dry_run)
        return 0

    monkeypatch.setattr(script, "send_session_reminders", fake)
    monkeypatch.setattr(script.settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(sys, "argv", ["send_session_reminders.py"])
    await script.main()
    assert called == [] and "refusing" in capsys.readouterr().out

    monkeypatch.setattr(sys, "argv", ["send_session_reminders.py", "--dry-run"])
    await script.main()
    assert called == [True]
