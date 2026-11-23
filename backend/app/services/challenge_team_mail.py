"""Emails for a team challenge: nudges for a captain whose team isn't full,
"a teammate joined", "your team is complete", the evening before and the
morning of match day. Each email goes to each person once (challenge_mails).

Wording rules: "challenge", "entry", "rewards". Never "tournament", "ticket"
or "prize" (payment partners read what we send). Very simple English.

Outside production the email layer only reaches EMAIL_ALLOWLIST, so running
this on dev is safe: nothing leaves unless an address is allowed.
"""
from __future__ import annotations

import html
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.logging import logger
from app.models.cafe import Cafe
from app.models.challenge import Challenge, ChallengeEntry, ChallengeMail, ChallengePlayer
from app.models.user import User
from app.services import challenge_service as svc
from app.services import challenge_teams as teams

IST = timezone(timedelta(hours=5, minutes=30))
DISCLAIMER = "This challenge is not made, run or supported by Riot Games."
# Placeholder and seeded addresses only bounce, which hurts every real email we send.
_NO_EMAIL = ("example.com", "example", "test", "invalid")

# Captain nudges: how long after the captain paid, or before sign-ups close.
NUDGE_STEPS = (("nudge_24h", timedelta(hours=24)), ("nudge_72h", timedelta(hours=72)))
NUDGE_LAST_BEFORE_CLOSE = timedelta(hours=24)
ADMIN_REMIND_GAP = timedelta(hours=6)


def _can_email(email: Optional[str]) -> bool:
    if not email or "@" not in email:
        return False
    domain = email.rsplit("@", 1)[-1].lower()
    return not any(domain == d or domain.endswith("." + d) for d in _NO_EMAIL)


def _page(ch: Challenge, tail: str = "me") -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/challenge/{ch.slug}/{tail}".rstrip("/")


def _frame(title: str, lines: list[str]) -> str:
    return (
        "<div style='font-family:Arial,sans-serif;max-width:520px;'>"
        f"<h1 style='margin:0 0 10px;font-size:22px;'>{html.escape(title)}</h1>"
        + "".join(lines)
        + f"<p style='font-size:12px;color:#8A8F9C;margin-top:18px;'>{DISCLAIMER}</p></div>"
    )


def _button(url: str, label: str) -> str:
    return (f"<p style='margin:16px 0;'><a href='{html.escape(url)}' style='background:#D0463C;color:#fff;padding:12px 20px;"
            f"text-decoration:none;font-weight:bold;border-radius:6px;display:inline-block;'>{html.escape(label)}</a></p>")


async def _deliver(db: AsyncSession, ch: Challenge, player: ChallengePlayer, kind: str, subject: str, body: str,
                   *, dry_run: bool = False) -> bool:
    """Send once per (player, kind). True if sent (or, in a dry run, would be)."""
    if player.status != "active" or player.user_id is None:
        return False
    user = await db.get(User, player.user_id)
    if user is None or not _can_email(user.email):
        return False
    already = (await db.execute(select(ChallengeMail.id).where(
        ChallengeMail.player_id == player.id, ChallengeMail.kind == kind))).first()
    if already:
        return False
    if dry_run:
        return True
    db.add(ChallengeMail(challenge_id=ch.id, player_id=player.id, kind=kind))
    try:
        await db.flush()
    except IntegrityError:  # two runs at once: the other one sends it
        await db.rollback()
        return False
    from app.services.notification_service import NotificationService
    try:
        ok = await NotificationService()._send_resend_email(user.email, subject, body, f"CH-{str(player.id)[:8]}")
    except Exception as exc:  # an email problem never breaks the caller
        logger.warning("challenge_mail_failed", kind=kind, error=str(exc)[:200])
        ok = False
    if not ok:
        await db.rollback()  # drop the log row so the next run tries again
        return False
    await db.commit()
    return True


async def _team(db: AsyncSession, ch: Challenge, entry: ChallengeEntry) -> tuple[Optional[ChallengePlayer], list[ChallengePlayer], int, int]:
    cfg = teams.config(ch)
    mates = [p for p in await teams.players(db, ch.id) if p.entry_id == entry.id and p.status == "active"]
    captain = next((p for p in mates if p.role == "captain"), None)
    main, _ = teams._team_counts(cfg, mates)
    return captain, mates, main, cfg["size"]


