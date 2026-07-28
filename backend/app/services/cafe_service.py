from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from app.repositories.cafe_repository import CafeRepository
from app.schemas.cafe import CafeCreateRequest, CafeUpdateRequest, CafeResponse
from app.models.cafe import Cafe, VerificationStatus
from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException

class CafeService:
    def __init__(self, cafe_repo: CafeRepository):
        self.cafe_repo = cafe_repo

    async def create_cafe(self, owner_id: UUID, cafe_in: CafeCreateRequest) -> CafeResponse:
        cafe_dict = cafe_in.model_dump()
        cafe_dict["id"] = uuid4()
        cafe_dict["owner_id"] = owner_id
        cafe_dict["verification_status"] = VerificationStatus.PENDING
        cafe_dict["is_active"] = True

        created = await self.cafe_repo.create(cafe_dict)
        return CafeResponse.model_validate(created)

    async def get_cafe(self, cafe_id: UUID) -> CafeResponse:
        cafe = await self.cafe_repo.get_by_id(cafe_id)
        if not cafe:
            raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
        return CafeResponse.model_validate(cafe)

    async def update_cafe(self, cafe_id: UUID, owner_id: UUID, update_data: CafeUpdateRequest) -> CafeResponse:
        cafe = await self.cafe_repo.get_by_id(cafe_id)
        if not cafe:
            raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
        
        if str(cafe.owner_id) != str(owner_id):
            raise ForbiddenException(message="You can only update your own café", error_code="FORBIDDEN")

        update_dict = update_data.model_dump(exclude_unset=True)
        updated = await self.cafe_repo.update(cafe_id, update_dict)
        return CafeResponse.model_validate(updated)

    async def list_cafes(self, city: Optional[str] = None, page: int = 1, limit: int = 20) -> Dict[str, Any]:
        items, total = await self.cafe_repo.get_all_verified(city=city, page=page, limit=limit)
        return {
            "items": [CafeResponse.model_validate(c) for c in items],
            "total": total,
            "page": page,
            "pageSize": limit
        }

    async def search_cafes(self, query: Optional[str] = None, city: Optional[str] = None, page: int = 1, limit: int = 20) -> Dict[str, Any]:
        items, total = await self.cafe_repo.search(query=query, city=city, page=page, limit=limit)
        return {
            "items": [CafeResponse.model_validate(c) for c in items],
            "total": total,
            "page": page,
            "pageSize": limit
        }

    async def get_pending_cafes(self, page: int = 1, limit: int = 20) -> Dict[str, Any]:
        items, total = await self.cafe_repo.get_pending_verification(page=page, limit=limit)
        return {
            "items": [CafeResponse.model_validate(c) for c in items],
            "total": total,
            "page": page,
            "pageSize": limit
        }

    async def verify_cafe(self, cafe_id: UUID, admin_id: UUID, status: VerificationStatus) -> CafeResponse:
        cafe = await self.cafe_repo.get_by_id(cafe_id)
        if not cafe:
            raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")

        updated = await self.cafe_repo.update_verification_status(cafe_id, status)
        return CafeResponse.model_validate(updated)
