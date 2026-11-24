"""Team challenges: paid team and solo entry on top of the challenge system.

A team challenge is an ordinary Challenge row whose plan_config has a "team"
block (Valorant 3v3 at XQZ first). Everything the Tekken challenge does with
entries (the bracket, check-in, results, the public pages) keeps working,
because a whole team is one ChallengeEntry. The people in it are
ChallengePlayer rows, and every Razorpay order is a ChallengePayment.

Spots (team slots):
- A captain who starts paying holds one team slot for `holdMinutes` (the
  payment row, status 'created', until expires_at). Holds and paid teams
  together can never pass `maxTeams`: every slot change runs under the
  challenge row lock (challenge_service.change_spots).
- Solo players don't take a slot. KHEL-O puts them into a team that needs players later,
  only while a slot is free.
- When the slots are all taken, people join the waitlist for free. A
  waitlisted team is never moved up by itself (it hasn't paid): KHEL-O offers
  it a freed slot, and the captain then pays.
- A payment that still lands after its hold ran out keeps its slot if one is
  free, otherwise it is refunded at once.

Money: all entry money stays with KHEL-O until the challenge is done (no
Razorpay Route here); KHEL-O pays the café by hand. Refunds use Razorpay's
refund API (mock refunds on a mock payment, dev only).
"""
from __future__ import annotations

import hashlib
import hmac
import html
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

import structlog
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.cafe import Cafe
from app.models.challenge import Challenge, ChallengeEntry, ChallengeMatch, ChallengePayment, ChallengePlayer
from app.models.user import User
from app.services import challenge_bracket as bracket
from app.services import challenge_service as svc
from app.services import drop_service

logger = structlog.get_logger()

RANKS = ("Unrated", "Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ascendant", "Immortal", "Radiant")
PLAY_STYLES = {
    "entry": "I go in first",
    "support": "I support my team",
    "anchor": "I play safe and hold angles",
    "any": "Anything is fine",
}
TEAM_ROLES = ("captain", "player")
# Words a team name may not contain (kept short and obvious; admins can rename).
BAD_WORDS = re.compile(
    r"(fuck|f\*ck|shit|bitch|bastard|cunt|dick|pussy|slut|whore|nigg|fag|rape|"
    r"madarchod|behenchod|bhenchod|chutiya|chutia|gandu|randi|lund|lavda|lawda|bsdk|mc\b|bc\b)",
    re.IGNORECASE,
)
TEAM_NAME_RE = re.compile(r"^[A-Za-z0-9 ]{3,20}$")
RIOT_RE = re.compile(r"^([^#]{3,16})#([A-Za-z0-9]{3,5})$")
INSTA_RE = re.compile(r"^[A-Za-z0-9._]{1,30}$")

DEFAULTS: dict[str, Any] = {
    "size": 3,              # players in a team, captain included
    "maxSubs": 1,
    "priceTeam": 750,
    "priceSolo": 300,
    "holdMinutes": 10,
    "maxTeams": 16,
    "minTeams": 8,
    "slotMinutes": 20,      # one single-game match, start to start
    "bo3Minutes": 50,       # a best of 3, start to start
    "bo3RoundsLeft": 2,     # semi-finals and the final are best of 3
    "gameTo": 10,           # rounds a team must win to take one game (Swift Play: 5)
    "lobbies": 2,           # games that run at the same time (PCs for 2 teams each)
    "registrationClosesAt": None,
    "teammatesBy": None,    # after this the captain may type teammates in by hand
}


class TeamError(Exception):
    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status


def now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _parse(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    return _aware(datetime.fromisoformat(value.replace("Z", "+00:00")))


def config(ch: Challenge) -> Optional[dict[str, Any]]:
    """The team settings, or None for a solo challenge (Tekken)."""
    raw = (ch.plan_config or {}).get("team") if isinstance(ch.plan_config, dict) else None
    if not isinstance(raw, dict):
        return None
    return {**DEFAULTS, **raw}


def is_team(ch: Challenge) -> bool:
    return config(ch) is not None


def closes_at(ch: Challenge) -> Optional[datetime]:
    cfg = config(ch) or {}
    return _parse(cfg.get("registrationClosesAt"))


def signups_open(ch: Challenge, at: Optional[datetime] = None) -> bool:
    if ch.status != "open" or ch.checkin_closed_at is not None:
        return False
    close = closes_at(ch)
    return close is None or (at or now()) < close


# ── Checking what people type ─────────────────────────────────────────────


def clean_team_name(raw: str) -> str:
    name = re.sub(r"\s+", " ", (raw or "").strip())
    if not TEAM_NAME_RE.match(name):
        raise TeamError("Team name: 3 to 20 letters, numbers or spaces.", "BAD_TEAM_NAME")
    if BAD_WORDS.search(name.replace(" ", "")) or BAD_WORDS.search(name):
        raise TeamError("Please pick a different team name.", "BAD_TEAM_NAME")
    return name


def clean_riot(raw: str) -> tuple[str, str]:
    """'Uzair#KHL1' → (as typed, lower-case key). Name 3–16, tag 3–5 letters/numbers."""
    value = re.sub(r"\s*#\s*", "#", (raw or "").strip())
    m = RIOT_RE.match(value)
    if not m:
        raise TeamError("Riot ID looks like Name#TAG, for example Uzair#KHL1.", "BAD_RIOT_ID")
    return value, value.lower()


def clean_insta(raw: Optional[str], required: bool = True) -> Optional[str]:
    value = (raw or "").strip().lstrip("@").strip()
    value = re.sub(r"^(https?://)?(www\.)?instagram\.com/", "", value).strip("/")
    if not value:
        if required:
            raise TeamError("Add your Instagram username.", "BAD_INSTAGRAM")
        return None
    if not INSTA_RE.match(value):
        raise TeamError("Instagram username: letters, numbers, dots and _ only.", "BAD_INSTAGRAM")
    return value


def clean_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) != 10 or digits[0] not in "6789":
        raise TeamError("WhatsApp number: 10 digits, like 9876543210.", "BAD_PHONE")
    return "+91" + digits


