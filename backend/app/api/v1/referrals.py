"""Referrals: the public offer, claiming a friend's link, a player's own rewards, and the admin page.
See services/referrals.py and docs/superpowers/specs/2026-11-21-referrals-design.md."""
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.core.exceptions import NotFoundException, ValidationException
from app.database import get_db
from app.models.admin_audit_log import AdminAuditLog
from app.models.booking import Booking
from app.models.referral import Referral, ReferralCredit
from app.models.user import User
from app.repositories.platform_settings_repository import PlatformSettingsRepository
from app.services import referrals as R

router = APIRouter()
admin_router = APIRouter()


def _offer(s) -> dict:
    """What the programme gives. Never includes the community code itself: that lives in WhatsApp."""
    on = bool(s.referrals_on)
    return {
        "on": on,
        "welcome": int(s.welcome_credit or 0) if on else 0,
        "community": int(s.community_credit or 0) if on and s.community_code else 0,
        "reward": int(s.referral_reward or 0) if on else 0,
        "maxPerBooking": int(R.CAP_PER_BOOKING),
        "minSession": int(R.MIN_SESSION),
        "creditDays": R.CREDIT_DAYS,
        "referrerCap": R.REFERRER_CAP,
    }


@router.get("/offer", status_code=status.HTTP_200_OK)
async def referral_offer(db: AsyncSession = Depends(get_db)):
    s = await PlatformSettingsRepository(db).get_or_create()
    return {"success": True, "data": _offer(s)}


class ClaimIn(BaseModel):
    code: str = Field(..., max_length=20)