def _invite_url(ch: Challenge, entry: ChallengeEntry) -> str:
    return _page(ch, f"invite/{entry.invite_code}")


def _players_word(n: int) -> str:
    return "player" if n == 1 else "players"


async def send_captain_nudge(db: AsyncSession, ch: Challenge, entry: ChallengeEntry, kind: str, *, dry_run: bool = False) -> bool:
    captain, _, main, size = await _team(db, ch, entry)
    if captain is None or main >= size or not entry.invite_code:
        return False
    missing = size - main
    close = teams.closes_at(ch)
    when = f" Sign-ups close {close.astimezone(IST):%a %d %b}, {close.astimezone(IST):%I:%M %p}." if close else ""
    body = _frame(f"{missing} more {_players_word(missing)} needed", [
        f"<p style='font-size:15px;'>Hi {html.escape(captain.full_name.split()[0])}, your team <b>{html.escape(entry.name)}</b> has "
        f"{main} of {size} players.{when}</p>",
        "<p style='font-size:15px;'>Send this link to your teammates on WhatsApp. They log in and fill their details. "
        "It is free for them.</p>",
        _button(_invite_url(ch, entry), "Open my teammate link"),
        f"<p style='font-size:14px;color:#555;'>Or open <a href='{_page(ch)}'>My entry</a> and tap Send on WhatsApp.</p>",
    ])
    return await _deliver(db, ch, captain, kind, f"{missing} more {_players_word(missing)} for {entry.name}", body, dry_run=dry_run)


async def notify_teammate_joined(db: AsyncSession, ch: Challenge, new_player: ChallengePlayer) -> None:
    """After someone joins a team: welcome them, tell the captain, and say so when the team is full."""
    if new_player.entry_id is None or new_player.role == "captain":
        return
    entry = await svc.entry_for(db, ch.id, entry_id=new_player.entry_id)
    if entry is None:
        return
    captain, _, main, size = await _team(db, ch, entry)
    e = html.escape
    first = new_player.full_name.split()[0]
    await _deliver(db, ch, new_player, "welcome", f"You are in team {entry.name}", _frame("You are in the team!", [
        f"<p style='font-size:15px;'>Hi {e(first)}, you joined <b>{e(entry.name)}</b> for {e(ch.title)}. You did not need to pay.</p>",
        "<p style='font-size:15px;'>Open My entry to see your team and your check-in QR for match day.</p>",
        _button(_page(ch), "Open My entry"),
    ]))
    if captain is None or captain.id == new_player.id:
        return
    if main >= size:
        await _deliver(db, ch, captain, "team_complete", f"{entry.name} is complete", _frame("Your team is complete!", [
            f"<p style='font-size:15px;'>{e(first)} joined. <b>{e(entry.name)}</b> now has all {size} players.</p>",
            "<p style='font-size:15px;'>Next: join the Khelo community on WhatsApp and watch Instagram for the draw and your match time.</p>",
            _button(_page(ch), "Open My entry"),
        ]))
    elif entry.invite_code:
        await _deliver(db, ch, captain, f"joined:{new_player.id}", f"{first} joined {entry.name}", _frame(f"{first} joined your team", [
            f"<p style='font-size:15px;'><b>{e(entry.name)}</b> has {main} of {size} players. {size - main} more to go.</p>",
            _button(_invite_url(ch, entry), "Send the link again"),
        ]))


async def remind_captains(db: AsyncSession, ch: Challenge, entry_id=None) -> dict:
    """Admin tap: email the captain of each short team (or one team) right now.
    A captain gets at most one of these every 6 hours."""
    sent = skipped = 0
    for entry in await teams.team_entries(db, ch.id):
        if entry.status != "confirmed" or entry.kind != "team" or (entry_id and entry.id != entry_id):
            continue
        captain, _, main, size = await _team(db, ch, entry)
        if captain is None or main >= size:
            continue
        recent = (await db.execute(select(ChallengeMail.sent_at).where(
            ChallengeMail.player_id == captain.id, ChallengeMail.kind.like("nudge_admin:%"))
            .order_by(ChallengeMail.sent_at.desc()))).scalars().first()
        if recent is not None and teams.now() - teams._aware(recent) < ADMIN_REMIND_GAP:
            skipped += 1
            continue
        ok = await send_captain_nudge(db, ch, entry, f"nudge_admin:{teams.now():%Y%m%d%H%M}")
        if ok:
            sent += 1
        else:
            skipped += 1
    return {"sent": sent, "skipped": skipped}


