from fastapi import APIRouter, Depends, status
from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.hardware_tier import HardwareTierCreate, HardwareTierResponse
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.services.hardware_tier_service import HardwareTierService

router = APIRouter()

@router.post("", response_model=HardwareTierResponse, status_code=status.HTTP_201_CREATED)
async def create_hardware_tier(payload: HardwareTierCreate, db: AsyncSession = Depends(get_db)):
    repo = HardwareTierRepository(db)
    service = HardwareTierService(repo)
    return await service.create_tier(payload)

@router.get("/cafe/{cafe_id}", response_model=List[HardwareTierResponse])
async def list_cafe_hardware_tiers(cafe_id: UUID, db: AsyncSession = Depends(get_db)):
    repo = HardwareTierRepository(db)
    service = HardwareTierService(repo)
    return await service.list_cafe_tiers(cafe_id)

@router.get("/{tier_id}", response_model=HardwareTierResponse)
async def get_hardware_tier(tier_id: UUID, db: AsyncSession = Depends(get_db)):
    repo = HardwareTierRepository(db)
    service = HardwareTierService(repo)
    return await service.get_tier(tier_id)
