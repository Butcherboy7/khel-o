from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.models.promotion import Promotion
from app.models.booking import Booking, BookingStatus
from app.core.logging import logger
from app.services.notification_service import NotificationService

async def send_email_notification(to_email: str, subject: str, body: str):
    logger.info("sending_email", to_email=to_email, subject=subject)

async def send_web_push_notification(user_id: str, title: str, body: str):
    logger.info("sending_web_push", user_id=user_id, title=title)

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

async def send_session_reminders(db: AsyncSession) -> int:
    now_utc = datetime.now(timezone.utc)
    today = now_utc.date()

    stmt = select(Booking).where(
        Booking.status == BookingStatus.CONFIRMED,
        Booking.reminder_sent == False,
        Booking.session_date == today
    )
    res = await db.execute(stmt)
    bookings = res.scalars().all()

    notifier = NotificationService()
    sent_count = 0

    for booking in bookings:
        session_start = datetime.combine(booking.session_date, booking.start_time).replace(tzinfo=timezone.utc)
        time_until_session = session_start - now_utc

        # Check if session starts between 25 and 35 minutes from now
        if timedelta(minutes=25) <= time_until_session <= timedelta(minutes=35):
            await notifier.send_session_reminder(db, booking.id)
            booking.reminder_sent = True
            sent_count += 1

    if sent_count > 0:
        await db.commit()
        logger.info("send_session_reminders_task", count=sent_count, timestamp=now_utc.isoformat())

    return sent_count
