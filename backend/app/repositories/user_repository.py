from typing import Optional, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.user import User
from app.repositories.base import BaseRepository

class UserRepository(BaseRepository[User]):
    def __init__(self, db: AsyncSession):
        super().__init__(User, db)

    async def get_by_id(self, user_id: UUID) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalars().first()

    async def get_by_email(self, email: str) -> Optional[User]:
        clean_email = email.strip().lower()
        result = await self.db.execute(
            select(User).where(func.lower(User.email) == clean_email)
        )
        return result.scalars().first()

    async def get_by_google_id(self, google_id: str) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.google_id == google_id))
        return result.scalars().first()

    async def create(self, user_data: dict[str, Any] | User) -> User:
        if isinstance(user_data, User):
            user_obj = user_data
        else:
            user_obj = User(**user_data)
        self.db.add(user_obj)
        await self.db.commit()
        await self.db.refresh(user_obj)
        return user_obj

    async def update(self, user_id: UUID, update_data: dict[str, Any]) -> Optional[User]:
        user = await self.get_by_id(user_id)
        if not user:
            return None
        for field, value in update_data.items():
            if hasattr(user, field):
                setattr(user, field, value)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def deactivate(self, user_id: UUID) -> Optional[User]:
        return await self.update(user_id, {"is_active": False})
