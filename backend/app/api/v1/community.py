"""Community page: this week's poll, the members-only code, contributions.

"Member" means the person tapped Join on the community page while logged in.
We cannot see inside WhatsApp, so it is never shown as "verified".
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_optional_user, require_admin
from app.core.exceptions import AuthException, BadRequestException, NotFoundException
from app.database import get_db
from app.models.analytics_event import AnalyticsEvent
from app.models.community import (
    CommunityContribution, CommunityGroupSize, CommunityJoin, CommunityLead, CommunityMember,
    CommunityPhoto, CommunityPoll, CommunityPollVote, CommunityPost, CommunitySettings,
)
from app.models.user import User

router = APIRouter(prefix="/community", tags=["Community"])
admin_router = APIRouter(prefix="/admin/community", tags=["Admin Community"])

DAILY_CONTRIBUTION_LIMIT = 5


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def _active_poll(db: AsyncSession) -> Optional[CommunityPoll]:
    return (await db.execute(
        select(CommunityPoll).where(CommunityPoll.status == "active").order_by(CommunityPoll.created_at.desc()).limit(1)
    )).scalar_one_or_none()


def _first_name(name: Optional[str]) -> str:
    return (name or "").strip().split(" ")[0][:20] or "A gamer"


DEVICE_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


def _device(raw: Optional[str]) -> Optional[str]:
    """The phone's random id (kept in the browser). Anything odd is ignored."""
    raw = (raw or "").strip()
    return raw if DEVICE_RE.match(raw) else None


def _source(raw: Optional[str]) -> Optional[str]:
    raw = (raw or "").strip().lower()[:60]
    return raw if re.match(r"^[a-z0-9][a-z0-9_.-]*$", raw) else None


async def _joined_count(db: AsyncSession) -> int:
    """People who tapped Join: one per phone, plus logged-in members not already counted by a phone."""
    phones = (await db.execute(select(func.count()).select_from(CommunityJoin))).scalar_one()
    extra = (await db.execute(
        select(func.count()).select_from(CommunityMember).where(
            CommunityMember.user_id.not_in(select(CommunityJoin.user_id).where(CommunityJoin.user_id.is_not(None)))
        )
    )).scalar_one()
    return phones + extra


async def _is_member(db: AsyncSession, user: Optional[User], device: Optional[str]) -> bool:
    if user is not None and await db.get(CommunityMember, user.id) is not None:
        return True
    if device is not None:
        return (await db.execute(select(CommunityJoin.id).where(CommunityJoin.device_id == device))).first() is not None
    return False


@router.get("/this-week")
async def this_week(device_id: Optional[str] = Query(None, alias="deviceId"), db: AsyncSession = Depends(get_db),
                    user: Optional[User] = Depends(get_optional_user)):
    device = _device(device_id)
    poll = await _active_poll(db)
    is_member = await _is_member(db, user, device)

    poll_out = None
    if poll is not None:
        poll_out = await _poll_view(db, poll, user, device, is_member)

    closed = (await db.execute(
        select(CommunityPoll).where(CommunityPoll.status == "closed").order_by(CommunityPoll.created_at.desc()).limit(3)
    )).scalars().all()
    closed_out = []
    for p in closed:
        counts = dict((await db.execute(
            select(CommunityPollVote.option_index, func.count()).where(CommunityPollVote.poll_id == p.id)
            .group_by(CommunityPollVote.option_index)
        )).all())
        total = sum(counts.values())
        if not total:
            continue
        top = max(range(len(p.options)), key=lambda i: counts.get(i, 0))
        closed_out.append({"question": p.question, "winner": p.options[top], "votes": total})

    posts = await _visible_posts(db)
    post = posts[0] if posts else None
    photos = (await db.execute(
        select(CommunityPhoto).where(CommunityPhoto.hidden.is_(False)).order_by(CommunityPhoto.position, CommunityPhoto.created_at)
    )).scalars().all()
    hero = next((ph for ph in photos if ph.is_hero), photos[0] if photos else None)
    members = await _joined_count(db)
    since = _now() - timedelta(days=30)
    names = (await db.execute(
        select(User.full_name).join(CommunityContribution, CommunityContribution.user_id == User.id).where(
            CommunityContribution.status == "approved", CommunityContribution.show_name.is_(True),
            CommunityContribution.created_at >= since,
        ).distinct().limit(12)
    )).scalars().all()
    return {"success": True, "data": {
        "poll": poll_out,
        "closedPolls": closed_out,
        "post": None if post is None else _post_out(post),
        "earlierPosts": [_post_out(x) for x in posts[1:4]],
        "photos": [{"url": ph.url, "caption": ph.caption} for ph in photos],
        "heroUrl": hero.url if hero else None,
        "settings": await _settings(db),
        "isMember": is_member,
        "members": members,
        "contributors": [_first_name(n) for n in names],
    }}


SETTINGS_DEFAULTS: dict = {
    "kicker": "KHEL-O Community · Hyderabad",
    "headline": "Be there when it drops.",
    "line": "Drops, challenges and café news land in our WhatsApp group first.",
    "joinLabel": "Join the community · free",
    # Tabs in the order shown; a tab left out is hidden. The first one opens first.
    "tabs": ["week", "vote", "next", "photos"],
    "showMembersCode": True,
    "showHappeningNow": True,
    "showRecap": True,
    "showMemberCount": True,
}
TAB_KEYS = {"week", "vote", "next", "photos"}


async def _settings(db: AsyncSession) -> dict:
    row = await db.get(CommunitySettings, 1)
    return {**SETTINGS_DEFAULTS, **((row.data or {}) if row else {})}