def clean_player(raw: dict, *, solo: bool = False, by_someone_else: bool = False) -> dict:
    """One person's details, checked. Raises TeamError with a plain message.
    Instagram is optional for everyone. Typed in by the captain or KHEL-O: rank may be left empty too."""
    name = re.sub(r"\s+", " ", str(raw.get("fullName") or "").strip())
    if not 2 <= len(name) <= 50:
        raise TeamError("Full name: 2 to 50 letters.", "BAD_NAME")
    riot, key = clean_riot(str(raw.get("riotId") or ""))
    rank = raw.get("rank") or "Unrated"
    if rank not in RANKS:
        raise TeamError("Pick your current rank.", "BAD_RANK")
    college = re.sub(r"\s+", " ", str(raw.get("college") or "").strip())[:80] or None
    out = {
        "full_name": name,
        "phone": clean_phone(str(raw.get("phone") or "")),
        "riot_id": riot,
        "riot_key": key,
        "rank": rank,
        "instagram": clean_insta(raw.get("instagram"), required=False),
        "college": college,
        "play_style": None,
    }
    if solo:
        style = raw.get("playStyle")
        out["play_style"] = style if style in PLAY_STYLES else None
    return out


def clean_sub(raw: Optional[dict]) -> Optional[dict]:
    """The optional substitute on the captain's form: name, Riot ID, phone."""
    if not raw or not any(str(raw.get(k) or "").strip() for k in ("fullName", "riotId", "phone")):
        return None
    name = re.sub(r"\s+", " ", str(raw.get("fullName") or "").strip())
    if not 2 <= len(name) <= 50:
        raise TeamError("Substitute's name: 2 to 50 letters.", "BAD_NAME")
    riot, key = clean_riot(str(raw.get("riotId") or ""))
    return {"full_name": name, "phone": clean_phone(str(raw.get("phone") or "")), "riot_id": riot, "riot_key": key}


def _taps(raw: Optional[dict]) -> dict[str, Optional[datetime]]:
    raw = raw or {}
    out = {}
    for key, col in (("community", "tapped_community_at"), ("instaKhelo", "tapped_insta_khelo_at"), ("instaVenue", "tapped_insta_venue_at")):
        out[col] = now() if raw.get(key) else None
    return out


# ── Counting ──────────────────────────────────────────────────────────────


async def players(db: AsyncSession, challenge_id) -> list[ChallengePlayer]:
    await db.flush()
    return list((await db.execute(
        select(ChallengePlayer).where(ChallengePlayer.challenge_id == challenge_id)
        .order_by(ChallengePlayer.created_at).execution_options(populate_existing=True)
    )).scalars().all())


async def team_entries(db: AsyncSession, challenge_id) -> list[ChallengeEntry]:
    return [e for e in await svc.entries(db, challenge_id) if e.kind is not None]


async def live_holds(db: AsyncSession, challenge_id, *, exclude_id=None) -> list[ChallengePayment]:
    """Team orders still holding a slot: started, not paid, not run out, not for an offered team."""
    q = select(ChallengePayment).where(
        ChallengePayment.challenge_id == challenge_id,
        ChallengePayment.kind == "team",
        ChallengePayment.status == "created",
        ChallengePayment.expires_at > now(),
        ChallengePayment.entry_id.is_(None),
    )
    if exclude_id is not None:
        q = q.where(ChallengePayment.id != exclude_id)
    return list((await db.execute(q)).scalars().all())


async def stats(db: AsyncSession, ch: Challenge) -> dict[str, int]:
    cfg = config(ch) or DEFAULTS
    rows = await team_entries(db, ch.id)
    ppl = await players(db, ch.id)
    paid = sum(1 for e in rows if e.status == "confirmed" and not e.is_test)
    paid_all = sum(1 for e in rows if e.status == "confirmed")
    holds = len(await live_holds(db, ch.id))
    return {
        "maxTeams": cfg["maxTeams"],  # None = no limit
        "teams": paid,
        "teamsWithTest": paid_all,
        "holding": holds,
        "spotsLeft": None if cfg["maxTeams"] is None else max(cfg["maxTeams"] - paid_all - holds, 0),
        "waitlistTeams": sum(1 for e in rows if e.status == "waitlist"),
        "solosWaiting": sum(1 for p in ppl if p.role == "solo" and p.entry_id is None and p.status == "active"),
        "solosWaitlist": sum(1 for p in ppl if p.role == "solo" and p.status == "waitlist"),
        "players": sum(1 for p in ppl if p.status == "active" and p.entry_id is not None),
    }


async def _room(db: AsyncSession, ch: Challenge, *, exclude_payment=None) -> int:
    cfg = config(ch)
    paid = sum(1 for e in await team_entries(db, ch.id) if e.status == "confirmed")
    holds = len(await live_holds(db, ch.id, exclude_id=exclude_payment))
    if cfg["maxTeams"] is None:
        return 10**6
    return cfg["maxTeams"] - paid - holds


