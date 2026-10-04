"""Campaigns the team creates, each with a short link (khel-o.com/c/<slug>).

The short link forwards to the campaign's landing page stamped with UTM tags
(utm_campaign = slug), so the existing visit tracking credits every tap,
café view and booking to it. The admin list shows only these campaigns.
"""
import re
from datetime import date, datetime, timedelta
from typing import Literal, Optional
from uuid import UUID
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.exceptions import ConflictException, NotFoundException
from app.database import get_db
from app.models.marketing_campaign import MarketingCampaign
from app.models.user import User
from app.services import growth_report_service

public_router = APIRouter(prefix="/c", tags=["Campaign links"])
admin_router = APIRouter(prefix="/admin/marketing-campaigns", tags=["Admin Campaigns"])

Channel = Literal["instagram_reel", "instagram_story", "instagram_bio", "whatsapp", "qr_poster", "other"]
Status = Literal["live", "ended", "archived"]
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,39}$")
REPORT_DAYS = 92


def utm_for(channel: str, paid: bool) -> tuple[str, str]:
    """utm_source / utm_medium for a channel. Paid Instagram goes through Meta."""
    if channel in ("instagram_reel", "instagram_story"):
        return ("meta", "paid_social") if paid else ("instagram", channel.split("_")[1])
    return {
        "instagram_bio": ("instagram", "bio"),
        "whatsapp": ("whatsapp", "message"),
        "qr_poster": ("qr", "offline"),
    }.get(channel, ("other", "paid" if paid else "link"))


def target_for(c: MarketingCampaign) -> str:
    parts = urlsplit(c.landing_path)
    if c.status == "archived":
        return c.landing_path
    query = [(k, v) for k, v in parse_qsl(parts.query) if not k.startswith("utm_")]
    query += [
        ("utm_source", c.utm_source),
        ("utm_medium", c.utm_medium),
        ("utm_campaign", c.slug),
        ("utm_content", c.channel),
    ]
    return urlunsplit(("", "", parts.path or "/", urlencode(query), ""))


def _today() -> date:
    return datetime.now(growth_report_service.IST).date()


def _window(c: MarketingCampaign) -> tuple[date, date]:
    end = _today()
    return max(c.started_on, end - timedelta(days=REPORT_DAYS)), end


class CampaignCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    slug: str
    channel: Channel
    paid: bool = False
    landing_path: str = Field("/", max_length=300)
    spend_inr: Optional[int] = Field(None, ge=0, le=10_000_000)
    started_on: Optional[date] = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str) -> str:
        v = v.strip().lower()
        if not SLUG_RE.match(v):
            raise ValueError("Use 2–40 lowercase letters, numbers or dashes")
        return v

    @field_validator("landing_path")
    @classmethod
    def _path(cls, v: str) -> str:
        v = v.strip() or "/"
        if not v.startswith("/") or v.startswith("//") or "://" in v:
            raise ValueError("Use a KHEL-O page path that starts with /")
        return v


