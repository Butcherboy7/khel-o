"""KHEL-O on Instagram: the reels we post, shown on Explore and Community.

Admin pastes a reel link, a short title, an optional tag (GTA 6, Update...) and
uploads a cover. The public list is what the reel strip shows.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.exceptions import BadRequestException, NotFoundException
from app.database import get_db
from app.models.instagram_reel import InstagramReel
from app.models.user import User

INSTAGRAM_HANDLE = "khelo.journey"

public_router = APIRouter(prefix="/instagram", tags=["Instagram"])
admin_router = APIRouter(prefix="/admin/instagram", tags=["Admin Instagram"])

# instagram.com/reel/<code>, /reels/<code>, /p/<code>, optionally under a username.
_REEL = re.compile(r"^https?://(?:www\.|m\.)?instagram\.com/(?:[A-Za-z0-9_.]+/)?(reels?|p|tv)/([A-Za-z0-9_-]{5,})/?", re.I)


def clean_reel_url(raw: str) -> str:
    """Accepts any Instagram reel or post link (with tracking junk) and returns a clean one."""
    m = _REEL.match((raw or "").strip())
    if not m:
        raise BadRequestException(
            message="Paste a link to a reel or post on instagram.com, like https://www.instagram.com/reel/ABC123/",
            error_code="BAD_REEL_LINK",
        )
    kind = "p" if m.group(1).lower() == "p" else "reel"
    return f"https://www.instagram.com/{kind}/{m.group(2)}/"


def _cover(raw: Optional[str]) -> Optional[str]:
    v = (raw or "").strip() or None
    if v and not v.startswith("https://") and not v.startswith("http://"):
        raise BadRequestException(message="The cover must be an uploaded image.", error_code="BAD_URL")
    return v


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ReelIn(_Camel):
    url: str = Field(min_length=10, max_length=500)
    title: str = Field(min_length=2, max_length=80)
    tag: Optional[str] = Field(None, max_length=24)
    cover_url: Optional[str] = Field(None, max_length=1000)


class ReelEdit(_Camel):
    url: Optional[str] = Field(None, min_length=10, max_length=500)
    title: Optional[str] = Field(None, min_length=2, max_length=80)
    tag: Optional[str] = Field(None, max_length=24)
    cover_url: Optional[str] = Field(None, max_length=1000)
    hidden: Optional[bool] = None


class ReelOrder(_Camel):
    ids: list[UUID] = Field(min_length=1, max_length=500)


class PresignRequest(_Camel):
    content_type: str


def _out(r: InstagramReel, admin: bool = False) -> dict:
    d = {"id": str(r.id), "url": r.url, "coverUrl": r.cover_url, "title": r.title, "tag": r.tag,
         "createdAt": r.created_at.isoformat() if isinstance(r.created_at, datetime) else None}
    if admin:
        d.update({"position": r.position, "hidden": r.hidden})
    return d


def _order():
    return (InstagramReel.position, InstagramReel.created_at.desc())


# ---- public

@public_router.get("/reels")
async def public_reels(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(InstagramReel).where(InstagramReel.hidden.is_(False)).order_by(*_order()).limit(12)
    )).scalars().all()
    return {"success": True, "data": {"handle": INSTAGRAM_HANDLE, "reels": [_out(r) for r in rows]}}


# ---- admin

@admin_router.get("/reels")
async def list_reels(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    rows = (await db.execute(select(InstagramReel).order_by(*_order()))).scalars().all()
    return {"success": True, "data": [_out(r, admin=True) for r in rows]}


@admin_router.post("/reels/presign")
async def presign_cover(payload: PresignRequest, admin: User = Depends(require_admin)):
    from app.services.storage_service import create_presigned_upload_at
    return {"success": True, "data": create_presigned_upload_at("instagram", payload.content_type)}


@admin_router.post("/reels", status_code=201)
async def add_reel(payload: ReelIn, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    url = clean_reel_url(payload.url)
    dupe = (await db.execute(select(InstagramReel.id).where(InstagramReel.url == url))).first()
    if dupe is not None:
        raise BadRequestException(message="This reel is already on the list.", error_code="REEL_EXISTS")
    first = (await db.execute(select(func.min(InstagramReel.position)))).scalar_one_or_none()
    # Newest goes first.
    r = InstagramReel(url=url, title=payload.title.strip(), tag=(payload.tag or "").strip() or None,
                      cover_url=_cover(payload.cover_url), position=(first or 0) - 1)
    db.add(r)
    await db.commit()
    return {"success": True, "data": _out(r, admin=True)}


@admin_router.patch("/reels/{rid}")
async def edit_reel(rid: UUID, payload: ReelEdit, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    r = await db.get(InstagramReel, rid)
    if r is None:
        raise NotFoundException(message="Reel not found.", error_code="REEL_NOT_FOUND")
    old_cover = r.cover_url
    if payload.url is not None:
        r.url = clean_reel_url(payload.url)
    if payload.title is not None:
        r.title = payload.title.strip()
    if payload.tag is not None:
        r.tag = payload.tag.strip() or None
    if "cover_url" in payload.model_fields_set:
        r.cover_url = _cover(payload.cover_url)
    if payload.hidden is not None:
        r.hidden = payload.hidden
    await db.commit()
    if old_cover and old_cover != r.cover_url:
        _delete_cover(old_cover)
    return {"success": True, "data": _out(r, admin=True)}


@admin_router.put("/reels/order")
async def order_reels(payload: ReelOrder, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    rows = {r.id: r for r in (await db.execute(select(InstagramReel))).scalars()}
    for n, rid in enumerate(payload.ids):
        if rid in rows:
            rows[rid].position = n
    await db.commit()
    return {"success": True, "data": {"ok": True}}


@admin_router.delete("/reels/{rid}")
async def delete_reel(rid: UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    r = await db.get(InstagramReel, rid)
    if r is None:
        raise NotFoundException(message="Reel not found.", error_code="REEL_NOT_FOUND")
    cover = r.cover_url
    await db.delete(r)
    await db.commit()
    if cover:
        _delete_cover(cover)
    return {"success": True, "data": {"ok": True}}


def _delete_cover(url: str) -> None:
    from app.services.storage_service import delete_object, key_from_url
    try:
        key = key_from_url(url)
        if key and key.startswith("instagram/"):
            delete_object(key)
    except Exception:  # storage not configured (tests, local)
        pass
