"""Admin tools for "Booking soon" (lead) listings.

One place for the team to find the cafés we listed from public info, give
them real photos so people recognise them, and get into the owner account
when a café agrees to come on board:

  GET    /admin/booking-soon                       the lead listings
  POST   /admin/booking-soon/{id}/photos/presign   upload URL for one photo
  POST   /admin/booking-soon/{id}/photos           attach an uploaded photo
  DELETE /admin/booking-soon/{id}/photos           remove a photo
  POST   /admin/booking-soon/{id}/owner-login      fresh owner password, shown once

Owner login only works while the account still sits on our placeholder
@khel-o.com email. Once the owner's real email is on it, the account is
theirs and this endpoint refuses, so a click here can never lock a real
owner out.
"""
import logging
import uuid as _uuid
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.config import settings
from app.constants import PHOTO_CATEGORIES
from app.core.exceptions import BadRequestException, ConflictException, NotFoundException
from app.database import get_db
from app.models.admin_audit_log import AdminAuditLog
from app.models.cafe import Cafe
from app.models.cafe_waitlist import CafeWaitlistEntry
from app.models.user import User
from app.repositories.booking_repository import BookingRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.promotion_repository import PromotionRepository
from app.repositories.user_repository import UserRepository
from app.services.admin_service import AdminService

router = APIRouter()
logger = logging.getLogger(__name__)

PLACEHOLDER_DOMAIN = "@khel-o.com"


def is_placeholder_email(email: Optional[str]) -> bool:
    return (email or "").strip().lower().endswith(PLACEHOLDER_DOMAIN)


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class PresignRequest(_Camel):
    content_type: str = Field(..., min_length=1)
    category: str

    @field_validator("category")
    @classmethod
    def _category(cls, v: str) -> str:
        if v not in PHOTO_CATEGORIES:
            raise ValueError(f"category must be one of {PHOTO_CATEGORIES}")
        return v


class AddPhotoRequest(PresignRequest):
    content_type: str = "image/jpeg"  # not needed to attach; kept for one shared validator
    url: str = Field(..., min_length=1)


class RemovePhotoRequest(_Camel):
    url: str = Field(..., min_length=1)


class OwnerLoginRequest(_Camel):
    reason: str = Field(default="Onboarding a Booking soon café", min_length=1, max_length=500)


def _photo_url(p) -> Optional[str]:
    return p.get("url") if isinstance(p, dict) else p


def _photos(cafe: Cafe) -> list:
    return list(cafe.photos) if isinstance(cafe.photos, list) else []


async def _cafe(db: AsyncSession, cafe_id: UUID) -> Cafe:
    cafe = await CafeRepository(db).get_by_id(cafe_id)
    if not cafe:
        raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
    return cafe


def _audit(db: AsyncSession, admin: User, action: str, cafe: Cafe, reason: Optional[str] = None) -> None:
    db.add(AdminAuditLog(
        id=_uuid.uuid4(), admin_id=admin.id, admin_email=admin.email, action=action,
        entity_type="cafe", entity_id=str(cafe.id), entity_name=cafe.name, reason=reason,
    ))


@router.get("", status_code=status.HTTP_200_OK)
async def list_booking_soon(
    q: Optional[str] = Query(None, max_length=100),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    waitlist = (
        select(CafeWaitlistEntry.cafe_id, func.count(CafeWaitlistEntry.id).label("n"))
        .group_by(CafeWaitlistEntry.cafe_id)
        .subquery()
    )
    stmt = (
        select(Cafe, User.email, func.coalesce(waitlist.c.n, 0))
        .join(User, User.id == Cafe.owner_id)
        .outerjoin(waitlist, waitlist.c.cafe_id == Cafe.id)
        .where(Cafe.is_lead_listing == True, Cafe.is_active == True)  # noqa: E712
        .order_by(Cafe.city, Cafe.name)
    )
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(
            func.lower(Cafe.name).like(like),
            func.lower(func.coalesce(Cafe.address_line2, "")).like(like),
            func.lower(Cafe.city).like(like),
        ))
    rows = (await db.execute(stmt)).all()
    return {
        "success": True,
        "data": [
            {
                "id": str(c.id),
                "name": c.name,
                "slug": c.slug,
                "area": c.address_line2,
                "city": c.city,
                "phone": c.phone_number,
                "googleMapsUrl": c.google_maps_url,
                "photos": _photos(c),
                "ownerEmail": email,
                "ownerHandedOver": not is_placeholder_email(email),
                "waitlistCount": int(n),
                "createdAt": c.created_at.isoformat() if c.created_at else None,
            }
            for c, email, n in rows
        ],
    }


