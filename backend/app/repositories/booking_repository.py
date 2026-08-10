from typing import List, Optional, Tuple, Any
from uuid import UUID
from decimal import Decimal
from datetime import date, time, datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

from app.models.booking import Booking, BookingStatus
from app.models.user import User
from app.models.cafe import Cafe
from app.models.hardware_tier import HardwareTier
from app.repositories.base import BaseRepository

class BookingRepository(BaseRepository[Booking]):
    def __init__(self, db: AsyncSession):
        super().__init__(Booking, db)

    async def get_by_id(self, booking_id: UUID) -> Optional[Booking]:
        result = await self.db.execute(select(Booking).where(Booking.id == booking_id))
        return result.scalars().first()

    async def get_by_reference(self, reference: str) -> Optional[Booking]:
        result = await self.db.execute(select(Booking).where(Booking.booking_reference == reference))
        return result.scalars().first()

    async def get_by_gamer_id(
        self,
        gamer_id: UUID,
        status_filter: Optional[str] = None,
        page: int = 1,
        limit: int = 20
    ) -> Tuple[List[Tuple[Booking, str, str, str]], int]:
        stmt = select(
            Booking,
            Cafe.name.label("cafe_name"),
            Cafe.address_line1.label("cafe_address"),
            HardwareTier.name.label("tier_name")
        ).outerjoin(
            Cafe, Booking.cafe_id == Cafe.id
        ).outerjoin(
            HardwareTier, Booking.hardware_tier_id == HardwareTier.id
        ).where(Booking.gamer_id == gamer_id)

        if status_filter:
            stmt = stmt.where(Booking.status == status_filter)

        stmt = stmt.order_by(Booking.created_at.desc())

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        offset = (page - 1) * limit
        paginated_stmt = stmt.offset(offset).limit(limit)
        result = await self.db.execute(paginated_stmt)
        rows = result.all()

        items = []
        for row in rows:
            b, c_name, c_addr, t_name = row[0], row[1] or "Gaming Cafe", row[2] or "", row[3] or "Hardware Tier"
            items.append((b, c_name, c_addr, t_name))

        return items, total

    get_by_gamer = get_by_gamer_id

    async def get_by_cafe_id(self, cafe_id: UUID, page: int = 1, limit: int = 20) -> Tuple[List[Booking], int]:
        stmt = select(Booking).where(Booking.cafe_id == cafe_id).order_by(Booking.created_at.desc())
        
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        offset = (page - 1) * limit
        paginated_stmt = stmt.offset(offset).limit(limit)
        result = await self.db.execute(paginated_stmt)
        items = list(result.scalars().all())

        return items, total

    get_by_cafe = get_by_cafe_id

    async def get_overlapping_bookings_count(
        self,
        tier_id: UUID,
        session_date: date,
        start_time: time,
        end_time: time
    ) -> int:
        now_utc = datetime.now(timezone.utc)
        ttl_threshold = now_utc - timedelta(minutes=15)
        
        stmt = select(func.coalesce(func.sum(Booking.seats_count), 0)).select_from(Booking).where(
            Booking.hardware_tier_id == tier_id,
            Booking.session_date == session_date,
            or_(
                Booking.status == BookingStatus.CONFIRMED,
                and_(
                    Booking.status == BookingStatus.PENDING_PAYMENT,
                    Booking.created_at >= ttl_threshold
                )
            ),
            and_(
                Booking.start_time < end_time,
                Booking.end_time > start_time
            )
        )
        result = await self.db.execute(stmt)
        return int(result.scalar() or 0)

    async def get_overlapping_bookings_count_with_lock(
        self,
        tier_id: UUID,
        session_date: date,
        start_time: time,
        end_time: time,
        use_cafe_capacity: bool = False,
        cafe_id: Optional[UUID] = None
    ) -> Tuple[int, int]:
        """Returns (overlapping_count, capacity) with row lock. Uses cafe.bookable_stations if use_cafe_capacity=True."""
        if use_cafe_capacity and cafe_id:
            cafe_stmt = select(Cafe).where(Cafe.id == cafe_id).with_for_update()
            cafe_result = await self.db.execute(cafe_stmt)
            cafe = cafe_result.scalars().first()
            capacity = cafe.bookable_stations if cafe else 0
        else:
            tier_stmt = select(HardwareTier).where(HardwareTier.id == tier_id).with_for_update()
            tier_result = await self.db.execute(tier_stmt)
            tier = tier_result.scalars().first()
            capacity = tier.app_bookable_seats if tier else 0
        
        count = await self.get_overlapping_bookings_count(
            tier_id=tier_id,
            session_date=session_date,
            start_time=start_time,
            end_time=end_time
        )
        return count, capacity
    
    async def get_gamer_daily_seats_count(
        self,
        gamer_id: UUID,
        cafe_id: UUID,
        session_date: date
    ) -> int:
        now_utc = datetime.now(timezone.utc)
        ttl_threshold = now_utc - timedelta(minutes=15)
        
        stmt = select(func.coalesce(func.sum(Booking.seats_count), 0)).select_from(Booking).where(
            Booking.gamer_id == gamer_id,
            Booking.cafe_id == cafe_id,
            Booking.session_date == session_date,
            or_(
                Booking.status == BookingStatus.CONFIRMED,
                and_(
                    Booking.status == BookingStatus.PENDING_PAYMENT,
                    Booking.created_at >= ttl_threshold
                )
            )
        )
        result = await self.db.execute(stmt)
        return int(result.scalar() or 0)

    async def get_owner_bookings_joined(
        self,
        cafe_ids: List[UUID],
        cafe_id_filter: Optional[UUID] = None,
        status_filter: Optional[str] = None,
        date_filter: Optional[date] = None,
        page: int = 1,
        limit: int = 20
    ) -> Tuple[List[Tuple[Booking, str, str, str]], int]:
        if not cafe_ids:
            return [], 0

        stmt = select(
            Booking,
            User.full_name.label("gamer_full_name"),
            HardwareTier.name.label("tier_name"),
            Cafe.name.label("cafe_name")
        ).join(
            User, Booking.gamer_id == User.id
        ).join(
            HardwareTier, Booking.hardware_tier_id == HardwareTier.id
        ).join(
            Cafe, Booking.cafe_id == Cafe.id
        )

        filters = [Booking.cafe_id.in_(cafe_ids)]
        if cafe_id_filter:
            filters.append(Booking.cafe_id == cafe_id_filter)
        if status_filter:
            filters.append(Booking.status == status_filter)
        if date_filter:
            filters.append(Booking.session_date == date_filter)

        stmt = stmt.where(and_(*filters)).order_by(Booking.session_date.desc(), Booking.start_time.desc())

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        offset = (page - 1) * limit
        paginated_stmt = stmt.offset(offset).limit(limit)
        result = await self.db.execute(paginated_stmt)
        rows = result.all()

        items = []
        for row in rows:
            booking_obj = row[0]
            full_name = row[1] or "Gamer"
            first_name = full_name.split()[0]
            tier_name = row[2] or "Hardware Tier"
            cafe_name = row[3] or "Café"
            items.append((booking_obj, first_name, tier_name, cafe_name))

        return items, total

    async def count_bookings_this_month(self, cafe_ids: List[UUID]) -> int:
        if not cafe_ids:
            return 0
        now = datetime.now(timezone.utc)
        first_day = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        stmt = select(func.count()).select_from(Booking).where(
            Booking.cafe_id.in_(cafe_ids),
            Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.COMPLETED]),
            Booking.created_at >= first_day
        )
        res = await self.db.execute(stmt)
        return res.scalar() or 0

    async def sum_revenue_this_month(self, cafe_ids: List[UUID]) -> float:
        if not cafe_ids:
            return 0.0
        now = datetime.now(timezone.utc)
        first_day = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        stmt = select(func.sum(Booking.total_amount)).select_from(Booking).where(
            Booking.cafe_id.in_(cafe_ids),
            Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.COMPLETED]),
            Booking.created_at >= first_day
        )
        res = await self.db.execute(stmt)
        return float(res.scalar() or 0.0)

    async def count_upcoming_today(self, cafe_ids: List[UUID]) -> int:
        if not cafe_ids:
            return 0
        now = datetime.now(timezone.utc)
        today = now.date()
        current_time = now.time()

        stmt = select(func.count()).select_from(Booking).where(
            Booking.cafe_id.in_(cafe_ids),
            Booking.status == BookingStatus.CONFIRMED,
            Booking.session_date == today,
            Booking.start_time > current_time
        )
        res = await self.db.execute(stmt)
        return res.scalar() or 0

    async def get_booked_hours_this_week(self, cafe_ids: List[UUID]) -> float:
        if not cafe_ids:
            return 0.0
        now = datetime.now(timezone.utc)
        start_of_week = (now - timedelta(days=now.weekday())).date()
        end_of_week = start_of_week + timedelta(days=6)

        stmt = select(func.sum(Booking.duration_hours)).select_from(Booking).where(
            Booking.cafe_id.in_(cafe_ids),
            Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.COMPLETED]),
            Booking.session_date >= start_of_week,
            Booking.session_date <= end_of_week
        )
        res = await self.db.execute(stmt)
        return float(res.scalar() or 0.0)

    async def get_total_possible_hours_this_week(self, cafe_ids: List[UUID]) -> float:
        if not cafe_ids:
            return 0.0
        stmt = select(func.sum(HardwareTier.total_seats)).where(
            HardwareTier.cafe_id.in_(cafe_ids),
            HardwareTier.is_active == True
        )
        res = await self.db.execute(stmt)
        total_seats = res.scalar() or 0
        # 12 operating hours per day * 7 days * total seats
        return float(total_seats * 12 * 7)

    async def get_most_popular_tier_this_month(self, cafe_ids: List[UUID]) -> Optional[str]:
        if not cafe_ids:
            return None
        now = datetime.now(timezone.utc)
        first_day = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        stmt = select(
            HardwareTier.name,
            func.count(Booking.id).label("booking_count")
        ).join(
            Booking, Booking.hardware_tier_id == HardwareTier.id
        ).where(
            Booking.cafe_id.in_(cafe_ids),
            Booking.created_at >= first_day
        ).group_by(
            HardwareTier.name
        ).order_by(
            func.count(Booking.id).desc()
        )

        res = await self.db.execute(stmt)
        row = res.first()
        return row[0] if row else None

    async def create(self, booking_data: dict[str, Any] | Booking) -> Booking:
        if isinstance(booking_data, Booking):
            booking_obj = booking_data
        else:
            booking_obj = Booking(**booking_data)
        self.db.add(booking_obj)
        await self.db.commit()
        await self.db.refresh(booking_obj)
        return booking_obj

    async def update(self, booking_id: UUID, update_data: dict[str, Any]) -> Optional[Booking]:
        booking = await self.get_by_id(booking_id)
        if not booking:
            return None
        for field, value in update_data.items():
            if hasattr(booking, field) and value is not None:
                setattr(booking, field, value)
        await self.db.commit()
        await self.db.refresh(booking)
        return booking
