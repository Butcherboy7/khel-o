"""Community page: this week's poll, the members-only code, contributions.

"Member" means the person tapped Join on the community page while logged in.
We cannot see inside WhatsApp, so it is never shown as "verified".
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Request
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
        select(CommunityContribution, User.full_name, User.email, User.phone_number)
        .outerjoin(User, User.id == CommunityContribution.user_id)
        .order_by(CommunityContribution.created_at.desc()).limit(200)
    )).all()
    return {"success": True, "data": [{
        "id": str(c.id), "kind": c.kind, "title": c.title, "detail": c.detail, "showName": c.show_name,
        "status": c.status, "createdAt": c.created_at.isoformat(), "name": name, "email": email, "phone": phone,
    } for c, name, email, phone in rows]}


@admin_router.get("/overview")
async def community_overview(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    """What the community has done: who tapped Join, the live poll's votes, what people sent in."""
    members = (await db.execute(select(func.count()).select_from(CommunityMember))).scalar_one()
    week = (await db.execute(
        select(func.count()).select_from(CommunityMember).where(CommunityMember.joined_at >= _now() - timedelta(days=7))
    )).scalar_one()
    recent = (await db.execute(
        select(User.full_name, User.email, User.phone_number, CommunityMember.joined_at)
        .join(User, User.id == CommunityMember.user_id).order_by(CommunityMember.joined_at.desc()).limit(25)
    )).all()
    poll = await _active_poll(db)
    poll_out = None
    if poll is not None:
        counts = dict((await db.execute(
            select(CommunityPollVote.option_index, func.count()).where(CommunityPollVote.poll_id == poll.id)
            .group_by(CommunityPollVote.option_index)
        )).all())
        poll_out = {
            "question": poll.question, "closesAt": poll.closes_at.isoformat() if poll.closes_at else None,
            "membersCode": poll.members_code,
            "options": [{"label": o, "votes": counts.get(i, 0)} for i, o in enumerate(poll.options)],
            "total": sum(counts.values()),
        }
    by_status = dict((await db.execute(
        select(CommunityContribution.status, func.count()).group_by(CommunityContribution.status)
    )).all())
    return {"success": True, "data": {
        "members": members, "joinedThisWeek": week, "poll": poll_out,
        "contributionsNew": by_status.get("new", 0),
        "recent": [{"name": n, "email": e, "phone": ph, "joinedAt": j.isoformat()} for n, e, ph, j in recent],
    }}


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


# ---------------------------------------------------------------- the community email

class CommunityEmailRequest(_Camel):
    test: bool = False
    # The recipient count the admin saw; a real send is refused if it changed.
    confirm_count: Optional[int] = None


@admin_router.get("/email")
async def community_email_preview(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    from app.services import community_mailer as mailer
    return {"success": True, "data": {
        "subject": mailer.SUBJECT, "recipients": len(await mailer.recipients(db)),
        "testedRecently": mailer.tested_recently(admin),
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
    count = len(await mailer.recipients(db))
    if payload.confirm_count != count:
        raise BadRequestException(message=f"The list changed: it is {count} people now. Check and confirm again.", error_code="COUNT_CHANGED")
    sent = await mailer.send_all(db)
    return {"success": True, "data": {"sent": sent, "test": False}}


_UNSUB_STYLE = "margin:0;background:#F1EFEA;font-family:Arial,sans-serif;color:#111318"


@router.get("/unsubscribe")
async def community_unsubscribe_page(u: UUID, t: str):
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
        f'<form method="post"><input type="hidden" name="u" value="{_h.escape(str(u))}"><input type="hidden" name="t" value="{_h.escape(t)}">'
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
    ok = uid is not None and await mailer.unsubscribe(db, uid, fields.get("t", [""])[0][:64])
    msg = "Done. No more community emails." if ok else "That link did not work."
    return HTMLResponse(
        f'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<body style="font-family:Arial,sans-serif;max-width:420px;margin:64px auto;padding:0 20px"><h1 style="font-size:20px">{msg}</h1></body>'
    )
