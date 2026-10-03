"""Everything the café waitlist sends, and who it may send to.

* When a café goes live (admin approval with hardware, admin /go-live, or the
  owner's claim), everyone who tapped "Notify me" gets one in-app notification
  and one email. `notified_at` makes that once-only.
* Admin can also send a custom update to one café's list, after a test send.
* Every email carries an unsubscribe link; an unsubscribed person gets no
  further waitlist email from any café.

Only email is sent. Phone-only entries are left for the admin CSV export.
"""
import asyncio
import hashlib
import hmac
import html
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

import app.database as database
from app.config import settings
from app.models.cafe import Cafe
from app.models.cafe_waitlist import CafeWaitlistEntry
from app.models.notification import Notification, NotificationType
from app.models.user import User

logger = structlog.get_logger()

PLAY_TIMES = {
    "weekday_evenings": "Weekday evenings",
    "weekends": "Weekends",
    "late_nights": "Late nights",
}

# Lead cafés are created under placeholder owner accounts on our own domain;
# those addresses are never real inboxes.
_PLACEHOLDER_DOMAIN = "@khel-o.com"
# SES production limit is 14/s; stay under it.
_SEND_GAP_SECONDS = 0.08


@dataclass
class Recipient:
    entry: CafeWaitlistEntry
    email: Optional[str]
    name: Optional[str]


def unsubscribe_token(entry_id: uuid.UUID) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode(), f"waitlist-unsub:{entry_id}".encode(), hashlib.sha256
    ).hexdigest()[:32]


def unsubscribe_url(entry_id: uuid.UUID) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/api/v1/waitlist/unsubscribe?e={entry_id}&t={unsubscribe_token(entry_id)}"


def _email_of(user: Optional[User], contact: Optional[str]) -> Optional[str]:
    if user is not None and user.email and not user.email.lower().endswith(_PLACEHOLDER_DOMAIN):
        return user.email
    if contact and "@" in contact:
        return contact.strip()
    return None


async def recipients(db: AsyncSession, cafe_id: uuid.UUID, only_unnotified: bool = False) -> list[Recipient]:
    stmt = (
        select(CafeWaitlistEntry, User)
        .outerjoin(User, User.id == CafeWaitlistEntry.user_id)
        .where(CafeWaitlistEntry.cafe_id == cafe_id, CafeWaitlistEntry.unsubscribed_at.is_(None))
        .order_by(CafeWaitlistEntry.created_at)
    )
    if only_unnotified:
        stmt = stmt.where(CafeWaitlistEntry.notified_at.is_(None))
    rows = (await db.execute(stmt)).all()
    out, seen = [], set()
    for entry, user in rows:
        email = _email_of(user, entry.contact)
        if email and email.lower() in seen:
            email = None  # same inbox twice on one list: email it once
        if email:
            seen.add(email.lower())
        out.append(Recipient(entry=entry, email=email, name=user.full_name if user else None))
    return out


def _email_html(heading: str, body_html: str, button_url: str, button_label: str, entry_id: uuid.UUID) -> str:
    from app.services.notification_service import _email_button, _email_wrapper

    return _email_wrapper(f"""
        <h2 style="margin: 0 0 12px; font-size: 20px;">{heading}</h2>
        <div style="font-size: 15px; line-height: 1.55; color: #3A3D46;">{body_html}</div>
        <div style="margin: 24px 0 8px;">{_email_button(button_url, button_label)}</div>
        <p style="margin: 24px 0 0; font-size: 12px; color: #8A8F9C;">
            You're getting this because you tapped "Notify me" on KHEL-O.
            <a href="{unsubscribe_url(entry_id)}" style="color: #8A8F9C;">Unsubscribe</a>
        </p>
    """)


def _cafe_url(cafe: Cafe) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/cafe/{cafe.slug or cafe.id}"


async def _send(to: str, subject: str, body: str, ref: str) -> bool:
    from app.services.notification_service import NotificationService

    ok = await NotificationService()._send_resend_email(to, subject, body, ref)
    await asyncio.sleep(_SEND_GAP_SECONDS)
    return ok


async def _grant_local_legends(db: AsyncSession, cafe_id: uuid.UUID) -> None:
    """Everyone who voted for this café or introduced its owner becomes a
    Local Legend. Idempotent, so a repeat go-live changes nothing."""
    from app.models.owner_intro import OwnerIntro
    from app.services.badge_service import grant_helper_badge

    voters = (await db.execute(select(CafeWaitlistEntry.user_id).where(
        CafeWaitlistEntry.cafe_id == cafe_id, CafeWaitlistEntry.user_id.is_not(None)
    ))).scalars().all()
    introducers = (await db.execute(select(OwnerIntro.submitted_by_user_id).where(
        OwnerIntro.cafe_id == cafe_id, OwnerIntro.status != "dead"
    ))).scalars().all()
    for user_id in set(voters) | set(introducers):
        await grant_helper_badge(db, user_id, "local_legend")


