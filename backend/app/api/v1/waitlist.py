from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_optional_user
from app.services.badge_service import grant_helper_badge
from app.core.exceptions import NotFoundException
from app.database import get_db
from app.models.user import User
from app.repositories.cafe_repository import CafeRepository
from app.repositories.waitlist_repository import WaitlistRepository

def to_camel(string: str) -> str:
    first, *rest = string.split("_")
    return first + "".join(word.capitalize() for word in rest)


router = APIRouter()


class WaitlistJoinRequest(BaseModel):
    # Signed-out visitors are identified by the same session id the analytics
    # client already sends, so we don't mint a second one.
    session_id: str = Field(..., max_length=64)
    contact: Optional[str] = Field(None, max_length=255)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class WaitlistLeaveRequest(BaseModel):
    session_id: str = Field(..., max_length=64)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


async def _require_cafe(db: AsyncSession, cafe_id: UUID):
    cafe = await CafeRepository(db).get_by_id(cafe_id)
    if not cafe:
        raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
    return cafe


@router.post("/{cafe_id}/waitlist", status_code=status.HTTP_200_OK)
async def join_waitlist(
    cafe_id: UUID,
    payload: WaitlistJoinRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Vote for a café to be listed ("Notify me").

    Sign-in is required: a vote earns a badge and XP, and the count is the
    pitch we make to café owners, so every vote has to be one real account.
    Returns 200 rather than 201 on a repeat tap: voting twice is a no-op.
    """
    cafe = await _require_cafe(db, cafe_id)
    repo = WaitlistRepository(db)

    await repo.join(cafe_id, current_user.id, payload.session_id, payload.contact)
    count = await repo.count(cafe_id)
    badge = await grant_helper_badge(db, current_user.id, "day_one")

    return {"success": True, "data": {"count": count, "joined": True, "goal": cafe.waitlist_goal, "badgeUnlocked": badge}}


@router.delete("/{cafe_id}/waitlist", status_code=status.HTTP_200_OK)
async def leave_waitlist(
    cafe_id: UUID,
    payload: WaitlistLeaveRequest,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    cafe = await _require_cafe(db, cafe_id)
    repo = WaitlistRepository(db)
    user_id = current_user.id if current_user else None

    await repo.leave(cafe_id, user_id, payload.session_id)
    count = await repo.count(cafe_id)

    return {"success": True, "data": {"count": count, "joined": False, "goal": cafe.waitlist_goal}}


@router.get("/{cafe_id}/waitlist/count", status_code=status.HTTP_200_OK)
async def get_waitlist_count(
    cafe_id: UUID,
    sessionId: Optional[str] = Query(None, max_length=64),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """The true count, never thresholded.

    The '>= 5' rule is a display decision on the card — the real number is
    needed for the owner-facing demand figure, so hiding it here would mean
    two sources of truth.
    """
    cafe = await _require_cafe(db, cafe_id)
    repo = WaitlistRepository(db)
    user_id = current_user.id if current_user else None

    count = await repo.count(cafe_id)
    joined = False
    if user_id is not None or sessionId:
        joined = await repo.has_joined(cafe_id, user_id, sessionId or "")

    return {"success": True, "data": {"count": count, "joined": joined, "goal": cafe.waitlist_goal}}


class WaitlistPlayTimeRequest(BaseModel):
    session_id: str = Field(..., max_length=64)
    play_time: str = Field(..., max_length=20)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


@router.patch("/{cafe_id}/waitlist/play-time", status_code=status.HTTP_200_OK)
async def set_waitlist_play_time(
    cafe_id: UUID,
    payload: WaitlistPlayTimeRequest,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """The optional one-tap "when would you play?" answer after joining."""
    from sqlalchemy import select
    from app.core.exceptions import BadRequestException
    from app.models.cafe_waitlist import CafeWaitlistEntry
    from app.services.waitlist_mailer import PLAY_TIMES

    if payload.play_time not in PLAY_TIMES:
        raise BadRequestException(message="Unknown play time", error_code="INVALID_PLAY_TIME")
    repo = WaitlistRepository(db)
    user_id = current_user.id if current_user else None
    entry = (await db.execute(
        select(CafeWaitlistEntry).where(repo._identity_clause(cafe_id, user_id, payload.session_id))
    )).scalar_one_or_none()
    if entry is None:
        raise NotFoundException(message="Join the list first", error_code="NOT_ON_WAITLIST")
    entry.play_time = payload.play_time
    await db.commit()
    return {"success": True, "data": {"playTime": entry.play_time}}


CONTACT_METHODS = ("whatsapp", "call", "email")


class WaitlistDetailsRequest(BaseModel):
    session_id: str = Field(..., max_length=64)
    phone: Optional[str] = Field(None, max_length=20)
    contact_method: Optional[str] = Field(None, max_length=10)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


@router.patch("/{cafe_id}/waitlist/details", status_code=status.HTTP_200_OK)
async def set_waitlist_details(
    cafe_id: UUID,
    payload: WaitlistDetailsRequest,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """The optional after-voting answers: a number to WhatsApp or call, and
    which they prefer. Only the fields sent are changed, so each one-tap
    answer can save on its own."""
    import re
    from sqlalchemy import select
    from app.core.exceptions import BadRequestException
    from app.models.cafe_waitlist import CafeWaitlistEntry

    if payload.contact_method is not None and payload.contact_method not in CONTACT_METHODS:
        raise BadRequestException(message="Unknown contact method", error_code="INVALID_CONTACT_METHOD")

    phone = None
    if payload.phone is not None:
        phone = re.sub(r"[^\d+]", "", payload.phone.strip())
        digits = re.sub(r"\D", "", phone)
        if not 10 <= len(digits) <= 15:
            raise BadRequestException(message="Enter a valid phone number", error_code="INVALID_PHONE")

    repo = WaitlistRepository(db)
    user_id = current_user.id if current_user else None
    entry = (await db.execute(
        select(CafeWaitlistEntry).where(repo._identity_clause(cafe_id, user_id, payload.session_id))
    )).scalar_one_or_none()
    if entry is None:
        raise NotFoundException(message="Join the list first", error_code="NOT_ON_WAITLIST")

    if phone is not None:
        entry.phone = phone
    if payload.contact_method is not None:
        entry.contact_method = payload.contact_method
    await db.commit()
    return {
        "success": True,
        "data": {"phone": entry.phone, "contactMethod": entry.contact_method},
    }