def _due_nudge(ch: Challenge, captain: ChallengePlayer, at: datetime) -> Optional[str]:
    """The nudge that is due now: 'last' in the final day before sign-ups close, else 24h / 72h after paying."""
    close = teams.closes_at(ch)
    if close is not None and at >= close:
        return None
    if close is not None and close - at <= NUDGE_LAST_BEFORE_CLOSE:
        return "nudge_last"
    age = at - teams._aware(captain.created_at)
    due = None
    for kind, wait in NUDGE_STEPS:
        if age >= wait:
            due = kind
    return due


async def run_nudges(db: AsyncSession, ch: Challenge, *, at: Optional[datetime] = None, dry_run: bool = False) -> int:
    at = at or teams.now()
    n = 0
    for entry in await teams.team_entries(db, ch.id):
        if entry.status != "confirmed" or entry.kind != "team":
            continue
        captain, _, main, size = await _team(db, ch, entry)
        if captain is None or main >= size:
            continue
        kind = _due_nudge(ch, captain, at)
        if kind and await send_captain_nudge(db, ch, entry, kind, dry_run=dry_run):
            n += 1
    return n


async def run_day_mail(db: AsyncSession, ch: Challenge, *, at: Optional[datetime] = None, dry_run: bool = False) -> int:
    """The evening before (18:00 IST) and the morning of (08:00 IST): everyone on a confirmed team."""
    at = at or teams.now()
    first = teams._aware(ch.starts_at)
    if first is None or at >= first:
        return 0
    day0 = first.astimezone(IST).date()
    eve_at = datetime.combine(day0 - timedelta(days=1), datetime.min.time(), IST).replace(hour=18)
    morn_at = datetime.combine(day0, datetime.min.time(), IST).replace(hour=8)
    kind = "matchday" if at >= morn_at else "eve" if at >= eve_at else None
    if kind is None:
        return 0
    cafe = await db.get(Cafe, ch.cafe_id)
    cafe_name = cafe.name if cafe else "the café"
    report = first.astimezone(IST) - timedelta(hours=1)
    n = 0
    confirmed = {e.id: e for e in await teams.team_entries(db, ch.id) if e.status == "confirmed"}
    for p in await teams.players(db, ch.id):
        if p.status != "active" or not p.entry_id or p.entry_id not in confirmed:
            continue
        if kind == "eve":
            subject, title = f"Tomorrow: {ch.title}", "Match day is tomorrow"
            lines = [f"<p style='font-size:15px;'>Report by <b>{report:%I:%M %p}</b> and show your check-in QR at the desk. "
                     f"First matches start at {first.astimezone(IST):%I:%M %p}.</p>",
                     "<p style='font-size:15px;'>The bracket is drawn tonight. Your match time shows on My entry and on Instagram.</p>"]
        else:
            subject, title = f"Today: {ch.title}", "Match day is today"
            lines = [f"<p style='font-size:15px;'>Be at {html.escape(cafe_name)} by <b>{report:%I:%M %p}</b>. "
                     "Late teams lose their match, so come early.</p>",
                     "<p style='font-size:15px;'>Open My entry for your QR and your match time.</p>"]
        if await _deliver(db, ch, p, kind, subject, _frame(title, lines + [_button(_page(ch), "Open My entry")]), dry_run=dry_run):
            n += 1
    return n


async def run_all(db: AsyncSession, *, dry_run: bool = False) -> dict:
    out = {"nudges": 0, "day": 0}
    rows = (await db.execute(select(Challenge).where(Challenge.status.in_(("open", "closed", "live"))))).scalars().all()
    for ch in rows:
        if not teams.is_team(ch):
            continue
        out["nudges"] += await run_nudges(db, ch, dry_run=dry_run)
        out["day"] += await run_day_mail(db, ch, dry_run=dry_run)
    return out
