from typing import Any
from uuid import UUID
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationException
from app.models.analytics_event import AnalyticsEvent
from app.repositories.base import BaseRepository
from app.repositories.cafe_repository import CafeRepository


class AnalyticsEventRepository(BaseRepository[AnalyticsEvent]):
    def __init__(self, db: AsyncSession):
        super().__init__(AnalyticsEvent, db)

    async def create_event(self, data: dict[str, Any]) -> AnalyticsEvent:
        cafe_id = data.get("cafe_id")
        if cafe_id is not None:
            cafe = await CafeRepository(self.db).get_by_id(cafe_id)
            if cafe is None:
                raise ValidationException(
                    message="Referenced café does not exist",
                    error_code="INVALID_CAFE_ID",
                )

        event = AnalyticsEvent(**data)
        self.db.add(event)
        try:
            await self.db.commit()
        except IntegrityError:
            # Defense in depth: a race (café deleted between the check above and
            # this commit) or any other DB-enforced FK violation should still
            # surface as a controlled 422, not a raw 500.
            await self.db.rollback()
            raise ValidationException(
                message="Referenced café does not exist",
                error_code="INVALID_CAFE_ID",
            )
        await self.db.refresh(event)
        return event

    async def backfill_session(self, session_id: str, user_id: UUID) -> int:
        """Link anonymous pre-signup events to the user who just registered."""
        stmt = (
            update(AnalyticsEvent)
            .where(AnalyticsEvent.session_id == session_id, AnalyticsEvent.user_id.is_(None))
            .values(user_id=user_id)
        )
        result = await self.db.execute(stmt)
        await self.db.commit()
        return result.rowcount or 0