class ExtraTag(BaseModel):
    source: str = Field(..., min_length=1, max_length=60)
    campaign: str = Field(..., min_length=1, max_length=100)

    @field_validator("source", "campaign")
    @classmethod
    def _trim(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Can't be empty")
        return v


def tag_pairs(c: MarketingCampaign) -> list[tuple[str, str]]:
    return [(t["source"], t["campaign"]) for t in (c.extra_tags or []) if t.get("source") and t.get("campaign")]


class CampaignUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    extra_tags: Optional[list[ExtraTag]] = Field(None, max_length=10)
    spend_inr: Optional[int] = Field(None, ge=0, le=10_000_000)
    clear_spend: bool = False
    status: Optional[Status] = None
    started_on: Optional[date] = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def _out(c: MarketingCampaign, summary: Optional[dict] = None) -> dict:
    start, end = _window(c)
    data = {
        "id": str(c.id),
        "slug": c.slug,
        "name": c.name,
        "channel": c.channel,
        "paid": c.paid,
        "landingPath": c.landing_path,
        "utmSource": c.utm_source,
        "utmMedium": c.utm_medium,
        "spendInr": c.spend_inr,
        "status": c.status,
        "startedOn": c.started_on.isoformat(),
        "reportFrom": start.isoformat(),
        "reportTo": end.isoformat(),
        "shortPath": f"/c/{c.slug}",
        "extraTags": [{"source": s, "campaign": k} for s, k in tag_pairs(c)],
    }
    if summary is not None:
        data["summary"] = summary
    return data


async def _summary(db: AsyncSession, c: MarketingCampaign) -> dict:
    start, end = _window(c)
    next_step = None
    if start > end:
        t = {"visitors": 0, "viewedCafe": 0, "bookingStarted": 0, "booked": 0, "bookings": 0, "gmv": 0}
    else:
        from datetime import datetime as _dt
        from app.services.campaign_advisor import advise

        report = await growth_report_service.campaign_report(db, c.utm_source, c.slug, start, end, also=tag_pairs(c))
        t = report["totals"]
        steps = advise(
            report, spend=c.spend_inr or None, paid=c.paid, live=c.status == "live",
            today=_dt.now(growth_report_service.IST).date(),
        )["steps"]
        if steps:
            next_step = {"tone": steps[0]["tone"], "title": steps[0]["title"]}
    bookings = t["bookings"]
    return {
        "nextStep": next_step,
        "visitors": t["visitors"],
        "viewedCafe": t["viewedCafe"],
        "bookingStarted": t["bookingStarted"],
        "booked": t["booked"],
        "bookings": bookings,
        "gmv": t["gmv"],
        "costPerBooking": round(c.spend_inr / bookings, 2) if c.spend_inr and bookings else None,
    }


async def _get(db: AsyncSession, campaign_id) -> MarketingCampaign:
    c = await db.get(MarketingCampaign, campaign_id)
    if not c:
        raise NotFoundException(message="Campaign not found", error_code="CAMPAIGN_NOT_FOUND")
    return c


@public_router.get("/{slug}", status_code=status.HTTP_200_OK)
async def resolve_short_link(slug: str, db: AsyncSession = Depends(get_db)):
    c = (await db.execute(select(MarketingCampaign).where(MarketingCampaign.slug == slug.lower()))).scalar_one_or_none()
    if not c:
        raise NotFoundException(message="Link not found", error_code="CAMPAIGN_NOT_FOUND")
    return {"success": True, "data": {"target": target_for(c)}}


@admin_router.get("", status_code=status.HTTP_200_OK)
async def list_campaigns(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(MarketingCampaign).order_by(MarketingCampaign.started_on.desc(), MarketingCampaign.created_at.desc())
    )).scalars().all()
    out = []
    for c in rows:
        out.append(_out(c, await _summary(db, c) if c.status != "archived" else None))
    return {"success": True, "data": {"campaigns": out}}


@admin_router.post("", status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: CampaignCreate,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    taken = (await db.execute(select(MarketingCampaign.id).where(MarketingCampaign.slug == payload.slug))).first()
    if taken:
        raise ConflictException(message="That short link is already used", error_code="SLUG_TAKEN")
    source, medium = utm_for(payload.channel, payload.paid)
    c = MarketingCampaign(
        slug=payload.slug,
        name=payload.name.strip(),
        channel=payload.channel,
        paid=payload.paid,
        landing_path=payload.landing_path,
        utm_source=source,
        utm_medium=medium,
        spend_inr=payload.spend_inr,
        status="live",
        started_on=payload.started_on or _today(),
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return {"success": True, "data": {"campaign": _out(c)}}


@admin_router.patch("/{campaign_id}", status_code=status.HTTP_200_OK)
async def update_campaign(
    campaign_id: UUID,
    payload: CampaignUpdate,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    c = await _get(db, campaign_id)
    if payload.name is not None:
        c.name = payload.name.strip()
    if payload.clear_spend:
        c.spend_inr = None
    elif payload.spend_inr is not None:
        c.spend_inr = payload.spend_inr
    if payload.status is not None:
        c.status = payload.status
    if payload.started_on is not None:
        c.started_on = payload.started_on
    if payload.extra_tags is not None:
        seen, tags = set(), []
        for t in payload.extra_tags:
            key = (t.source, t.campaign)
            if key != (c.utm_source, c.slug) and key not in seen:
                seen.add(key)
                tags.append({"source": t.source, "campaign": t.campaign})
        c.extra_tags = tags
    await db.commit()
    await db.refresh(c)
    return {"success": True, "data": {"campaign": _out(c)}}
