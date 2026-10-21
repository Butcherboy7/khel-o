"""Challenges: free in-person gaming challenges at partner cafés.

Public (no account): the challenge itself, with the real number of spots left.
Signed in: sign up (name + phone + consents), see your own entry, answer
"Coming on the day?", or drop out. Admin: create and edit challenges, the
entry list with phones, actions, and a CSV.

Public wording is "challenge", "free sign-up", "spots" and "waitlist". Phone
numbers only ever go to their owner and to admins.
"""
import csv
import io
import re
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_optional_user, get_user_roles, require_admin
from app.api.v1.owner_intros import normalise_phone
from app.core import bot_guard
from app.core.exceptions import BadRequestException, ConflictException, NotFoundException
from app.core.logging import logger
from app.database import get_db
from app.models.analytics_event import AnalyticsEvent
from app.models.cafe import Cafe
from app.models.challenge import Challenge, ChallengeEntry
from app.models.user import User
from app.services import challenge_service as svc

public_router = APIRouter(prefix="/challenges", tags=["Challenges"])
admin_router = APIRouter(prefix="/admin/challenges", tags=["Admin Challenges"])

STATUSES = ("draft", "open", "closed", "live", "finished")
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$")


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _maps_url(cafe: Cafe) -> Optional[str]:
    if cafe.google_maps_url:
        return cafe.google_maps_url
    if cafe.latitude is not None and cafe.longitude is not None:
        return f"https://www.google.com/maps/search/?api=1&query={cafe.latitude},{cafe.longitude}"
    return None


def _challenge_out(ch: Challenge, cafe: Cafe, counts: dict[str, int]) -> dict:
    return {
        "id": str(ch.id),
        "slug": ch.slug,
        "title": ch.title,
        "game": ch.game,
        "setupLine": ch.setup_line,
        "format": ch.format,
        "bestOf": ch.best_of,
        "finalBestOf": ch.final_best_of,
        "startsAt": _iso(ch.starts_at),
        "endsAt": _iso(ch.ends_at),
        "checkinOpensAt": _iso(ch.checkin_opens_at),
        "checkinClosesAt": _iso(ch.checkin_closes_at),
        "capacity": ch.capacity,
        "minAge": ch.min_age,
        "status": ch.status,
        "rulesMd": ch.rules_md,
        "prizesMd": ch.prizes_md,
        "coverImageUrl": ch.cover_image_url,
        "communityUrl": ch.community_url,
        "instagramHandle": ch.instagram_handle,
        "cafe": {
            "id": str(cafe.id),
            "name": cafe.name,
            "slug": cafe.slug,
            "address": ", ".join(p for p in (cafe.address_line1, cafe.address_line2) if p),
            "city": cafe.city,
            "mapsUrl": _maps_url(cafe),
        },
        "confirmed": counts["confirmed"],
        "spotsLeft": max(ch.capacity - counts["confirmed"], 0),
        "waitlist": counts["waitlist"],
    }


def _my_entry_out(e: ChallengeEntry, all_entries: list[ChallengeEntry]) -> dict:
    return {
        "id": str(e.id),
        "status": e.status,
        "rank": svc.rank(e, all_entries),
        "name": e.name,
        "displayName": e.display_name,
        "publicName": svc.public_name(e),
        "phone": e.phone,
        "mainCharacter": e.main_character,
        "coming": e.coming,
        "promotedAt": _iso(e.promoted_at),
        "consentFilming": e.consent_filming,
        "consentUpdates": e.consent_updates,
        "joinedAt": _iso(e.created_at),
    }


async def _is_admin(db: AsyncSession, user: Optional[User]) -> bool:
    return user is not None and "admin" in await get_user_roles(user.id, db)


async def _load(db: AsyncSession, slug: str, user: Optional[User]) -> tuple[Challenge, Cafe]:
    ch = (await db.execute(select(Challenge).where(Challenge.slug == slug))).scalar_one_or_none()
    # A draft is invisible to everyone but admins (they preview it).
    if ch is None or (ch.status == "draft" and not await _is_admin(db, user)):
        raise NotFoundException(message="No challenge here", error_code="CHALLENGE_NOT_FOUND")
    cafe = await db.get(Cafe, ch.cafe_id)
    return ch, cafe


