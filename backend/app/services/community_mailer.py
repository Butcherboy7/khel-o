"""The community email: one message to registered users about what they miss
(drops, challenges, squads) with a way into the WhatsApp community.

Safety, in order:
* an admin sends a test to their own inbox first; the real send is refused until
  they have, and until the confirmed recipient count matches;
* only real, active, non-placeholder addresses, once each;
* every email has a one-tap unsubscribe that works for every later community email.
Nothing outside production is delivered except EMAIL_ALLOWLIST (notification_service.email_allowed).
"""
import asyncio
import hashlib
import hmac
import html
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.community import (
    CommunityEmailCampaign, CommunityEmailDelivery, CommunityLead, CommunityPoll, CommunityPollVote,
)
from app.models.user import User
from app.services import community_email_templates as tpl

logger = structlog.get_logger()

SUBJECT = "Festive week, better with a squad"
_PLACEHOLDER_DOMAINS = ("@khel-o.com", "@example.com")
_GAP = 0.08  # SES allows 14/s
OFF_KEY = "community_email_off"
TESTED_KEY = "community_email_tested_at"


def unsubscribe_token(user_id: uuid.UUID) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"community-unsub:{user_id}".encode(), hashlib.sha256).hexdigest()[:32]


def unsubscribe_url(user_id: uuid.UUID, lead: bool = False) -> str:
    extra = "&k=lead" if lead else ""
    return f"{settings.FRONTEND_URL.rstrip('/')}/api/v1/community/unsubscribe?u={user_id}&t={unsubscribe_token(user_id)}{extra}"


def email_html(first_name: str | None, user_id: uuid.UUID, lead: bool = False) -> str:
    from app.services.notification_service import _email_button, _email_wrapper

    front = settings.FRONTEND_URL.rstrip("/")
    name = html.escape(first_name or "there")
    rows = "".join(
        f'<tr><td style="padding:6px 0;font-size:14px;line-height:1.5;color:#3A3D46"><b style="color:#D0463C">{h}.</b> {t}</td></tr>'
        for h, t in (
            ("Drops", "GTA 6 seats before everyone else"),
            ("Challenges", "Tekken night, #02 is announced here first"),
            ("Squads", "Find people to play with in your city"),
        )
    )
    return _email_wrapper(f"""
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#D0463C;font-weight:800">KHEL-O community</p>
        <h2 style="margin:0 0 12px;font-size:22px;">Festive week, better with a squad</h2>
        <div style="font-size:15px;line-height:1.55;color:#3A3D46">
          <p style="margin:0 0 10px">Hi {name}, you joined KHEL-O, but you are missing the good part. The community gets these first:</p>
          <table role="presentation" style="width:100%;border-collapse:collapse">{rows}</table>
        </div>
        <div style="margin:22px 0 8px">{_email_button(f"{front}/community", "Join the community")}</div>
        <p style="margin:24px 0 0;font-size:12px;color:#8A8F9C">
          You get this because {"you asked for KHEL-O updates" if lead else "you have a KHEL-O account"}.
          <a href="{unsubscribe_url(user_id, lead)}" style="color:#8A8F9C">Unsubscribe in one tap</a>
        </p>
    """)


async def recipients(db: AsyncSession) -> list[User]:
    rows = (await db.execute(
        select(User).where(User.is_active.is_(True), User.deleted_at.is_(None), User.email.is_not(None))
    )).scalars().all()
    seen, out = set(), []
    for u in rows:
        email = (u.email or "").strip().lower()
        if not email or "@" not in email or email.endswith(_PLACEHOLDER_DOMAINS) or email in seen:
            continue
        if (u.guide_state or {}).get(OFF_KEY):
            continue
        seen.add(email)
        out.append(u)
    return out


