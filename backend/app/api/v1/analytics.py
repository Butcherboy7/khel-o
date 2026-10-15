from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.api.deps import get_optional_user
from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.analytics import AnalyticsEventCreateRequest, AnalyticsEventType
from app.repositories.analytics_event_repository import AnalyticsEventRepository
from app.core.localities import locality_for

INTERNAL_ROLES = {UserRole.ADMIN, UserRole.CAFE_OWNER, UserRole.STAFF}
router = APIRouter()


def _device(user_agent: str) -> tuple[str, str | None]:
    """(device class, in-app browser) from the User-Agent, stamped on every
    event server-side so no client version can get it wrong."""
    ua = user_agent or ""
    if "iPad" in ua or ("Android" in ua and "Mobile" not in ua):
        device = "tablet"
    elif "Mobi" in ua or "iPhone" in ua or "Android" in ua:
        device = "mobile"
    else:
        device = "desktop"
    if "Instagram" in ua:
        iab = "instagram"
    elif "FBAN" in ua or "FBAV" in ua or "FB_IAB" in ua:
        iab = "facebook"
    else:
        iab = None
    return device, iab


@router.post("/events", status_code=status.HTTP_204_NO_CONTENT)
async def create_analytics_event(
    payload: AnalyticsEventCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    # Staff browsing the admin console isn't product traffic — drop it here too,
    # not just in the client, so a stale bundle can't inflate the numbers.
    if payload.event_type in (AnalyticsEventType.PAGE_VIEW, AnalyticsEventType.PAGE_EXIT) and str(
        payload.metadata.get("path", "")
    ).startswith("/admin"):
        return None
    if payload.event_type == AnalyticsEventType.UI_ACTION:
        action = payload.metadata.get("action")
        if not isinstance(action, str) or not action or len(action) > 60:
            return None

    metadata = dict(payload.metadata)
    if payload.event_type == AnalyticsEventType.LOCATION_SHARED:
        # Coordinates are turned into a neighbourhood here and dropped: only
        # the area name is ever stored.
        try:
            lat, lng = float(metadata.pop("lat")), float(metadata.pop("lng"))
        except (KeyError, TypeError, ValueError):
            return None
        city, locality = locality_for(lat, lng)
        metadata = {**metadata, "city": city, "locality": locality}
    # Our own test devices (?internal=1) and staff/owner accounts are kept
    # but marked, so campaign and traffic numbers can leave them out.
    internal = metadata.pop("internal", None) is True or (
        current_user is not None and current_user.role in INTERNAL_ROLES
    )
    if internal:
        metadata["internal"] = True
    if payload.event_type == AnalyticsEventType.SIGNIN_COMPLETED and current_user is not None:
        created = current_user.created_at
        if created is not None:
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            metadata["new"] = datetime.now(timezone.utc) - created < timedelta(minutes=15)
    device, iab = _device(request.headers.get("user-agent", ""))
    metadata["dev"] = device
    if iab:
        metadata["iab"] = iab

    repo = AnalyticsEventRepository(db)
    await repo.create_event({
        "session_id": payload.session_id,
        "user_id": current_user.id if current_user else None,
        "event_type": payload.event_type.value,
        "cafe_id": payload.cafe_id,
        "event_metadata": metadata,
    })
    return None