async def player_for(db: AsyncSession, challenge_id, user_id) -> Optional[ChallengePlayer]:
    return (await db.execute(
        select(ChallengePlayer).where(ChallengePlayer.challenge_id == challenge_id, ChallengePlayer.user_id == user_id)
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()


async def _check_free(db: AsyncSession, ch: Challenge, user_id, riot_keys: list[str], team_name: Optional[str] = None,
                      phone: Optional[str] = None) -> None:
    """Refuse a sign-up that would put a person, a Riot ID, a team name or a team's WhatsApp
    number in twice. (The database allows one team entry per number, so refusing here is what
    stops someone paying and then getting no entry.)"""
    mine = await player_for(db, ch.id, user_id) if user_id else None
    if mine is not None and mine.status in ("active", "waitlist"):
        raise TeamError("You're already signed up for this challenge. Open “My entry” to see it.", "ALREADY_IN", 409)
    if len(set(riot_keys)) != len(riot_keys):
        raise TeamError("Each player needs a different Riot ID.", "RIOT_ID_TWICE")
    taken = (await db.execute(
        select(ChallengePlayer.riot_id).where(
            ChallengePlayer.challenge_id == ch.id,
            ChallengePlayer.riot_key.in_(riot_keys),
            ChallengePlayer.status.in_(("active", "waitlist")),
        )
    )).scalars().first()
    if taken:
        raise TeamError(f"The Riot ID {taken} is already in this challenge.", "RIOT_ID_TAKEN", 409)
    if phone:
        owner = (await db.execute(select(ChallengeEntry.name).where(
            ChallengeEntry.challenge_id == ch.id, ChallengeEntry.phone == phone))).scalars().first()
        if owner:
            raise TeamError(f"This WhatsApp number is already used by the team {owner}. Use a different number for your team.",
                            "PHONE_TAKEN", 409)
    if team_name:
        clash = (await db.execute(
            select(ChallengeEntry.id).where(
                ChallengeEntry.challenge_id == ch.id,
                func.lower(ChallengeEntry.name) == team_name.lower(),
                ChallengeEntry.status.in_(("confirmed", "waitlist")),
            )
        )).first()
        held = (await db.execute(
            select(ChallengePayment.form).where(
                ChallengePayment.challenge_id == ch.id, ChallengePayment.kind == "team",
                ChallengePayment.status == "created", ChallengePayment.expires_at > now(),
                ChallengePayment.user_id != user_id,
            )
        )).scalars().all()
        if clash or any((f or {}).get("teamName", "").lower() == team_name.lower() for f in held):
            raise TeamError("That team name is taken. Try another one.", "TEAM_NAME_TAKEN", 409)


def _invite_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(6))


async def _new_invite_code(db: AsyncSession) -> str:
    for _ in range(20):
        code = _invite_code()
        if (await db.execute(select(ChallengeEntry.id).where(ChallengeEntry.invite_code == code))).first() is None:
            return code
    raise RuntimeError("Could not make an invite code")


async def _next_position(db: AsyncSession, challenge_id) -> int:
    top = (await db.execute(
        select(func.max(ChallengeEntry.position)).where(ChallengeEntry.challenge_id == challenge_id)
    )).scalar_one()
    return (top or 0) + 1


# ── Paying ────────────────────────────────────────────────────────────────


@dataclass
class Started:
    payment: ChallengePayment
    key_id: str


def _form_out(kind: str, team_name: Optional[str], captain: dict, sub: Optional[dict], taps: dict, agreed: bool) -> dict:
    return {
        "kind": kind,
        "teamName": team_name,
        "player": {k: v for k, v in captain.items()},
        "sub": sub,
        "taps": {k: (v.isoformat() if v else None) for k, v in taps.items()},
        "agreed": agreed,
    }


async def start_payment(db: AsyncSession, ch: Challenge, user: User, payload: dict) -> Started:
    """Check the form, hold a team slot (team only) and make the Razorpay order.
    A second tap while their own hold is still live hands back the same order."""
    cfg = config(ch)
    kind = payload.get("kind")
    if kind not in ("team", "solo"):
        raise TeamError("Pick Team of 5 or Solo.", "BAD_KIND")
    if not payload.get("agreed"):
        raise TeamError("Tick the box to agree before paying.", "NOT_AGREED")
    captain = clean_player(payload.get("player") or {}, solo=(kind == "solo"))
    sub = clean_sub(payload.get("sub")) if kind == "team" else None
    team_name = clean_team_name(payload.get("teamName") or "") if kind == "team" else None
    taps = _taps(payload.get("taps"))
    amount = Decimal(str(cfg["priceTeam"] if kind == "team" else cfg["priceSolo"]))

    # Their own order still running? Hand it back (the Pay button was tapped twice).
    existing = (await db.execute(
        select(ChallengePayment).where(
            ChallengePayment.challenge_id == ch.id, ChallengePayment.user_id == user.id,
            ChallengePayment.kind == kind, ChallengePayment.status == "created",
            ChallengePayment.expires_at > now(), ChallengePayment.entry_id.is_(None),
        )
    )).scalars().first()

    # The order is made before the lock: a Razorpay call never runs while the
    # challenge row is locked. An order that ends up unused just expires.
    order_id = None if existing else drop_service.create_order(amount, f"CH-{secrets.token_hex(4)}")

    async def work(locked: Challenge):
        if not signups_open(locked):
            raise TeamError("Sign-ups are closed.", "SIGNUPS_CLOSED")
        mine = (await db.execute(
            select(ChallengePayment).where(
                ChallengePayment.challenge_id == locked.id, ChallengePayment.user_id == user.id,
                ChallengePayment.kind == kind, ChallengePayment.status == "created",
                ChallengePayment.expires_at > now(), ChallengePayment.entry_id.is_(None),
            ).execution_options(populate_existing=True)
        )).scalars().first()
        keys = [captain["riot_key"]] + ([sub["riot_key"]] if sub else [])
        await _check_free(db, locked, user.id, keys, team_name, phone=captain["phone"] if kind == "team" else None)
        form = _form_out(kind, team_name, captain, sub, taps, True)
        if mine is not None:
            mine.form = form  # they may have fixed a typo before paying
            return mine
        if kind == "team" and await _room(db, locked) <= 0:
            raise TeamError("All the team spots are taken. Join the waitlist instead.", "FULL", 409)
        p = ChallengePayment(
            challenge_id=locked.id, user_id=user.id, kind=kind, amount=amount, status="created",
            razorpay_order_id=order_id or f"order_pending_{secrets.token_hex(6)}",
            expires_at=now() + timedelta(minutes=cfg["holdMinutes"]), form=form,
        )
        db.add(p)
        return p

    try:
        payment = await svc.change_spots(db, ch.id, work)
    except TeamError:
        await db.rollback()
        raise
    return Started(payment=payment, key_id=settings.RAZORPAY_KEY_ID)


async def start_offer_payment(db: AsyncSession, ch: Challenge, user: User) -> Started:
    """A waitlisted team that was offered a slot: the captain pays for it now."""
    cfg = config(ch)
    amount = Decimal(str(cfg["priceTeam"]))
    me = await player_for(db, ch.id, user.id)
    entry = await svc.entry_for(db, ch.id, entry_id=me.entry_id) if me and me.entry_id else None
    if entry is None or me.role != "captain" or entry.status != "waitlist" or entry.offered_at is None:
        raise TeamError("There's no spot offered to your team right now.", "NO_OFFER", 409)
    if ch.drawn_at is not None:
        raise TeamError("The bracket is already drawn, so no new teams can join. Sorry!", "ALREADY_DRAWN", 409)
    existing = (await db.execute(
        select(ChallengePayment).where(
            ChallengePayment.entry_id == entry.id, ChallengePayment.status == "created",
            ChallengePayment.expires_at > now(),
        )
    )).scalars().first()
    if existing:
        return Started(payment=existing, key_id=settings.RAZORPAY_KEY_ID)
    order_id = drop_service.create_order(amount, f"CH-{secrets.token_hex(4)}")
    p = ChallengePayment(
        challenge_id=ch.id, user_id=user.id, kind="team", amount=amount, status="created",
        razorpay_order_id=order_id, expires_at=now() + timedelta(hours=24),
        form={"kind": "offer", "teamName": entry.name}, entry_id=entry.id,
    )
    db.add(p)
    await db.commit()
    return Started(payment=p, key_id=settings.RAZORPAY_KEY_ID)


@dataclass
class Confirmed:
    outcome: str  # 'paid' | 'already' | 'refunded'
    payment: ChallengePayment


async def confirm(db: AsyncSession, order_id: str, payment_id: str) -> Optional[Confirmed]:
    """Money is in for this order (the browser's verify or the webhook, whichever
    lands first; the second is a no-op). Turns the form into a team or a solo
    player. None if the order isn't a challenge order."""
    pay = (await db.execute(select(ChallengePayment).where(ChallengePayment.razorpay_order_id == order_id))).scalar_one_or_none()
    if pay is None:
        return None
    challenge_id = pay.challenge_id
    # Read the id now: change_spots commits, and an expired row can't lazy-load here (MissingGreenlet).
    pay_id = pay.id
    result: dict[str, Any] = {}

    async def work(locked: Challenge):
        p = (await db.execute(
            select(ChallengePayment).where(ChallengePayment.id == pay_id).with_for_update()
            .execution_options(populate_existing=True)
        )).scalar_one()
        if p.status in ("paid", "refunded"):
            result["outcome"] = "already"
            return p
        p.razorpay_payment_id = payment_id
        p.paid_at = now()
        form = p.form or {}
        if locked.drawn_at is not None:
            result["outcome"] = "refund"
            result["reason"] = "The bracket was already drawn when your payment arrived"
            p.status = "paid"
            return p

        if form.get("kind") == "offer":
            entry = await svc.entry_for(db, locked.id, entry_id=p.entry_id)
            if entry is None or entry.status != "waitlist" or await _room(db, locked) <= 0:
                result["outcome"] = "refund"
                p.status = "paid"
                return p
            entry.status = "confirmed"
            entry.promoted_at = now()
            entry.offered_at = None
            for pl in await players(db, locked.id):
                if pl.entry_id == entry.id and pl.status == "waitlist":
                    pl.status = "active"
            p.status = "paid"
            result["outcome"] = "paid"
            return p

        captain = dict(form.get("player") or {})
        taps = {k: _parse(v) for k, v in (form.get("taps") or {}).items()}
        try:
            await _check_free(db, locked, p.user_id, [captain.get("riot_key", "")])
        except TeamError:
            # Signed up some other way while paying (a second tab): give the money back.
            result["outcome"] = "refund"
            p.status = "paid"
            return p

        if p.kind == "team":
            if await _room(db, locked, exclude_payment=p.id) <= 0:
                result["outcome"] = "refund"
                p.status = "paid"
                return p
            entry = ChallengeEntry(
                challenge_id=locked.id, user_id=p.user_id, name=form.get("teamName") or "Team",
                display_name=(form.get("teamName") or "Team")[:40], phone=captain["phone"],
                position=await _next_position(db, locked.id), status="confirmed",
                consent_rules=True, consent_age=True, consent_filming=True, consent_updates=True,
                consent_version="team-1", kind="team", invite_code=await _new_invite_code(db),
            )
            db.add(entry)
            await db.flush()
            db.add(ChallengePlayer(
                challenge_id=locked.id, entry_id=entry.id, user_id=p.user_id, role="captain",
                added_by="self", agreed_at=now(), **_player_cols(captain), **taps,
            ))
            if form.get("sub"):
                sub = form["sub"]
                db.add(ChallengePlayer(
                    challenge_id=locked.id, entry_id=entry.id, user_id=None, role="sub", added_by="captain",
                    full_name=sub["full_name"], phone=sub["phone"], riot_id=sub["riot_id"], riot_key=sub["riot_key"],
                ))
            p.entry_id = entry.id
        else:
            player = ChallengePlayer(
                challenge_id=locked.id, entry_id=None, user_id=p.user_id, role="solo",
                added_by="self", agreed_at=now(), **_player_cols(captain), **taps,
            )
            db.add(player)
            await db.flush()
            p.player_id = player.id
        p.status = "paid"
        result["outcome"] = "paid"
        return p

    try:
        p = await svc.change_spots(db, challenge_id, work)
    except (RuntimeError, IntegrityError) as exc:
        # Money is in but the entry can't be made (for example the number is already on another
        # team). Never leave that stuck: give it back and say why.
        await db.rollback()
        logger.error("challenge_confirm_failed_refunding", payment=str(pay_id), error=str(exc)[:200])
        p = (await db.execute(select(ChallengePayment).where(ChallengePayment.id == pay_id)
                              .execution_options(populate_existing=True))).scalar_one()
        if p.status in ("paid", "refunded"):
            return Confirmed("already", p)
        p.razorpay_payment_id = payment_id
        p.paid_at = now()
        p.status = "paid"
        await db.commit()
        await refund(db, p, "We could not create your entry, so the money is returned")
        try:
            from app.services import challenge_team_mail
            await challenge_team_mail.notify_unmade_entry(db, await db.get(Challenge, challenge_id), p.user_id, p.amount)
        except Exception as exc:  # the refund already happened; the email is a courtesy
            logger.warning("challenge_unmade_mail_failed", error=str(exc)[:200])
        return Confirmed("refunded", p)
    if result.get("outcome") == "refund":
        await refund(db, p, result.get("reason") or "No team spot was free when the payment arrived")
        return Confirmed("refunded", p)
    if result.get("outcome") == "paid":
        try:
            await send_confirmation(db, p)
        except Exception as exc:  # an email problem never undoes a paid entry
            logger.warning("challenge_confirm_email_failed", error=str(exc)[:200])
    return Confirmed(result.get("outcome", "already"), p)


def _player_cols(d: dict) -> dict:
    keys = ("full_name", "phone", "riot_id", "riot_key", "rank", "instagram", "college", "play_style")
    return {k: d.get(k) for k in keys}


async def refund(db: AsyncSession, p: ChallengePayment, reason: str) -> ChallengePayment:
    """Give the money back for one payment (idempotent)."""
    if p.status == "refunded":
        return p
    if p.status != "paid" or not p.razorpay_payment_id:
        raise TeamError("This payment hasn't been paid, so there's nothing to refund.", "NOT_PAID")
    try:
        refund_id = drop_service.refund_payment(p.razorpay_payment_id, Decimal(str(p.amount)), reason)
    except Exception as exc:
        logger.error("challenge_refund_failed", payment=str(p.id), error=str(exc)[:300])
        raise TeamError("Razorpay didn't take the refund. Try again, or refund it in the Razorpay dashboard.", "REFUND_FAILED", 502)
    p.status = "refunded"
    p.refund_id = refund_id
    p.refunded_at = now()
    p.refund_reason = reason[:120]
    await db.commit()
    return p


# ── Free sign-ups: waitlist, teammates ────────────────────────────────────


async def join_waitlist(db: AsyncSession, ch: Challenge, user: User, payload: dict) -> None:
    """All slots taken: the same details, no payment. A team waits as one entry."""
    kind = payload.get("kind")
    if kind not in ("team", "solo"):
        raise TeamError("Pick Team of 5 or Solo.", "BAD_KIND")
    captain = clean_player(payload.get("player") or {}, solo=(kind == "solo"))
    team_name = clean_team_name(payload.get("teamName") or "") if kind == "team" else None
    taps = _taps(payload.get("taps"))

    async def work(locked: Challenge):
        if not signups_open(locked):
            raise TeamError("Sign-ups are closed.", "SIGNUPS_CLOSED")
        await _check_free(db, locked, user.id, [captain["riot_key"]], team_name, phone=captain["phone"] if kind == "team" else None)
        if kind == "team":
            entry = ChallengeEntry(
                challenge_id=locked.id, user_id=user.id, name=team_name, display_name=team_name[:40],
                phone=captain["phone"], position=await _next_position(db, locked.id), status="waitlist",
                consent_rules=True, consent_age=True, consent_filming=True, consent_updates=True,
                consent_version="team-1", kind="team", invite_code=await _new_invite_code(db),
            )
            db.add(entry)
            await db.flush()
            db.add(ChallengePlayer(challenge_id=locked.id, entry_id=entry.id, user_id=user.id, role="captain",
                                   status="waitlist", added_by="self", agreed_at=now(), **_player_cols(captain), **taps))
        else:
            db.add(ChallengePlayer(challenge_id=locked.id, entry_id=None, user_id=user.id, role="solo",
                                   status="waitlist", added_by="self", agreed_at=now(), **_player_cols(captain), **taps))

    try:
        await svc.change_spots(db, ch.id, work)
    except TeamError:
        await db.rollback()
        raise


async def entry_by_code(db: AsyncSession, ch: Challenge, code: str) -> ChallengeEntry:
    entry = (await db.execute(select(ChallengeEntry).where(
        ChallengeEntry.challenge_id == ch.id, ChallengeEntry.invite_code == (code or "").strip().upper(),
    ))).scalar_one_or_none()
    if entry is None or entry.status not in ("confirmed", "waitlist"):
        raise TeamError("This invite link isn't working. Ask your captain for a new one.", "BAD_INVITE", 404)
    return entry


def _team_counts(cfg: dict, team: list[ChallengePlayer]) -> tuple[int, int]:
    live = [p for p in team if p.status in ("active", "waitlist")]
    return sum(1 for p in live if p.role in TEAM_ROLES), sum(1 for p in live if p.role == "sub")


async def join_team(db: AsyncSession, ch: Challenge, user: Optional[User], code: Optional[str], payload: dict,
                    *, entry_id=None, by: str = "self") -> ChallengePlayer:
    """A teammate joins with the captain's link (by='self'), or the captain or
    KHEL-O types them in (by='captain'/'admin', user=None). No payment."""
    cfg = config(ch)
    as_sub = bool(payload.get("asSub"))
    if by == "captain":
        # Until sign-ups close teammates fill their own details with the link;
        # after that the captain may type in anyone still missing.
        opens = _parse(cfg.get("teammatesBy")) if cfg.get("teammatesBy") else closes_at(ch)
        if opens is not None and now() < opens:
            raise TeamError("Send your link to your teammates. You can type their details yourself after sign-ups close.",
                            "TOO_EARLY", 409)
    person = (clean_player(payload.get("player") or {}, by_someone_else=(by != "self"))
              if not (as_sub and by != "self") else None)
    if person is None:
        sub = clean_sub(payload.get("player") or {})
        if sub is None:
            raise TeamError("Add the substitute's name, Riot ID and WhatsApp number.", "BAD_SUB")
        person = {**sub, "rank": None, "instagram": None, "college": None, "play_style": None}
    taps = _taps(payload.get("taps")) if by == "self" else {}
    if by == "self" and not payload.get("agreed"):
        raise TeamError("Tick the box to agree first.", "NOT_AGREED")

    async def work(locked: Challenge):
        if by == "self" and locked.status not in ("open", "closed"):
            raise TeamError("This challenge isn't taking new players now.", "SIGNUPS_CLOSED")
        entry = await entry_by_code(db, locked, code) if code else await svc.entry_for(db, locked.id, entry_id=entry_id)
        if entry is None or entry.status not in ("confirmed", "waitlist"):
            raise TeamError("That team isn't in the challenge.", "BAD_INVITE", 404)
        team = [p for p in await players(db, locked.id) if p.entry_id == entry.id]
        main, subs = _team_counts(cfg, team)
        if as_sub:
            if subs >= cfg["maxSubs"]:
                raise TeamError("This team already has its substitute.", "TEAM_FULL", 409)
        elif main >= cfg["size"]:
            raise TeamError("This team is full.", "TEAM_FULL", 409)
        await _check_free(db, locked, user.id if user else None, [person["riot_key"]])
        row = ChallengePlayer(
            challenge_id=locked.id, entry_id=entry.id, user_id=user.id if user else None,
            role="sub" if as_sub else "player", status="active" if entry.status == "confirmed" else "waitlist",
            added_by=by, agreed_at=now() if by == "self" else None, **_player_cols(person), **taps,
        )
        db.add(row)
        await db.flush()
        return row

    try:
        return await svc.change_spots(db, ch.id, work)
    except TeamError:
        await db.rollback()
        raise


async def tap(db: AsyncSession, ch: Challenge, user: User, which: str) -> None:
    col = {"community": "tapped_community_at", "instaKhelo": "tapped_insta_khelo_at", "instaVenue": "tapped_insta_venue_at"}.get(which)
    me = await player_for(db, ch.id, user.id)
    if col and me is not None and getattr(me, col) is None:
        setattr(me, col, now())
        await db.commit()


# ── Check-in QR (one per player) ──────────────────────────────────────────


def _sign(player_id: UUID) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"challenge-player:{player_id.hex}".encode(), hashlib.sha256).hexdigest()[:16]


