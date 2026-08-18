from typing import Optional
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.models.password_reset_token import PasswordResetToken
from app.repositories.base import BaseRepository


class PasswordResetRepository(BaseRepository[PasswordResetToken]):
    def __init__(self, db: AsyncSession):
        super().__init__(PasswordResetToken, db)

    async def create(self, reset_token: PasswordResetToken) -> PasswordResetToken:
        self.db.add(reset_token)
        await self.db.commit()
        await self.db.refresh(reset_token)
        return reset_token

    async def get_by_token(self, token: str) -> Optional[PasswordResetToken]:
        result = await self.db.execute(select(PasswordResetToken).where(PasswordResetToken.token == token))
        return result.scalars().first()

    async def mark_used(self, token_id: UUID) -> None:
        await self.db.execute(
            update(PasswordResetToken)
            .where(PasswordResetToken.id == token_id)
            .values(used_at=datetime.now(timezone.utc))
        )
        await self.db.commit()

    async def invalidate_all_for_user(self, user_id: UUID) -> None:
        """Mark every still-usable token for this user as used, so an old leaked link can't be replayed."""
        await self.db.execute(
            update(PasswordResetToken)
            .where(PasswordResetToken.user_id == user_id, PasswordResetToken.used_at.is_(None))
            .values(used_at=datetime.now(timezone.utc))
        )
        await self.db.commit()