async def _me_payload(db: AsyncSession, slug: str, user_id) -> dict:
    """Read fresh after a change (a retried change can leave loaded rows stale)."""
    ch = (await db.execute(select(Challenge).where(Challenge.slug == slug))).scalar_one()
    cafe = await db.get(Cafe, ch.cafe_id)
    mine = await svc.entry_for(db, ch.id, user_id=user_id)
    all_entries = await svc.entries(db, ch.id)
    return {
        "challenge": _challenge_out(ch, cafe, await svc.counts(db, ch.id)),
        "entry": _my_entry_out(mine, all_entries) if mine else None,
    }


# ── Public ────────────────────────────────────────────────────────────────


@public_router.get("/{slug}")
async def get_challenge(slug: str, db: AsyncSession = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    ch, cafe = await _load(db, slug, user)
    return {"success": True, "data": _challenge_out(ch, cafe, await svc.counts(db, ch.id))}


class JoinRequest(_Camel):
    name: str = Field(..., min_length=1, max_length=80)
    display_name: Optional[str] = Field(None, max_length=40)
    phone: str = Field(..., min_length=10, max_length=20)
    main_character: Optional[str] = Field(None, max_length=60)
    consent_rules: bool
    consent_age: bool
    consent_filming: bool = False
    consent_updates: bool = False
    utm_source: Optional[str] = Field(None, max_length=80)
    utm_campaign: Optional[str] = Field(None, max_length=80)
    utm_content: Optional[str] = Field(None, max_length=80)
    form_ticket: Optional[str] = None
    website: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        phone = normalise_phone(v)
        if not (phone.startswith("+91") and len(phone) == 13):
            raise ValueError("Enter your 10-digit Indian mobile number")
        return phone

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Tell us your name")
        return v

    @field_validator("display_name", "main_character", "utm_source", "utm_campaign", "utm_content")
    @classmethod
    def _strip(cls, v: Optional[str]) -> Optional[str]:
        v = " ".join((v or "").split())
        return v or None


@public_router.post("/{slug}/entries", status_code=status.HTTP_201_CREATED)
async def join_challenge(
    slug: str,
    payload: JoinRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    user_id = user.id
    ch, _ = await _load(db, slug, user)
    if ch.status != "open":
        raise BadRequestException(message="Sign-ups for this challenge are closed", error_code="CHALLENGE_CLOSED")
    if not payload.consent_rules:
        raise BadRequestException(message="Tick the box to agree to the rules", error_code="RULES_REQUIRED")
    if not payload.consent_age:
        raise BadRequestException(message=f"This challenge is {ch.min_age}+ only", error_code="AGE_REQUIRED")
    try:
        await bot_guard.check(db, request, "challenge", payload.phone, payload.form_ticket, payload.website)
    except bot_guard.Blocked:
        raise bot_guard.try_again()

    fields = payload.model_dump(exclude={"form_ticket", "website"})
    try:
        entry, created = await svc.join(db, ch.id, user_id, fields)
    except svc.AlreadySignedUp:
        raise ConflictException(
            message="This number is already signed up for this challenge on another account",
            error_code="PHONE_ALREADY_SIGNED_UP",
        )
    if created:
        logger.info("challenge_signup", challenge=slug, status=entry.status)
    data = await _me_payload(db, slug, user_id)
    data["created"] = created
    return {"success": True, "data": data}


@public_router.get("/{slug}/me")
async def my_challenge(slug: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    await _load(db, slug, user)
    return {"success": True, "data": await _me_payload(db, slug, user.id)}


class ComingRequest(_Camel):
    coming: Literal["yes", "no"]


@public_router.post("/{slug}/me/coming")
async def answer_coming(
    slug: str, payload: ComingRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user),
):
    user_id = user.id
    ch, _ = await _load(db, slug, user)
    mine = await svc.entry_for(db, ch.id, user_id=user_id)
    if mine is None or mine.status not in svc.ACTIVE:
        raise NotFoundException(message="You're not signed up for this challenge", error_code="NOT_SIGNED_UP")
    if ch.status in ("live", "finished"):
        raise BadRequestException(message="The challenge has already started", error_code="CHALLENGE_STARTED")
    await svc.answer_coming(db, ch.id, mine.id, payload.coming)
    return {"success": True, "data": await _me_payload(db, slug, user_id)}


@public_router.post("/{slug}/me/withdraw")
async def withdraw_me(slug: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    user_id = user.id
    ch, _ = await _load(db, slug, user)
    mine = await svc.entry_for(db, ch.id, user_id=user_id)
    if mine is None or mine.status not in svc.ACTIVE:
        raise NotFoundException(message="You're not signed up for this challenge", error_code="NOT_SIGNED_UP")
    await svc.withdraw(db, ch.id, mine.id, by="player")
    return {"success": True, "data": await _me_payload(db, slug, user_id)}


# ── Admin ─────────────────────────────────────────────────────────────────


class ChallengeIn(_Camel):
    slug: str
    title: str = Field(..., min_length=3, max_length=120)
    cafe_id: UUID
    game: str = Field(..., min_length=1, max_length=80)
    setup_line: Optional[str] = Field(None, max_length=160)
    format: str = Field("Single elimination + 3rd-place match", max_length=120)
    best_of: int = Field(3, ge=1, le=9)
    final_best_of: int = Field(5, ge=1, le=9)
    starts_at: datetime
    ends_at: datetime
    checkin_opens_at: datetime
    checkin_closes_at: datetime
    capacity: int = Field(..., ge=1, le=256)
    min_age: int = Field(18, ge=0, le=99)
    status: Literal["draft", "open", "closed", "live", "finished"] = "draft"
    rules_md: str = Field("", max_length=8000)
    prizes_md: str = Field("", max_length=4000)
    cover_image_url: Optional[str] = Field(None, max_length=1000)
    community_url: Optional[str] = Field(None, max_length=500)
    instagram_handle: Optional[str] = Field(None, max_length=60)

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str) -> str:
        v = v.strip().lower()
        if not SLUG_RE.match(v):
            raise ValueError("Use 3–60 lowercase letters, numbers and dashes")
        return v

    @field_validator("setup_line", "cover_image_url", "community_url", "instagram_handle")
    @classmethod
    def _blank(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        return v or None

    @field_validator("starts_at", "ends_at", "checkin_opens_at", "checkin_closes_at")
    @classmethod
    def _aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("Send times with their time zone")
        return v

    @model_validator(mode="after")
    def _order(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("The end has to be after the start")
        if self.checkin_closes_at <= self.checkin_opens_at:
            raise ValueError("Check-in has to close after it opens")
        return self


def _admin_entry_out(e: ChallengeEntry, all_entries: list[ChallengeEntry]) -> dict:
    return {
        **_my_entry_out(e, all_entries),
        "position": e.position,
        "userId": str(e.user_id),
        "consentRules": e.consent_rules,
        "consentAge": e.consent_age,
        "toldAt": _iso(e.told_at),
        "comingAt": _iso(e.coming_at),
        "withdrawnAt": _iso(e.withdrawn_at),
        "withdrawnBy": e.withdrawn_by,
        "present": e.present,
        "checkedInAt": _iso(e.checked_in_at),
        "utmSource": e.utm_source,
        "utmCampaign": e.utm_campaign,
        "utmContent": e.utm_content,
        "isTest": e.is_test,
    }


async def _admin_get(db: AsyncSession, challenge_id: UUID) -> tuple[Challenge, Cafe]:
    ch = await db.get(Challenge, challenge_id)
    if ch is None:
        raise NotFoundException(message="No such challenge", error_code="CHALLENGE_NOT_FOUND")
    return ch, await db.get(Cafe, ch.cafe_id)


async def _check_cafe_and_slug(db: AsyncSession, payload: ChallengeIn, exclude_id: Optional[UUID] = None) -> None:
    if await db.get(Cafe, payload.cafe_id) is None:
        raise BadRequestException(message="Café not found", error_code="CAFE_NOT_FOUND")
    clash = (await db.execute(select(Challenge.id).where(Challenge.slug == payload.slug))).scalar_one_or_none()
    if clash is not None and clash != exclude_id:
        raise ConflictException(message="Another challenge already uses that link name", error_code="SLUG_TAKEN")


async def _stats(db: AsyncSession, ch: Challenge, rows: list[ChallengeEntry]) -> dict:
    real = [e for e in rows if not e.is_test]
    confirmed = [e for e in real if e.status == "confirmed"]
    sources: dict[str, int] = {}
    for e in real:
        key = e.utm_source or "direct"
        sources[key] = sources.get(key, 0) + 1

    # Page views and taps, counted from the site's own event log (our own test
    # devices and staff accounts are marked internal and left out).
    # Counted here, not in SQL: one challenge has a few thousand rows at most.
    events = (await db.execute(
        select(AnalyticsEvent.event_metadata, AnalyticsEvent.session_id)
        .where(
            AnalyticsEvent.event_type == "ui_action",
            AnalyticsEvent.event_metadata["challenge"].as_string() == ch.slug,
            AnalyticsEvent.created_at >= ch.created_at,
        )
    )).all()
    counted: dict[str, tuple[int, set]] = {}
    for meta, session_id in events:
        action = (meta or {}).get("action")
        if not action or (meta or {}).get("internal"):
            continue
        n, people = counted.get(action, (0, set()))
        people.add(session_id)
        counted[action] = (n + 1, people)
    taps = {action: {"count": n, "people": len(people)} for action, (n, people) in counted.items()}
    return {
        "signedUp": len(real),
        "confirmed": len(confirmed),
        "waitlist": sum(1 for e in real if e.status == "waitlist"),
        "withdrawn": sum(1 for e in real if e.status == "withdrawn"),
        "noShow": sum(1 for e in real if e.status == "no_show"),
        "comingYes": sum(1 for e in confirmed if e.coming == "yes"),
        "comingNoAnswer": sum(1 for e in confirmed if e.coming is None),
        "movedUpNotTold": sum(1 for e in confirmed if e.promoted_at and not e.told_at),
        "checkedIn": sum(1 for e in real if e.present),
        "filmingOk": sum(1 for e in real if e.consent_filming and e.status == "confirmed"),
        "updatesOk": sum(1 for e in real if e.consent_updates),
        "tests": len(rows) - len(real),
        "sources": sources,
        "events": taps,
    }


@admin_router.get("")
async def admin_list(db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    rows = (await db.execute(select(Challenge).order_by(Challenge.starts_at.desc()))).scalars().all()
    out = []
    for ch in rows:
        cafe = await db.get(Cafe, ch.cafe_id)
        out.append(_challenge_out(ch, cafe, await svc.counts(db, ch.id)))
    return {"success": True, "data": out}


@admin_router.get("/cafe-options")
async def admin_cafe_options(db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    cafes = (await db.execute(
        select(Cafe).where(Cafe.is_active.is_(True), Cafe.is_lead_listing.is_(False)).order_by(Cafe.name)
    )).scalars().all()
    return {"success": True, "data": [{"id": str(c.id), "name": c.name, "city": c.city} for c in cafes]}


@admin_router.post("", status_code=status.HTTP_201_CREATED)
async def admin_create(payload: ChallengeIn, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    await _check_cafe_and_slug(db, payload)
    ch = Challenge(**payload.model_dump())
    db.add(ch)
    await db.commit()
    cafe = await db.get(Cafe, ch.cafe_id)
    return {"success": True, "data": _challenge_out(ch, cafe, await svc.counts(db, ch.id))}


@admin_router.get("/{challenge_id}")
async def admin_detail(challenge_id: UUID, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    ch, cafe = await _admin_get(db, challenge_id)
    rows = await svc.entries(db, ch.id)
    return {"success": True, "data": {
        "challenge": _challenge_out(ch, cafe, await svc.counts(db, ch.id)),
        "entries": [_admin_entry_out(e, rows) for e in rows],
        "stats": await _stats(db, ch, rows),
    }}


@admin_router.patch("/{challenge_id}")
async def admin_update(challenge_id: UUID, payload: ChallengeIn, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    ch, _ = await _admin_get(db, challenge_id)
    await _check_cafe_and_slug(db, payload, exclude_id=ch.id)
    fields = payload.model_dump()

    def apply(locked: Challenge) -> None:
        for key, value in fields.items():
            setattr(locked, key, value)

    # More spots: the waitlist moves up into them.
    await svc.set_capacity(db, challenge_id, apply)
    ch, cafe = await _admin_get(db, challenge_id)
    return {"success": True, "data": _challenge_out(ch, cafe, await svc.counts(db, ch.id))}


@admin_router.get("/{challenge_id}/entries.csv")
async def admin_csv(challenge_id: UUID, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    ch, _ = await _admin_get(db, challenge_id)
    rows = await svc.entries(db, ch.id)
    buf = io.StringIO()
    out = csv.writer(buf)
    out.writerow(["Place in line", "Status", "Rank", "Name", "Gamer tag", "Phone", "Main", "Coming", "Moved up",
                  "Filming OK", "Updates OK", "Present", "Source", "Campaign", "Content", "Test", "Joined (UTC)"])
    for e in rows:
        out.writerow([
            e.position, e.status, svc.rank(e, rows) or "", e.name, e.display_name or "", e.phone,
            e.main_character or "", e.coming or "", "yes" if e.promoted_at else "",
            "yes" if e.consent_filming else "no", "yes" if e.consent_updates else "no",
            "yes" if e.present else "", e.utm_source or "", e.utm_campaign or "", e.utm_content or "",
            "yes" if e.is_test else "", e.created_at.strftime("%Y-%m-%d %H:%M"),
        ])
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="khelo-{ch.slug}-players.csv"'},
    )


EntryAction = Literal["withdraw", "no_show", "restore", "promote", "told", "test", "untest"]


@admin_router.post("/{challenge_id}/entries/{entry_id}/{action}")
async def admin_entry_action(
    challenge_id: UUID, entry_id: UUID, action: EntryAction,
    db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin),
):
    admin_id = admin.id
    ch, _ = await _admin_get(db, challenge_id)
    slug = ch.slug
    entry = await svc.entry_for(db, ch.id, entry_id=entry_id)
    if entry is None:
        raise NotFoundException(message="No such entry", error_code="ENTRY_NOT_FOUND")

    if action in ("withdraw", "no_show"):
        if entry.status not in svc.ACTIVE:
            raise BadRequestException(message="They're already out", error_code="ENTRY_NOT_ACTIVE")
        await svc.withdraw(db, challenge_id, entry_id, by="admin", status="withdrawn" if action == "withdraw" else "no_show")
    elif action == "restore":
        if entry.status in svc.ACTIVE:
            raise BadRequestException(message="They're already in", error_code="ENTRY_ACTIVE")
        await svc.restore(db, challenge_id, entry_id)
    elif action == "promote":
        if entry.status != "waitlist":
            raise BadRequestException(message="Only someone on the waitlist can be moved up", error_code="NOT_WAITLIST")
        try:
            await svc.promote(db, challenge_id, entry_id)
        except svc.NoFreeSpot:
            raise BadRequestException(message="Every spot is taken. Take someone out first.", error_code="NO_FREE_SPOT")
    elif action == "told":
        entry.told_at = svc.now()
        await db.commit()
    else:
        entry.is_test = action == "test"
        await db.commit()
    logger.info("challenge_entry_action", challenge=slug, action=action, admin=str(admin_id))
    return await admin_detail(challenge_id, db, admin)


@admin_router.post("/{challenge_id}/release-silent")
async def admin_release_silent(challenge_id: UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    await _admin_get(db, challenge_id)
    released, moved = await svc.release_silent(db, challenge_id)
    logger.info("challenge_release_silent", challenge=str(challenge_id), released=released, moved=moved)
    data = (await admin_detail(challenge_id, db, admin))["data"]
    data["released"] = released
    data["movedUp"] = moved
    return {"success": True, "data": data}