@router.post("/{cafe_id}/photos/presign", status_code=status.HTTP_200_OK)
async def presign_photo(
    cafe_id: UUID,
    payload: PresignRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.services.storage_service import create_presigned_upload

    cafe = await _cafe(db, cafe_id)
    if len(_photos(cafe)) >= settings.CAFE_PHOTO_MAX_COUNT:
        raise BadRequestException(f"A café can have at most {settings.CAFE_PHOTO_MAX_COUNT} photos")
    return {"success": True, "data": create_presigned_upload(cafe.id, payload.content_type)}


@router.post("/{cafe_id}/photos", status_code=status.HTTP_200_OK)
async def add_photo(
    cafe_id: UUID,
    payload: AddPhotoRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Attach a photo already uploaded through the presign URL above. Only
    our own bucket's objects for this café are accepted, never outside links."""
    from app.services.storage_service import key_from_url

    cafe = await _cafe(db, cafe_id)
    key = key_from_url(payload.url)
    if not key or not key.startswith(f"cafes/{cafe.id}/"):
        raise BadRequestException("Upload the photo through KHEL-O first")
    photos = _photos(cafe)
    if any(_photo_url(p) == payload.url for p in photos):
        return {"success": True, "data": {"photos": photos}}
    if len(photos) >= settings.CAFE_PHOTO_MAX_COUNT:
        raise BadRequestException(f"A café can have at most {settings.CAFE_PHOTO_MAX_COUNT} photos")
    cafe.photos = photos + [{"url": payload.url, "category": payload.category}]
    _audit(db, current_admin, "cafe.photo_add", cafe)
    await db.commit()
    return {"success": True, "data": {"photos": cafe.photos}}


@router.delete("/{cafe_id}/photos", status_code=status.HTTP_200_OK)
async def remove_photo(
    cafe_id: UUID,
    payload: RemovePhotoRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.services.storage_service import delete_object, key_from_url

    cafe = await _cafe(db, cafe_id)
    photos = _photos(cafe)
    if not any(_photo_url(p) == payload.url for p in photos):
        raise NotFoundException("Photo not found on this café")
    cafe.photos = [p for p in photos if _photo_url(p) != payload.url]
    _audit(db, current_admin, "cafe.photo_remove", cafe)
    await db.commit()
    key = key_from_url(payload.url)
    if key:
        try:
            delete_object(key)
        except Exception:  # storage unset; the photo is already off the café
            logger.warning(f"photo_cleanup_skipped key={key}")
    return {"success": True, "data": {"photos": cafe.photos}}


@router.post("/{cafe_id}/owner-login", status_code=status.HTTP_200_OK)
async def issue_owner_login(
    cafe_id: UUID,
    payload: OwnerLoginRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """A fresh password for the café's placeholder owner account, returned once
    and never stored in plain text. Any earlier password stops working."""
    cafe = await _cafe(db, cafe_id)
    owner = await db.get(User, cafe.owner_id)
    if not owner:
        raise NotFoundException(message="This café has no owner account", error_code="OWNER_NOT_FOUND")
    if not is_placeholder_email(owner.email):
        raise ConflictException(
            message="This account is already on the owner's own email. Ask them to use Forgot password.",
            error_code="OWNER_HANDED_OVER",
        )
    service = AdminService(
        db=db, user_repo=UserRepository(db), cafe_repo=CafeRepository(db),
        booking_repo=BookingRepository(db), promo_repo=PromotionRepository(db),
    )
    _, temporary_password = await service.reset_user_password(owner.id)
    _audit(db, current_admin, "cafe.owner_login_issued", cafe, payload.reason)
    await db.commit()
    return {"success": True, "data": {"email": owner.email, "temporaryPassword": temporary_password}}