@router.post("/claim", status_code=status.HTTP_200_OK)
async def claim_referral(body: ClaimIn, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = await PlatformSettingsRepository(db).get_or_create()
    result = await R.claim(db, s, current_user, body.code)
    return {"success": True, "data": {"status": result}}


@router.get("/me", status_code=status.HTTP_200_OK)
async def my_referrals(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.analytics_event import AnalyticsEvent

    s = await PlatformSettingsRepository(db).get_or_create()
    now = datetime.now(timezone.utc)
    code = R.invite_code(current_user.id)
    opened = (await db.execute(
        select(func.count(func.distinct(AnalyticsEvent.session_id))).where(
            AnalyticsEvent.event_type == "page_view", AnalyticsEvent.event_metadata["inv"].as_string() == code
        )
    )).scalar() or 0
    counts = dict((await db.execute(
        select(Referral.status, func.count(Referral.id)).where(Referral.referrer_id == current_user.id).group_by(Referral.status)
    )).all())
    credits = (await db.execute(
        select(ReferralCredit).where(
            ReferralCredit.user_id == current_user.id, ReferralCredit.status == "available", ReferralCredit.expires_at > now
        ).order_by(ReferralCredit.expires_at)
    )).scalars().all()
    referred = (await db.execute(select(Referral).where(Referral.referred_id == current_user.id))).scalar_one_or_none()
    return {"success": True, "data": {
        "code": code,
        "opened": opened,
        "joined": sum(v for k, v in counts.items() if k != "void"),
        "played": counts.get("rewarded", 0) + counts.get("capped", 0),
        "rewarded": counts.get("rewarded", 0),
        "credits": [{"amount": float(c.amount), "expiresAt": c.expires_at.isoformat()} for c in credits],
        "available": float(sum(float(c.amount) for c in credits)),
        "invitedBy": bool(referred and referred.status != "void"),
        "offer": _offer(s),
    }}


# ---------------- admin ----------------

class ReferralSettingsIn(BaseModel):
    referrals_on: Optional[bool] = None
    welcome_credit: Optional[int] = Field(None, ge=0, le=100)
    community_credit: Optional[int] = Field(None, ge=0, le=100)
    referral_reward: Optional[int] = Field(None, ge=0, le=100)
    # Empty string clears the code (community credit off).
    community_code: Optional[str] = Field(None, max_length=20)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def _settings_out(s) -> dict:
    return {
        "referralsOn": bool(s.referrals_on),
        "welcomeCredit": int(s.welcome_credit or 0),
        "communityCredit": int(s.community_credit or 0),
        "referralReward": int(s.referral_reward or 0),
        "communityCode": s.community_code,
        "maxPerBooking": int(R.CAP_PER_BOOKING),
        "minSession": int(R.MIN_SESSION),
        "creditDays": R.CREDIT_DAYS,
        "referrerCap": R.REFERRER_CAP,
    }


@admin_router.get("", status_code=status.HTTP_200_OK)
async def admin_referrals(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
    limit: int = Query(50, ge=1, le=200),
):
    s = await PlatformSettingsRepository(db).get_or_create()
    by_status = dict((await db.execute(select(Referral.status, func.count(Referral.id)).group_by(Referral.status))).all())
    credit_rows = (await db.execute(
        select(ReferralCredit.status, func.count(ReferralCredit.id), func.coalesce(func.sum(ReferralCredit.amount), 0))
        .group_by(ReferralCredit.status)
    )).all()
    credits = {st: {"count": n, "amount": float(a)} for st, n, a in credit_rows}
    # ₹ KHEL-O gave on paid bookings, by kind (credit_note "welcome+community+referral").
    from app.services.checkout_maths import _paid_statuses
    paid = (await db.execute(
        select(Booking.credit_note, func.count(Booking.id), func.coalesce(func.sum(Booking.khelo_credit), 0))
        .where(Booking.khelo_credit > 0, Booking.status.in_(_paid_statuses()))
        .group_by(Booking.credit_note)
    )).all()
    spent = {"bookings": 0, "amount": 0.0, "withCommunityCode": 0, "withFriendReward": 0}
    for note, n, a in paid:
        spent["bookings"] += n
        spent["amount"] += float(a)
        if note and "community" in note:
            spent["withCommunityCode"] += n
        if note and "referral" in note:
            spent["withFriendReward"] += n

    referrer = User.__table__.alias("referrer")
    friend = User.__table__.alias("friend")
    rows = (await db.execute(
        select(Referral, referrer.c.full_name, referrer.c.email, friend.c.full_name, friend.c.email)
        .join(referrer, referrer.c.id == Referral.referrer_id)
        .join(friend, friend.c.id == Referral.referred_id)
        .order_by(Referral.created_at.desc())
        .limit(limit)
    )).all()
    recent = [{
        "id": str(r.id), "status": r.status, "createdAt": r.created_at.isoformat(),
        "rewardedAt": r.rewarded_at.isoformat() if r.rewarded_at else None,
        "referrer": rn or re_, "referrerEmail": re_, "friend": fn or fe, "friendEmail": fe,
        "voidReason": r.void_reason,
    } for r, rn, re_, fn, fe in rows]
    top = (await db.execute(
        select(User.full_name, User.email, func.count(Referral.id).label("n"))
        .join(Referral, Referral.referrer_id == User.id)
        .where(Referral.status != "void")
        .group_by(User.id, User.full_name, User.email)
        .order_by(func.count(Referral.id).desc())
        .limit(10)
    )).all()
    return {"success": True, "data": {
        "settings": _settings_out(s),
        "referrals": {k: by_status.get(k, 0) for k in ("joined", "rewarded", "capped", "void")},
        "credits": credits,
        "spent": spent,
        "recent": recent,
        "top": [{"name": n or e, "email": e, "friends": c} for n, e, c in top],
    }}


@admin_router.put("/settings", status_code=status.HTTP_200_OK)
async def admin_referral_settings(
    body: ReferralSettingsIn, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin),
):
    s = await PlatformSettingsRepository(db).get_or_create()
    data = body.model_dump(exclude_unset=True)
    if "community_code" in data:
        code = R.norm_code(data["community_code"])
        if code and not re.fullmatch(r"[A-Z0-9-]{4,20}", code):
            raise ValidationException(message="Use 4 to 20 letters, numbers or dashes.", error_code="BAD_CODE")
        data["community_code"] = code or None
    for k, v in data.items():
        setattr(s, k, v)
    s.updated_by = admin.id
    db.add(AdminAuditLog(
        id=uuid.uuid4(), admin_id=admin.id, admin_email=admin.email, action="referral_settings",
        entity_type="platform_settings", entity_id="referrals",
        entity_name=", ".join(f"{k}={'set' if k == 'community_code' and v else v}" for k, v in data.items())[:250],
    ))
    await db.commit()
    return {"success": True, "data": _settings_out(s)}


class VoidIn(BaseModel):
    reason: str = Field(..., min_length=2, max_length=120)


@admin_router.post("/{referral_id}/void", status_code=status.HTTP_200_OK)
async def admin_void_referral(
    referral_id: uuid.UUID, body: VoidIn, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin),
):
    ref = await db.get(Referral, referral_id)
    if ref is None:
        raise NotFoundException(message="Referral not found", error_code="NOT_FOUND")
    ref.status = "void"
    ref.void_reason = body.reason
    # An unused reward from it goes too; one already spent on a booking stays spent.
    credits = (await db.execute(
        select(ReferralCredit).where(ReferralCredit.referral_id == ref.id, ReferralCredit.status == "available")
    )).scalars().all()
    for c in credits:
        c.status = "void"
    db.add(AdminAuditLog(
        id=uuid.uuid4(), admin_id=admin.id, admin_email=admin.email, action="referral_void",
        entity_type="referral", entity_id=str(ref.id), entity_name=body.reason[:250],
    ))
    await db.commit()
    return {"success": True, "data": {"id": str(ref.id), "status": "void", "creditsVoided": len(credits)}}
