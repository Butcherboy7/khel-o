from fastapi import APIRouter, Depends, status, Query
from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.cafe import CafeCreate, CafeResponse
from app.repositories.cafe_repository import CafeRepository
from app.services.cafe_service import CafeService
from app.api.deps import get_current_cafe_owner
from app.models.user import User

router = APIRouter()

@router.get("", response_model=List[CafeResponse])
async def list_cafes(city: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    repo = CafeRepository(db)
    service = CafeService(repo)
    return await service.list_verified_cafes(city=city)

@router.get("/{cafe_id}", response_model=CafeResponse)
async def get_cafe(cafe_id: UUID, db: AsyncSession = Depends(get_db)):
    repo = CafeRepository(db)
    service = CafeService(repo)
    return await service.get_cafe(cafe_id)

@router.post("", response_model=CafeResponse, status_code=status.HTTP_201_CREATED)
async def create_cafe(
    payload: CafeCreate,
    current_owner: User = Depends(get_current_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    repo = CafeRepository(db)
    service = CafeService(repo)
    return await service.create_cafe(current_owner.id, payload)