def _post_out(post: CommunityPost) -> dict:
    return {
        "id": str(post.id), "headline": post.headline, "line": post.line, "imageUrl": post.image_url,
        "buttonLabel": post.button_label, "buttonUrl": post.button_url, "createdAt": post.created_at.isoformat(),
        "pinned": post.pinned,
    }


async def _visible_posts(db: AsyncSession) -> list[CommunityPost]:
    """What visitors see now: not hidden, inside its show window, pinned first, then newest."""
    now = _now()
    rows = (await db.execute(
        select(CommunityPost).where(CommunityPost.hidden.is_(False)).order_by(CommunityPost.created_at.desc()).limit(50)
    )).scalars().all()
    live = [p for p in rows
            if (p.show_from is None or _aware(p.show_from) <= now) and (p.show_until is None or _aware(p.show_until) > now)]
    return sorted(live, key=lambda p: not p.pinned)


async def _poll_view(db: AsyncSession, poll: CommunityPoll, user: Optional[User], device: Optional[str], is_member: bool) -> dict:
    counts = dict((await db.execute(
        select(CommunityPollVote.option_index, func.count()).where(CommunityPollVote.poll_id == poll.id)
        .group_by(CommunityPollVote.option_index)
    )).all())
    total = sum(counts.values())
    my_vote = None
    if user is not None:
        my_vote = (await db.execute(
            select(CommunityPollVote.option_index).where(
                CommunityPollVote.poll_id == poll.id, CommunityPollVote.user_id == user.id)
        )).scalar_one_or_none()
    if my_vote is None and device is not None:
        my_vote = (await db.execute(
            select(CommunityPollVote.option_index).where(
                CommunityPollVote.poll_id == poll.id, CommunityPollVote.device_id == device)
        )).scalar_one_or_none()
    closed = poll.closes_at is not None and _aware(poll.closes_at) <= _now()
    return {
        "id": str(poll.id),
        "question": poll.question,
        "options": [
            {"label": label, "votes": counts.get(i, 0), "percent": round(100 * counts.get(i, 0) / total) if total else 0}
            for i, label in enumerate(poll.options)
        ],
        "total": total,
        "closesAt": poll.closes_at.isoformat() if poll.closes_at else None,
        "closed": closed,
        "myVote": my_vote,
        "hasCode": bool(poll.members_code),
        "codeNote": poll.members_code_note,
        # Only people who tapped Join (on this phone or account) get the code itself.
        "code": poll.members_code if (is_member and poll.members_code) else None,
    }


class JoinRequest(_Camel):
    device_id: str
    source: Optional[str] = None
    in_app: bool = False