async def lead_recipients(db: AsyncSession) -> list[CommunityLead]:
    """People who left an email and ticked the box for promotions, once each, not already an account."""
    accounts = {(u.email or "").strip().lower() for u in await recipients(db)}
    rows = (await db.execute(
        select(CommunityLead).where(CommunityLead.marketing_ok.is_(True), CommunityLead.unsubscribed.is_(False),
                                    CommunityLead.email.is_not(None))
    )).scalars().all()
    seen, out = set(), []
    for ld in rows:
        email = (ld.email or "").strip().lower()
        if not email or email.endswith(_PLACEHOLDER_DOMAINS) or email in seen or email in accounts:
            continue
        seen.add(email)
        out.append(ld)
    return out


async def send_test(db: AsyncSession, admin: User) -> dict:
    from app.services.notification_service import NotificationService, email_allowed

    body = email_html(admin.full_name.split()[0] if admin.full_name else None, admin.id)
    delivered = email_allowed(admin.email)
    sent = await NotificationService()._send_resend_email(admin.email, f"[Test] {SUBJECT}", body, "community-email-test")
    admin.guide_state = {**(admin.guide_state or {}), TESTED_KEY: datetime.now(timezone.utc).isoformat()}
    await db.commit()
    return {"sent": bool(sent), "delivered": delivered, "to": admin.email, "html": body}


def tested_recently(admin: User, hours: int = 24) -> bool:
    raw = (admin.guide_state or {}).get(TESTED_KEY)
    if not raw:
        return False
    try:
        return (datetime.now(timezone.utc) - datetime.fromisoformat(raw)).total_seconds() < hours * 3600
    except ValueError:
        return False


async def send_all(db: AsyncSession) -> int:
    from app.services.notification_service import NotificationService

    sent = 0
    for u in await recipients(db):
        body = email_html(u.full_name.split()[0] if u.full_name else None, u.id)
        if await NotificationService()._send_resend_email(u.email, SUBJECT, body, "community-email"):
            sent += 1
        await asyncio.sleep(_GAP)
    for ld in await lead_recipients(db):
        body = email_html(None, ld.id, lead=True)
        if await NotificationService()._send_resend_email(ld.email, SUBJECT, body, "community-email"):
            sent += 1
        await asyncio.sleep(_GAP)
    logger.info("community_email_sent", emails=sent)
    return sent


async def unsubscribe(db: AsyncSession, user_id: uuid.UUID, token: str, lead: bool = False) -> bool:
    if not hmac.compare_digest(token, unsubscribe_token(user_id)):
        return False
    if lead:
        row = await db.get(CommunityLead, user_id)
        if row is None:
            return False
        row.unsubscribed = True
        await db.commit()
        return True
    user = await db.get(User, user_id)
    if user is None:
        return False
    user.guide_state = {**(user.guide_state or {}), OFF_KEY: True}
    await db.commit()
    return True


# ------------------------------------------------------------------ scheduled campaigns (a, b, c)

STALE_AFTER = timedelta(hours=24)   # a campaign this late is marked missed, never sent out of season
RESUME_AFTER = timedelta(minutes=10)  # a "sending" campaign with no progress this long is picked up again


def _aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


@dataclass
class Target:
    email: str
    first_name: str | None
    id: uuid.UUID
    lead: bool = False


async def active_poll_options(db: AsyncSession) -> list[str]:
    poll = (await db.execute(
        select(CommunityPoll).where(CommunityPoll.status == "active").order_by(CommunityPoll.created_at.desc()).limit(1)
    )).scalar_one_or_none()
    return [str(o) for o in (poll.options or [])] if poll else []


async def voter_ids(db: AsyncSession) -> set[uuid.UUID]:
    rows = (await db.execute(select(CommunityPollVote.user_id).where(CommunityPollVote.user_id.is_not(None)))).scalars().all()
    return set(rows)


async def audience(db: AsyncSession, variant: str) -> list[Target]:
    """Real, active, not-unsubscribed people, once each. Email c skips anyone who already voted."""
    skip = await voter_ids(db) if variant == "c" else set()
    out = [
        Target((u.email or "").strip().lower(), (u.full_name or "").split()[0] if u.full_name else None, u.id)
        for u in await recipients(db) if u.id not in skip
    ]
    out += [Target((ld.email or "").strip().lower(), None, ld.id, True) for ld in await lead_recipients(db)]
    return out