def player_token(player_id: UUID) -> str:
    return f"p{player_id.hex}{_sign(player_id)}"


def player_id_from_token(token: str) -> Optional[UUID]:
    token = (token or "").strip().lower()
    if len(token) != 49 or not token.startswith("p"):
        return None
    try:
        pid = UUID(hex=token[1:33])
    except ValueError:
        return None
    return pid if hmac.compare_digest(token[33:], _sign(pid)) else None


def checkin_url(ch: Challenge, p: ChallengePlayer) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/challenge/{ch.slug}/checkin/{player_token(p.id)}"


async def set_checked_in(db: AsyncSession, ch: Challenge, player: ChallengePlayer, on: bool) -> None:
    """Mark one player here (or not). A team counts as here once most of its players are (3 of 5)."""
    player.checked_in_at = now() if on else None
    await db.flush()
    if player.entry_id:
        entry = await svc.entry_for(db, ch.id, entry_id=player.entry_id)
        here = sum(1 for p in await players(db, ch.id) if p.entry_id == entry.id and p.status == "active" and p.checked_in_at)
        entry.present = here >= config(ch)["size"] // 2 + 1
        entry.checked_in_at = now() if entry.present and entry.checked_in_at is None else (entry.checked_in_at if entry.present else None)
    await db.commit()


