import math
from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from app.repositories.cafe_repository import CafeRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.repositories.promotion_repository import PromotionRepository
from app.repositories.review_repository import ReviewRepository
from app.repositories.user_repository import UserRepository
from app.services.promotion_service import PromotionService
from app.schemas.cafe import CafeCreateRequest, CafeUpdateRequest, CafeResponse, CafeListItem, CafeListResponse
from app.schemas.hardware_tier import HardwareTierResponse
from app.schemas.review import ReviewResponse
from app.schemas.user import UserResponse
from app.schemas.admin import AdminCafeDetailResponse
from app.models.cafe import Cafe, VerificationStatus
from app.models.user import User, UserRole
from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException

class CafeService:
    def __init__(
        self,
        cafe_repo: CafeRepository,
        tier_repo: Optional[HardwareTierRepository] = None,
        promo_repo: Optional[PromotionRepository] = None,
        review_repo: Optional[ReviewRepository] = None,
        user_repo: Optional[UserRepository] = None
    ):
        self.cafe_repo = cafe_repo
        self.tier_repo = tier_repo
        self.promo_repo = promo_repo
        self.review_repo = review_repo
        self.user_repo = user_repo

    async def create_cafe(self, owner_id: UUID, cafe_in: CafeCreateRequest) -> CafeResponse:
        cafe_dict = cafe_in.model_dump()
        cafe_dict["id"] = uuid4()
        cafe_dict["owner_id"] = owner_id
        cafe_dict["verification_status"] = VerificationStatus.PENDING
        cafe_dict["is_active"] = True

        created = await self.cafe_repo.create(cafe_dict)
        return await self._build_cafe_response(created)

    async def get_cafe(self, cafe_id: UUID, current_user: Optional[User] = None) -> CafeResponse:
        cafe = await self.cafe_repo.get_by_id(cafe_id)
        if not cafe:
            raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")

        # Business rule: If café is not verified or not active, return 404 unless owner or admin
        if cafe.verification_status != VerificationStatus.VERIFIED or not cafe.is_active:
            is_allowed = False
            if current_user:
                if current_user.role == UserRole.ADMIN or str(cafe.owner_id) == str(current_user.id):
                    is_allowed = True
            if not is_allowed:
                raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")

        return await self._build_cafe_response(cafe)

    async def _build_cafe_response(self, cafe: Cafe, response_cls: type = CafeResponse) -> Any:
        tiers_res: List[HardwareTierResponse] = []
        if self.tier_repo:
            active_tiers = await self.tier_repo.get_by_cafe_id(cafe.id, active_only=True)
            tiers_res = [HardwareTierResponse.model_validate(t) for t in active_tiers]

        active_promos = []
        if self.promo_repo:
            promo_service = PromotionService(self.promo_repo, tier_repo=self.tier_repo)
            active_promos = await promo_service.get_active_promotions_for_cafe(cafe.id)

        avg_rating, total_revs = 0.0, 0
        recent_revs: List[ReviewResponse] = []
        if self.review_repo:
            avg_rating, total_revs = await self.review_repo.get_average_rating_and_count(cafe.id)
            items_tuples, _ = await self.review_repo.get_by_cafe_id(cafe.id, page=1, limit=5, include_hidden=False)
            for r, fn in items_tuples:
                rd = {
                    "id": r.id,
                    "cafe_id": r.cafe_id,
                    "gamer_id": r.gamer_id,
                    "booking_id": r.booking_id,
                    "rating": r.rating,
                    "comment": r.comment,
                    "is_visible": r.is_visible,
                    "gamer_name": fn,
                    "created_at": r.created_at,
                    "updated_at": r.updated_at
                }
                recent_revs.append(ReviewResponse.model_validate(rd))

        resp = response_cls.model_validate(cafe)
        resp.tiers = tiers_res
        resp.active_promotions = active_promos
        resp.recent_reviews = recent_revs
        resp.average_rating = avg_rating
        resp.total_reviews = total_revs

        if hasattr(resp, "owner") and getattr(resp, "owner", None) is None and self.user_repo:
            owner_obj = await self.user_repo.get_by_id(cafe.owner_id)
            if owner_obj:
                resp.owner = UserResponse.model_validate(owner_obj)

        if hasattr(resp, "bank_account_number") and getattr(resp, "bank_account_number", None) is None:
            from app.models.owner_payout_account import OwnerPayoutAccount
            from sqlalchemy import select
            stmt_payout = select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == cafe.owner_id)
            res_payout = await self.cafe_repo.db.execute(stmt_payout)
            payout_acc = res_payout.scalars().first()
            if payout_acc:
                resp.bank_account_number = payout_acc.bank_account_number_masked or (payout_acc.details.get("full_account") if payout_acc.details else None)
                resp.bank_ifsc = payout_acc.bank_ifsc
                resp.account_holder_name = payout_acc.account_holder_name

        return resp

    async def update_cafe(self, cafe_id: UUID, owner_id: UUID, update_data: CafeUpdateRequest) -> CafeResponse:
        cafe = await self.cafe_repo.get_by_id(cafe_id)
        if not cafe:
            raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
        
        if str(cafe.owner_id) != str(owner_id):
            raise ForbiddenException(message="You can only update your own café", error_code="FORBIDDEN")

        if cafe.verification_status == VerificationStatus.SUSPENDED:
            raise ForbiddenException(
                message="Suspended cafés cannot be modified or reactivated by owners. Please contact admin.",
                error_code="CAFE_SUSPENDED"
            )

        update_dict = update_data.model_dump(exclude_unset=True)
        updated = await self.cafe_repo.update(cafe_id, update_dict)
        return await self._build_cafe_response(updated)

    async def list_cafes(
        self,
        city: Optional[str] = None,
        query: Optional[str] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        amenities: Optional[List[str]] = None,
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        limit = min(limit, 50)
        items_dict, total = await self.cafe_repo.search_verified(
            city=city,
            query=query,
            min_price=min_price,
            max_price=max_price,
            amenities=amenities,
            page=page,
            limit=limit
        )

        items: List[CafeListItem] = []
        for item in items_dict:
            c_id = item.get("id")
            if c_id and self.review_repo:
                avg_r, tot_r = await self.review_repo.get_average_rating_and_count(c_id)
                item["average_rating"] = avg_r
                item["total_reviews"] = tot_r
            items.append(CafeListItem.model_validate(item))

        total_pages = math.ceil(total / limit) if total > 0 else 0

        return {
            "items": items,
            "total": total,
            "page": page,
            "pageSize": limit,
            "totalPages": total_pages
        }

    search_cafes = list_cafes

    async def get_pending_cafes(self, page: int = 1, limit: int = 20) -> Dict[str, Any]:
        items, total = await self.cafe_repo.get_pending_verification(page=page, limit=limit)
        limit = min(limit, 50)
        total_pages = math.ceil(total / limit) if total > 0 else 0
        return {
            "items": [await self._build_cafe_response(c, response_cls=AdminCafeDetailResponse) for c in items],
            "total": total,
            "page": page,
            "pageSize": limit,
            "totalPages": total_pages
        }

    async def verify_cafe(self, cafe_id: UUID, admin_id: UUID, status: VerificationStatus) -> CafeResponse:
        cafe = await self.cafe_repo.get_by_id(cafe_id)
        if not cafe:
            raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")

        updated = await self.cafe_repo.update_verification_status(cafe_id, status)
        return await self._build_cafe_response(updated)