@router.post("/join")
async def join(payload: JoinRequest, db: AsyncSession = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    """Counts the Join tap (the page then opens the WhatsApp group). No login needed."""
    device = _device(payload.device_id)
    if device is None:
        raise BadRequestException(message="Bad request.", error_code="BAD_DEVICE")
    row = (await db.execute(select(CommunityJoin).where(CommunityJoin.device_id == device))).scalar_one_or_none()
    if row is None:
        db.add(CommunityJoin(device_id=device, user_id=user.id if user else None, source=_source(payload.source), in_app=payload.in_app))
    elif user is not None and row.user_id is None:
        row.user_id = user.id
    if user is not None and await db.get(CommunityMember, user.id) is None:
        db.add(CommunityMember(user_id=user.id))
    await db.commit()
    poll = await _active_poll(db)
    return {"success": True, "data": {"isMember": True, "code": poll.members_code if poll else None}}


@router.post("/joined")
async def joined(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    if await db.get(CommunityMember, user.id) is None:
        db.add(CommunityMember(user_id=user.id))
        await db.commit()
    return {"success": True, "data": {"isMember": True}}


class LeadRequest(_Camel):
    device_id: str
    email: Optional[str] = Field(None, max_length=254)
    phone: Optional[str] = Field(None, max_length=20)
    marketing_ok: bool = False
    source: Optional[str] = None


@router.post("/lead")
async def leave_contact(payload: LeadRequest, db: AsyncSession = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    """An optional email and/or phone, left after joining. Marketing needs the ticked box."""
    device = _device(payload.device_id)
    if device is None:
        raise BadRequestException(message="Bad request.", error_code="BAD_DEVICE")
    email = (payload.email or "").strip().lower() or None
    phone = re.sub(r"[^\d+]", "", payload.phone or "") or None
    if email and not _EMAIL_RE.match(email):
        raise BadRequestException(message="That email does not look right.", error_code="BAD_EMAIL")
    if phone and not re.match(r"^\+?\d{10,15}$", phone):
        raise BadRequestException(message="That number does not look right.", error_code="BAD_PHONE")
    if not email and not phone:
        raise BadRequestException(message="Add an email or a number.", error_code="LEAD_EMPTY")
    since = _now() - timedelta(days=1)
    recent = (await db.execute(
        select(func.count()).select_from(CommunityLead).where(CommunityLead.device_id == device, CommunityLead.created_at >= since)
    )).scalar_one()
    if recent >= 5:
        raise BadRequestException(message="That is enough for today.", error_code="LEAD_LIMIT")
    existing = None
    if email:
        existing = (await db.execute(select(CommunityLead).where(CommunityLead.email == email))).scalars().first()
    if existing is None and phone:
        existing = (await db.execute(select(CommunityLead).where(CommunityLead.phone == phone))).scalars().first()
    if existing is None:
        db.add(CommunityLead(device_id=device, email=email, phone=phone, source=_source(payload.source), marketing_ok=payload.marketing_ok))
    else:
        existing.email = existing.email or email
        existing.phone = existing.phone or phone
        existing.marketing_ok = existing.marketing_ok or payload.marketing_ok
        if payload.marketing_ok:
            existing.unsubscribed = False
    await db.commit()
    return {"success": True, "data": {"ok": True}}


class VoteRequest(_Camel):
    option_index: int = Field(ge=0, le=9)
    device_id: Optional[str] = None


@router.post("/polls/{poll_id}/vote")
async def vote(poll_id: UUID, payload: VoteRequest, db: AsyncSession = Depends(get_db),
               user: Optional[User] = Depends(get_optional_user)):
    poll = await db.get(CommunityPoll, poll_id)
    if poll is None or poll.status != "active":
        raise NotFoundException(message="This vote is closed.", error_code="POLL_CLOSED")
    if poll.closes_at is not None and _aware(poll.closes_at) <= _now():
        raise BadRequestException(message="This vote has closed.", error_code="POLL_CLOSED")
    if payload.option_index >= len(poll.options):
        raise BadRequestException(message="That choice is not on the list.", error_code="POLL_BAD_OPTION")
    if user is None:
        raise AuthException(message="Sign in to vote. One tap with Google.", error_code="SIGN_IN_TO_VOTE")
    device = _device(payload.device_id)
    # One vote per person (or per phone); voting again moves it to the new choice.
    if user is not None:
        existing = (await db.execute(
            select(CommunityPollVote).where(CommunityPollVote.poll_id == poll.id, CommunityPollVote.user_id == user.id)
        )).scalar_one_or_none()
    else:
        existing = (await db.execute(
            select(CommunityPollVote).where(CommunityPollVote.poll_id == poll.id, CommunityPollVote.device_id == device)
        )).scalar_one_or_none()
    if existing is None:
        db.add(CommunityPollVote(poll_id=poll.id, user_id=user.id if user else None, device_id=device, option_index=payload.option_index))
    else:
        existing.option_index = payload.option_index
    await db.commit()
    return {"success": True, "data": {"myVote": payload.option_index}}


@router.delete("/polls/{poll_id}/vote")
async def remove_vote(poll_id: UUID, db: AsyncSession = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    """Take my vote back (tapped the wrong one). They can vote again any time before it closes."""
    if user is None:
        raise AuthException(message="Sign in first.", error_code="SIGN_IN_TO_VOTE")
    poll = await db.get(CommunityPoll, poll_id)
    if poll is None or poll.status != "active" or (poll.closes_at is not None and _aware(poll.closes_at) <= _now()):
        raise BadRequestException(message="This vote has closed.", error_code="POLL_CLOSED")
    await db.execute(delete(CommunityPollVote).where(CommunityPollVote.poll_id == poll.id, CommunityPollVote.user_id == user.id))
    await db.commit()
    return {"success": True, "data": {"myVote": None}}


class ContributionRequest(_Camel):
    kind: Literal["cafe", "photos"]
    title: str = Field(min_length=2, max_length=120)
    detail: Optional[str] = Field(None, max_length=1000)
    show_name: bool = False
    device_id: Optional[str] = None
    name: Optional[str] = Field(None, max_length=60)
    contact: Optional[str] = Field(None, max_length=160)


@router.post("/contributions", status_code=201)
async def contribute(payload: ContributionRequest, db: AsyncSession = Depends(get_db),
                     user: Optional[User] = Depends(get_optional_user)):
    if user is None:
        raise AuthException(message="Sign in to send this. One tap with Google.", error_code="SIGN_IN_TO_SEND")
    device = _device(payload.device_id)
    since = _now() - timedelta(days=1)
    who = CommunityContribution.user_id == user.id if user is not None else CommunityContribution.device_id == device
    recent = (await db.execute(
        select(func.count()).select_from(CommunityContribution).where(who, CommunityContribution.created_at >= since)
    )).scalar_one()
    if recent >= DAILY_CONTRIBUTION_LIMIT:
        raise BadRequestException(message="That is a lot for one day. Try again tomorrow.", error_code="CONTRIB_LIMIT")
    db.add(CommunityContribution(
        user_id=user.id if user else None, device_id=device, kind=payload.kind, title=payload.title.strip(),
        detail=(payload.detail or "").strip() or None, show_name=payload.show_name,
        submitter_name=(payload.name or "").strip() or None, contact=(payload.contact or "").strip() or None))
    await db.commit()
    return {"success": True, "data": {"ok": True}}


# ---------------------------------------------------------------- admin

class PollRequest(_Camel):
    question: str = Field(min_length=3, max_length=160)
    options: list[str] = Field(min_length=2, max_length=6)
    closes_at: Optional[datetime] = None
    members_code: Optional[str] = Field(None, max_length=40)
    members_code_note: Optional[str] = Field(None, max_length=160)


@admin_router.put("/poll")
async def set_poll(payload: PollRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    """Starts a new weekly poll and closes the old one (its votes are kept)."""
    for old in (await db.execute(select(CommunityPoll).where(CommunityPoll.status == "active"))).scalars():
        old.status = "closed"
    db.add(CommunityPoll(
        question=payload.question.strip(), options=[o.strip() for o in payload.options if o.strip()],
        closes_at=payload.closes_at, members_code=(payload.members_code or None),
        members_code_note=payload.members_code_note))
    await db.commit()
    return {"success": True, "data": {"ok": True}}


FUNNEL_ACTIONS = ["community_landed", "community_join_tap", "community_poll_vote", "community_contribution", "community_lead"]


async def _funnel(db: AsyncSession, days: int = 60) -> list[dict]:
    """Per ad source, how many different phones reached each step."""
    action = AnalyticsEvent.event_metadata["action"].as_string()
    rows = (await db.execute(
        select(AnalyticsEvent.session_id, AnalyticsEvent.event_metadata)
        .where(AnalyticsEvent.event_type == "ui_action", action.in_(FUNNEL_ACTIONS),
               AnalyticsEvent.created_at >= _now() - timedelta(days=days))
        .limit(200000)
    )).all()
    seen: dict[str, dict[str, set]] = {}
    in_app: dict[str, set] = {}
    for sid, md in rows:
        if not isinstance(md, dict) or md.get("internal"):
            continue
        utm = md.get("utm") if isinstance(md.get("utm"), dict) else {}
        src = (utm.get("c") or utm.get("s") or "direct")[:60]
        act = md.get("action")
        seen.setdefault(src, {a: set() for a in FUNNEL_ACTIONS})[act].add(sid)
        if act == "community_landed" and md.get("iab") in ("instagram", "facebook"):
            in_app.setdefault(src, set()).add(sid)
    out = [{"source": s, "inApp": len(in_app.get(s, ())), **{a: len(v[a]) for a in FUNNEL_ACTIONS}} for s, v in seen.items()]
    return sorted(out, key=lambda r: r["community_landed"], reverse=True)


class PollEditRequest(_Camel):
    question: Optional[str] = Field(None, min_length=3, max_length=160)
    options: Optional[list[str]] = Field(None, min_length=2, max_length=6)
    closes_at: Optional[datetime] = None
    clear_close: bool = False
    members_code: Optional[str] = Field(None, max_length=40)
    members_code_note: Optional[str] = Field(None, max_length=160)


@admin_router.patch("/poll")
async def edit_poll(payload: PollEditRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    """Fix the running poll: wording, choices, closing day, code. Votes stay on their choice by position;
    removing a choice drops the votes on it."""
    poll = await _active_poll(db)
    if poll is None:
        raise NotFoundException(message="No poll is running.", error_code="NO_POLL")
    if payload.question is not None:
        poll.question = payload.question.strip()
    if payload.options is not None:
        opts = [o.strip() for o in payload.options if o.strip()]
        if len(opts) < 2:
            raise BadRequestException(message="Give at least 2 choices.", error_code="POLL_OPTIONS")
        if len(opts) < len(poll.options):
            await db.execute(delete(CommunityPollVote).where(
                CommunityPollVote.poll_id == poll.id, CommunityPollVote.option_index >= len(opts)))
        poll.options = opts
    if payload.clear_close:
        poll.closes_at = None
    elif payload.closes_at is not None:
        poll.closes_at = payload.closes_at
    if payload.members_code is not None:
        poll.members_code = payload.members_code.strip() or None
    if payload.members_code_note is not None:
        poll.members_code_note = payload.members_code_note.strip() or None
    await db.commit()
    return {"success": True, "data": {"ok": True}}


@admin_router.post("/poll/close")
async def close_poll(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    """Close the running poll now. The choice with the most votes wins and shows under Closed votes."""
    poll = await _active_poll(db)
    if poll is None:
        raise NotFoundException(message="No poll is running.", error_code="NO_POLL")
    poll.status = "closed"
    await db.commit()
    return {"success": True, "data": {"ok": True}}


@admin_router.get("/overview")
async def community_overview(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    """What the community has done: who tapped Join, the poll, the ad funnel, what people sent in."""
    members = await _joined_count(db)
    week_ago = _now() - timedelta(days=7)
    week = (await db.execute(select(func.count()).select_from(CommunityJoin).where(CommunityJoin.created_at >= week_ago))).scalar_one()
    recent = (await db.execute(
        select(CommunityJoin.created_at, CommunityJoin.source, CommunityJoin.in_app, User.full_name, User.email, User.phone_number)
        .outerjoin(User, User.id == CommunityJoin.user_id).order_by(CommunityJoin.created_at.desc()).limit(25)
    )).all()
    leads = (await db.execute(select(func.count()).select_from(CommunityLead))).scalar_one()
    promo_ok = (await db.execute(
        select(func.count()).select_from(CommunityLead).where(CommunityLead.marketing_ok.is_(True), CommunityLead.unsubscribed.is_(False))
    )).scalar_one()
    poll = await _active_poll(db)
    poll_out = None
    if poll is not None:
        counts = dict((await db.execute(
            select(CommunityPollVote.option_index, func.count()).where(CommunityPollVote.poll_id == poll.id)
            .group_by(CommunityPollVote.option_index)
        )).all())
        poll_out = {
            "id": str(poll.id), "question": poll.question, "closesAt": poll.closes_at.isoformat() if poll.closes_at else None,
            "membersCode": poll.members_code, "membersCodeNote": poll.members_code_note,
            "options": [{"label": o, "votes": counts.get(i, 0)} for i, o in enumerate(poll.options)],
            "total": sum(counts.values()),
        }
    by_status = dict((await db.execute(
        select(CommunityContribution.status, func.count()).group_by(CommunityContribution.status)
    )).all())
    post = (await db.execute(select(CommunityPost).order_by(CommunityPost.created_at.desc()).limit(1))).scalar_one_or_none()
    group = (await db.execute(select(CommunityGroupSize).order_by(CommunityGroupSize.created_at.desc()).limit(1))).scalar_one_or_none()
    return {"success": True, "data": {
        "members": members, "joinedThisWeek": week, "poll": poll_out,
        "contributionsNew": by_status.get("new", 0),
        "leads": leads, "promoOk": promo_ok,
        "funnel": await _funnel(db),
        "post": None if post is None else {"headline": post.headline, "line": post.line, "createdAt": post.created_at.isoformat()},
        "postIsStale": post is None or post.created_at.replace(tzinfo=timezone.utc) < _now() - timedelta(days=7),
        "groupSize": None if group is None else {"size": group.size, "at": group.created_at.isoformat()},
        "recent": [{"name": n, "email": e, "phone": ph, "joinedAt": c.isoformat(), "source": s, "inApp": ia}
                   for c, s, ia, n, e, ph in recent],
    }}


@admin_router.get("/contributions")
async def list_contributions(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    rows = (await db.execute(
        select(CommunityContribution, User.full_name, User.email, User.phone_number)
        .outerjoin(User, User.id == CommunityContribution.user_id)
        .order_by(CommunityContribution.created_at.desc()).limit(200)
    )).all()
    return {"success": True, "data": [{
        "id": str(c.id), "kind": c.kind, "title": c.title, "detail": c.detail, "showName": c.show_name,
        "status": c.status, "createdAt": c.created_at.isoformat(),
        "name": name or c.submitter_name, "email": email, "phone": phone, "contact": c.contact,
    } for c, name, email, phone in rows]}


class ContributionStatus(_Camel):
    status: Literal["new", "approved", "declined"]


@admin_router.patch("/contributions/{cid}")
async def set_contribution(cid: UUID, payload: ContributionStatus, db: AsyncSession = Depends(get_db),
                           admin: User = Depends(require_admin)):
    row = await db.get(CommunityContribution, cid)
    if row is None:
        raise NotFoundException(message="Not found.", error_code="CONTRIB_NOT_FOUND")
    row.status = payload.status
    await db.commit()
    return {"success": True, "data": {"ok": True}}


class PostRequest(_Camel):
    headline: str = Field(min_length=3, max_length=120)
    line: Optional[str] = Field(None, max_length=200)
    image_url: Optional[str] = Field(None, max_length=1000)
    button_label: Optional[str] = Field(None, max_length=40)
    button_url: Optional[str] = Field(None, max_length=300)
    pinned: bool = False
    hidden: bool = False
    show_from: Optional[datetime] = None
    show_until: Optional[datetime] = None


def _link(raw: Optional[str], what: str) -> Optional[str]:
    v = (raw or "").strip() or None
    if v and not v.startswith(("https://", "http://", "/")):
        raise BadRequestException(message=f"The {what} must start with https:// or /", error_code="BAD_URL")
    return v


async def _unpin_others(db: AsyncSession, keep: Optional[UUID]) -> None:
    for other in (await db.execute(select(CommunityPost).where(CommunityPost.pinned.is_(True)))).scalars():
        if other.id != keep:
            other.pinned = False


def _apply_post(post: CommunityPost, payload: PostRequest) -> None:
    post.headline = payload.headline.strip()
    post.line = (payload.line or "").strip() or None
    post.image_url = _link(payload.image_url, "photo link")
    post.button_label = (payload.button_label or "").strip() or None
    post.button_url = _link(payload.button_url, "button link")
    post.pinned = payload.pinned
    post.hidden = payload.hidden
    post.show_from = payload.show_from
    post.show_until = payload.show_until
    if post.show_from and post.show_until and post.show_until <= post.show_from:
        raise BadRequestException(message="'Show until' must be after 'show from'.", error_code="BAD_WINDOW")


def _admin_post(p: CommunityPost) -> dict:
    now = _now()
    if p.hidden:
        state = "hidden"
    elif p.show_from is not None and _aware(p.show_from) > now:
        state = "scheduled"
    elif p.show_until is not None and _aware(p.show_until) <= now:
        state = "ended"
    else:
        state = "live"
    return {**_post_out(p), "hidden": p.hidden, "state": state,
            "showFrom": p.show_from.isoformat() if p.show_from else None,
            "showUntil": p.show_until.isoformat() if p.show_until else None}


@admin_router.get("/posts")
async def list_posts(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    rows = (await db.execute(select(CommunityPost).order_by(CommunityPost.pinned.desc(), CommunityPost.created_at.desc()).limit(200))).scalars().all()
    on_top = await _visible_posts(db)
    return {"success": True, "data": {"posts": [_admin_post(p) for p in rows], "onTopId": str(on_top[0].id) if on_top else None}}


@admin_router.patch("/posts/{pid}")
async def edit_post(pid: UUID, payload: PostRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    post = await db.get(CommunityPost, pid)
    if post is None:
        raise NotFoundException(message="Post not found.", error_code="POST_NOT_FOUND")
    _apply_post(post, payload)
    if post.pinned:
        await _unpin_others(db, post.id)
    await db.commit()
    return {"success": True, "data": _admin_post(post)}


@admin_router.delete("/posts/{pid}")
async def delete_post(pid: UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    post = await db.get(CommunityPost, pid)
    if post is None:
        raise NotFoundException(message="Post not found.", error_code="POST_NOT_FOUND")
    await db.delete(post)
    await db.commit()
    return {"success": True, "data": {"ok": True}}


# ---- admin: photo wall

class PhotoRequest(_Camel):
    url: str = Field(min_length=2, max_length=1000)
    caption: Optional[str] = Field(None, max_length=120)


class PhotoEdit(_Camel):
    caption: Optional[str] = Field(None, max_length=120)
    hidden: Optional[bool] = None
    is_hero: Optional[bool] = None


class PhotoOrder(_Camel):
    ids: list[UUID] = Field(min_length=1, max_length=500)


class PresignRequest(_Camel):
    content_type: str


def _photo_out(ph: CommunityPhoto) -> dict:
    return {"id": str(ph.id), "url": ph.url, "caption": ph.caption, "position": ph.position,
            "isHero": ph.is_hero, "hidden": ph.hidden, "createdAt": ph.created_at.isoformat()}


@admin_router.get("/photos")
async def list_photos(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    rows = (await db.execute(select(CommunityPhoto).order_by(CommunityPhoto.position, CommunityPhoto.created_at))).scalars().all()
    return {"success": True, "data": [_photo_out(p) for p in rows]}


@admin_router.post("/photos/presign")
async def presign_photo(payload: PresignRequest, admin: User = Depends(require_admin)):
    from app.services.storage_service import create_presigned_upload_at
    return {"success": True, "data": create_presigned_upload_at("community", payload.content_type)}


@admin_router.post("/photos", status_code=201)
async def add_photo(payload: PhotoRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    url = _link(payload.url, "photo link")
    last = (await db.execute(select(func.max(CommunityPhoto.position)))).scalar_one_or_none()
    has_hero = (await db.execute(select(CommunityPhoto.id).where(CommunityPhoto.is_hero.is_(True)))).first() is not None
    ph = CommunityPhoto(url=url, caption=(payload.caption or "").strip() or None, position=(last or 0) + 1, is_hero=not has_hero)
    db.add(ph)
    await db.commit()
    return {"success": True, "data": _photo_out(ph)}


@admin_router.patch("/photos/{phid}")
async def edit_photo(phid: UUID, payload: PhotoEdit, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    ph = await db.get(CommunityPhoto, phid)
    if ph is None:
        raise NotFoundException(message="Photo not found.", error_code="PHOTO_NOT_FOUND")
    if payload.caption is not None:
        ph.caption = payload.caption.strip() or None
    if payload.hidden is not None:
        ph.hidden = payload.hidden
    if payload.is_hero:
        for other in (await db.execute(select(CommunityPhoto).where(CommunityPhoto.is_hero.is_(True)))).scalars():
            other.is_hero = False
        ph.is_hero = True
        ph.hidden = False
    await db.commit()
    return {"success": True, "data": _photo_out(ph)}


@admin_router.put("/photos/order")
async def order_photos(payload: PhotoOrder, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    rows = {p.id: p for p in (await db.execute(select(CommunityPhoto))).scalars()}
    for n, pid in enumerate(payload.ids):
        if pid in rows:
            rows[pid].position = n
    await db.commit()
    return {"success": True, "data": {"ok": True}}


@admin_router.delete("/photos/{phid}")
async def delete_photo(phid: UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    ph = await db.get(CommunityPhoto, phid)
    if ph is None:
        raise NotFoundException(message="Photo not found.", error_code="PHOTO_NOT_FOUND")
    url, was_hero = ph.url, ph.is_hero
    await db.delete(ph)
    await db.flush()
    if was_hero:
        nxt = (await db.execute(select(CommunityPhoto).order_by(CommunityPhoto.position).limit(1))).scalar_one_or_none()
        if nxt is not None:
            nxt.is_hero = True
    await db.commit()
    from app.services.storage_service import delete_object, key_from_url
    try:
        key = key_from_url(url)
    except Exception:  # storage not configured (tests, local)
        key = None
    if key and key.startswith("community/"):
        delete_object(key)
    return {"success": True, "data": {"ok": True}}


# ---- admin: page settings

class SettingsRequest(_Camel):
    kicker: Optional[str] = Field(None, max_length=60)
    headline: Optional[str] = Field(None, min_length=3, max_length=80)
    line: Optional[str] = Field(None, max_length=200)
    join_label: Optional[str] = Field(None, min_length=3, max_length=40)
    tabs: Optional[list[str]] = Field(None, min_length=1, max_length=4)
    show_members_code: Optional[bool] = None
    show_happening_now: Optional[bool] = None
    show_recap: Optional[bool] = None
    show_member_count: Optional[bool] = None


@admin_router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    return {"success": True, "data": {**await _settings(db), "defaults": SETTINGS_DEFAULTS}}


@admin_router.put("/settings")
async def put_settings(payload: SettingsRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    changes = payload.model_dump(by_alias=True, exclude_none=True)
    if "tabs" in changes:
        tabs = [t for t in dict.fromkeys(changes["tabs"]) if t in TAB_KEYS]
        if not tabs:
            raise BadRequestException(message="Keep at least one tab.", error_code="NO_TABS")
        changes["tabs"] = tabs
    for k in ("kicker", "headline", "line", "joinLabel"):
        if k in changes:
            changes[k] = changes[k].strip()
    row = await db.get(CommunitySettings, 1)
    if row is None:
        row = CommunitySettings(id=1, data={})
        db.add(row)
    row.data = {**(row.data or {}), **changes}
    await db.commit()
    return {"success": True, "data": await _settings(db)}


@admin_router.post("/settings/reset")
async def reset_settings(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    row = await db.get(CommunitySettings, 1)
    if row is not None:
        row.data = {}
        await db.commit()
    return {"success": True, "data": SETTINGS_DEFAULTS}


# ---- admin: poll history

@admin_router.get("/polls")
async def poll_history(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    rows = (await db.execute(select(CommunityPoll).order_by(CommunityPoll.created_at.desc()).limit(50))).scalars().all()
    out = []
    for p in rows:
        counts = dict((await db.execute(
            select(CommunityPollVote.option_index, func.count()).where(CommunityPollVote.poll_id == p.id)
            .group_by(CommunityPollVote.option_index))).all())
        total = sum(counts.values())
        top = max(range(len(p.options)), key=lambda i: counts.get(i, 0)) if total else None
        out.append({"id": str(p.id), "question": p.question, "status": p.status, "total": total,
                    "winner": p.options[top] if top is not None else None,
                    "options": [{"label": o, "votes": counts.get(i, 0)} for i, o in enumerate(p.options)],
                    "createdAt": p.created_at.isoformat(), "closesAt": p.closes_at.isoformat() if p.closes_at else None})
    return {"success": True, "data": out}


@admin_router.delete("/polls/{poll_id}")
async def delete_poll(poll_id: UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    """For a test or a mistake: removes the poll and its votes."""
    poll = await db.get(CommunityPoll, poll_id)
    if poll is None:
        raise NotFoundException(message="Poll not found.", error_code="POLL_NOT_FOUND")
    await db.execute(delete(CommunityPollVote).where(CommunityPollVote.poll_id == poll.id))
    await db.delete(poll)
    await db.commit()
    return {"success": True, "data": {"ok": True}}


@admin_router.delete("/contributions/{cid}")
async def delete_contribution(cid: UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    row = await db.get(CommunityContribution, cid)
    if row is None:
        raise NotFoundException(message="Not found.", error_code="CONTRIB_NOT_FOUND")
    await db.delete(row)
    await db.commit()
    return {"success": True, "data": {"ok": True}}


# ---- admin: page analytics

ALL_ACTIONS = [
    "community_landed", "community_tab", "community_join_tap", "community_poll_vote", "community_poll_unvote",
    "community_contribution", "community_lead", "community_sign_in_ask", "community_tile_tap", "community_next_step_tap",
]


@admin_router.get("/analytics")
async def community_analytics(days: int = Query(30, ge=1, le=365), db: AsyncSession = Depends(get_db),
                              admin: User = Depends(require_admin)):
    """Everything people did on the community page, from our own events (internal/test visits left out)."""
    since = _now() - timedelta(days=days)
    action = AnalyticsEvent.event_metadata["action"].as_string()
    rows = (await db.execute(
        select(AnalyticsEvent.session_id, AnalyticsEvent.event_metadata, AnalyticsEvent.created_at)
        .where(AnalyticsEvent.event_type == "ui_action", action.in_(ALL_ACTIONS), AnalyticsEvent.created_at >= since)
        .limit(300000)
    )).all()
    people: dict[str, set] = {a: set() for a in ALL_ACTIONS}
    taps: dict[str, int] = {a: 0 for a in ALL_ACTIONS}
    tabs: dict[str, int] = {}
    join_where: dict[str, int] = {}
    in_app: set = set()
    daily: dict[str, dict[str, set]] = {}
    for sid, md, at in rows:
        if not isinstance(md, dict) or md.get("internal"):
            continue
        act = md.get("action")
        people[act].add(sid)
        taps[act] += 1
        day = (_aware(at) + timedelta(hours=5, minutes=30)).date().isoformat()
        d = daily.setdefault(day, {"visits": set(), "joins": set(), "votes": set()})
        if act == "community_landed":
            d["visits"].add(sid)
            if md.get("iab") in ("instagram", "facebook") or md.get("inApp"):
                in_app.add(sid)
        elif act == "community_join_tap":
            d["joins"].add(sid)
            w = str(md.get("where") or "unknown")[:40]
            join_where[w] = join_where.get(w, 0) + 1
        elif act == "community_poll_vote":
            d["votes"].add(sid)
        elif act == "community_tab":
            t = str(md.get("tab") or "?")[:12]
            tabs[t] = tabs.get(t, 0) + 1
    start = (since + timedelta(hours=5, minutes=30)).date()
    series = []
    for n in range(days + 1):
        day = (start + timedelta(days=n)).isoformat()
        d = daily.get(day, {})
        series.append({"day": day, **{k: len(d.get(k, ())) for k in ("visits", "joins", "votes")}})
    visits = len(people["community_landed"])
    return {"success": True, "data": {
        "days": days,
        "totals": {
            "visits": visits, "inApp": len(in_app),
            "joined": len(people["community_join_tap"]), "voted": len(people["community_poll_vote"]),
            "suggested": len(people["community_contribution"]), "leftContact": len(people["community_lead"]),
            "askedToSignIn": len(people["community_sign_in_ask"]), "removedVote": taps["community_poll_unvote"],
            "nextStepTaps": taps["community_next_step_tap"],
        },
        "joinRate": round(100 * len(people["community_join_tap"]) / visits) if visits else 0,
        "tabs": tabs, "joinWhere": dict(sorted(join_where.items(), key=lambda kv: -kv[1])),
        "series": series[-days:] if days < len(series) else series,
        "sources": await _funnel(db, days),
    }}





@admin_router.post("/post", status_code=201)
async def publish_post(payload: PostRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    """A post on the community page. The pinned one sits on top, else the newest live one."""
    post = CommunityPost()
    _apply_post(post, payload)
    db.add(post)
    await db.flush()
    if post.pinned:
        await _unpin_others(db, post.id)
    await db.commit()
    return {"success": True, "data": {"ok": True, "id": str(post.id)}}


class GroupSizeRequest(_Camel):
    size: int = Field(ge=0, le=1_000_000)


@admin_router.post("/group-size")
async def set_group_size(payload: GroupSizeRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    db.add(CommunityGroupSize(size=payload.size))
    await db.commit()
    return {"success": True, "data": {"ok": True}}


async def _people(db: AsyncSession) -> list[dict]:
    """Everyone we can contact: accounts that tapped Join, and emails or numbers people left."""
    rows: list[dict] = []
    joined = (await db.execute(
        select(CommunityMember.joined_at, User.full_name, User.email, User.phone_number, User.guide_state)
        .join(User, User.id == CommunityMember.user_id)
    )).all()
    for at, name, email, phone, gs in joined:
        rows.append({"kind": "account", "name": name, "email": email, "phone": phone, "source": None,
                     "promoOk": bool(email) and not (gs or {}).get("community_email_off"), "at": at.isoformat()})
    leads = (await db.execute(select(CommunityLead).order_by(CommunityLead.created_at.desc()))).scalars().all()
    for ld in leads:
        rows.append({"kind": "lead", "name": None, "email": ld.email, "phone": ld.phone, "source": ld.source,
                     "promoOk": bool(ld.marketing_ok and not ld.unsubscribed), "at": ld.created_at.isoformat()})
    return sorted(rows, key=lambda r: r["at"], reverse=True)


@admin_router.get("/people")
async def community_people(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    return {"success": True, "data": (await _people(db))[:500]}


@admin_router.get("/people.csv")
async def community_people_csv(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    import csv
    import io
    from fastapi.responses import StreamingResponse

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["kind", "name", "email", "phone", "source", "ok_to_send_promotions", "at"])
    for r in await _people(db):
        w.writerow([r["kind"], r["name"] or "", r["email"] or "", r["phone"] or "", r["source"] or "", "yes" if r["promoOk"] else "no", r["at"]])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="community-people.csv"'})


# ---------------------------------------------------------------- the community email

class CommunityEmailRequest(_Camel):
    test: bool = False
    # The recipient count the admin saw; a real send is refused if it changed.
    confirm_count: Optional[int] = None


@admin_router.get("/email")
async def community_email_preview(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    from app.services import community_mailer as mailer
    return {"success": True, "data": {
        "subject": mailer.SUBJECT, "recipients": len(await mailer.recipients(db)) + len(await mailer.lead_recipients(db)),
        "testedRecently": mailer.tested_recently(admin),
        "accounts": len(await mailer.recipients(db)), "leads": len(await mailer.lead_recipients(db)),
        "html": mailer.email_html(admin.full_name.split()[0] if admin.full_name else None, admin.id),
    }}


@admin_router.post("/email")
async def community_email_send(payload: CommunityEmailRequest, db: AsyncSession = Depends(get_db),
                               admin: User = Depends(require_admin)):
    from app.services import community_mailer as mailer
    if payload.test:
        return {"success": True, "data": {**await mailer.send_test(db, admin), "test": True}}
    if not mailer.tested_recently(admin):
        raise BadRequestException(message="Send a test to yourself first.", error_code="TEST_FIRST")
    count = len(await mailer.recipients(db)) + len(await mailer.lead_recipients(db))
    if payload.confirm_count != count:
        raise BadRequestException(message=f"The list changed: it is {count} people now. Check and confirm again.", error_code="COUNT_CHANGED")
    sent = await mailer.send_all(db)
    return {"success": True, "data": {"sent": sent, "test": False}}


_UNSUB_STYLE = "margin:0;background:#F1EFEA;font-family:Arial,sans-serif;color:#111318"


@router.get("/unsubscribe")
async def community_unsubscribe_page(u: UUID, t: str, k: str = ""):
    # A GET only shows the button: mail scanners open links and must not unsubscribe anyone.
    import html as _h
    from fastapi.responses import HTMLResponse
    return HTMLResponse(
        f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<meta name="robots" content="noindex"><title>Unsubscribe</title></head><body style="{_UNSUB_STYLE}">'
        f'<div style="max-width:420px;margin:64px auto;padding:32px;background:#fff;border:1px solid #E8E6E2;border-radius:16px">'
        f'<div style="font-weight:800;font-size:20px;margin-bottom:20px">KHEL<span style="color:#E54D42">-O</span></div>'
        f'<h1 style="font-size:20px;margin:0 0 8px">Stop community emails?</h1>'
        f'<p style="color:#5A5E6B;line-height:1.5">You will still get emails about your own bookings.</p>'
        f'<form method="post"><input type="hidden" name="u" value="{_h.escape(str(u))}"><input type="hidden" name="t" value="{_h.escape(t)}"><input type="hidden" name="k" value="{_h.escape(k)}">'
        f'<button style="margin-top:12px;background:#E54D42;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-weight:700;font-size:15px">Unsubscribe</button>'
        f'</form></div></body></html>'
    )


@router.post("/unsubscribe")
async def community_unsubscribe_do(request: Request, db: AsyncSession = Depends(get_db)):
    from urllib.parse import parse_qs
    from fastapi.responses import HTMLResponse
    from app.services import community_mailer as mailer
    fields = parse_qs((await request.body()).decode("utf-8", "ignore"))
    try:
        uid = UUID(fields.get("u", [""])[0])
    except ValueError:
        uid = None
    ok = uid is not None and await mailer.unsubscribe(db, uid, fields.get("t", [""])[0][:64], lead=fields.get("k", [""])[0] == "lead")
    msg = "Done. No more community emails." if ok else "That link did not work."
    return HTMLResponse(
        f'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<body style="font-family:Arial,sans-serif;max-width:420px;margin:64px auto;padding:0 20px"><h1 style="font-size:20px">{msg}</h1></body>'
    )
