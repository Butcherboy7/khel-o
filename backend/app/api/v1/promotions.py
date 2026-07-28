from fastapi import APIRouter, Depends, status
from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.promotion import PromotionCreate, PromotionResponse
from app.repositories.promotion_repository import PromotionRepository
from app.services.promotion_service import PromotionService

router = APIRouter()

@router.post("", response_model=PromotionResponse, status_code=status.HTTP_201_CREATED)
async def create_promotion(payload: PromotionCreate, db: AsyncSession = Depends(get_db)):
    repo = PromotionRepository(db)
    service = PromotionService(repo)
    return await service.create_promotion(payload)

@router.get("/cafe/{cafe_id}", response_model=List[PromotionResponse])
async def list_cafe_promotions(cafe_id: UUID, db: AsyncSession = Depends(get_db)):
    repo = PromotionRepository(db)
    service = PromotionService(repo)
    return await service.list_active_promotions(cafe_id)
