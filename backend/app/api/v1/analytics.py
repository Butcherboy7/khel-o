from typing import Optional

from fastapi import APIRouter, status
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.api.deps import get_optional_user
from app.database import get_db
from app.models.user import User
from app.schemas.analytics import AnalyticsEventCreateRequest, AnalyticsEventType
from app.repositories.analytics_event_repository import AnalyticsEventRepository

router = APIRouter()


@router.post("/events", status_code=status.HTTP_204_NO_CONTENT)
async def create_analytics_event(
    payload: AnalyticsEventCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    # Staff browsing the admin console isn't product traffic — drop it here too,
    # not just in the client, so a stale bundle can't inflate the numbers.
    if payload.event_type == AnalyticsEventType.PAGE_VIEW and str(payload.metadata.get("path", "")).startswith("/admin"):
        return None

    repo = AnalyticsEventRepository(db)
    await repo.create_event({
        "session_id": payload.session_id,
        "user_id": current_user.id if current_user else None,
        "event_type": payload.event_type.value,
        "cafe_id": payload.cafe_id,
        "event_metadata": payload.metadata,
    })
    return None
