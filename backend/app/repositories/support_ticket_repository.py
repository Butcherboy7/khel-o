from typing import List, Optional, Tuple
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.support_ticket import SupportTicket, SupportTicketStatus
from app.repositories.base import BaseRepository


class SupportTicketRepository(BaseRepository[SupportTicket]):
    def __init__(self, db: AsyncSession):
        super().__init__(SupportTicket, db)

    async def create(self, ticket: SupportTicket) -> SupportTicket:
        self.db.add(ticket)
        await self.db.commit()
        await self.db.refresh(ticket)
        return ticket

    async def get_by_user(self, user_id: UUID, page: int = 1, limit: int = 20) -> Tuple[List[SupportTicket], int]:
        stmt = select(SupportTicket).where(SupportTicket.user_id == user_id).order_by(SupportTicket.created_at.desc())
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0

        offset = (page - 1) * limit
        result = await self.db.execute(stmt.offset(offset).limit(limit))
        return list(result.scalars().all()), total

    async def list_all(
        self,
        status: Optional[SupportTicketStatus] = None,
        category: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> Tuple[List[SupportTicket], int]:
        stmt = select(SupportTicket)
        if status:
            stmt = stmt.where(SupportTicket.status == status)
        if category:
            stmt = stmt.where(SupportTicket.category == category)
        stmt = stmt.order_by(SupportTicket.created_at.desc())

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0

        offset = (page - 1) * limit
        result = await self.db.execute(stmt.offset(offset).limit(limit))
        return list(result.scalars().all()), total

    async def update_fields(self, ticket: SupportTicket, fields: dict) -> SupportTicket:
        for key, value in fields.items():
            if value is not None:
                setattr(ticket, key, value)
        if fields.get("status") in (SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED) and not ticket.resolved_at:
            ticket.resolved_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(ticket)
        return ticket
