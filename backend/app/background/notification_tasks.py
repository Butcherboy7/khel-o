from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import update
from app.models.promotion import Promotion
from app.core.logging import logger

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