async def send_launch_notifications(db: AsyncSession, cafe_id: uuid.UUID) -> int:
    """In-app + email to everyone on the list not yet told. Returns emails sent."""
    cafe = await db.get(Cafe, cafe_id)
    if cafe is None or cafe.is_lead_listing:
        return 0
    await _grant_local_legends(db, cafe_id)
    name = html.escape(cafe.name)
    title = f"{cafe.name} is now on KHEL-O"
    message = f"You asked us to tell you — {cafe.name} is taking bookings now. Grab your slot."
    link = f"/cafe/{cafe.slug or cafe.id}"
    sent = 0
    for r in await recipients(db, cafe_id, only_unnotified=True):
        if r.entry.user_id is not None:
            key = f"waitlist_live:{cafe_id}"
            exists = (await db.execute(select(Notification.id).where(
                Notification.user_id == r.entry.user_id, Notification.dedupe_key == key
            ))).scalars().first()
            if not exists:
                db.add(Notification(
                    id=uuid.uuid4(), user_id=r.entry.user_id, title=title, message=message,
                    notification_type=NotificationType.SYSTEM, is_read=False, link=link, dedupe_key=key,
                ))
        if r.email:
            body = _email_html(
                f"{name} is live on KHEL-O 🎮",
                f"You asked us to let you know. <b>{name}</b> is now taking bookings on KHEL-O — "
                "see which stations are free, pick a time and pay online.",
                _cafe_url(cafe), "Book your slot", r.entry.id,
            )
            if await _send(r.email, title, body, f"waitlist-live:{cafe_id}"):
                sent += 1
        r.entry.notified_at = datetime.now(timezone.utc)
        await db.commit()
    logger.info("waitlist_launch_sent", cafe_id=str(cafe_id), emails=sent)
    return sent


async def send_broadcast(
    db: AsyncSession, cafe_id: uuid.UUID, subject: str, message: str, test_to: Optional[str] = None
) -> int:
    """Admin's custom update to one café's list. `test_to` sends one copy
    there instead (the unsubscribe link in it is inert)."""
    cafe = await db.get(Cafe, cafe_id)
    if cafe is None:
        return 0
    body_html = html.escape(message).replace("\n", "<br>")
    heading = html.escape(subject)
    if test_to:
        body = _email_html(heading, body_html, _cafe_url(cafe), f"View {html.escape(cafe.name)}", uuid.UUID(int=0))
        return int(await _send(test_to, f"[Test] {subject}", body, f"waitlist-test:{cafe_id}"))
    sent = 0
    for r in await recipients(db, cafe_id):
        if not r.email:
            continue
        body = _email_html(heading, body_html, _cafe_url(cafe), f"View {html.escape(cafe.name)}", r.entry.id)
        if await _send(r.email, subject, body, f"waitlist-broadcast:{cafe_id}"):
            sent += 1
    logger.info("waitlist_broadcast_sent", cafe_id=str(cafe_id), emails=sent)
    return sent


async def unsubscribe(db: AsyncSession, entry_id: uuid.UUID, token: str) -> bool:
    """Opt this person out of every café's waitlist email, not just one."""
    if not hmac.compare_digest(token, unsubscribe_token(entry_id)):
        return False
    entry = await db.get(CafeWaitlistEntry, entry_id)
    if entry is None:
        return False
    same_person = [CafeWaitlistEntry.id == entry.id]
    if entry.user_id is not None:
        same_person.append(CafeWaitlistEntry.user_id == entry.user_id)
    if entry.contact:
        same_person.append(CafeWaitlistEntry.contact == entry.contact)
    await db.execute(
        update(CafeWaitlistEntry)
        .where(or_(*same_person), CafeWaitlistEntry.unsubscribed_at.is_(None))
        .values(unsubscribed_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return True


async def demand_stats(db: AsyncSession, cafe: Cafe, weeks: int = 6) -> dict:
    """Owner-pitch numbers for one café. Counts only — never who."""
    rows = (await db.execute(
        select(CafeWaitlistEntry.created_at, CafeWaitlistEntry.play_time)
        .where(CafeWaitlistEntry.cafe_id == cafe.id)
    )).all()
    now = datetime.now(timezone.utc)

    def aware(d: datetime) -> datetime:
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)

    by_week = [0] * weeks
    for created, _ in rows:
        age = (now - aware(created)).days // 7
        if 0 <= age < weeks:
            by_week[weeks - 1 - age] += 1
    play = Counter(p for _, p in rows if p in PLAY_TIMES)
    return {
        "cafeName": cafe.name,
        "city": cafe.city,
        "slug": cafe.slug,
        "isLive": not cafe.is_lead_listing,
        "count": len(rows),
        "goal": cafe.waitlist_goal,
        "last7Days": sum(1 for c, _ in rows if now - aware(c) <= timedelta(days=7)),
        "firstRequestedAt": min((aware(c) for c, _ in rows), default=None),
        "weekly": by_week,
        "playTimes": [{"key": k, "label": v, "count": play.get(k, 0)} for k, v in PLAY_TIMES.items()],
    }


# Background launch sends. Tasks are held here so they aren't garbage
# collected mid-send; each opens its own session because the request's is
# closed by the time it runs.
_tasks: set[asyncio.Task] = set()


def schedule_launch_notifications(cafe_id: uuid.UUID) -> None:
    async def run() -> None:
        try:
            async with database.AsyncSessionLocal() as db:
                await send_launch_notifications(db, cafe_id)
        except Exception as e:  # never let a mail problem surface anywhere
            logger.error("waitlist_launch_failed", cafe_id=str(cafe_id), error=str(e))

    task = asyncio.create_task(run())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