async def send_one(target: Target, variant: str, poll_options: list[str]) -> bool:
    from app.services.notification_service import NotificationService

    url = unsubscribe_url(target.id, target.lead)
    r = tpl.render(variant, target.first_name, url, poll_options, target.lead)
    return await NotificationService().send_rich_email(
        target.email, r.subject, r.html, r.text,
        from_email=settings.COMMUNITY_EMAIL_FROM, reply_to=settings.COMMUNITY_EMAIL_REPLY_TO or None,
        unsubscribe_url=url, ref=f"community-{variant}",
    )


async def send_variant_test(db: AsyncSession, admin: User, variant: str) -> dict:
    """The test goes through exactly the same code path as the real send, to the admin only."""
    from app.services.notification_service import email_allowed

    camp = (await db.execute(select(CommunityEmailCampaign).where(CommunityEmailCampaign.variant == variant))).scalar_one()
    options = await active_poll_options(db)
    target = Target((admin.email or "").strip().lower(), (admin.full_name or "").split()[0] if admin.full_name else None, admin.id)
    sent = await send_one(target, variant, options)
    if sent:
        camp.tested_at = datetime.now(timezone.utc)
        await db.commit()
    return {"sent": bool(sent), "delivered": email_allowed(admin.email), "to": admin.email}


async def run_due(db: AsyncSession, now: datetime | None = None, send=send_one, gap: float = _GAP) -> list[dict]:
    """Send every campaign whose time has come. Safe to run every few minutes:
    a campaign needs a test first, is claimed atomically, never goes out more than a day late,
    and the delivery log means nobody gets the same email twice even if a run is cut short."""
    from sqlalchemy import update

    now = now or datetime.now(timezone.utc)
    done: list[dict] = []
    camps = (await db.execute(
        select(CommunityEmailCampaign).where(CommunityEmailCampaign.status.in_(("scheduled", "sending")))
        .order_by(CommunityEmailCampaign.scheduled_for)
    )).scalars().all()
    for camp in camps:
        if _aware(camp.scheduled_for) > now:
            continue
        if camp.status == "scheduled":
            if camp.tested_at is None:
                logger.warning("community_email_blocked_untested", variant=camp.variant)
                continue
            if now - _aware(camp.scheduled_for) > STALE_AFTER:
                camp.status = "missed"
                await db.commit()
                done.append({"variant": camp.variant, "status": "missed"})
                continue
            claim = await db.execute(update(CommunityEmailCampaign).where(
                CommunityEmailCampaign.id == camp.id, CommunityEmailCampaign.status == "scheduled",
            ).values(status="sending", started_at=now))
        else:
            if camp.started_at is not None and now - _aware(camp.started_at) < RESUME_AFTER:
                continue
            claim = await db.execute(update(CommunityEmailCampaign).where(
                CommunityEmailCampaign.id == camp.id, CommunityEmailCampaign.status == "sending",
            ).values(started_at=now))
        await db.commit()
        if claim.rowcount != 1:
            continue
        await db.refresh(camp)

        options = await active_poll_options(db)
        already = set((await db.execute(
            select(CommunityEmailDelivery.email).where(CommunityEmailDelivery.campaign_id == camp.id)
        )).scalars().all())
        for target in await audience(db, camp.variant):
            if target.email in already:
                continue
            if await send(target, camp.variant, options):
                db.add(CommunityEmailDelivery(campaign_id=camp.id, email=target.email))
                camp.sent_count += 1
                already.add(target.email)
            else:
                camp.failed_count += 1
            await db.commit()
            if gap:
                await asyncio.sleep(gap)
        camp.status = "sent"
        camp.finished_at = datetime.now(timezone.utc)
        await db.commit()
        logger.info("community_campaign_sent", variant=camp.variant, sent=camp.sent_count, failed=camp.failed_count)
        done.append({"variant": camp.variant, "status": "sent", "sent": camp.sent_count, "failed": camp.failed_count})
    return done
