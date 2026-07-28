from typing import List, Optional, Tuple, Any, Dict
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, cast, Float
from sqlalchemy.dialects.postgresql import JSONB

from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
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

    async def search_verified(
        self,
        city: Optional[str] = None,
        query: Optional[str] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        amenities: Optional[List[str]] = None,
        page: int = 1,
        limit: int = 20
    ) -> Tuple[List[Dict[str, Any]], int]:
        stmt = select(Cafe).where(
            Cafe.verification_status == VerificationStatus.VERIFIED,
            Cafe.is_active == True
        )

        if city and city.strip():
            stmt = stmt.where(func.lower(Cafe.city) == city.strip().lower())

        if query and query.strip():
            search_pattern = f"%{query.strip().lower()}%"
            stmt = stmt.where(
                or_(
                    func.lower(Cafe.name).like(search_pattern),
                    func.lower(Cafe.description).like(search_pattern)
                )
            )

        if amenities:
            for amenity in amenities:
                if amenity.strip():
                    stmt = stmt.where(Cafe.amenities.contains([amenity.strip()]))

        # Subquery or join for hardware tiers price filtering
        if min_price is not None or max_price is not None:
            tier_subquery = select(HardwareTier.cafe_id).where(HardwareTier.is_active == True)
            if min_price is not None:
                tier_subquery = tier_subquery.where(HardwareTier.price_per_hour >= min_price)
            if max_price is not None:
                tier_subquery = tier_subquery.where(HardwareTier.price_per_hour <= max_price)
            stmt = stmt.where(Cafe.id.in_(tier_subquery))

        # Order by created_at desc
        stmt = stmt.order_by(Cafe.created_at.desc())

        # Total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        offset = (page - 1) * limit
        paginated_stmt = stmt.offset(offset).limit(limit)
        cafes_result = await self.db.execute(paginated_stmt)
        cafes = list(cafes_result.scalars().all())

        if not cafes:
            return [], total

        # Batch fetch active hardware tiers for these cafes
        cafe_ids = [c.id for c in cafes]
        tiers_stmt = select(HardwareTier).where(
            HardwareTier.cafe_id.in_(cafe_ids),
            HardwareTier.is_active == True
        )
        tiers_result = await self.db.execute(tiers_stmt)
        tiers = list(tiers_result.scalars().all())

        # Group tiers by cafe_id
        tiers_by_cafe: Dict[UUID, List[HardwareTier]] = {}
        for t in tiers:
            tiers_by_cafe.setdefault(t.cafe_id, []).append(t)

        items: List[Dict[str, Any]] = []
        for c in cafes:
            cafe_tiers = tiers_by_cafe.get(c.id, [])
            prices = [float(t.price_per_hour) for t in cafe_tiers]
            starting_price = min(prices) if prices else None
            tier_names = [t.name for t in cafe_tiers]
            
            # Photos - first photo URL only, empty list if none
            photo_list = list(c.photos) if isinstance(c.photos, list) and c.photos else []
            photos_summary = [photo_list[0]] if photo_list else []

            items.append({
                "id": c.id,
                "name": c.name,
                "city": c.city,
                "state": c.state,
                "average_rating": 0.0,
                "total_reviews": 0,
                "starting_price": starting_price,
                "tier_names": tier_names,
                "photos": photos_summary,
                "has_active_promotion": False,
                "verification_status": c.verification_status,
                "is_active": c.is_active
            })

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
