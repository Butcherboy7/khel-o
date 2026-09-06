from typing import Any
from uuid import UUID
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analytics_event import AnalyticsEvent
from app.repositories.base import BaseRepository


class AnalyticsEventRepository(BaseRepository[AnalyticsEvent]):
    def __init__(self, db: AsyncSession):
        super().__init__(AnalyticsEvent, db)

    async def create_event(self, data: dict[str, Any]) -> AnalyticsEvent:
        event = AnalyticsEvent(**data)
        self.db.add(event)
        await self.db.commit()
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
