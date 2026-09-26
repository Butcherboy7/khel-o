from typing import Literal, Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_staff_or_owner
from app.database import get_db
from app.models.user import User

router = APIRouter()

# Must match the page keys in frontend/src/lib/ownerGuideCopy.ts.
GuidePage = Literal[
    "dashboard", "scanner", "bookings", "availability", "tiers", "offers",
    "reviews", "analytics", "notifications", "payouts", "staff", "settings",
]


class GuideEventRequest(BaseModel):
    type: Literal["session_start", "page_view", "dismiss"]
    page: Optional[GuidePage] = None

    @model_validator(mode="after")
    def page_required_for_page_events(self) -> "GuideEventRequest":
        if self.type != "session_start" and self.page is None:
            raise ValueError("page is required for page_view and dismiss")
        return self


def _normalized(state: dict | None) -> dict:
    state = state or {}
    return {"sessions": int(state.get("sessions", 0)), "pages": dict(state.get("pages", {}))}


@router.get("", status_code=status.HTTP_200_OK)
async def get_guide_state(current_user: User = Depends(require_staff_or_owner)):
    return {"success": True, "data": _normalized(current_user.guide_state)}


@router.post("/events", status_code=status.HTTP_200_OK)
async def record_guide_event(
    payload: GuideEventRequest,
    current_user: User = Depends(require_staff_or_owner),
    db: AsyncSession = Depends(get_db),
):
    # Lock the row so two open tabs incrementing at once don't lose a count.
    user = (await db.execute(select(User).where(User.id == current_user.id).with_for_update())).scalar_one()
    state = _normalized(user.guide_state)

    if payload.type == "session_start":
        state["sessions"] += 1
    else:
        page = dict(state["pages"].get(payload.page, {"views": 0, "dismissed": False}))
        if payload.type == "page_view":
            page["views"] = int(page.get("views", 0)) + 1
        else:
            page["dismissed"] = True
        state["pages"][payload.page] = page

    # Reassign a fresh dict: in-place JSON mutation isn't change-tracked.
    user.guide_state = state
    await db.commit()
    return {"success": True, "data": state}
