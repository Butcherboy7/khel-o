"""One way to ping every admin's phone. Anything an admin has to act on calls `alert_admins`."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.models.user_role import UserRoleMapping
from app.models.user import UserRole
from app.services.push_service import PushService


async def alert_admins(db: AsyncSession, title: str, body: str, url: str = "/admin") -> int:
    """Push to every device of every admin. Never raises: the thing being reported is already saved."""
    try:
        ids = list((await db.execute(
            select(UserRoleMapping.user_id).where(UserRoleMapping.role == UserRole.ADMIN))).scalars().all())
        # dedupeKey keeps two different events from replacing each other on the phone.
        return await PushService().send_to_users(
            db, ids, {"title": title, "body": body, "url": url, "type": "system", "dedupeKey": f"admin:{title}:{body}"[:200]})
    except Exception as e:  # noqa: BLE001
        logger.error("admin_alert_failed", title=title, error=str(e))
        return 0