# ── Admin: solos, offers, refunds, cancel ─────────────────────────────────


async def make_solo_team(db: AsyncSession, ch: Challenge, player_ids: list[UUID], name: Optional[str]) -> ChallengeEntry:
    cfg = config(ch)

    async def work(locked: Challenge):
        ppl = {p.id: p for p in await players(db, locked.id)}
        chosen = [ppl.get(i) for i in player_ids]
        if not chosen or any(p is None or p.role != "solo" or p.entry_id is not None or p.status != "active" for p in chosen):
            raise TeamError("Pick solo players who paid and aren't in a team yet.", "BAD_SOLOS")
        if len(chosen) > cfg["size"]:
            raise TeamError(f"A team has {cfg['size']} players.", "TOO_MANY")
        if await _room(db, locked) <= 0:
            raise TeamError("No team spot is free.", "FULL", 409)
        taken = {e.name.lower() for e in await team_entries(db, locked.id) if e.status in ("confirmed", "waitlist")}
        if name:
            team_name = clean_team_name(name)
            if team_name.lower() in taken:
                raise TeamError(f"A team called {team_name} already exists. Pick another name.", "TEAM_NAME_TAKEN", 409)
        else:
            n = 1
            while f"solo squad {n}" in taken:
                n += 1
            team_name = f"Solo Squad {n}"
        lead = chosen[0]
        if (await db.execute(select(ChallengeEntry.id).where(
                ChallengeEntry.challenge_id == locked.id, ChallengeEntry.phone == lead.phone))).first():
            raise TeamError("That player's WhatsApp number is already on another team entry. Pick a different captain for this team.",
                            "PHONE_TAKEN", 409)
        entry = ChallengeEntry(
            challenge_id=locked.id, user_id=lead.user_id, name=team_name, display_name=team_name[:40],
            phone=lead.phone, position=await _next_position(db, locked.id), status="confirmed",
            consent_rules=True, consent_age=True, consent_filming=True, consent_updates=True,
            consent_version="team-1", kind="solo_group", invite_code=await _new_invite_code(db),
            is_test=any(p.is_test for p in chosen),
        )
        db.add(entry)
        await db.flush()
        for i, p in enumerate(chosen):
            p.entry_id = entry.id
            p.role = "captain" if i == 0 else "player"
            p.added_by = p.added_by or "admin"
        return entry

    try:
        return await svc.change_spots(db, ch.id, work)
    except TeamError:
        await db.rollback()
        raise


