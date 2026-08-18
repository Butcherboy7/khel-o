from fastapi import APIRouter, Depends, status
from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.promotion import (
    PromotionCreateRequest,
    PromotionUpdateRequest,
    PromotionResponse,
    ActivePromotionResponse
)
from app.repositories.promotion_repository import PromotionRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.services.promotion_service import PromotionService
from app.api.deps import require_cafe_owner
from app.models.user import User

router = APIRouter()

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_promotion(
    payload: PromotionCreateRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    promo_repo = PromotionRepository(db)
    cafe_repo = CafeRepository(db)
    tier_repo = HardwareTierRepository(db)
    service = PromotionService(promo_repo, cafe_repo, tier_repo)
    result = await service.create_promotion(
        cafe_id=payload.cafe_id,
        owner_id=current_owner.id,
        promo_in=payload
    )
    return {
        "success": True,
        "data": {
            "promotion": result
        }
    }

@router.get("/cafe/{cafe_id}", status_code=status.HTTP_200_OK)
async def list_cafe_promotions(
    cafe_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    promo_repo = PromotionRepository(db)
    tier_repo = HardwareTierRepository(db)
    service = PromotionService(promo_repo, tier_repo=tier_repo)
    results = await service.get_active_promotions_for_cafe(cafe_id)
    return {
        "success": True,
        "data": {
            "promotions": results
        }
    }

@router.get("/owner/cafe/{cafe_id}", status_code=status.HTTP_200_OK)
async def list_owner_promotions(
    cafe_id: UUID,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    """Full promotion list for the owner's management view (all statuses, not just currently-active)."""
    promo_repo = PromotionRepository(db)
    cafe_repo = CafeRepository(db)
    service = PromotionService(promo_repo, cafe_repo)
    results = await service.get_promotions_for_owner(cafe_id=cafe_id, owner_id=current_owner.id)
    return {
        "success": True,
        "data": {
            "promotions": results
        }
    }

@router.get("/{promotion_id}", status_code=status.HTTP_200_OK)
async def get_promotion(
    promotion_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    promo_repo = PromotionRepository(db)
    service = PromotionService(promo_repo)
    result = await service.get_promotion(promotion_id)
    return {
        "success": True,
        "data": {
            "promotion": result
        }
    }

@router.patch("/{promotion_id}", status_code=status.HTTP_200_OK)
async def update_promotion(
    promotion_id: UUID,
    payload: PromotionUpdateRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    promo_repo = PromotionRepository(db)
    cafe_repo = CafeRepository(db)
    service = PromotionService(promo_repo, cafe_repo)
    result = await service.update_promotion(
        promotion_id=promotion_id,
        owner_id=current_owner.id,
        update_in=payload
    )
    return {
        "success": True,
        "data": {
            "promotion": result
        }
    }

@router.delete("/{promotion_id}", status_code=status.HTTP_200_OK)
async def deactivate_promotion(
    promotion_id: UUID,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    promo_repo = PromotionRepository(db)
    cafe_repo = CafeRepository(db)
    service = PromotionService(promo_repo, cafe_repo)
    await service.deactivate_promotion(promotion_id=promotion_id, owner_id=current_owner.id)
    return {
        "success": True,
        "message": "Promotion deactivated successfully"
    }
