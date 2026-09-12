from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_optional_user
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
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Ask to be told when this café starts taking bookings.

    Returns 200 rather than 201 on a repeat tap: joining twice is a no-op, not
    an error, and the client should not have to distinguish the two.
    """
    await _require_cafe(db, cafe_id)
    repo = WaitlistRepository(db)
    user_id = current_user.id if current_user else None

    await repo.join(cafe_id, user_id, payload.session_id, payload.contact)
    count = await repo.count(cafe_id)

    return {"success": True, "data": {"count": count, "joined": True}}


@router.delete("/{cafe_id}/waitlist", status_code=status.HTTP_200_OK)
async def leave_waitlist(
    cafe_id: UUID,
    payload: WaitlistLeaveRequest,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_cafe(db, cafe_id)
    repo = WaitlistRepository(db)
    user_id = current_user.id if current_user else None

    await repo.leave(cafe_id, user_id, payload.session_id)
    count = await repo.count(cafe_id)

    return {"success": True, "data": {"count": count, "joined": False}}


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
    await _require_cafe(db, cafe_id)
    repo = WaitlistRepository(db)
    user_id = current_user.id if current_user else None

    count = await repo.count(cafe_id)
    joined = False
    if user_id is not None or sessionId:
        joined = await repo.has_joined(cafe_id, user_id, sessionId or "")

    return {"success": True, "data": {"count": count, "joined": joined}}
