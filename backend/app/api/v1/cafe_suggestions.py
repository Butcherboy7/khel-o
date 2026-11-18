"""Suggest a cafe: anyone can tell us about a cafe that isn't on KHEL-O yet
(name, city, Google Maps link, the cafe's phone if they have it). No account;
same invisible bot checks as the launch list. Admin works the inbox."""
import csv
import io
import uuid
from typing import Literal, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.api.v1.owner_intros import normalise_phone
from app.core import bot_guard
from app.core.exceptions import NotFoundException
from app.database import get_db
from app.models.cafe_suggestion import CafeSuggestion

public_router = APIRouter(prefix="/cafe-suggestions", tags=["Cafe Suggestions"])
admin_router = APIRouter(prefix="/admin/cafe-suggestions", tags=["Admin Cafe Suggestions"])

MAPS_HOSTS = ("google.com", "google.co.in", "goo.gl", "g.co")


def _clean_maps(v: Optional[str]) -> Optional[str]:
    v = (v or "").strip()
    if not v:
        return None
    if "://" not in v:
        v = "https://" + v
    host = (urlparse(v).hostname or "").lower()
    if not any(host == h or host.endswith("." + h) for h in MAPS_HOSTS):
        raise ValueError("Paste the link from Google Maps (Share, then Copy link)")
    return v[:500]


class SuggestRequest(BaseModel):
    cafe_name: str = Field(..., min_length=1, max_length=120)
    city: str = Field(..., min_length=1, max_length=80)
    maps_url: Optional[str] = Field(None, max_length=500)
    cafe_phone: Optional[str] = Field(None, max_length=20)
    note: Optional[str] = Field(None, max_length=500)
    suggester_name: str = Field(..., min_length=1, max_length=80)
    suggester_phone: str = Field(..., min_length=10, max_length=20)
    source: Optional[str] = Field(None, max_length=80)
    form_ticket: Optional[str] = None
    website: Optional[str] = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    @field_validator("cafe_name", "city", "suggester_name")
    @classmethod
    def _text(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("This one can't be empty")
        return v

    @field_validator("maps_url")
    @classmethod
    def _maps(cls, v: Optional[str]) -> Optional[str]:
        return _clean_maps(v)

    @field_validator("suggester_phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalise_phone(v)

    @field_validator("cafe_phone")
    @classmethod
    def _cafe_phone(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        return normalise_phone(v) if v else None

    @field_validator("note", "source")
    @classmethod
    def _strip(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        return v or None


class StatusUpdate(BaseModel):
    status: Literal["new", "contacted", "listed", "no_answer"]


@public_router.post("", status_code=status.HTTP_201_CREATED)
async def suggest_cafe(payload: SuggestRequest, request: Request, db: AsyncSession = Depends(get_db)):
    try:
        await bot_guard.check(db, request, "launch", payload.suggester_phone, payload.form_ticket, payload.website)
    except bot_guard.Blocked as blocked:
        raise bot_guard.refusal(blocked.reason)
    db.add(CafeSuggestion(
        cafe_name=payload.cafe_name, city=payload.city, maps_url=payload.maps_url,
        cafe_phone=payload.cafe_phone, note=payload.note,
        suggester_name=payload.suggester_name, suggester_phone=payload.suggester_phone,
        source=payload.source,
    ))
    await db.commit()
    return {"success": True, "data": {"received": True}}


def _row(r: CafeSuggestion) -> dict:
    return {
        "id": str(r.id), "cafeName": r.cafe_name, "city": r.city, "mapsUrl": r.maps_url,
        "cafePhone": r.cafe_phone, "note": r.note, "suggesterName": r.suggester_name,
        "suggesterPhone": r.suggester_phone, "status": r.status, "source": r.source,
        "createdAt": r.created_at.isoformat(),
    }


async def _all(db: AsyncSession) -> list[CafeSuggestion]:
    return list((await db.execute(select(CafeSuggestion).order_by(CafeSuggestion.created_at.desc()))).scalars().all())


# Registered before "/{id}" so "export.csv" isn't read as an id.
@admin_router.get("/export.csv")
async def admin_suggestions_csv(db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    buf = io.StringIO()
    out = csv.writer(buf)
    out.writerow(["Cafe", "City", "Maps link", "Cafe phone", "Suggested by", "Their phone", "Status", "Note", "Sent (UTC)", "Source"])
    for r in await _all(db):
        out.writerow([r.cafe_name, r.city, r.maps_url or "", r.cafe_phone or "", r.suggester_name, r.suggester_phone,
                      r.status, r.note or "", r.created_at.strftime("%Y-%m-%d %H:%M"), r.source or ""])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="khelo-cafe-suggestions.csv"'})


@admin_router.get("")
async def admin_list_suggestions(db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    rows = await _all(db)
    return {"success": True, "data": {"total": len(rows), "items": [_row(r) for r in rows]}}


@admin_router.patch("/{suggestion_id}")
async def admin_set_status(suggestion_id: str, payload: StatusUpdate, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    try:
        sid = uuid.UUID(suggestion_id)
    except ValueError:
        raise NotFoundException(message="Suggestion not found", error_code="SUGGESTION_NOT_FOUND")
    row = await db.get(CafeSuggestion, sid)
    if row is None:
        raise NotFoundException(message="Suggestion not found", error_code="SUGGESTION_NOT_FOUND")
    row.status = payload.status
    await db.commit()
    return {"success": True, "data": _row(row)}
