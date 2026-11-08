"""Community page: this week's poll, the members-only code, contributions.

"Member" means the person tapped Join on the community page while logged in.
We cannot see inside WhatsApp, so it is never shown as "verified".
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_optional_user, require_admin
from app.core.exceptions import BadRequestException, NotFoundException
from app.database import get_db
from app.models.community import CommunityContribution, CommunityMember, CommunityPoll, CommunityPollVote
from app.models.user import User

router = APIRouter(prefix="/community", tags=["Community"])
admin_router = APIRouter(prefix="/admin/community", tags=["Admin Community"])

DAILY_CONTRIBUTION_LIMIT = 5


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _active_poll(db: AsyncSession) -> Optional[CommunityPoll]:
    return (await db.execute(
        select(CommunityPoll).where(CommunityPoll.status == "active").order_by(CommunityPoll.created_at.desc()).limit(1)
    )).scalar_one_or_none()


def _first_name(name: Optional[str]) -> str:
    return (name or "").strip().split(" ")[0][:20] or "A gamer"


@router.get("/this-week")
async def this_week(db: AsyncSession = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    poll = await _active_poll(db)
    is_member = False
    if user is not None:
        is_member = (await db.get(CommunityMember, user.id)) is not None

    poll_out = None
    if poll is not None:
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
        closed = poll.closes_at is not None and poll.closes_at <= _now()
        poll_out = {
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
            # Only people who tapped Join get the code itself.
            "code": poll.members_code if (is_member and poll.members_code) else None,
        }

    members = (await db.execute(select(func.count()).select_from(CommunityMember))).scalar_one()
    since = _now() - timedelta(days=30)
    names = (await db.execute(
        select(User.full_name).join(CommunityContribution, CommunityContribution.user_id == User.id).where(
            CommunityContribution.status == "approved", CommunityContribution.show_name.is_(True),
            CommunityContribution.created_at >= since,
        ).distinct().limit(12)
    )).scalars().all()
    return {"success": True, "data": {
        "poll": poll_out,
        "isMember": is_member,
        "members": members,
        "contributors": [_first_name(n) for n in names],
    }}


@router.post("/joined")
async def joined(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    if await db.get(CommunityMember, user.id) is None:
        db.add(CommunityMember(user_id=user.id))
        await db.commit()
    return {"success": True, "data": {"isMember": True}}


class VoteRequest(_Camel):
    option_index: int = Field(ge=0, le=9)


@router.post("/polls/{poll_id}/vote")
async def vote(poll_id: UUID, payload: VoteRequest, db: AsyncSession = Depends(get_db),
               user: User = Depends(get_current_active_user)):
    poll = await db.get(CommunityPoll, poll_id)
    if poll is None or poll.status != "active":
        raise NotFoundException(message="This vote is closed.", error_code="POLL_CLOSED")
    if poll.closes_at is not None and poll.closes_at <= _now():
        raise BadRequestException(message="This vote has closed.", error_code="POLL_CLOSED")
    if payload.option_index >= len(poll.options):
        raise BadRequestException(message="That choice is not on the list.", error_code="POLL_BAD_OPTION")
    # One vote per person; voting again moves it to the new choice.
    existing = (await db.execute(
        select(CommunityPollVote).where(CommunityPollVote.poll_id == poll.id, CommunityPollVote.user_id == user.id)
    )).scalar_one_or_none()
    if existing is None:
        db.add(CommunityPollVote(poll_id=poll.id, user_id=user.id, option_index=payload.option_index))
    else:
        existing.option_index = payload.option_index
    await db.commit()
    return {"success": True, "data": {"myVote": payload.option_index}}


class ContributionRequest(_Camel):
    kind: Literal["cafe", "photos"]
    title: str = Field(min_length=2, max_length=120)
    detail: Optional[str] = Field(None, max_length=1000)
    show_name: bool = False


@router.post("/contributions", status_code=201)
async def contribute(payload: ContributionRequest, db: AsyncSession = Depends(get_db),
                     user: User = Depends(get_current_active_user)):
    since = _now() - timedelta(days=1)
    recent = (await db.execute(
        select(func.count()).select_from(CommunityContribution).where(
            CommunityContribution.user_id == user.id, CommunityContribution.created_at >= since)
    )).scalar_one()
    if recent >= DAILY_CONTRIBUTION_LIMIT:
        raise BadRequestException(message="That is a lot for one day. Try again tomorrow.", error_code="CONTRIB_LIMIT")
    db.add(CommunityContribution(
        user_id=user.id, kind=payload.kind, title=payload.title.strip(),
        detail=(payload.detail or "").strip() or None, show_name=payload.show_name))
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


@admin_router.get("/contributions")
async def list_contributions(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    rows = (await db.execute(
        select(CommunityContribution, User.full_name, User.email)
        .outerjoin(User, User.id == CommunityContribution.user_id)
        .order_by(CommunityContribution.created_at.desc()).limit(200)
    )).all()
    return {"success": True, "data": [{
        "id": str(c.id), "kind": c.kind, "title": c.title, "detail": c.detail, "showName": c.show_name,
        "status": c.status, "createdAt": c.created_at.isoformat(), "name": name, "email": email,
    } for c, name, email in rows]}


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
