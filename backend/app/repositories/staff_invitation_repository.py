import uuid
from typing import Optional, List
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.staff_invitation import StaffInvitation

class StaffInvitationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, invitation_data: dict) -> StaffInvitation:
        invitation = StaffInvitation(**invitation_data)
        self.db.add(invitation)
        await self.db.commit()
        await self.db.refresh(invitation)
        return invitation

    async def get_by_id(self, invitation_id: uuid.UUID) -> Optional[StaffInvitation]:
        stmt = select(StaffInvitation).where(StaffInvitation.id == invitation_id)
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def get_by_token(self, token: str) -> Optional[StaffInvitation]:
        stmt = select(StaffInvitation).where(StaffInvitation.token == token)
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def get_pending_by_email_and_venue(self, email: str, venue_id: uuid.UUID) -> Optional[StaffInvitation]:
        stmt = select(StaffInvitation).where(
            StaffInvitation.email == email.lower().strip(),
            StaffInvitation.venue_id == venue_id,
            StaffInvitation.status == "pending"
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def get_pending_by_email(self, email: str) -> List[StaffInvitation]:
        clean_email = email.lower().strip()
        now = datetime.now(timezone.utc)
        stmt = select(StaffInvitation).where(
            StaffInvitation.email == clean_email,
            StaffInvitation.status == "pending"
        )
        res = await self.db.execute(stmt)
        invites = list(res.scalars().all())
        valid_invites = []
        for inv in invites:
            exp = inv.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp > now:
                valid_invites.append(inv)
        return valid_invites

    async def get_by_venue_id(self, venue_id: uuid.UUID) -> List[StaffInvitation]:
        stmt = select(StaffInvitation).where(
            StaffInvitation.venue_id == venue_id
        ).order_by(StaffInvitation.created_at.desc())
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    get_by_venue = get_by_venue_id

    async def update_status(self, invitation_id: uuid.UUID, status: str) -> Optional[StaffInvitation]:
        return await self.update(invitation_id, {"status": status})

    async def update(self, invitation_id: uuid.UUID, update_data: dict) -> Optional[StaffInvitation]:
        invitation = await self.get_by_id(invitation_id)
        if not invitation:
            return None
        for key, value in update_data.items():
            setattr(invitation, key, value)
        await self.db.commit()
        await self.db.refresh(invitation)
        return invitation
