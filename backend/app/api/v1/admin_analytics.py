from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.admin_analytics_service import AdminAnalyticsService
from app.api.deps import require_admin
from app.models.user import User

router = APIRouter()


@router.get("/executive", status_code=status.HTTP_200_OK)
async def get_executive_dashboard(
    periodDays: int = Query(30, ge=1, le=365),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_executive_dashboard(period_days=periodDays)
    return {"success": True, "data": result}


@router.get("/cafes", status_code=status.HTTP_200_OK)
async def get_cafe_performance(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_cafe_performance()
    return {"success": True, "data": result}


@router.get("/setups", status_code=status.HTTP_200_OK)
async def get_setup_performance(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_setup_performance()
    return {"success": True, "data": result}


@router.get("/geography", status_code=status.HTTP_200_OK)
async def get_geography(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_geography()
    return {"success": True, "data": result}


@router.get("/revenue", status_code=status.HTTP_200_OK)
async def get_revenue_breakdown(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_revenue_breakdown()
    return {"success": True, "data": result}
