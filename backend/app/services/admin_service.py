import math
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timezone, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.repositories.user_repository import UserRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.booking_repository import BookingRepository
from app.repositories.promotion_repository import PromotionRepository
from app.repositories.payment_repository import PaymentRepository
from app.schemas.admin import (
    AdminAnalyticsResponse,
    AdminCafeListItem,
    AdminBookingListItem,
    CafeVerifyAdminRequest
)
from app.schemas.user import UserResponse
from app.schemas.cafe import CafeResponse
from app.schemas.booking import BookingResponse
from app.schemas.promotion import PromotionResponse
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.booking import Booking, BookingStatus
from app.models.hardware_tier import HardwareTier
from app.models.promotion import Promotion
from app.core.exceptions import NotFoundException, ValidationException

class AdminService:
    def __init__(
        self,
        db: AsyncSession,
        user_repo: UserRepository,
        cafe_repo: CafeRepository,
        booking_repo: BookingRepository,
        promo_repo: PromotionRepository,
        payment_repo: Optional[PaymentRepository] = None
    ):
        self.db = db
        self.user_repo = user_repo
        self.cafe_repo = cafe_repo
        self.booking_repo = booking_repo
        self.promo_repo = promo_repo
        self.payment_repo = payment_repo or PaymentRepository(db)

    async def get_platform_analytics(self) -> AdminAnalyticsResponse:
        cafes_by_status = await self.cafe_repo.count_by_verification_status()
        total_cafes = sum(cafes_by_status.values())

        users_by_role = await self.user_repo.count_by_role()
        total_users = sum(users_by_role.values())

        now = datetime.now(timezone.utc)
        first_day_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # Bookings & revenue this month
        stmt_month = select(
            func.count(Booking.id),
            func.sum(Booking.total_amount)
        ).where(
            Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.COMPLETED]),
            Booking.created_at >= first_day_month
        )
        res_month = await self.db.execute(stmt_month)
        row_month = res_month.first()
        bookings_this_month = row_month[0] if row_month and row_month[0] else 0
        revenue_this_month = float(row_month[1]) if row_month and row_month[1] else 0.0

        # Bookings & revenue all time
        stmt_all = select(
            func.count(Booking.id),
            func.sum(Booking.total_amount)
        ).where(
            Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.COMPLETED])
        )
        res_all = await self.db.execute(stmt_all)
        row_all = res_all.first()
        bookings_all_time = row_all[0] if row_all and row_all[0] else 0
        revenue_all_time = float(row_all[1]) if row_all and row_all[1] else 0.0

        # Top 5 cafes this month
        stmt_top = select(
            Cafe.id,
            Cafe.name,
            func.count(Booking.id).label("cnt"),
            func.sum(Booking.total_amount).label("rev")
        ).join(
            Booking, Booking.cafe_id == Cafe.id
        ).where(
            Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.COMPLETED]),
            Booking.created_at >= first_day_month
        ).group_by(
            Cafe.id, Cafe.name
        ).order_by(
            func.count(Booking.id).desc()
        ).limit(5)

        res_top = await self.db.execute(stmt_top)
        top_rows = res_top.all()

        top_cafes = [
            {
                "cafeId": str(row[0]),
                "cafeName": row[1],
                "bookings": row[2],
                "revenue": float(row[3] or 0.0)
            }
            for row in top_rows
        ]

        return AdminAnalyticsResponse(
            total_cafes=total_cafes,
            cafes_by_status=cafes_by_status,
            total_users=total_users,
            users_by_role=users_by_role,
            total_bookings_this_month=bookings_this_month,
            total_revenue_this_month=revenue_this_month,
            total_bookings_all_time=bookings_all_time,
            total_revenue_all_time=revenue_all_time,
            top_cafes_this_month=top_cafes
        )

    async def list_cafes(
        self,
        verification_status: Optional[str] = None,
        city: Optional[str] = None,
        is_active: Optional[bool] = None,
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        limit = min(limit, 50)
        items_tuples, total = await self.cafe_repo.get_all_admin(
            verification_status=verification_status,
            city=city,
            is_active=is_active,
            page=page,
            limit=limit
        )

        item_responses: List[AdminCafeListItem] = []
        for cafe, owner_email in items_tuples:
            cd = CafeResponse.model_validate(cafe).model_dump()
            cd["owner_email"] = owner_email
            item_responses.append(AdminCafeListItem.model_validate(cd))

        total_pages = math.ceil(total / limit) if total > 0 else 0
        return {
            "items": item_responses,
            "total": total,
            "page": page,
            "pageSize": limit,
            "totalPages": total_pages
        }

    async def list_users(
        self,
        role: Optional[str] = None,
        is_active: Optional[bool] = None,
        email_search: Optional[str] = None,
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        limit = min(limit, 50)
        users, total = await self.user_repo.get_all_admin(
            role=role,
            is_active=is_active,
            email_search=email_search,
            page=page,
            limit=limit
        )

        item_responses = [UserResponse.model_validate(u) for u in users]
        total_pages = math.ceil(total / limit) if total > 0 else 0
        return {
            "items": item_responses,
            "total": total,
            "page": page,
            "pageSize": limit,
            "totalPages": total_pages
        }

    async def get_user(self, user_id: UUID) -> UserResponse:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundException(message="User not found", error_code="USER_NOT_FOUND")
        return UserResponse.model_validate(user)

    async def deactivate_user(self, user_id: UUID) -> UserResponse:
        user = await self.user_repo.deactivate(user_id)
        if not user:
            raise NotFoundException(message="User not found", error_code="USER_NOT_FOUND")
        return UserResponse.model_validate(user)

    async def activate_user(self, user_id: UUID) -> UserResponse:
        user = await self.user_repo.activate(user_id)
        if not user:
            raise NotFoundException(message="User not found", error_code="USER_NOT_FOUND")
        return UserResponse.model_validate(user)

    async def change_user_role(self, user_id: UUID, new_role_str: str) -> UserResponse:
        try:
            target_role = UserRole(new_role_str)
        except ValueError:
            raise ValidationException(message=f"Invalid role '{new_role_str}'", error_code="INVALID_ROLE")

        user = await self.user_repo.update_role(user_id, target_role)
        if not user:
            raise NotFoundException(message="User not found", error_code="USER_NOT_FOUND")
        return UserResponse.model_validate(user)

    async def list_all_bookings(
        self,
        cafe_id: Optional[UUID] = None,
        gamer_id: Optional[UUID] = None,
        status: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        limit = min(limit, 50)
        stmt = select(
            Booking,
            User.email.label("gamer_email"),
            User.full_name.label("gamer_full_name"),
            Cafe.name.label("cafe_name"),
            HardwareTier.name.label("tier_name")
        ).join(
            User, Booking.gamer_id == User.id
        ).join(
            Cafe, Booking.cafe_id == Cafe.id
        ).join(
            HardwareTier, Booking.hardware_tier_id == HardwareTier.id
        )

        filters = []
        if cafe_id:
            filters.append(Booking.cafe_id == cafe_id)
        if gamer_id:
            filters.append(Booking.gamer_id == gamer_id)
        if status:
            filters.append(Booking.status == status)
        if date_from:
            filters.append(Booking.session_date >= date_from)
        if date_to:
            filters.append(Booking.session_date <= date_to)

        if filters:
            stmt = stmt.where(and_(*filters))

        stmt = stmt.order_by(Booking.created_at.desc())

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        offset = (page - 1) * limit
        paginated_stmt = stmt.offset(offset).limit(limit)
        res = await self.db.execute(paginated_stmt)
        rows = res.all()

        item_responses: List[AdminBookingListItem] = []
        for row in rows:
            booking_obj, gamer_email, full_name, cafe_name, tier_name = row[0], row[1], row[2], row[3], row[4]
            bd = BookingResponse.model_validate(booking_obj).model_dump()
            bd["gamer_email"] = gamer_email or ""
            bd["gamer_name"] = (full_name or "Gamer").split()[0]
            bd["cafe_name"] = cafe_name or "Café"
            bd["tier_name"] = tier_name or "Tier"
            item_responses.append(AdminBookingListItem.model_validate(bd))

        total_pages = math.ceil(total / limit) if total > 0 else 0
        return {
            "items": item_responses,
            "total": total,
            "page": page,
            "pageSize": limit,
            "totalPages": total_pages
        }

    async def get_booking_detail(self, booking_id: UUID) -> Dict[str, Any]:
        stmt = select(
            Booking,
            User.email.label("gamer_email"),
            User.full_name.label("gamer_full_name"),
            Cafe.name.label("cafe_name"),
            HardwareTier.name.label("tier_name")
        ).join(
            User, Booking.gamer_id == User.id
        ).join(
            Cafe, Booking.cafe_id == Cafe.id
        ).join(
            HardwareTier, Booking.hardware_tier_id == HardwareTier.id
        ).where(Booking.id == booking_id)

        res = await self.db.execute(stmt)
        row = res.first()
        if not row:
            raise NotFoundException(message="Booking not found", error_code="BOOKING_NOT_FOUND")

        booking_obj, gamer_email, full_name, cafe_name, tier_name = row[0], row[1], row[2], row[3], row[4]
        bd = BookingResponse.model_validate(booking_obj).model_dump()
        bd["gamer_email"] = gamer_email or ""
        bd["gamer_name"] = (full_name or "Gamer").split()[0]
        bd["cafe_name"] = cafe_name or "Café"
        bd["tier_name"] = tier_name or "Tier"

        payment = await self.payment_repo.get_by_booking_id(booking_id)
        payment_dict = payment.__dict__ if payment else None

        return {
            "booking": AdminBookingListItem.model_validate(bd),
            "payment": payment_dict
        }

    async def list_promotions(
        self,
        cafe_id: Optional[UUID] = None,
        is_active: Optional[bool] = None,
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        limit = min(limit, 50)
        stmt = select(Promotion)
        filters = []
        if cafe_id:
            filters.append(Promotion.cafe_id == cafe_id)
        if is_active is not None:
            filters.append(Promotion.is_active == is_active)

        if filters:
            stmt = stmt.where(and_(*filters))
        stmt = stmt.order_by(Promotion.created_at.desc())

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        offset = (page - 1) * limit
        paginated_stmt = stmt.offset(offset).limit(limit)
        res = await self.db.execute(paginated_stmt)
        promos = list(res.scalars().all())

        item_responses = [PromotionResponse.model_validate(p) for p in promos]
        total_pages = math.ceil(total / limit) if total > 0 else 0
        return {
            "items": item_responses,
            "total": total,
            "page": page,
            "pageSize": limit,
            "totalPages": total_pages
        }

    async def deactivate_promotion(self, promotion_id: UUID) -> PromotionResponse:
        deactivated = await self.promo_repo.deactivate(promotion_id)
        if not deactivated:
            raise NotFoundException(message="Promotion not found", error_code="PROMOTION_NOT_FOUND")
        return PromotionResponse.model_validate(deactivated)
