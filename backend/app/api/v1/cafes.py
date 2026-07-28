from fastapi import APIRouter, Depends, status, Query
from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.cafe import CafeCreateRequest, CafeUpdateRequest
from app.schemas.hardware_tier import HardwareTierCreateRequest, HardwareTierUpdateRequest
from app.repositories.cafe_repository import CafeRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.services.cafe_service import CafeService
from app.services.hardware_tier_service import HardwareTierService
from app.api.deps import require_cafe_owner
from app.models.user import User

router = APIRouter()

@router.get("", status_code=status.HTTP_200_OK)
async def list_cafes(
    city: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    repo = CafeRepository(db)
    service = CafeService(repo)
    if q:
        result = await service.search_cafes(query=q, city=city, page=page, limit=limit)
    else:
        result = await service.list_cafes(city=city, page=page, limit=limit)
    return {
        "success": True,
        "data": result
    }

@router.get("/{cafe_id}", status_code=status.HTTP_200_OK)
async def get_cafe(cafe_id: UUID, db: AsyncSession = Depends(get_db)):
    repo = CafeRepository(db)
    service = CafeService(repo)
    result = await service.get_cafe(cafe_id)
    return {
        "success": True,
        "data": {
            "cafe": result
        }
    }

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_cafe(
    payload: CafeCreateRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    repo = CafeRepository(db)
    service = CafeService(repo)
    result = await service.create_cafe(current_owner.id, payload)
    return {
        "success": True,
        "data": {
            "cafe": result
        }
    }

@router.patch("/{cafe_id}", status_code=status.HTTP_200_OK)
async def update_cafe(
    cafe_id: UUID,
    payload: CafeUpdateRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    repo = CafeRepository(db)
    service = CafeService(repo)
    result = await service.update_cafe(cafe_id, current_owner.id, payload)
    return {
        "success": True,
        "data": {
            "cafe": result
        }
    }

# Hardware Tiers under Cafe
@router.post("/{cafe_id}/tiers", status_code=status.HTTP_201_CREATED)
async def add_hardware_tier(
    cafe_id: UUID,
    payload: HardwareTierCreateRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    cafe_repo = CafeRepository(db)
    tier_repo = HardwareTierRepository(db)
    service = HardwareTierService(tier_repo, cafe_repo)
    result = await service.add_hardware_tier(cafe_id, current_owner.id, payload)
    return {
        "success": True,
        "data": {
            "hardwareTier": result
        }
    }

@router.get("/{cafe_id}/tiers", status_code=status.HTTP_200_OK)
async def list_hardware_tiers(cafe_id: UUID, db: AsyncSession = Depends(get_db)):
    tier_repo = HardwareTierRepository(db)
    service = HardwareTierService(tier_repo)
    result = await service.get_cafe_tiers(cafe_id)
    return {
        "success": True,
        "data": {
            "hardwareTiers": result
        }
    }

@router.patch("/{cafe_id}/tiers/{tier_id}", status_code=status.HTTP_200_OK)
async def update_hardware_tier(
    cafe_id: UUID,
    tier_id: UUID,
    payload: HardwareTierUpdateRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    cafe_repo = CafeRepository(db)
    tier_repo = HardwareTierRepository(db)
    service = HardwareTierService(tier_repo, cafe_repo)
    result = await service.update_hardware_tier(tier_id, current_owner.id, payload)
    return {
        "success": True,
        "data": {
            "hardwareTier": result
        }
    }
