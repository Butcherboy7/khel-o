from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.models.promotion import Promotion
from app.models.booking import Booking, BookingStatus
from app.models.cafe import Cafe
from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.core.demo import not_demo_cafe, not_demo_user
from app.core.logging import logger
from app.core.time import IST, now_ist, session_start_ist
from app.services.account_deletion_service import DELETED_EMAIL_DOMAIN
from app.services.notification_service import NotificationService, format_session_time

async def expire_promotions(db: AsyncSession) -> int:
    now = datetime.now(timezone.utc)
    stmt = update(Promotion).where(
        Promotion.valid_until < now,
        Promotion.is_active == True
    ).values(is_active=False)
    result = await db.execute(stmt)
    await db.commit()
    expired_count = result.rowcount
    logger.info("expired_promotions_task", count=expired_count, timestamp=now.isoformat())
    return expired_count

# Cron runs scripts/send_session_reminders.py every 5 minutes, so a session is
# first picked up 30-35 minutes before it starts. Anything closer than
# REMINDER_LATEST is too late to be useful (they're on their way or there).
REMINDER_LEAD = timedelta(minutes=35)
REMINDER_LATEST = timedelta(minutes=10)
# Booked this close to the start: the confirmation they just got is the
# reminder, a second message minutes later is noise.
FRESH_BOOKING = timedelta(minutes=60)
# Seeded and placeholder addresses: emailing them only bounces, which hurts
# the sender reputation every real email depends on.
NO_EMAIL_DOMAINS = ("example.com", "example", "test", "invalid", DELETED_EMAIL_DOMAIN)


def _can_email(email: str) -> bool:
    domain = email.rsplit("@", 1)[-1].lower()
    return not any(domain == d or domain.endswith("." + d) for d in NO_EMAIL_DOMAINS)


async def send_session_reminders(db: AsyncSession, now: datetime | None = None, dry_run: bool = False) -> int:
    """Email + in-app note to each player whose session starts in about 30
    minutes. session_date/start_time are naive IST (see app/core/time.py).
    Returns how many players were (or, with dry_run, would be) reminded."""
    now = now or now_ist()
    today = now.astimezone(IST).date()

    stmt = (
        select(Booking, User, Cafe)
        .join(User, Booking.gamer_id == User.id)
        .join(Cafe, Booking.cafe_id == Cafe.id)
        .where(
            Booking.status == BookingStatus.CONFIRMED,
            Booking.reminder_sent == False,
            # A session just after midnight is "tomorrow" while it's 23:45 today.
            Booking.session_date.in_([today, today + timedelta(days=1)]),
            User.is_active == True,
            not_demo_cafe(),
            not_demo_user(),
        )
    )
    rows = (await db.execute(stmt)).all()

    notifier = NotificationService()
    sent_count = 0

    for booking, gamer, cafe in rows:
        start = session_start_ist(booking.session_date, booking.start_time)
        lead = start - now
        if not (REMINDER_LATEST <= lead <= REMINDER_LEAD):
            continue
        created_at = booking.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        if start - created_at < FRESH_BOOKING:
            continue

        sent_count += 1
        if dry_run:
            continue

        minutes = max(5, 5 * round(lead.total_seconds() / 300))
        start_label = format_session_time(booking.start_time)
        # Flag first and commit: if the email then fails, the player misses
        # one reminder; the other order risks sending it every 5 minutes.
        booking.reminder_sent = True
        db.add(Notification(
            user_id=booking.gamer_id,
            title=f"Your session starts in {minutes} min",
            message=f"{cafe.name} at {start_label}. Show the QR on your booking pass at the counter.",
            notification_type=NotificationType.BOOKING_REMINDER,
            link=f"/bookings/{booking.id}",
            dedupe_key=f"booking_reminder:{booking.id}",
        ))
        await db.commit()
        if _can_email(gamer.email):
            await notifier.send_session_reminder(db, booking.id, minutes)

    if sent_count > 0:
        logger.info("send_session_reminders_task", count=sent_count, dry_run=dry_run, timestamp=now.isoformat())

    return sent_count
