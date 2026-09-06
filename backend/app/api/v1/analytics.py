from fastapi import APIRouter, status
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.database import get_db
from app.schemas.analytics import AnalyticsEventCreateRequest
from app.repositories.analytics_event_repository import AnalyticsEventRepository

router = APIRouter()


@router.post("/events", status_code=status.HTTP_204_NO_CONTENT)
async def create_analytics_event(
    payload: AnalyticsEventCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    repo = AnalyticsEventRepository(db)
    await repo.create_event({
        "session_id": payload.session_id,
        "event_type": payload.event_type.value,
        "cafe_id": payload.cafe_id,
        "event_metadata": payload.metadata,
    })
    return None
