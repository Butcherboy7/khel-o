""""Know the owner?" — a signed-in player drops a café owner's contact.

Sign-in is required: the outreach team calls a real person's phone off the
back of this, so every intro has to trace back to an account.
"""
import re
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user
from app.config import settings
from app.core.exceptions import BadRequestException, BaseAppException
from app.core.logging import logger
from app.database import get_db
from app.models.cafe import Cafe
from app.models.owner_intro import OwnerIntro
from app.models.user import User
from app.repositories.platform_settings_repository import PlatformSettingsRepository
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/owner-intros", tags=["Owner Intros"])

RELATIONS = {
    "regular": "I play there a lot",
    "friend_family": "Friend / family",
    "work_there": "I work there",
    "other": "Other",
}
# Per-player cap per rolling day. Real intros are rare; this only stops a
# script from filling the outreach queue.
DAILY_LIMIT = 5


def to_camel(string: str) -> str:
    first, *rest = string.split("_")
    return first + "".join(word.capitalize() for word in rest)


def normalise_phone(raw: str) -> str:
    """Keep digits (and a leading +). A bare 10-digit Indian mobile gets +91
    so the outreach team can tap-to-call or WhatsApp it as-is."""
    value = raw.strip()
    digits = re.sub(r"\D", "", value)
    if len(digits) == 10 and digits[0] in "6789":
        return "+91" + digits
    if len(digits) == 12 and digits.startswith("91") and digits[2] in "6789":
        return "+" + digits
    if 10 <= len(digits) <= 15 and value.startswith("+"):
        return "+" + digits
    raise ValueError("Enter a valid phone number")


class OwnerIntroCreateRequest(BaseModel):
    cafe_id: Optional[UUID] = None
    cafe_name: Optional[str] = Field(None, max_length=160)
    area: Optional[str] = Field(None, max_length=160)
    owner_name: str = Field(..., min_length=2, max_length=120)
    owner_phone: str = Field(..., min_length=10, max_length=20)
    relation: Literal["regular", "friend_family", "work_there", "other"]
    note: Optional[str] = Field(None, max_length=500)
    owner_consent: bool

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    @field_validator("owner_phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalise_phone(v)

    @field_validator("owner_name", "cafe_name", "area", "note")
    @classmethod
    def _strip(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        return v or None


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_owner_intro(
    payload: OwnerIntroCreateRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if not payload.owner_consent:
        raise BadRequestException(message="Check with the owner first, then tick the box", error_code="OWNER_CONSENT_REQUIRED")
    if not payload.owner_name:
        raise BadRequestException(message="Add the owner's name", error_code="OWNER_NAME_REQUIRED")

    cafe = None
    if payload.cafe_id is not None:
        cafe = await db.get(Cafe, payload.cafe_id)
        if cafe is None:
            raise BadRequestException(message="Café not found", error_code="CAFE_NOT_FOUND")
    cafe_name = cafe.name if cafe else payload.cafe_name
    if not cafe_name:
        raise BadRequestException(message="Which café is it?", error_code="CAFE_NAME_REQUIRED")
    area = payload.area or (cafe.city if cafe else None)

    # Same player, same owner number: a double tap or a re-send, not a new lead.
    existing = (await db.execute(
        select(OwnerIntro).where(
            OwnerIntro.submitted_by_user_id == current_user.id,
            OwnerIntro.owner_phone == payload.owner_phone,
            OwnerIntro.cafe_name == cafe_name,
        )
    )).scalar_one_or_none()
    if existing is not None:
        return {"success": True, "data": {"id": str(existing.id), "duplicate": True}}

    since = datetime.now(timezone.utc) - timedelta(days=1)
    recent = (await db.execute(
        select(func.count(OwnerIntro.id)).where(
            OwnerIntro.submitted_by_user_id == current_user.id, OwnerIntro.created_at >= since
        )
    )).scalar_one()
    if recent >= DAILY_LIMIT:
        raise BaseAppException(
            message="That's a lot of intros for one day — try again tomorrow",
            error_code="OWNER_INTRO_LIMIT",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    intro = OwnerIntro(
        cafe_id=cafe.id if cafe else None,
        cafe_name=cafe_name,
        area=area,
        owner_name=payload.owner_name,
        owner_phone=payload.owner_phone,
        relation=payload.relation,
        note=payload.note,
        owner_consent=True,
        submitted_by_user_id=current_user.id,
    )
    db.add(intro)
    await db.commit()

    try:
        platform = await PlatformSettingsRepository(db).get_or_create()
        rows = [
            ("Café", cafe_name),
            ("Area", area or "—"),
            ("Owner", payload.owner_name),
            ("Owner phone", payload.owner_phone),
            ("How they know them", RELATIONS[payload.relation]),
            ("Note", payload.note or "—"),
            ("From", f"{current_user.full_name} <{current_user.email}>"),
        ]
        await NotificationService().send_owner_intro(
            platform.support_email, rows, f"{settings.FRONTEND_URL}/admin/leads#owner-intros"
        )
    except Exception as e:  # the intro is saved; the email is a nicety
        logger.error("owner_intro_notify_failed", error=str(e))

    return {"success": True, "data": {"id": str(intro.id), "duplicate": False}}
