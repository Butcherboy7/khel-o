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

SUBJECT = "Can I ask you a small favour?"
LINK = "https://khel-o.com/challenge/valorant-5v5-xqz?utm_source=email&utm_medium=announce&utm_campaign=valorant-email"
BELL_TITLE = "A small favour?"
BELL_TEXT = ("Valorant 5v5, in person at XQZ Gaming Cafe, Hyderabad, on 5 Dec. If you play, join us. "
             "If you don't, could you send it to a friend who does? It would mean a lot.")
_GAP = 0.08


def _lines(first_name: str | None) -> list[str]:
    name = first_name or "there"
    return [
        f"Hi {name},",
        "Abdullah from KHEL-O. I'll keep this short, because I'm asking for a favour.",
        "On Saturday 5 December we are hosting a Valorant 5v5 in person at XQZ Gaming Cafe in Gachibowli, Hyderabad. Teams of five, ten gaming PCs, "
        "everyone in the same room, a real match day. It is one of the first events we have run, and I would love it to be full of people who show up "
        "and have a great day.",
        "You may not play Valorant, and that is completely fine. But you probably know someone who does. If you could forward "
        "this to that one friend, or drop it in a group where people game, it would honestly mean a lot.",
        f"Everything they need is here: {LINK} (the page has a share button too).",
        "Any question at all, message me on WhatsApp at +91 81421 28389 or just reply to this email.",
        "Thank you for reading this far.",
        "Abdullah",
        "P.S. If you'd rather not get mail like this, reply with the word stop and I won't send another.",
    ]


def email_text(first_name: str | None) -> str:
    return (chr(10) * 2).join(_lines(first_name))


def email_html(first_name: str | None, user_id=None) -> str:
    """Plain on purpose: no images, no buttons, one link, so Gmail reads it as a letter from a person."""
    paras = []
    for line in _lines(first_name):
        esc = html.escape(line).replace(html.escape(LINK), f"<a href='{LINK}'>{html.escape(LINK)}</a>")
        paras.append(f"<p style='margin:0 0 14px'>{esc}</p>")
    return "<div style='font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#222'>" + "".join(paras) + "</div>"


async def _send(to: str, first_name: str | None, subject: str, ref: str) -> bool:
    from app.config import settings
    from app.services.notification_service import NotificationService
    return await NotificationService().send_rich_email(
        to, subject, email_html(first_name), email_text(first_name),
        from_email=settings.COMMUNITY_EMAIL_FROM, reply_to=settings.COMMUNITY_EMAIL_REPLY_TO or None,
        unsubscribe_url="", ref=ref)


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


async def send_test(db: AsyncSession, admin: User, to: str | None = None) -> dict:
    first = admin.full_name.split()[0] if admin.full_name else None
    return {"sent": bool(await _send(to or admin.email, first, f"[Test] {SUBJECT}", "valorant-announce-test"))}


async def send_all(db: AsyncSession) -> dict:
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
            if await _send(u.email, first, SUBJECT, "valorant-announce"):
                emails += 1
            await asyncio.sleep(_GAP)
    logger.info("valorant_announce_done", bells=bells, emails=emails)
    return {"bells": bells, "emails": emails}
