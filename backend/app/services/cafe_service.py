from typing import List, Optional
from uuid import UUID
from app.repositories.cafe_repository import CafeRepository
from app.schemas.cafe import CafeCreate, CafeUpdate, CafeResponse
from app.models.cafe import Cafe, VerificationStatus
from app.core.exceptions import NotFoundException

class CafeService:
    def __init__(self, cafe_repo: CafeRepository):
        self.cafe_repo = cafe_repo

    async def create_cafe(self, owner_id: UUID, cafe_in: CafeCreate) -> CafeResponse:
        cafe = Cafe(
            owner_id=owner_id,
            verification_status=VerificationStatus.PENDING,
            **cafe_in.model_dump()
        )
        created = await self.cafe_repo.create(cafe)
        return CafeResponse.model_validate(created)

    async def get_cafe(self, cafe_id: UUID) -> CafeResponse:
        cafe = await self.cafe_repo.get_by_id(cafe_id)
        if not cafe:
            raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
        return CafeResponse.model_validate(cafe)

    async def list_verified_cafes(self, city: Optional[str] = None) -> List[CafeResponse]:
        cafes = await self.cafe_repo.get_verified_cafes(city=city)
        return [CafeResponse.model_validate(c) for c in cafes]
