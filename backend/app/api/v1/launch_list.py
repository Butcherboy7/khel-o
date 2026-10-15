"""Game-launch lists (GTA 6 first): "message me when launch slots open".

Public, no account: the boosted Instagram post lands people here, and a login
wall is where those visitors were lost before. Bots are stopped by the same
invisible checks as sign-up (app.core.bot_guard). The count shown publicly is
the real number of people on the list.
"""
import csv
import io
from datetime import date, datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.api.v1.owner_intros import normalise_phone
from app.core import bot_guard
from app.core.exceptions import NotFoundException
from app.database import get_db
from app.models.launch_signup import LaunchSignup

# The launches a list exists for. A new one is a new entry here.
LAUNCHES = {
    "gta6": {"title": "GTA 6", "launch_date": date(2026, 11, 19)},
}

public_router = APIRouter(prefix="/launch-list", tags=["Launch Lists"])
admin_router = APIRouter(prefix="/admin/launch-list", tags=["Admin Launch Lists"])


def _launch(key: str) -> dict:
    launch = LAUNCHES.get(key)
    if launch is None:
        raise NotFoundException(message="No launch list with that name", error_code="LAUNCH_NOT_FOUND")
    return launch


async def _count(db: AsyncSession, key: str) -> int:
    return (await db.execute(
        select(func.count()).select_from(LaunchSignup).where(LaunchSignup.launch == key)
    )).scalar_one()


class LaunchJoinRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    phone: str = Field(..., min_length=10, max_length=20)
    contact_method: Literal["whatsapp", "text", "call"]
    email: Optional[str] = Field(None, max_length=255)
    consent: bool
    utm_source: Optional[str] = Field(None, max_length=80)
    utm_campaign: Optional[str] = Field(None, max_length=80)
    utm_content: Optional[str] = Field(None, max_length=80)
    # bot_guard: signed form ticket + the hidden trap field.
    form_ticket: Optional[str] = None
    website: Optional[str] = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalise_phone(v)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Tell us your name")
        return v

    @field_validator("email", "utm_source", "utm_campaign", "utm_content")
    @classmethod
    def _strip(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        return v or None

    @field_validator("consent")
    @classmethod
    def _consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Tick the box so we're allowed to message you")
        return v


@public_router.get("/{key}")
async def launch_info(key: str, db: AsyncSession = Depends(get_db)):
    launch = _launch(key)
    return {"success": True, "data": {
        "key": key,
        "title": launch["title"],
        "launchDate": launch["launch_date"].isoformat(),
        "count": await _count(db, key),
    }}


@public_router.post("/{key}", status_code=status.HTTP_201_CREATED)
async def join_launch_list(key: str, payload: LaunchJoinRequest, request: Request, db: AsyncSession = Depends(get_db)):
    _launch(key)
    try:
        await bot_guard.check(db, request, "launch", payload.phone, payload.form_ticket, payload.website)
    except bot_guard.Blocked:
        raise bot_guard.try_again()

    existing = (await db.execute(
        select(LaunchSignup).where(LaunchSignup.launch == key, LaunchSignup.phone == payload.phone)
    )).scalar_one_or_none()
    row = existing
    if existing is None:
        row = LaunchSignup(
            launch=key, name=payload.name, phone=payload.phone, contact_method=payload.contact_method,
            email=payload.email, consent=True, utm_source=payload.utm_source,
            utm_campaign=payload.utm_campaign, utm_content=payload.utm_content,
        )
        db.add(row)
    else:
        # Joining again just updates how they want to hear from us.
        existing.name = payload.name
        existing.contact_method = payload.contact_method
        existing.email = payload.email or existing.email
        existing.consent = True
        existing.updated_at = datetime.now(timezone.utc)
    await db.commit()
    # Their place in line: everyone who joined before them, plus them. Joining
    # again keeps the original created_at, so nobody loses their spot.
    position = (await db.execute(
        select(func.count()).select_from(LaunchSignup)
        .where(LaunchSignup.launch == key, LaunchSignup.created_at <= row.created_at)
    )).scalar_one()
    return {"success": True, "data": {
        "joined": True,
        "alreadyJoined": existing is not None,
        "count": await _count(db, key),
        "position": position,
    }}


async def _rows(db: AsyncSession, key: str) -> list[LaunchSignup]:
    return list((await db.execute(
        select(LaunchSignup).where(LaunchSignup.launch == key).order_by(LaunchSignup.created_at.desc())
    )).scalars().all())


# Registered before "/{key}" so "gta6.csv" isn't read as a launch key.
@admin_router.get("/{key}.csv")
async def admin_launch_list_csv(key: str, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    _launch(key)
    buf = io.StringIO()
    out = csv.writer(buf)
    out.writerow(["Name", "Phone", "Reach by", "Email", "Joined (UTC)", "Source", "Campaign", "Content"])
    for r in await _rows(db, key):
        out.writerow([r.name, r.phone, r.contact_method, r.email or "", r.created_at.strftime("%Y-%m-%d %H:%M"),
                      r.utm_source or "", r.utm_campaign or "", r.utm_content or ""])
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="khelo-{key}-launch-list.csv"'},
    )


@admin_router.get("/{key}")
async def admin_launch_list(key: str, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    launch = _launch(key)
    rows = await _rows(db, key)
    by_method = {"whatsapp": 0, "text": 0, "call": 0}
    for r in rows:
        by_method[r.contact_method] = by_method.get(r.contact_method, 0) + 1
    return {"success": True, "data": {
        "title": launch["title"],
        "launchDate": launch["launch_date"].isoformat(),
        "total": len(rows),
        "byMethod": by_method,
        "items": [{
            "id": str(r.id),
            "name": r.name,
            "phone": r.phone,
            "contactMethod": r.contact_method,
            "email": r.email,
            "utmSource": r.utm_source,
            "utmCampaign": r.utm_campaign,
            "utmContent": r.utm_content,
            "joinedAt": r.created_at.isoformat(),
        } for r in rows],
    }}
