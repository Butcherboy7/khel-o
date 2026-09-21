from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.models.cafe import Cafe
from app.models.notification import Notification
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.services.push_service import PushService


class CafeNotifier:
    """Single owner/staff notification path for a café.

    Replaces the byte-identical `_notify_owner()` that previously lived in both
    BookingService and PaymentService. Both are call sites for push, so a third
    copy would have been the point where they drifted.
    """

    async def resolve_recipients(self, db: AsyncSession, cafe_id: UUID) -> list[UUID]:
        """The café owner plus every active staff user mapped to this café."""
        cafe = (await db.execute(select(Cafe).where(Cafe.id == cafe_id))).scalars().first()
        if not cafe or not cafe.owner_id:
            return []

        recipients: list[UUID] = [cafe.owner_id]

        staff_rows = await db.execute(
            select(UserRoleMapping.user_id)
            .join(User, User.id == UserRoleMapping.user_id)
            .where(
                UserRoleMapping.cafe_id == cafe_id,
                UserRoleMapping.role == UserRole.STAFF,
                User.is_active == True,  # noqa: E712 — SQLAlchemy needs the comparison
            )
        )
        for (user_id,) in staff_rows.all():
            if user_id not in recipients:
                recipients.append(user_id)

        return recipients

    async def notify_cafe(
        self,
        db: AsyncSession,
        cafe_id: UUID,
        title: str,
        message: str,
        notification_type: str = "system",
        link: str | None = None,
        dedupe_key: str | None = None,
    ) -> int:
        """Write an in-app notification for every recipient, then push to the
        ones that were newly written. Returns how many users were newly
        notified. Never raises."""
        try:
            recipients = await self.resolve_recipients(db, cafe_id)
            if not recipients:
                return 0

            newly_notified: list[UUID] = []
            for user_id in recipients:
                if await self._insert_notification(
                    db, user_id, title, message, notification_type, link, dedupe_key
                ):
                    newly_notified.append(user_id)

            if not newly_notified:
                return 0

            try:
                await self._push(db, newly_notified, {
                    "title": title,
                    "body": message,
                    "url": link or "/owner/dashboard",
                    "dedupeKey": dedupe_key,
                    "type": notification_type,
                })
            except Exception as e:
                # The in-app rows are already committed and the bell will show
                # them. Push is the bonus, never the contract.
                logger.error("cafe_notifier_push_failed", error=str(e), cafe_id=str(cafe_id))

            return len(newly_notified)
        except Exception as e:
            logger.error("cafe_notifier_failed", error=str(e), cafe_id=str(cafe_id))
            return 0

    async def _insert_notification(
        self, db, user_id, title, message, notification_type, link, dedupe_key
    ) -> bool:
        """True if a row was written, False if this user already has one for
        this dedupe_key.

        Check-then-insert with an IntegrityError backstop rather than
        ON CONFLICT: tests run on SQLite and production on Postgres, and
        `on_conflict_do_nothing` is dialect-specific. The index is what actually
        guarantees correctness under a race; the pre-check just avoids noisy
        rollbacks in the common case.
        """
        if dedupe_key:
            existing = await db.execute(
                select(Notification.id).where(
                    Notification.user_id == user_id,
                    Notification.dedupe_key == dedupe_key,
                )
            )
            if existing.scalars().first():
                return False

        db.add(Notification(
            id=uuid4(),
            user_id=user_id,
            title=title,
            message=message,
            notification_type=notification_type,
            is_read=False,
            link=link,
            dedupe_key=dedupe_key,
        ))
        try:
            await db.commit()
            return True
        except IntegrityError:
            await db.rollback()
            return False

    async def _push(self, db: AsyncSession, user_ids: list[UUID], payload: dict) -> int:
        return await PushService().send_to_users(db, user_ids, payload)
