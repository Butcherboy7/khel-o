from typing import Optional, List, Tuple, Any, Dict
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.models.user import User, UserRole
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

    async def get_all_admin(
        self,
        role: Optional[str] = None,
        is_active: Optional[bool] = None,
        email_search: Optional[str] = None,
        page: int = 1,
        limit: int = 20
    ) -> Tuple[List[User], int]:
        stmt = select(User)
        filters = []

        if role:
            filters.append(User.role == role)
        if is_active is not None:
            filters.append(User.is_active == is_active)
        if email_search:
            filters.append(func.lower(User.email).contains(email_search.strip().lower()))

        if filters:
            stmt = stmt.where(and_(*filters))

        stmt = stmt.order_by(User.created_at.desc())

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        offset = (page - 1) * limit
        paginated_stmt = stmt.offset(offset).limit(limit)
        result = await self.db.execute(paginated_stmt)
        items = list(result.scalars().all())

        return items, total

    async def count_by_role(self) -> Dict[str, int]:
        stmt = select(User.role, func.count(User.id)).group_by(User.role)
        res = await self.db.execute(stmt)
        rows = res.all()
        counts = {"gamer": 0, "cafe_owner": 0, "admin": 0}
        for r, cnt in rows:
            r_str = r.value if hasattr(r, "value") else str(r)
            counts[r_str] = cnt
        return counts

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

    async def activate(self, user_id: UUID) -> Optional[User]:
        return await self.update(user_id, {"is_active": True})

    async def update_role(self, user_id: UUID, role: UserRole) -> Optional[User]:
        return await self.update(user_id, {"role": role})
