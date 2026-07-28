from typing import List, Optional, Tuple, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from app.models.cafe import Cafe, VerificationStatus
from app.repositories.base import BaseRepository

class CafeRepository(BaseRepository[Cafe]):
    def __init__(self, db: AsyncSession):
        super().__init__(Cafe, db)

    async def get_by_id(self, cafe_id: UUID) -> Optional[Cafe]:
        result = await self.db.execute(select(Cafe).where(Cafe.id == cafe_id))
        return result.scalars().first()

    async def get_by_owner_id(self, owner_id: UUID) -> List[Cafe]:
        result = await self.db.execute(select(Cafe).where(Cafe.owner_id == owner_id))
        return list(result.scalars().all())

    get_by_owner = get_by_owner_id

    async def get_all_verified(self, city: Optional[str] = None, page: int = 1, limit: int = 20) -> Tuple[List[Cafe], int]:
        query = select(Cafe).where(
            Cafe.verification_status == VerificationStatus.VERIFIED,
            Cafe.is_active == True
        )
        if city:
            query = query.where(func.lower(Cafe.city) == city.strip().lower())

        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        offset = (page - 1) * limit
        paginated_query = query.offset(offset).limit(limit)
        result = await self.db.execute(paginated_query)
        items = list(result.scalars().all())

        return items, total

    get_verified_cafes = get_all_verified

    async def search(self, query: Optional[str] = None, city: Optional[str] = None, page: int = 1, limit: int = 20) -> Tuple[List[Cafe], int]:
        stmt = select(Cafe).where(
            Cafe.verification_status == VerificationStatus.VERIFIED,
            Cafe.is_active == True
        )
        if city:
            stmt = stmt.where(func.lower(Cafe.city) == city.strip().lower())
        if query:
            search_pattern = f"%{query.strip().lower()}%"
            stmt = stmt.where(
                or_(
                    func.lower(Cafe.name).like(search_pattern),
                    func.lower(Cafe.description).like(search_pattern),
                    func.lower(Cafe.address_line1).like(search_pattern)
                )
            )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        offset = (page - 1) * limit
        paginated_stmt = stmt.offset(offset).limit(limit)
        result = await self.db.execute(paginated_stmt)
        items = list(result.scalars().all())

        return items, total

    async def create(self, cafe_data: dict[str, Any] | Cafe) -> Cafe:
        if isinstance(cafe_data, Cafe):
            cafe_obj = cafe_data
        else:
            cafe_obj = Cafe(**cafe_data)
        self.db.add(cafe_obj)
        await self.db.commit()
        await self.db.refresh(cafe_obj)
        return cafe_obj

    async def update(self, cafe_id: UUID, update_data: dict[str, Any]) -> Optional[Cafe]:
        cafe = await self.get_by_id(cafe_id)
        if not cafe:
            return None
        for field, value in update_data.items():
            if hasattr(cafe, field) and value is not None:
                setattr(cafe, field, value)
        await self.db.commit()
        await self.db.refresh(cafe)
        return cafe

    async def update_verification_status(self, cafe_id: UUID, status: VerificationStatus) -> Optional[Cafe]:
        is_active = (status == VerificationStatus.VERIFIED)
        return await self.update(cafe_id, {
            "verification_status": status,
            "is_active": is_active
        })

    async def get_pending_verification(self, page: int = 1, limit: int = 20) -> Tuple[List[Cafe], int]:
        stmt = select(Cafe).where(Cafe.verification_status == VerificationStatus.PENDING)
        
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        offset = (page - 1) * limit
        paginated_stmt = stmt.offset(offset).limit(limit)
        result = await self.db.execute(paginated_stmt)
        items = list(result.scalars().all())

        return items, total
