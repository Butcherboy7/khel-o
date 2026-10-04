"""Stops sign-up / login / password-reset bots without a captcha.

What the bots did (Sep–Oct 2026): opened the site in a desktop browser and
filled every form it found, creating an account 1–3 seconds after landing and
asking for password resets that emailed real people. Real users never notice
these checks:

- Speed: the form page asks for a signed ticket when it loads. Sign-up is
  refused if it comes back sooner than a person could fill it in.
- Trap field: an input people never see. Form-filling bots fill it in.
- Limits: a few attempts per IP and per email address in a time window,
  counted in the auth_attempts table so both backend workers agree.

A refused sign-up just says "try again in a moment": by then the ticket is old
enough, so a real person who was unusually fast gets through on the retry.
"""
from __future__ import annotations

import hashlib
import hmac
import random
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Request
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import BaseAppException, BadRequestException
from app.core.logging import logger
from app.models.auth_attempt import AuthAttempt

# Seconds a person needs, at the least, between the form appearing and sending it.
# Bots took 1–3 s. Login has no floor: password managers fill and submit instantly.
MIN_SECONDS = {"register": 5, "forgot": 3, "login": 0}
# (window, max per IP, max per email address) — counts every attempt in the window.
LIMITS = {
    "register": (timedelta(hours=1), 5, 3),
    "forgot": (timedelta(hours=1), 10, 3),
    "login": (timedelta(minutes=15), 30, 10),
}
# Forms that must carry a ticket. Login doesn't, so a tab left open across a
# deploy can still sign in; it is covered by the limits and the trap field.
NEEDS_TICKET = {"register", "forgot"}
KEEP_DAYS = 30


class TooManyAttempts(BaseAppException):
    def __init__(self):
        super().__init__(
            message="Too many attempts. Please wait a few minutes and try again.",
            error_code="TOO_MANY_ATTEMPTS",
            status_code=429,
        )


class Blocked(Exception):
    """Raised for the bot signals; the caller picks what the client sees."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def _sign(payload: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]


def issue_form_ticket(now: Optional[float] = None) -> str:
    payload = f"{int(now if now is not None else time.time())}.{secrets.token_hex(6)}"
    return f"{payload}.{_sign(payload)}"


def ticket_age(ticket: Optional[str], now: Optional[float] = None) -> Optional[float]:
    """Seconds since the ticket was issued, or None when it is missing or forged."""
    if not ticket or ticket.count(".") != 2:
        return None
    payload, sig = ticket.rsplit(".", 1)
    if not hmac.compare_digest(sig, _sign(payload)):
        return None
    try:
        issued = int(payload.split(".", 1)[0])
    except ValueError:
        return None
    return (now if now is not None else time.time()) - issued


def client_ip(request: Request) -> str:
    # Caddy (the only thing in front of the backend) overwrites X-Forwarded-For
    # with the real client address, so the first entry can be trusted.
    fwd = request.headers.get("x-forwarded-for", "")
    ip = fwd.split(",")[0].strip() if fwd else ""
    return (ip or (request.client.host if request.client else "") or "unknown")[:64]


def email_hash(email: Optional[str]) -> Optional[str]:
    clean = (email or "").strip().lower()
    return hashlib.sha256(clean.encode()).hexdigest() if clean else None


def bot_reason(kind: str, ticket: Optional[str], trap: Optional[str], now: Optional[float] = None) -> Optional[str]:
    """Why this submission looks like a bot, or None. Pure, for tests."""
    if trap and trap.strip():
        return "trap"
    age = ticket_age(ticket, now)
    if kind in NEEDS_TICKET and age is None:
        return "no_ticket"
    if age is not None and age < MIN_SECONDS[kind]:
        return "too_fast"
    return None


async def check(
    db: AsyncSession,
    request: Request,
    kind: str,
    email: Optional[str],
    ticket: Optional[str],
    trap: Optional[str],
) -> None:
    """Log the attempt; raise Blocked (bot signals) or TooManyAttempts (limits)."""
    ip, eh = client_ip(request), email_hash(email)
    window, per_ip, per_email = LIMITS[kind]
    since = datetime.now(timezone.utc) - window

    reason = bot_reason(kind, ticket, trap)
    if reason is None:
        by_ip = (await db.execute(
            select(func.count()).select_from(AuthAttempt)
            .where(AuthAttempt.kind == kind, AuthAttempt.ip == ip, AuthAttempt.created_at >= since)
        )).scalar_one()
        by_email = 0
        if eh:
            by_email = (await db.execute(
                select(func.count()).select_from(AuthAttempt)
                .where(AuthAttempt.kind == kind, AuthAttempt.email_hash == eh, AuthAttempt.created_at >= since)
            )).scalar_one()
        if by_ip >= per_ip:
            reason = "limit_ip"
        elif by_email >= per_email:
            reason = "limit_email"

    db.add(AuthAttempt(kind=kind, ip=ip, email_hash=eh, outcome="blocked" if reason else "allowed", reason=reason))
    if random.random() < 0.02:
        await db.execute(delete(AuthAttempt).where(
            AuthAttempt.created_at < datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)
        ))
    await db.commit()

    if reason:
        logger.warning("auth_attempt_blocked", kind=kind, reason=reason, ip=ip)
        if reason.startswith("limit_"):
            raise TooManyAttempts()
        raise Blocked(reason)


def try_again() -> BadRequestException:
    """What a blocked sign-up or login sees. Vague on purpose: no hint for the bot."""
    return BadRequestException(message="Please wait a moment and try again.", error_code="TRY_AGAIN")
