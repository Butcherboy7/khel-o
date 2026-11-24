"""Referrals and KHEL-O booking credits.

Spec: docs/superpowers/specs/2026-11-21-referrals-design.md

- Welcome: every player's first paid booking is ₹welcome_credit off.
- Community code: +₹community_credit off the first booking with the code posted in the
  WhatsApp community (typed in checkout's "Have a code?" box).
- Friend reward: ₹referral_reward off one later booking for each friend who joined from your
  link and whose own first booking was checked in at the café.

KHEL-O pays every rupee of it: the credit goes into bookings.khelo_discount (café share =
total - fee + khelo_discount), and the café's settlement (subtotal) never changes. A credit is
only a lower price on a booking: no cash, no withdrawal, no transfer, no balance to top up.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

CAP_PER_BOOKING = Decimal("30")      # most KHEL-O credit on one booking
MIN_SESSION = Decimal("50")          # credits only on a session of ₹50 or more
MIN_CHARGE = Decimal("1")            # Razorpay's minimum order: always charge at least ₹1
REFERRER_CAP = 10                    # rewarded friends per referrer
CREDIT_DAYS = 60                     # a friend reward lasts this long
CLAIM_WINDOW_DAYS = 14               # a link must be claimed this soon after the account is made
CODE_RE = re.compile(r"^[0-9a-f]{10}$")


def invite_code(user_id: UUID) -> str:
    return user_id.hex[:10]


def norm_code(code: Optional[str]) -> str:
    return re.sub(r"\s+", "", (code or "")).upper()


def matches_community_code(settings, code: Optional[str]) -> bool:
    want = norm_code(getattr(settings, "community_code", None))
    return bool(want) and norm_code(code) == want


@dataclass
class CreditLine:
    kind: str     # welcome | community | referral
    label: str
    amount: Decimal


@dataclass
class Credits:
    lines: list[CreditLine] = field(default_factory=list)
    referral_credit_id: Optional[UUID] = None
    # Show "+₹15 with the community code": first booking, a code is set, not typed yet.
    community_hint: int = 0
    # The community code was typed but can't be used here (not a first booking, too small...).
    community_note: Optional[str] = None

    @property
    def total(self) -> Decimal:
        return sum((l.amount for l in self.lines), Decimal("0"))

    @property
    def note(self) -> Optional[str]:
        return "+".join(l.kind for l in self.lines) or None


def fit_lines(lines: list[CreditLine], ceiling: Decimal) -> list[CreditLine]:
    """Trim the lines (last first) so their sum stays within the ceiling; drop zero lines."""
    out: list[CreditLine] = []
    room = max(Decimal("0"), ceiling)
    for l in lines:
        take = min(l.amount, room)
        if take > 0:
            out.append(CreditLine(l.kind, l.label, take))
            room -= take
    return out


async def available_credit(db: AsyncSession, user_id: UUID, now: Optional[datetime] = None):
    from app.models.referral import ReferralCredit

    now = now or datetime.now(timezone.utc)
    return (await db.execute(
        select(ReferralCredit)
        .where(ReferralCredit.user_id == user_id, ReferralCredit.status == "available", ReferralCredit.expires_at > now)
        .order_by(ReferralCredit.expires_at)
        .limit(1)
    )).scalar_one_or_none()


async def credits_for(
    db: AsyncSession,
    settings,
    gamer_id: Optional[UUID],
    session_price: Decimal,
    charge_before: Decimal,
    community_code: Optional[str],
    first_booking: bool,
) -> Credits:
    """The KHEL-O credit lines for one booking. `charge_before` is what the customer would pay
    without credits (session + fee); at least ₹1 of it is always charged."""
    c = Credits()
    if not getattr(settings, "referrals_on", False):
        if community_code:
            c.community_note = "That code isn't running right now."
        return c
    if session_price < MIN_SESSION:
        if community_code:
            c.community_note = f"Codes work on sessions of ₹{int(MIN_SESSION)} or more."
        return c

    lines: list[CreditLine] = []
    welcome = Decimal(int(settings.welcome_credit or 0))
    community = Decimal(int(settings.community_credit or 0))
    if first_booking and welcome > 0:
        lines.append(CreditLine("welcome", "Welcome offer · first booking", welcome))
    if community_code:
        if first_booking and community > 0:
            lines.append(CreditLine("community", "Community code", community))
        elif not first_booking:
            c.community_note = "The community code is for your first booking. Your friend reward still works."
    elif first_booking and community > 0 and settings.community_code:
        c.community_hint = int(community)

    reserved = None
    if gamer_id is not None:
        credit = await available_credit(db, gamer_id)
        if credit is not None and Decimal(str(credit.amount)) > 0:
            lines.append(CreditLine("referral", "Friend reward", Decimal(str(credit.amount))))
            reserved = credit.id

    c.lines = fit_lines(lines, min(CAP_PER_BOOKING, charge_before - MIN_CHARGE))
    if reserved is not None and any(l.kind == "referral" for l in c.lines):
        c.referral_credit_id = reserved
    return c


# ---- claiming a friend's link ----

async def user_by_code(db: AsyncSession, code: str):
    from app.models.user import User

    if not CODE_RE.match(code or ""):
        return None
    rows = (await db.execute(
        select(User).where(func.replace(cast(User.id, String), "-", "").like(f"{code}%")).limit(2)
    )).scalars().all()
    return rows[0] if len(rows) == 1 else None


def _digits(phone: Optional[str]) -> str:
    d = re.sub(r"\D", "", phone or "")
    return d[-10:] if len(d) >= 10 else ""


async def claim(db: AsyncSession, settings, user, code: str, now: Optional[datetime] = None) -> str:
    """Link a new player to the friend whose invite link they came from. Returns a status word:
    joined | already | own | not_found | not_new | off. Never raises for a bad code."""
    from app.models.referral import Referral
    from app.services.checkout_maths import has_paid_booking

    now = now or datetime.now(timezone.utc)
    if not getattr(settings, "referrals_on", False):
        return "off"
    code = (code or "").strip().lower()
    existing = (await db.execute(select(Referral).where(Referral.referred_id == user.id))).scalar_one_or_none()
    if existing is not None:
        return "already"
    referrer = await user_by_code(db, code)
    if referrer is None or not referrer.is_active:
        return "not_found"
    if referrer.id == user.id:
        return "own"
    if _digits(referrer.phone_number) and _digits(referrer.phone_number) == _digits(user.phone_number):
        return "own"
    created = user.created_at
    if created is not None and created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if created is not None and now - created > timedelta(days=CLAIM_WINDOW_DAYS):
        return "not_new"
    if await has_paid_booking(db, user.id):
        return "not_new"
    db.add(Referral(id=uuid4(), referrer_id=referrer.id, referred_id=user.id, code=code, status="joined", created_at=now))
    await db.commit()
    return "joined"


# ---- booking lifecycle hooks (best-effort: a referral must never fail a payment or check-in) ----

async def on_paid(db: AsyncSession, booking) -> None:
    from app.models.referral import ReferralCredit

    try:
        cid = getattr(booking, "referral_credit_id", None)
        if not cid:
            return
        credit = await db.get(ReferralCredit, cid)
        if credit is None:
            return
        if credit.status != "available":
            if credit.used_booking_id != booking.id:
                logger.info("referral credit %s already used; booking %s got it too", cid, booking.id)
            return
        credit.status = "used"
        credit.used_booking_id = booking.id
        credit.used_at = datetime.now(timezone.utc)
        await db.commit()
    except Exception:  # noqa: BLE001
        logger.exception("referrals.on_paid failed for booking %s", getattr(booking, "id", None))
        await db.rollback()


async def on_cancelled(db: AsyncSession, booking_id: UUID) -> None:
    """A cancelled booking gives its friend reward back (if it hasn't expired)."""
    from app.models.referral import ReferralCredit

    try:
        credit = (await db.execute(
            select(ReferralCredit).where(ReferralCredit.used_booking_id == booking_id, ReferralCredit.status == "used")
        )).scalar_one_or_none()
        if credit is None:
            return
        credit.status = "available"
        credit.used_booking_id = None
        credit.used_at = None
        await db.commit()
    except Exception:  # noqa: BLE001
        logger.exception("referrals.on_cancelled failed for booking %s", booking_id)
        await db.rollback()


async def on_checked_in(db: AsyncSession, booking, settings=None, now: Optional[datetime] = None) -> Optional[str]:
    """The friend played: reward whoever brought them. Returns the new referral status, if any."""
    from app.models.notification import Notification, NotificationType
    from app.models.referral import Referral, ReferralCredit

    try:
        now = now or datetime.now(timezone.utc)
        ref = (await db.execute(
            select(Referral).where(Referral.referred_id == booking.gamer_id, Referral.status == "joined")
        )).scalar_one_or_none()
        if ref is None:
            return None
        if settings is None:
            from app.repositories.platform_settings_repository import PlatformSettingsRepository
            settings = await PlatformSettingsRepository(db).get_or_create()
        if not settings.referrals_on:
            return None
        if Decimal(str(booking.total_amount or 0)) + Decimal(str(booking.khelo_credit or 0)) < MIN_SESSION:
            return None
        rewarded = (await db.execute(
            select(func.count(Referral.id)).where(Referral.referrer_id == ref.referrer_id, Referral.status == "rewarded")
        )).scalar() or 0
        ref.booking_id = booking.id
        ref.rewarded_at = now
        amount = int(settings.referral_reward or 0)
        if rewarded >= REFERRER_CAP or amount <= 0:
            ref.status = "capped"
            await db.commit()
            return "capped"
        ref.status = "rewarded"
        db.add(ReferralCredit(
            id=uuid4(), user_id=ref.referrer_id, referral_id=ref.id, amount=amount,
            status="available", expires_at=now + timedelta(days=CREDIT_DAYS), created_at=now,
        ))
        db.add(Notification(
            id=uuid4(), user_id=ref.referrer_id, is_read=False, notification_type=NotificationType.PROMOTION,
            title=f"Your friend played. ₹{amount} off your next booking",
            message=f"Someone you invited just checked in at a café. Your next booking is ₹{amount} off, "
                    f"for {CREDIT_DAYS} days. Keep inviting: up to {REFERRER_CAP} friends.",
            link="/profile",
        ))
        await db.commit()
        return "rewarded"
    except Exception:  # noqa: BLE001
        logger.exception("referrals.on_checked_in failed for booking %s", getattr(booking, "id", None))
        await db.rollback()
        return None