async def place_solo(db: AsyncSession, ch: Challenge, player_id: UUID, entry_id: UUID) -> None:
    """Fill a gap in a team that's short of players with a paid solo player."""
    cfg = config(ch)

    async def work(locked: Challenge):
        ppl = await players(db, locked.id)
        p = next((x for x in ppl if x.id == player_id), None)
        if p is None or p.role != "solo" or p.entry_id is not None or p.status != "active":
            raise TeamError("Pick a paid solo player who isn't in a team.", "BAD_SOLO")
        entry = await svc.entry_for(db, locked.id, entry_id=entry_id)
        if entry is None or entry.status != "confirmed":
            raise TeamError("Pick a team that has a spot.", "BAD_TEAM")
        main, _ = _team_counts(cfg, [x for x in ppl if x.entry_id == entry.id])
        if main >= cfg["size"]:
            raise TeamError("That team is already full.", "TEAM_FULL", 409)
        p.entry_id = entry.id
        p.role = "player"
        p.added_by = "admin"

    try:
        await svc.change_spots(db, ch.id, work)
    except TeamError:
        await db.rollback()
        raise


async def offer_slot(db: AsyncSession, ch: Challenge, entry_id: UUID, on: bool = True) -> None:
    async def work(locked: Challenge):
        entry = await svc.entry_for(db, locked.id, entry_id=entry_id)
        if entry is None or entry.status != "waitlist":
            raise TeamError("Pick a team on the waitlist.", "BAD_TEAM")
        if on and locked.drawn_at is not None:
            raise TeamError("The bracket is already drawn. No new teams can join now.", "ALREADY_DRAWN", 409)
        if on and await _room(db, locked) <= 0:
            raise TeamError("No team spot is free to offer.", "FULL", 409)
        entry.offered_at = now() if on else None

    try:
        await svc.change_spots(db, ch.id, work)
    except TeamError:
        await db.rollback()
        raise


async def refund_player(db: AsyncSession, ch: Challenge, player_id: UUID, reason: str) -> None:
    """Refund a solo player (no team found) and take them out."""
    p = await db.get(ChallengePlayer, player_id)
    if p is None or p.challenge_id != ch.id:
        raise TeamError("No such player.", "BAD_PLAYER", 404)
    pay = (await db.execute(select(ChallengePayment).where(ChallengePayment.player_id == p.id))).scalar_one_or_none()
    if pay is None:
        raise TeamError("This player has no payment of their own (the captain paid for the team).", "NO_PAYMENT")
    await refund(db, pay, reason)
    p = await db.get(ChallengePlayer, player_id)
    p.status = "refunded"
    if p.entry_id is None:
        pass
    await db.commit()


async def refund_team(db: AsyncSession, ch: Challenge, entry_id: UUID, reason: str) -> None:
    pays = (await db.execute(select(ChallengePayment).where(
        ChallengePayment.entry_id == entry_id, ChallengePayment.status == "paid"))).scalars().all()
    if not pays:
        raise TeamError("This team has no payment to refund.", "NO_PAYMENT")
    for pay in pays:
        await refund(db, pay, reason)

    async def work(locked: Challenge):
        entry = await svc.entry_for(db, locked.id, entry_id=entry_id)
        entry.status = "withdrawn"
        entry.withdrawn_at = now()
        entry.withdrawn_by = "admin"
        for p in await players(db, locked.id):
            if p.entry_id == entry_id:
                p.status = "refunded"

    await svc.change_spots(db, ch.id, work)


