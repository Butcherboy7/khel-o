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
