import uuid
from typing import Dict, List, Optional

from sqlalchemy import select, func, delete, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cafe_waitlist import CafeWaitlistEntry


class WaitlistRepository:
    """All SQL for the café waitlist.

    Kept out of CafeRepository deliberately: that class already owns café
    search and is long enough, and this is a separate concern with its own
    identity rules.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    def _identity_clause(self, cafe_id: uuid.UUID, user_id: Optional[uuid.UUID], session_id: str):
        """Who counts as 'the same person'.

        Signed in -> the account, so the entry follows them across devices.
        Signed out -> the browser session, which is the only handle available.
        """
        if user_id is not None:
            return and_(
                CafeWaitlistEntry.cafe_id == cafe_id,
                CafeWaitlistEntry.user_id == user_id,
            )
        return and_(
            CafeWaitlistEntry.cafe_id == cafe_id,
            CafeWaitlistEntry.user_id.is_(None),
            CafeWaitlistEntry.session_id == session_id,
        )

    async def join(
        self,
        cafe_id: uuid.UUID,
        user_id: Optional[uuid.UUID],
        session_id: str,
        contact: Optional[str] = None,
    ) -> CafeWaitlistEntry:
        """Idempotent: tapping 'Notify me' twice must not inflate the count."""
        existing = (await self.db.execute(
            select(CafeWaitlistEntry).where(self._identity_clause(cafe_id, user_id, session_id))
        )).scalar_one_or_none()
        if existing:
            return existing

        entry = CafeWaitlistEntry(
            id=uuid.uuid4(),
            cafe_id=cafe_id,
            user_id=user_id,
            session_id=session_id,
            contact=contact,
        )
        self.db.add(entry)
        await self.db.commit()
        await self.db.refresh(entry)
        return entry

    async def leave(self, cafe_id: uuid.UUID, user_id: Optional[uuid.UUID], session_id: str) -> bool:
        result = await self.db.execute(
            delete(CafeWaitlistEntry).where(self._identity_clause(cafe_id, user_id, session_id))
        )
        await self.db.commit()
        return (result.rowcount or 0) > 0

    async def count(self, cafe_id: uuid.UUID) -> int:
        return (await self.db.execute(
            select(func.count(CafeWaitlistEntry.id)).where(CafeWaitlistEntry.cafe_id == cafe_id)
        )).scalar() or 0

    async def has_joined(
        self, cafe_id: uuid.UUID, user_id: Optional[uuid.UUID], session_id: str
    ) -> bool:
        total = (await self.db.execute(
            select(func.count(CafeWaitlistEntry.id))
            .where(self._identity_clause(cafe_id, user_id, session_id))
        )).scalar() or 0
        return total > 0

    async def counts_for(self, cafe_ids: List[uuid.UUID]) -> Dict[uuid.UUID, int]:
        """Batch count for the explore grid — one query for the page, not one
        per card."""
        if not cafe_ids:
            return {}
        rows = (await self.db.execute(
            select(CafeWaitlistEntry.cafe_id, func.count(CafeWaitlistEntry.id))
            .where(CafeWaitlistEntry.cafe_id.in_(cafe_ids))
            .group_by(CafeWaitlistEntry.cafe_id)
        )).all()
        return {cafe_id: total for cafe_id, total in rows}
