"""One-off announcement of the Valorant 5v5 challenge to every KHEL-O account.

Two things go out, once per person (re-running never repeats):
* a bell notification in the app, for every active account;
* a plain, personal-looking email, for accounts with a real address who have
  not turned community emails off. It is deliberately text-only (no images, no
  button graphics, one link, a real sign-off) so Gmail treats it as mail from a
  person, not a promotion. It still carries a one-tap unsubscribe.
People already signed up for the challenge are skipped.
Run through scripts/send_valorant_announce.py (dry run by default).
"""
import asyncio
import html

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.challenge import ChallengePlayer
from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.services import community_mailer as cm

logger = structlog.get_logger()

SUBJECT = "Valorant 5v5 at XQZ on 5 Dec, got a team?"
LINK = "https://khel-o.com/c/valorant-email"
BELL_TITLE = "Valorant 5v5 on Sat 5 Dec"
BELL_TEXT = "Teams of 5 at XQZ Hyderabad, rewards worth ₹5,000. Sign up your team or come solo."
_GAP = 0.08


def email_html(first_name: str | None, user_id) -> str:
    name = html.escape(first_name or "there")
    p = "style='margin:0 0 12px;font-size:15px;line-height:1.55;color:#222'"
    return (
        "<div style='font-family:Arial,sans-serif;max-width:520px'>"
        f"<p {p}>Hi {name},</p>"
        f"<p {p}>On Saturday 5 December we are hosting a Valorant 5v5 at XQZ in Gachibowli, Hyderabad. "
        "Teams of 5, first to 5 rounds, with rewards worth ₹5,000.</p>"
        f"<p {p}>It is ₹250 per person. One person pays ₹1,250 for the team and the rest join with a link, no payment needed. "
        "No team yet? Sign up solo and we will put you in one.</p>"
        f"<p {p}>Don't play Valorant? Forward this to a friend who does. The page has a share button too.</p>"
        f"<p {p}>Sign up here: <a href='{LINK}'>{LINK}</a></p>"
        f"<p {p}>Any question, message me on WhatsApp at +91 81421 28389 or reply to this email.</p>"
        f"<p {p}>See you there,<br>Abdullah, KHEL-O</p>"
        "<p style='margin:18px 0 0;font-size:12px;color:#8A8F9C;line-height:1.5'>"
        "You get this because you have a KHEL-O account. "
        f"<a href='{cm.unsubscribe_url(user_id)}' style='color:#8A8F9C'>Stop these emails</a>. "
        "KHEL-O is not endorsed by Riot Games.</p></div>"
    )


async def _signed_up(db: AsyncSession) -> set:
    rows = (await db.execute(select(ChallengePlayer.user_id).where(
        ChallengePlayer.user_id.is_not(None), ChallengePlayer.status.in_(("active", "waitlist"))))).scalars().all()
    return set(rows)


async def audience(db: AsyncSession) -> dict:
    """Who would get what. Skips anyone already announced to or already signed up."""
    skip = await _signed_up(db)
    done = set((await db.execute(select(Notification.user_id).where(
        Notification.dedupe_key.like("valorant-announce:%")))).scalars().all())
    mailable = {u.id: u for u in await cm.recipients(db)}
    everyone = (await db.execute(select(User).where(User.is_active.is_(True), User.deleted_at.is_(None)))).scalars().all()
    bell = [u for u in everyone if u.id not in skip and u.id not in done]
    mail = [u for u in bell if u.id in mailable]
    return {"bell": bell, "mail": mail}


async def send_test(db: AsyncSession, admin: User) -> dict:
    from app.services.notification_service import NotificationService
    first = admin.full_name.split()[0] if admin.full_name else None
    sent = await NotificationService()._send_resend_email(
        admin.email, f"[Test] {SUBJECT}", email_html(first, admin.id), "valorant-announce-test")
    return {"sent": bool(sent)}


async def send_all(db: AsyncSession) -> dict:
    from app.services.notification_service import NotificationService
    aud = await audience(db)
    mail_ids = {u.id for u in aud["mail"]}
    bells = emails = 0
    for u in aud["bell"]:
        try:
            async with db.begin_nested():
                db.add(Notification(
                    user_id=u.id, title=BELL_TITLE, message=BELL_TEXT, notification_type=NotificationType.SYSTEM,
                    link="/challenge/valorant-5v5-xqz?utm_source=bell&utm_medium=announce&utm_campaign=valorant-bell",
                    dedupe_key=f"valorant-announce:{u.id}"))
            await db.commit()
            bells += 1
        except Exception as exc:  # a clash means they were already announced to
            await db.rollback()
            logger.warning("valorant_announce_bell_skipped", error=str(exc)[:120])
            continue
        if u.id in mail_ids:
            first = u.full_name.split()[0] if u.full_name else None
            if await NotificationService()._send_resend_email(u.email, SUBJECT, email_html(first, u.id), "valorant-announce"):
                emails += 1
            await asyncio.sleep(_GAP)
    logger.info("valorant_announce_done", bells=bells, emails=emails)
    return {"bells": bells, "emails": emails}
