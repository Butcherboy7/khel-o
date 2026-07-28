from fastapi import APIRouter, Depends, status
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.services.hardware_tier_service import HardwareTierService

router = APIRouter()

@router.get("/cafe/{cafe_id}", status_code=status.HTTP_200_OK)
async def list_cafe_hardware_tiers(cafe_id: UUID, db: AsyncSession = Depends(get_db)):
    repo = HardwareTierRepository(db)
    service = HardwareTierService(repo)
    result = await service.get_cafe_tiers(cafe_id)
    return {
        "success": True,
        "data": {
            "hardwareTiers": result
        }
    }

@router.get("/{tier_id}", status_code=status.HTTP_200_OK)
async def get_hardware_tier(tier_id: UUID, db: AsyncSession = Depends(get_db)):
    repo = HardwareTierRepository(db)
    service = HardwareTierService(repo)
    result = await service.get_tier(tier_id)
    return {
        "success": True,
        "data": {
            "hardwareTier": result
        }
    }