async def cancel_and_refund_all(db: AsyncSession, ch: Challenge, reason: str) -> dict[str, int]:
    """Cancel the challenge and give everyone their money back."""
    pays = (await db.execute(select(ChallengePayment).where(
        ChallengePayment.challenge_id == ch.id, ChallengePayment.status == "paid"))).scalars().all()
    done, failed = 0, 0
    for pay in pays:
        try:
            await refund(db, pay, reason)
            done += 1
        except TeamError:
            await db.rollback()
            failed += 1
    ch = await db.get(Challenge, ch.id)
    ch.status = "cancelled"
    for p in await players(db, ch.id):
        if p.status in ("active", "waitlist"):
            p.status = "refunded" if p.status == "active" else "removed"
    await db.commit()
    return {"refunded": done, "failed": failed}


# ── The bracket: draw, times, results ─────────────────────────────────────


def schedule(ch: Challenge, rows: list[ChallengeMatch]) -> None:
    """Give every match a start time and a lobby, round by round, two lobbies
    at a time: 20 minutes per single game, 50 for a best of 3. A bye keeps
    its slot (empty), so the times printed on Friday never move."""
    cfg = config(ch)
    first = _aware(ch.starts_at)
    total = rounds_of(rows)
    t = first
    for r in range(total):
        ms = sorted((m for m in rows if m.round == r and not m.is_third_place), key=lambda m: m.position)
        bo3 = (total - r) <= cfg["bo3RoundsLeft"]
        step = timedelta(minutes=cfg["bo3Minutes"] if bo3 else cfg["slotMinutes"])
        real = [m for m in ms if not m.bye]
        for m in ms:
            if m.bye:
                m.starts_at, m.lobby = None, None
        for i, m in enumerate(real):
            lobbies = max(int(cfg.get("lobbies") or 2), 1)
            m.starts_at = t + step * (i // lobbies)
            m.lobby = "ABCD"[(i % lobbies) % 4]
        t = t + step * ((len(real) + lobbies - 1) // lobbies)


def rounds_of(rows: list[ChallengeMatch]) -> int:
    return max((m.round for m in rows), default=-1) + 1


def best_of(ch: Challenge, rounds: int, m: ChallengeMatch) -> int:
    cfg = config(ch)
    return 3 if (rounds - m.round) <= cfg["bo3RoundsLeft"] else 1


def team_numbers(ch: Challenge, entries: list[ChallengeEntry]) -> dict:
    """One team number everywhere: 1..N in the order teams were confirmed (join order).
    Frozen at the draw, so a later refund never renumbers anyone."""
    frozen = ((ch.plan_config or {}).get("team") or {}).get("numbers") if ch.drawn_at else None
    if frozen:
        return {k: int(v) for k, v in frozen.items()}
    live = sorted((e for e in entries if e.status == "confirmed"), key=lambda e: e.position)
    return {str(e.id): i for i, e in enumerate(live, start=1)}


async def draw(db: AsyncSession, ch: Challenge, redo: bool = False, early_ok: bool = False) -> int:
    """Shuffle the paid teams into a bracket (byes for the empty spots) and set
    the match times. Done on Friday, before check-in, so it doesn't need anyone
    to be here. Can be redone until the first real result is in."""
    from app.services import challenge_day as day
    from sqlalchemy import delete

    locked = await svc.lock(db, ch.id)
    existing = await day.matches(db, ch.id)
    if not existing and not early_ok and signups_open(locked):
        await db.commit()
        raise TeamError("Sign-ups are still open. Drawing now closes them for everyone.", "SIGNUPS_OPEN", 409)
    if existing and not redo:
        await db.commit()
        raise TeamError("The draw is already made. Use “Draw again” to redo it.", "ALREADY_DRAWN", 409)
    if any(m.completed_at and not m.bye for m in existing):
        raise TeamError("Results are already in. The draw can't be redone now.", "RESULTS_IN")
    teams = [e for e in await team_entries(db, ch.id) if e.status == "confirmed"]
    ppl = await players(db, ch.id)
    empty = [e.name for e in teams if not any(p.entry_id == e.id and p.status == "active" for p in ppl)]
    if empty:
        await db.rollback()
        raise TeamError(f"These teams have no players: {', '.join(empty)}. Remove and refund them (Teams tab) before the draw.", "EMPTY_TEAM", 409)
    if len(teams) < 2:
        raise TeamError("At least 2 paid teams are needed for a draw.", "TOO_FEW")
    await db.execute(delete(ChallengeMatch).where(ChallengeMatch.challenge_id == ch.id))
    seed = secrets.randbits(32)
    import random as _random
    _random.Random(seed).shuffle(teams)
    plan = bracket.plan(len(teams), third_place=False)
    made = []
    for s in plan.matches:
        m = ChallengeMatch(
            challenge_id=ch.id, round=s.round, position=s.position, is_third_place=False,
            entry_a_id=teams[s.a].id if s.a is not None else None,
            entry_b_id=teams[s.b].id if s.b is not None else None, bye=s.bye,
        )
        if s.bye:
            m.winner_entry_id = m.entry_a_id or m.entry_b_id
            m.completed_at = now()
        made.append(m)
        db.add(m)
    for m in made:
        if m.bye:
            day._advance(made, m)
    schedule(locked, made)
    cfg_all = dict(locked.plan_config or {})
    team_cfg = dict(cfg_all.get("team") or {})
    team_cfg["drawSeed"] = seed
    numbers = {str(e.id): i for i, e in enumerate(sorted(teams, key=lambda e: e.position), start=1)}
    team_cfg["numbers"] = numbers
    cfg_all["team"] = team_cfg
    locked.plan_config = cfg_all
    locked.drawn_at = now()
    locked.status = "live"
    await db.commit()
    return len(teams)


async def set_match_time(db: AsyncSession, ch: Challenge, match_id: UUID, starts_at: Optional[datetime], lobby: Optional[str]) -> None:
    m = await db.get(ChallengeMatch, match_id)
    if m is None or m.challenge_id != ch.id:
        raise TeamError("No such match.", "MATCH_NOT_FOUND", 404)
    m.starts_at = _aware(starts_at)
    m.lobby = lobby if lobby in ("A", "B", "C", "D") else None
    await db.commit()


async def record_result(db: AsyncSession, ch: Challenge, match_id: UUID, winner: str, games: list[dict]) -> None:
    """Pick the winner and type the round scores: one game (10–7) or a best of 3
    (each game's score). The winner moves on to the next match."""
    from app.services import challenge_day as day

    rows = await day.matches(db, ch.id)
    m = next((x for x in rows if x.id == match_id), None)
    if m is None:
        raise TeamError("No such match.", "MATCH_NOT_FOUND", 404)
    bo = best_of(ch, rounds_of(rows), m)
    to = int(config(ch).get("gameTo") or 10)
    clean: list[dict] = []
    for g in games or []:
        a, b = g.get("a"), g.get("b")
        if a is None and b is None:
            continue
        if not (isinstance(a, int) and isinstance(b, int) and 0 <= a <= to and 0 <= b <= to and (a == to) != (b == to)):
            raise TeamError(f"Each game ends when one team wins {to} rounds, like {to}–{to - 3}.", "BAD_SCORE")
        clean.append({"a": a, "b": b})
    wins_a = sum(1 for g in clean if g["a"] == to)
    wins_b = sum(1 for g in clean if g["b"] == to)
    need = bo // 2 + 1
    if clean:
        if len(clean) > bo:
            raise TeamError(f"A best of {bo} has at most {bo} games.", "BAD_SCORE")
        w, l = (wins_a, wins_b) if winner == "a" else (wins_b, wins_a)
        if w != need or l >= need:
            raise TeamError(
                "The scores don't match the winner you picked." if bo == 1
                else "In a best of 3 the winner wins 2 games.", "BAD_SCORE")
    if bo == 1:
        score_a, score_b = (clean[0]["a"], clean[0]["b"]) if clean else (None, None)
    else:
        score_a, score_b = (wins_a, wins_b) if clean else (None, None)
    try:
        await _record_rounds(db, ch, match_id, winner, score_a, score_b)
    except day.DayError as e:
        raise TeamError(e.message, e.code)
    m = await db.get(ChallengeMatch, match_id)
    m.games = clean or None
    await db.commit()


async def _record_rounds(db: AsyncSession, ch: Challenge, match_id, winner, score_a, score_b) -> None:
    """A single game: the score is rounds (10–7), not games won, so the Tekken
    games check doesn't apply. Same bracket moves as challenge_day._record."""
    from app.services import challenge_day as day

    try:
        locked = await day._lock_live(db, ch.id)
        rows = await day.matches(db, locked.id)
        m = next((x for x in rows if x.id == match_id), None)
        if m is None:
            raise day.DayError("No such match.", "MATCH_NOT_FOUND")
        if m.bye:
            raise day.DayError("This one is a bye: the team goes through without playing.", "MATCH_IS_BYE")
        if m.entry_a_id is None or m.entry_b_id is None:
            raise day.DayError("Both teams aren't known yet.", "MATCH_NOT_READY")
        if day._downstream_decided(rows, m):
            raise day.DayError("The next match already has a result. Clear that one first.", "NEXT_MATCH_DECIDED")
        m.winner_entry_id = m.entry_a_id if winner == "a" else m.entry_b_id
        m.score_a, m.score_b = score_a, score_b
        m.completed_at = now()
        m.postponed_at = None
        day._advance(rows, m)
        await db.commit()
    except day.DayError:
        await db.rollback()
        raise


# ── Email ─────────────────────────────────────────────────────────────────


async def send_confirmation(db: AsyncSession, p: ChallengePayment) -> bool:
    """'You are in!' with the check-in QR and, for a captain, the invite link."""
    from app.services.challenge_day import qr_data_url  # noqa: F401  (QR goes as a link, not an inline image)
    from app.services.notification_service import NotificationService

    ch = await db.get(Challenge, p.challenge_id)
    user = await db.get(User, p.user_id)
    cafe = await db.get(Cafe, ch.cafe_id)
    me = await player_for(db, ch.id, p.user_id)
    if user is None or not user.email or me is None:
        return False
    base = settings.FRONTEND_URL.rstrip("/")
    page = f"{base}/challenge/{ch.slug}/me"
    entry = await svc.entry_for(db, ch.id, entry_id=me.entry_id) if me.entry_id else None
    invite = f"{base}/challenge/{ch.slug}/invite/{entry.invite_code}" if entry and entry.invite_code and me.role == "captain" else None
    qr = f"{base}/api/v1/challenges/{ch.slug}/players/{player_token(me.id)}/qr.png"
    when = _aware(ch.starts_at).astimezone(timezone(timedelta(hours=5, minutes=30)))
    e = html.escape
    lines = [
        f"<h1 style='margin:0 0 8px;font-size:24px;'>You are in!</h1>",
        f"<p style='margin:0 0 16px;font-size:15px;color:#3A3F4B;'>{e(ch.title)} · {when.strftime('%a, %d %b')} · {e(cafe.name)}</p>",
    ]
    if entry:
        lines.append(f"<p style='font-size:15px;'><b>Team:</b> {e(entry.name)}</p>")
    else:
        lines.append("<p style='font-size:15px;'>You signed up solo. We are finding your team and will tell you by WhatsApp.</p>")
    if invite:
        lines.append(
            f"<p style='font-size:15px;'><b>Send this link to your {config(ch)['size'] - 1} teammates.</b> They log in and fill their details. They don't pay.</p>"
            f"<p style='font-size:15px;'><a href='{invite}'>{invite}</a></p>"
        )
    lines.append(
        f"<p style='font-size:15px;'><b>Your check-in QR.</b> Show it at the XQZ desk on match day.</p>"
        f"<p><img src='{qr}' width='200' height='200' alt='Your check-in QR code'></p>"
        f"<p style='font-size:15px;'><a href='{page}'>Open My entry</a> to see your team, your QR and your match time.</p>"
        f"<p style='font-size:13px;color:#6A6F7C;'>Amount paid: Rs {int(Decimal(str(p.amount)))}. Payment ID {e(p.razorpay_payment_id or '')}.</p>"
        f"<p style='font-size:12px;color:#8A8F9C;'>This challenge is not made, run or supported by Riot Games.</p>"
    )
    body = "<div style='font-family:Arial,sans-serif;max-width:520px;'>" + "".join(lines) + "</div>"
    return await NotificationService()._send_resend_email(user.email, f"You are in: {ch.title}", body, f"CH-{str(p.id)[:8]}")
