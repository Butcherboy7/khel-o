from typing import List, Optional, Tuple, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, and_
from app.models.review import Review
from app.models.user import User
from app.repositories.base import BaseRepository

class ReviewRepository(BaseRepository[Review]):
    def __init__(self, db: AsyncSession):
        super().__init__(Review, db)

    async def get_by_id(self, review_id: UUID) -> Optional[Review]:
        result = await self.db.execute(select(Review).where(Review.id == review_id))
        return result.scalars().first()

    async def get_by_booking_id(self, booking_id: UUID) -> Optional[Review]:
        result = await self.db.execute(select(Review).where(Review.booking_id == booking_id))
        return result.scalars().first()

    async def get_by_gamer_id(self, gamer_id: UUID) -> List[Review]:
        result = await self.db.execute(
            select(Review).where(Review.gamer_id == gamer_id).order_by(Review.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_by_cafe_id(
        self,
        cafe_id: UUID,
        page: int = 1,
        limit: int = 20,
        include_hidden: bool = False
    ) -> Tuple[List[Tuple[Review, str]], int]:
        stmt = select(Review, User.full_name).join(User, Review.gamer_id == User.id)
        
        filters = [Review.cafe_id == cafe_id]
        if not include_hidden:
            filters.append(Review.is_visible == True)

        stmt = stmt.where(and_(*filters)).order_by(Review.created_at.desc())

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        offset = (page - 1) * limit
        paginated_stmt = stmt.offset(offset).limit(limit)
        result = await self.db.execute(paginated_stmt)
        rows = result.all()

        items = []
        for row in rows:
            review_obj = row[0]
            full_name = row[1] or "Gamer"
            first_name = full_name.split()[0]
            items.append((review_obj, first_name))

        return items, total

    async def get_all_admin(
        self,
        cafe_id: Optional[UUID] = None,
        page: int = 1,
        limit: int = 20
    ) -> Tuple[List[Tuple[Review, str]], int]:
        stmt = select(Review, User.full_name).join(User, Review.gamer_id == User.id)
        if cafe_id:
            stmt = stmt.where(Review.cafe_id == cafe_id)
        stmt = stmt.order_by(Review.created_at.desc())

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        offset = (page - 1) * limit
        paginated_stmt = stmt.offset(offset).limit(limit)
        result = await self.db.execute(paginated_stmt)
        rows = result.all()

        items = []
        for row in rows:
            review_obj = row[0]
            full_name = row[1] or "Gamer"
            first_name = full_name.split()[0]
            items.append((review_obj, first_name))

        return items, total

    async def get_average_rating_and_count(self, cafe_id: UUID) -> Tuple[float, int]:
        stmt = select(
            func.avg(Review.rating),
            func.count(Review.id)
        ).where(
            Review.cafe_id == cafe_id,
            Review.is_visible == True
        )
        res = await self.db.execute(stmt)
        row = res.first()
        if not row or row[0] is None:
            return 0.0, 0
        avg_rating = round(float(row[0]), 1)
        total_count = int(row[1])
        return avg_rating, total_count

    async def create(self, review_data: dict[str, Any] | Review) -> Review:
        if isinstance(review_data, Review):
            review_obj = review_data
        else:
            review_obj = Review(**review_data)
        self.db.add(review_obj)
        await self.db.commit()
        await self.db.refresh(review_obj)
        return review_obj

    async def toggle_visibility(self, review_id: UUID, is_visible: bool) -> Optional[Review]:
        review = await self.get_by_id(review_id)
        if not review:
            return None
        review.is_visible = is_visible
        await self.db.commit()
        await self.db.refresh(review)
        return review
