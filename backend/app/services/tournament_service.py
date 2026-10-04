"""Tournaments: who may run them, registration, payment, check-in, bracket,
match calling, scores, results and the leaderboard.

Spec: docs/superpowers/specs/2026-10-05-tournaments-mvp-design.md. Bracket
maths live in tournament_bracket (pure); this module owns the database.
"""
from __future__ import annotations

import random
import secrets
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core import tournament_games as games
from app.core.exceptions import BadRequestException, ConflictException, ForbiddenException, NotFoundException
from app.core.logging import logger
from app.core.slug import slugify, unique_slug
from app.models.cafe import Cafe
from app.models.hardware_tier import HardwareTier
from app.models.tournament import Organiser, OrganiserMember, Tournament, TournamentEntry, TournamentMatch
from app.models.user import User
from app.services import razorpay_client
from app.services import tournament_bracket as tb

IST = timezone(timedelta(hours=5, minutes=30))
HOLD_MINUTES = 10
ACTIVE = ("held", "confirmed")
PUBLIC_STATUSES = ("published", "live", "completed", "cancelled")
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I
CHAMPION_BADGE = "champion"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def aware(d: Optional[datetime]) -> Optional[datetime]:
    if d is None:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


# ------------------------------------------------------------------ people

async def is_admin(db: AsyncSession, user: Optional[User]) -> bool:
    if not user:
        return False
    from app.api.deps import get_user_roles
    return "admin" in await get_user_roles(user.id, db)


async def _unique_organiser_slug(db: AsyncSession, name: str) -> str:
    base = slugify(name)[:70] or "organiser"
    taken = set((await db.execute(select(Organiser.slug).where(Organiser.slug.like(f"{base}%")))).scalars().all())
    return unique_slug(base, taken)


async def khelo_organiser(db: AsyncSession) -> Organiser:
    org = (await db.execute(select(Organiser).where(Organiser.kind == "khelo"))).scalars().first()
    if not org:
        org = Organiser(kind="khelo", name="KHEL-O", slug=await _unique_organiser_slug(db, "khel-o"))
        db.add(org)
        await db.commit()
        await db.refresh(org)
    return org


async def _staff_cafe_ids(db: AsyncSession, user: User) -> set:
    from app.models.user import UserRole
    from app.models.user_role import UserRoleMapping
    rows = (await db.execute(select(UserRoleMapping.cafe_id).where(
        UserRoleMapping.user_id == user.id, UserRoleMapping.role == UserRole.STAFF,
        UserRoleMapping.cafe_id.is_not(None)))).scalars().all()
    return set(rows)


async def ensure_cafe_organisers(db: AsyncSession, user: User) -> None:
    """A café owner runs tournaments as their café, and the café's staff help on
    the night: create that organiser (and membership) the first time they open
    the console."""
    owned = (await db.execute(select(Cafe).where(Cafe.owner_id == user.id, Cafe.is_lead_listing.is_(False)))).scalars().all()
    staff_ids = await _staff_cafe_ids(db, user) - {c.id for c in owned}
    staffed = (await db.execute(select(Cafe).where(Cafe.id.in_(staff_ids)))).scalars().all() if staff_ids else []
    changed = False
    for cafe in [*owned, *staffed]:
        org = (await db.execute(select(Organiser).where(Organiser.cafe_id == cafe.id))).scalars().first()
        if not org:
            org = Organiser(kind="cafe", name=cafe.name.strip(), cafe_id=cafe.id, slug=await _unique_organiser_slug(db, cafe.name))
            db.add(org)
            await db.flush()
            changed = True
        member = (await db.execute(select(OrganiserMember).where(
            OrganiserMember.organiser_id == org.id, OrganiserMember.user_id == user.id))).scalars().first()
        if not member:
            db.add(OrganiserMember(organiser_id=org.id, user_id=user.id, role="owner" if cafe.owner_id == user.id else "staff"))
            changed = True
    if changed:
        await db.commit()


async def my_organisers(db: AsyncSession, user: User) -> list[Organiser]:
    await ensure_cafe_organisers(db, user)
    if await is_admin(db, user):
        await khelo_organiser(db)
        return list((await db.execute(select(Organiser).order_by(Organiser.kind, Organiser.name))).scalars().all())
    return list((await db.execute(
        select(Organiser).join(OrganiserMember, OrganiserMember.organiser_id == Organiser.id)
        .where(OrganiserMember.user_id == user.id).order_by(Organiser.name)
    )).scalars().all())


async def require_manager(db: AsyncSession, user: User, organiser_id: UUID) -> Organiser:
    org = await db.get(Organiser, organiser_id)
    if not org:
        raise NotFoundException(message="Organiser not found", error_code="ORGANISER_NOT_FOUND")
    if await is_admin(db, user):
        return org
    member = (await db.execute(select(OrganiserMember).where(
        OrganiserMember.organiser_id == organiser_id, OrganiserMember.user_id == user.id))).scalars().first()
    if not member:
        raise ForbiddenException("You don't run tournaments for this organiser", error_code="NOT_ORGANISER")
    return org


async def venues_for(db: AsyncSession, user: User, organiser: Organiser) -> list[Cafe]:
    """Cafés this organiser may host at: a café organiser only at its own café;
    KHEL-O and companies at any bookable partner café."""
    if organiser.kind == "cafe":
        cafe = await db.get(Cafe, organiser.cafe_id)
        return [cafe] if cafe else []
    return list((await db.execute(
        select(Cafe).where(Cafe.is_active.is_(True), Cafe.is_lead_listing.is_(False)).order_by(Cafe.name)
    )).scalars().all())


# ------------------------------------------------------------------ capacity & reservations

def estimate(teams: int, stations: int, match_minutes: int, third_place: bool = False) -> dict:
    minutes = tb.estimate_minutes(teams, stations, match_minutes, third_place=third_place)
    return {
        "teams": teams,
        "minutes": minutes,
        "rounds": tb.rounds_for(teams) if teams >= 2 else 0,
        "fitsIn3h": tb.max_entrants_within(180, stations, match_minutes),
        "fitsIn4h": tb.max_entrants_within(240, stations, match_minutes),
    }


def _window(t: Tournament) -> tuple[datetime, datetime]:
    return aware(t.starts_at), aware(t.ends_at)


async def reservations_on(db: AsyncSession, tier_id: UUID, day: date) -> list[dict]:
    """Stations held by published/live tournaments on this setup on this IST day,
    clipped to the day, as booking-style slots: [{start, end, seats}] (IST times)."""
    day_start = datetime.combine(day, time(0, 0), tzinfo=IST)
    day_end = day_start + timedelta(days=1)
    rows = (await db.execute(select(Tournament).where(
        Tournament.hardware_tier_id == tier_id,
        Tournament.status.in_(("published", "live")),
        Tournament.starts_at < day_end.astimezone(timezone.utc),
        Tournament.ends_at > day_start.astimezone(timezone.utc),
    ))).scalars().all()
    out = []
    for t in rows:
        s, e = _window(t)
        s, e = max(s, day_start), min(e, day_end - timedelta(seconds=1))
        out.append({"start": s.astimezone(IST).time(), "end": e.astimezone(IST).time(), "seats": t.stations})
    return out


async def reserved_seats(db: AsyncSession, tier_id: UUID, day: date, start: time, end: time) -> int:
    return sum(r["seats"] for r in await reservations_on(db, tier_id, day) if r["start"] < end and r["end"] > start)


# ------------------------------------------------------------------ create / edit

EDITABLE = (
    "title", "game_key", "team_size", "third_place", "max_teams", "entry_fee", "starts_at", "check_in_minutes",
    "registration_closes_at", "match_minutes", "stations", "prizes", "sponsor_name", "sponsor_logo_url", "about",
    "rules", "cafe_id", "hardware_tier_id",
)


async def _taken(db: AsyncSession, tournament_id: UUID) -> int:
    await expire_holds(db, tournament_id)
    return int((await db.execute(select(func.count()).select_from(TournamentEntry).where(
        TournamentEntry.tournament_id == tournament_id, TournamentEntry.status.in_(ACTIVE)))).scalar_one())


async def _validate(db: AsyncSession, user: User, org: Organiser, t: Tournament, fresh: bool) -> None:
    if not (t.title or "").strip():
        raise BadRequestException(message="Give the tournament a name", error_code="TITLE_REQUIRED")
    if not (2 <= t.max_teams <= 256):
        raise BadRequestException(message="Players or teams must be between 2 and 256", error_code="BAD_MAX_TEAMS")
    if not (1 <= t.team_size <= 5):
        raise BadRequestException(message="Team size must be 1 to 5", error_code="BAD_TEAM_SIZE")
    if not (3 <= t.match_minutes <= 120):
        raise BadRequestException(message="Match length must be 3 to 120 minutes", error_code="BAD_MATCH_MINUTES")
    if float(t.entry_fee or 0) < 0 or float(t.entry_fee or 0) > 10000:
        raise BadRequestException(message="Entry fee must be between ₹0 and ₹10,000", error_code="BAD_FEE")
    if len(t.prizes or []) > 8:
        raise BadRequestException(message="Up to 8 prize rows", error_code="TOO_MANY_PRIZES")
    venues = {c.id: c for c in await venues_for(db, user, org)}
    if t.cafe_id not in venues:
        raise ForbiddenException("This organiser can't host at that café", error_code="BAD_VENUE")
    if t.hardware_tier_id:
        tier = await db.get(HardwareTier, t.hardware_tier_id)
        if not tier or tier.cafe_id != t.cafe_id:
            raise BadRequestException(message="Pick a setup from this café", error_code="BAD_TIER")
        seats = tier.app_bookable_seats or tier.total_seats or 0
        if seats and t.stations > seats:
            raise BadRequestException(message=f"{tier.name} has only {seats} stations", error_code="TOO_MANY_STATIONS")
    if t.stations < 1:
        raise BadRequestException(message="Use at least one station", error_code="BAD_STATIONS")
    starts, closes = aware(t.starts_at), aware(t.registration_closes_at)
    if fresh and starts <= now_utc():
        raise BadRequestException(message="The start time has to be in the future", error_code="START_IN_PAST")
    if closes > starts:
        raise BadRequestException(message="Registration must close before the start", error_code="BAD_CLOSE_TIME")
    if t.id:
        taken = await _taken(db, t.id)
        if taken > t.max_teams:
            raise BadRequestException(message=f"{taken} are already registered; capacity can't go below that",
                                      error_code="CAPACITY_BELOW_ENTRIES")


def _set_ends(t: Tournament) -> None:
    mins = tb.estimate_minutes(t.max_teams, t.stations, t.match_minutes, third_place=t.third_place)
    t.ends_at = aware(t.starts_at) + timedelta(minutes=max(60, mins + 30))


def _apply(t: Tournament, data: dict) -> None:
    clearable = ("sponsor_name", "sponsor_logo_url", "about", "hardware_tier_id")
    for k in EDITABLE:
        if k in data and (data[k] is not None or k in clearable):
            setattr(t, k, data[k])
    g = games.game(t.game_key)
    t.game_name = g["name"] if t.game_key != "custom" else (data.get("game_name") or t.game_name or g["name"])
    if not t.registration_closes_at and t.starts_at:
        t.registration_closes_at = aware(t.starts_at) - timedelta(hours=1)


async def create(db: AsyncSession, user: User, organiser_id: UUID, data: dict) -> Tournament:
    org = await require_manager(db, user, organiser_id)
    g = games.game(data.get("game_key") or "custom")
    t = Tournament(
        organiser_id=org.id, status="draft", created_by=user.id,
        team_size=g["team_size"], match_minutes=g["match_minutes"], rules=g["rules"],
        third_place=False, check_in_minutes=30, entry_fee=0, prizes=[], stations=1,
        game_key=data.get("game_key") or "custom", game_name=g["name"], max_teams=16,
    )
    _apply(t, data)
    await _validate(db, user, org, t, fresh=True)
    _set_ends(t)
    base = slugify(f"{t.title} {aware(t.starts_at).astimezone(IST):%d %b}")[:100]
    taken = set((await db.execute(select(Tournament.slug).where(Tournament.slug.like(f"{base}%")))).scalars().all())
    t.slug = unique_slug(base, taken)
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


async def get_for_manager(db: AsyncSession, user: User, tournament_id: UUID) -> tuple[Tournament, Organiser]:
    t = await db.get(Tournament, tournament_id)
    if not t:
        raise NotFoundException(message="Tournament not found", error_code="TOURNAMENT_NOT_FOUND")
    return t, await require_manager(db, user, t.organiser_id)


async def update(db: AsyncSession, user: User, tournament_id: UUID, data: dict) -> Tournament:
    t, org = await get_for_manager(db, user, tournament_id)
    if t.status in ("live", "completed", "cancelled"):
        raise BadRequestException(message="This tournament can't be edited any more", error_code="LOCKED")
    _apply(t, data)
    await _validate(db, user, org, t, fresh=t.status == "draft")
    _set_ends(t)
    await db.commit()
    await db.refresh(t)
    return t


async def publish(db: AsyncSession, user: User, tournament_id: UUID) -> Tournament:
    t, org = await get_for_manager(db, user, tournament_id)
    if t.status != "draft":
        raise BadRequestException(message="Already published", error_code="NOT_DRAFT")
    await _validate(db, user, org, t, fresh=True)
    t.status, t.published_at = "published", now_utc()
    await db.commit()
    await db.refresh(t)
    return t


async def close_registration(db: AsyncSession, user: User, tournament_id: UUID) -> Tournament:
    t, _ = await get_for_manager(db, user, tournament_id)
    if t.status != "published":
        raise BadRequestException(message="Registration isn't open", error_code="NOT_OPEN")
    t.registration_closes_at = min(aware(t.registration_closes_at), now_utc())
    await db.commit()
    return t


async def cancel(db: AsyncSession, user: User, tournament_id: UUID, reason: str = "") -> Tournament:
    t, _ = await get_for_manager(db, user, tournament_id)
    if t.status in ("completed", "cancelled"):
        raise BadRequestException(message="This tournament is already over", error_code="OVER")
    was_public = t.status != "draft"
    t.status = "cancelled"
    entries = (await db.execute(select(TournamentEntry).where(
        TournamentEntry.tournament_id == t.id, TournamentEntry.status.in_(("held", "confirmed", "waitlist"))))).scalars().all()
    for e in entries:
        if e.paid_at:
            e.refund_due = True
        e.status = "cancelled"
    await db.commit()
    if was_public:
        why = f" Reason: {reason.strip()}" if reason.strip() else ""
        await notify(db, t, entries, f"{t.title} is cancelled",
                     f"The organiser cancelled {t.title}.{why} Paid entries will be refunded.", email=True)
    return t


# ------------------------------------------------------------------ registration

async def expire_holds(db: AsyncSession, tournament_id: UUID) -> None:
    held = (await db.execute(select(TournamentEntry).where(
        TournamentEntry.tournament_id == tournament_id, TournamentEntry.status == "held"))).scalars().all()
    stale = [e for e in held if e.hold_expires_at and aware(e.hold_expires_at) < now_utc()]
    for e in stale:
        e.status = "cancelled"
    if stale:
        await db.commit()


async def _new_code(db: AsyncSession, tournament_id: UUID) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        clash = (await db.execute(select(TournamentEntry.id).where(
            TournamentEntry.tournament_id == tournament_id, TournamentEntry.check_in_code == code))).first()
        if not clash:
            return code
    raise ConflictException(message="Please try again", error_code="CODE_CLASH")


def registration_open(t: Tournament) -> bool:
    return t.status == "published" and now_utc() < aware(t.registration_closes_at)


async def my_entry(db: AsyncSession, t: Tournament, user: Optional[User]) -> Optional[TournamentEntry]:
    if not user:
        return None
    await expire_holds(db, t.id)
    rows = (await db.execute(select(TournamentEntry).where(
        TournamentEntry.tournament_id == t.id, TournamentEntry.user_id == user.id,
        TournamentEntry.status.in_(("held", "confirmed", "waitlist")),
    ).order_by(TournamentEntry.created_at.desc()))).scalars().all()
    return rows[0] if rows else None


async def get_public(db: AsyncSession, slug: str) -> Tournament:
    t = (await db.execute(select(Tournament).where(Tournament.slug == slug))).scalars().first()
    if not t or t.status not in PUBLIC_STATUSES:
        raise NotFoundException(message="Tournament not found", error_code="TOURNAMENT_NOT_FOUND")
    return t


async def register(db: AsyncSession, user: User, t: Tournament, gamer_tag: str, phone: Optional[str],
                   team_name: Optional[str], teammates: list[str]) -> dict:
    if not registration_open(t):
        raise BadRequestException(message="Registration is closed", error_code="REGISTRATION_CLOSED")
    gamer_tag = (gamer_tag or "").strip()[:40]
    if len(gamer_tag) < 2:
        raise BadRequestException(message="Add your gamer tag", error_code="TAG_REQUIRED")
    mates = [m.strip()[:40] for m in (teammates or []) if m and m.strip()]
    if t.team_size > 1:
        if not (team_name or "").strip():
            raise BadRequestException(message="Add a team name", error_code="TEAM_NAME_REQUIRED")
        if len(mates) != t.team_size - 1:
            raise BadRequestException(message=f"Add your {t.team_size - 1} teammates' names", error_code="TEAMMATES_REQUIRED")

    existing = await my_entry(db, t, user)
    if existing and existing.status in ("held", "confirmed"):
        return await _entry_payload(db, t, existing)

    full = await _taken(db, t.id) >= t.max_teams
    fee = float(t.entry_fee or 0)
    e = existing or TournamentEntry(tournament_id=t.id, user_id=user.id, check_in_code=await _new_code(db, t.id), status="waitlist")
    e.gamer_tag, e.phone = gamer_tag, (phone or "").strip()[:20] or None
    e.team_name = (team_name or "").strip()[:60] or None
    e.teammates = mates
    if full:
        e.status = "waitlist"
    elif fee > 0:
        e.status, e.amount = "held", fee
        e.hold_expires_at = now_utc() + timedelta(minutes=HOLD_MINUTES)
    else:
        e.status, e.amount = "confirmed", 0
    if not existing:
        db.add(e)
    await db.commit()
    await db.refresh(e)

    if e.status == "held":
        e.razorpay_order_id = razorpay_client.create_order(fee, receipt=f"T{e.check_in_code}{secrets.token_hex(2)}",
                                                           notes={"tournament": t.slug, "entry": str(e.id)})
        await db.commit()
    elif e.status == "confirmed":
        await _on_confirmed(db, t, e)
    return await _entry_payload(db, t, e)


async def _confirm_paid(db: AsyncSession, t: Tournament, e: TournamentEntry, payment_id: str) -> None:
    if e.status == "confirmed":
        return
    e.razorpay_payment_id, e.paid_at = payment_id, now_utc()
    held_alive = e.status == "held" and e.hold_expires_at and aware(e.hold_expires_at) >= now_utc()
    if held_alive or await _taken(db, t.id) < t.max_teams:
        e.status, e.hold_expires_at = "confirmed", None
        await db.commit()
        await _on_confirmed(db, t, e)
    else:
        # Paid after the hold ran out and the last spot went to someone else.
        e.status, e.refund_due = "cancelled", True
        await db.commit()
        await notify(db, t, [e], "Spot taken while you paid",
                     f"The last spot in {t.title} went while your payment was finishing. Your ₹{float(e.amount):.0f} will be refunded.",
                     email=True)


async def verify_payment(db: AsyncSession, user: User, t: Tournament, entry_id: UUID, order_id: str,
                         payment_id: str, signature: str) -> dict:
    e = await db.get(TournamentEntry, entry_id)
    if not e or e.tournament_id != t.id or e.user_id != user.id or e.razorpay_order_id != order_id:
        raise NotFoundException(message="Entry not found", error_code="ENTRY_NOT_FOUND")
    if not razorpay_client.signature_ok(order_id, payment_id, signature):
        raise BadRequestException(message="Payment could not be verified", error_code="BAD_SIGNATURE")
    await _confirm_paid(db, t, e, payment_id)
    await db.refresh(e)
    return await _entry_payload(db, t, e)


async def confirm_from_webhook(db: AsyncSession, order_id: str, payment_id: str) -> bool:
    """Razorpay's payment.captured for an order that isn't a booking."""
    e = (await db.execute(select(TournamentEntry).where(TournamentEntry.razorpay_order_id == order_id))).scalars().first()
    if not e:
        return False
    t = await db.get(Tournament, e.tournament_id)
    await _confirm_paid(db, t, e, payment_id)
    return True


async def cancel_entry(db: AsyncSession, user: User, t: Tournament) -> None:
    e = await my_entry(db, t, user)
    if not e:
        raise NotFoundException(message="You aren't registered", error_code="ENTRY_NOT_FOUND")
    if e.paid_at:
        raise BadRequestException(message="Paid entries are refunded only if the organiser cancels the event",
                                  error_code="PAID_ENTRY")
    if t.status == "live" and e.status == "confirmed":
        raise BadRequestException(message="The tournament has started", error_code="STARTED")
    freed = e.status == "confirmed"
    e.status = "cancelled"
    await db.commit()
    if freed:
        await _spot_opened(db, t)


async def _spot_opened(db: AsyncSession, t: Tournament) -> None:
    if not registration_open(t):
        return
    waiting = (await db.execute(select(TournamentEntry).where(
        TournamentEntry.tournament_id == t.id, TournamentEntry.status == "waitlist"))).scalars().all()
    if waiting:
        await notify(db, t, waiting, "A spot just opened",
                     f"A spot opened in {t.title}. First to register gets it.", email=True)


async def _on_confirmed(db: AsyncSession, t: Tournament, e: TournamentEntry) -> None:
    when = aware(t.starts_at).astimezone(IST)
    await notify(db, t, [e], f"You're in: {t.title}",
                 f"{when:%a %d %b, %I:%M %p}. Check in at the café from {t.check_in_minutes} minutes before. "
                 f"Your check-in code is {e.check_in_code}.", email=True)


# ------------------------------------------------------------------ notifications

async def notify(db: AsyncSession, t: Tournament, entries: Iterable[TournamentEntry], title: str, message: str,
                 email: bool = False, link_suffix: str = "/pass") -> None:
    """In-app + push (+ email) to the players behind these entries. Never raises."""
    from app.models.notification import Notification
    from app.services.notification_service import NotificationService
    from app.services.push_service import PushService

    user_ids = list({e.user_id for e in entries if e.user_id})
    if not user_ids:
        return
    link = f"/tournaments/{t.slug}{link_suffix}"
    try:
        for uid in user_ids:
            db.add(Notification(user_id=uid, title=title[:200], message=message, notification_type="system",
                                is_read=False, link=link))
        await db.commit()
    except Exception as ex:  # pragma: no cover
        await db.rollback()
        logger.warning("tournament_notify_failed", error=str(ex))
    try:
        await PushService().send_to_users(db, user_ids, {"title": title, "body": message, "url": link})
    except Exception:  # pragma: no cover
        pass
    if email:
        users = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
        svc = NotificationService()
        for u in users:
            try:
                await svc.send_tournament_update(u.email, u.full_name, title, title, [message],
                                                 f"{settings.FRONTEND_URL}{link}", "Open your pass")
            except Exception:  # pragma: no cover
                pass


# ------------------------------------------------------------------ door: check-in, walk-ins, removals

async def entries_of(db: AsyncSession, tournament_id: UUID, statuses: Iterable[str] | None = None) -> list[TournamentEntry]:
    q = select(TournamentEntry).where(TournamentEntry.tournament_id == tournament_id)
    if statuses:
        q = q.where(TournamentEntry.status.in_(tuple(statuses)))
    return list((await db.execute(q.order_by(TournamentEntry.created_at))).scalars().all())


async def check_in(db: AsyncSession, user: User, tournament_id: UUID, code: Optional[str], entry_id: Optional[UUID],
                   undo: bool = False) -> TournamentEntry:
    t, _ = await get_for_manager(db, user, tournament_id)
    if entry_id:
        e = await db.get(TournamentEntry, entry_id)
    else:
        clean = (code or "").strip().upper().replace(" ", "")
        e = (await db.execute(select(TournamentEntry).where(
            TournamentEntry.tournament_id == t.id, TournamentEntry.check_in_code == clean))).scalars().first()
    if not e or e.tournament_id != t.id:
        raise NotFoundException(message="No entry with that code", error_code="ENTRY_NOT_FOUND")
    if e.status != "confirmed":
        raise BadRequestException(message=f"This entry is {e.status}, not confirmed", error_code="NOT_CONFIRMED")
    e.checked_in_at = None if undo else (e.checked_in_at or now_utc())
    await db.commit()
    return e


async def add_walk_in(db: AsyncSession, user: User, tournament_id: UUID, gamer_tag: str, phone: Optional[str],
                      team_name: Optional[str], paid_at_counter: bool) -> TournamentEntry:
    t, _ = await get_for_manager(db, user, tournament_id)
    if t.status not in ("published", "live"):
        raise BadRequestException(message="Publish the tournament first", error_code="NOT_PUBLISHED")
    if await _taken(db, t.id) >= t.max_teams:
        raise BadRequestException(message="The tournament is full. Raise the capacity first.", error_code="FULL")
    if not (gamer_tag or "").strip():
        raise BadRequestException(message="Add a name", error_code="TAG_REQUIRED")
    e = TournamentEntry(
        tournament_id=t.id, gamer_tag=gamer_tag.strip()[:40], phone=(phone or "").strip()[:20] or None,
        team_name=(team_name or "").strip()[:60] or None, teammates=[], status="confirmed", source="walk_in",
        check_in_code=await _new_code(db, t.id), checked_in_at=now_utc(),
        amount=float(t.entry_fee or 0) if paid_at_counter else 0,
    )
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return e


async def remove_entry(db: AsyncSession, user: User, tournament_id: UUID, entry_id: UUID) -> TournamentEntry:
    t, _ = await get_for_manager(db, user, tournament_id)
    e = await db.get(TournamentEntry, entry_id)
    if not e or e.tournament_id != t.id:
        raise NotFoundException(message="Entry not found", error_code="ENTRY_NOT_FOUND")
    if e.seed is not None and t.status == "live":
        raise BadRequestException(message="This player is in the bracket. Give their match a walkover instead.",
                                  error_code="IN_BRACKET")
    freed = e.status == "confirmed"
    e.status = "removed"
    if e.paid_at:
        e.refund_due = True
    await db.commit()
    if freed:
        await _spot_opened(db, t)
    return e


# ------------------------------------------------------------------ bracket

async def matches_of(db: AsyncSession, tournament_id: UUID) -> list[TournamentMatch]:
    return list((await db.execute(select(TournamentMatch).where(TournamentMatch.tournament_id == tournament_id)
                                  .order_by(TournamentMatch.round, TournamentMatch.is_third_place, TournamentMatch.position))).scalars().all())


async def generate_bracket(db: AsyncSession, user: User, tournament_id: UUID, seeding: str = "random") -> list[TournamentMatch]:
    t, _ = await get_for_manager(db, user, tournament_id)
    if t.status not in ("published", "live"):
        raise BadRequestException(message="Publish the tournament first", error_code="NOT_PUBLISHED")
    existing = await matches_of(db, t.id)
    if any(m.status == "done" and not _is_bye(m) for m in existing) or any(m.status == "called" for m in existing):
        raise BadRequestException(message="Matches have started; the bracket can't be redrawn", error_code="BRACKET_STARTED")
    players = [e for e in await entries_of(db, t.id, ["confirmed"]) if e.checked_in_at]
    if len(players) < 2:
        raise BadRequestException(message="Check in at least 2 players first", error_code="TOO_FEW_PLAYERS")
    for m in existing:
        await db.delete(m)
    for e in await entries_of(db, t.id):
        e.seed = None
    if seeding == "random":
        random.shuffle(players)
    else:  # check-in order
        players.sort(key=lambda e: aware(e.checked_in_at))
    for i, e in enumerate(players):
        e.seed = i + 1
    plan = tb.plan(len(players), third_place=t.third_place)
    rows: dict[tuple[int, int, bool], TournamentMatch] = {}
    for s in plan.matches:
        m = TournamentMatch(tournament_id=t.id, round=s.round, position=s.position, is_third_place=s.is_third_place,
                            entry_a_id=players[s.a].id if s.a is not None else None,
                            entry_b_id=players[s.b].id if s.b is not None else None, status="waiting")
        db.add(m)
        rows[(s.round, s.position, s.is_third_place)] = m
    await db.flush()
    for s in plan.matches:
        m = rows[(s.round, s.position, s.is_third_place)]
        if s.bye:
            m.winner_entry_id = m.entry_a_id or m.entry_b_id
            m.status, m.walkover, m.completed_at = "done", True, now_utc()
            _advance(rows, plan.rounds, m)
    for m in rows.values():
        _refresh_ready(m)
    t.status = "live"
    await db.commit()
    return await matches_of(db, t.id)


def _is_bye(m: TournamentMatch) -> bool:
    return m.round == 0 and m.walkover and (m.entry_a_id is None or m.entry_b_id is None)


def _refresh_ready(m: TournamentMatch) -> None:
    if m.status == "waiting" and m.entry_a_id and m.entry_b_id:
        m.status = "ready"


def _advance(rows: dict, rounds: int, m: TournamentMatch, previous_winner: Optional[UUID] = None) -> None:
    """Put m's winner into the next match (and, from a semi, the loser into the 3rd-place match)."""
    if m.is_third_place or m.round >= rounds - 1:
        return
    nr, np_, side = tb.next_slot(m.round, m.position)
    nxt = rows.get((nr, np_, False))
    if nxt:
        setattr(nxt, f"entry_{side}_id", m.winner_entry_id)
        _refresh_ready(nxt)
    if m.round == rounds - 2:  # semi-final → 3rd-place match gets the loser
        third = rows.get((rounds - 1, 1, True))
        if third:
            loser = m.entry_b_id if m.winner_entry_id == m.entry_a_id else m.entry_a_id
            setattr(third, f"entry_{side}_id", loser)
            _refresh_ready(third)


async def _rows(db: AsyncSession, tournament_id: UUID) -> tuple[dict, int]:
    ms = await matches_of(db, tournament_id)
    rounds = max((m.round for m in ms), default=0) + 1
    return {(m.round, m.position, m.is_third_place): m for m in ms}, rounds


async def call_match(db: AsyncSession, user: User, tournament_id: UUID, match_id: UUID, station: Optional[int]) -> TournamentMatch:
    t, _ = await get_for_manager(db, user, tournament_id)
    m = await db.get(TournamentMatch, match_id)
    if not m or m.tournament_id != t.id:
        raise NotFoundException(message="Match not found", error_code="MATCH_NOT_FOUND")
    if m.status not in ("ready", "called"):
        raise BadRequestException(message="Both players aren't known yet", error_code="NOT_READY")
    if station is not None and not (1 <= station <= t.stations):
        raise BadRequestException(message=f"Pick a station from 1 to {t.stations}", error_code="BAD_STATION")
    m.status, m.station, m.called_at = "called", station, now_utc()
    await db.commit()
    entries = [e for e in [await db.get(TournamentEntry, m.entry_a_id), await db.get(TournamentEntry, m.entry_b_id)] if e]
    where = f" at station {station}" if station else ""
    names = " vs ".join(display_name(e) for e in entries)
    await notify(db, t, entries, "Your match is up", f"{names}: head to the {t.game_name} setup{where} now.")
    return m


async def report_score(db: AsyncSession, user: User, tournament_id: UUID, match_id: UUID,
                       score_a: Optional[int], score_b: Optional[int], walkover_winner: Optional[str]) -> TournamentMatch:
    t, _ = await get_for_manager(db, user, tournament_id)
    m = await db.get(TournamentMatch, match_id)
    if not m or m.tournament_id != t.id:
        raise NotFoundException(message="Match not found", error_code="MATCH_NOT_FOUND")
    if not (m.entry_a_id and m.entry_b_id):
        raise BadRequestException(message="Both players aren't known yet", error_code="NOT_READY")
    if walkover_winner in ("a", "b"):
        winner, m.walkover, m.score_a, m.score_b = getattr(m, f"entry_{walkover_winner}_id"), True, None, None
    else:
        if score_a is None or score_b is None or score_a < 0 or score_b < 0:
            raise BadRequestException(message="Enter both scores", error_code="SCORES_REQUIRED")
        if score_a == score_b:
            raise BadRequestException(message="No draws in a knockout: play extra time or penalties", error_code="DRAW")
        winner, m.walkover, m.score_a, m.score_b = (m.entry_a_id if score_a > score_b else m.entry_b_id), False, score_a, score_b

    rows, rounds = await _rows(db, t.id)
    if m.status == "done" and m.winner_entry_id != winner:
        # Correcting a result: only while the matches it feeds haven't been played.
        if not m.is_third_place and m.round < rounds - 1:
            nr, np_, _ = tb.next_slot(m.round, m.position)
            nxt = rows.get((nr, np_, False))
            third = rows.get((rounds - 1, 1, True)) if m.round == rounds - 2 else None
            if (nxt and nxt.status in ("called", "done")) or (third and third.status in ("called", "done")):
                raise BadRequestException(message="The next match already started; this result is locked",
                                          error_code="RESULT_LOCKED")
            for x in (nxt, third):
                if x:
                    x.status = "waiting"
    m.winner_entry_id, m.status, m.completed_at = winner, "done", now_utc()
    _advance(rows, rounds, m)
    await db.commit()
    await _maybe_complete(db, t)
    return m


async def _maybe_complete(db: AsyncSession, t: Tournament) -> None:
    rows, rounds = await _rows(db, t.id)
    final = rows.get((rounds - 1, 0, False))
    third = rows.get((rounds - 1, 1, True))
    if not final or final.status != "done" or (third and third.status != "done"):
        return
    entries = {e.id: e for e in await entries_of(db, t.id)}
    size = 1 << rounds
    for m in rows.values():
        if m.status != "done" or _is_bye(m):
            continue
        loser = m.entry_b_id if m.winner_entry_id == m.entry_a_id else m.entry_a_id
        if m.is_third_place:
            entries[m.winner_entry_id].final_place = 3
            entries[loser].final_place = 4
        elif m.round == rounds - 1:
            entries[m.winner_entry_id].final_place = 1
            entries[loser].final_place = 2
        elif loser in entries and entries[loser].final_place is None:
            entries[loser].final_place = (size >> (m.round + 1)) + 1
    for e in entries.values():
        if e.seed is not None:
            e.points = tb.points_for(e.final_place)
    t.status, t.completed_at = "completed", now_utc()
    await db.commit()

    champ = entries[final.winner_entry_id]
    if champ.user_id:
        from app.repositories.promotion_repository import PromotionRepository
        try:
            await PromotionRepository(db).grant_badge(champ.user_id, CHAMPION_BADGE, None)
        except Exception as ex:  # pragma: no cover
            logger.warning("champion_badge_failed", error=str(ex))
    placed = [e for e in entries.values() if e.seed is not None]
    await notify(db, t, placed, f"Results: {t.title}",
                 f"{display_name(champ)} won {t.title}. See the full bracket and your points.", link_suffix="")


# ------------------------------------------------------------------ reading

def display_name(e: Optional[TournamentEntry]) -> str:
    if not e:
        return "TBD"
    return e.team_name or e.gamer_tag


def phase(t: Tournament, taken: int) -> str:
    """What a player should see on the card."""
    if t.status in ("draft", "live", "completed", "cancelled"):
        return t.status
    if not registration_open(t):
        return "closed"
    if taken >= t.max_teams:
        return "full"
    if taken >= 0.75 * t.max_teams:
        return "filling"
    return "open"


async def card(db: AsyncSession, t: Tournament, cafe: Optional[Cafe] = None, org: Optional[Organiser] = None,
               counts: Optional[dict] = None) -> dict:
    cafe = cafe or await db.get(Cafe, t.cafe_id)
    org = org or await db.get(Organiser, t.organiser_id)
    if counts is None:
        taken = await _taken(db, t.id)
        waitlist = int((await db.execute(select(func.count()).select_from(TournamentEntry).where(
            TournamentEntry.tournament_id == t.id, TournamentEntry.status == "waitlist"))).scalar_one())
    else:
        taken, waitlist = counts.get("taken", 0), counts.get("waitlist", 0)
    g = games.game(t.game_key)
    starts = aware(t.starts_at)
    return {
        "id": str(t.id), "slug": t.slug, "title": t.title, "status": t.status, "phase": phase(t, taken),
        "game": {"key": t.game_key, "name": t.game_name, "short": g["short"] if t.game_key != "custom" else t.game_name,
                 "colour": g["colour"], "platform": g["platform"]},
        "startsAt": starts.isoformat(), "endsAt": aware(t.ends_at).isoformat(),
        "checkInOpensAt": (starts - timedelta(minutes=t.check_in_minutes)).isoformat(),
        "registrationClosesAt": aware(t.registration_closes_at).isoformat(),
        "teamSize": t.team_size, "maxTeams": t.max_teams, "taken": taken, "spotsLeft": max(0, t.max_teams - taken),
        "waitlist": waitlist, "entryFee": float(t.entry_fee or 0), "prizes": t.prizes or [],
        "sponsor": {"name": t.sponsor_name, "logoUrl": t.sponsor_logo_url} if t.sponsor_name else None,
        "matchMinutes": t.match_minutes, "stations": t.stations, "thirdPlace": t.third_place, "format": t.format,
        "cafe": {
            "id": str(cafe.id), "name": cafe.name.strip(), "slug": cafe.slug, "city": cafe.city,
            "address": ", ".join(p for p in [cafe.address_line1, cafe.address_line2] if p),
            "mapsUrl": cafe.google_maps_url,
        } if cafe else None,
        "organiser": {"id": str(org.id), "name": org.name, "kind": org.kind, "logoUrl": org.logo_url} if org else None,
    }


async def list_public(db: AsyncSession, game: Optional[str] = None, city: Optional[str] = None,
                      past: bool = False, limit: int = 40) -> list[dict]:
    q = select(Tournament, Cafe, Organiser).join(Cafe, Cafe.id == Tournament.cafe_id).join(Organiser, Organiser.id == Tournament.organiser_id)
    if past:
        q = q.where(Tournament.status.in_(("completed",))).order_by(Tournament.starts_at.desc())
    else:
        q = q.where(Tournament.status.in_(("published", "live"))).order_by(Tournament.starts_at)
    if game:
        q = q.where(Tournament.game_key == game)
    if city:
        q = q.where(func.lower(Cafe.city) == city.strip().lower())
    rows = (await db.execute(q.limit(limit))).all()
    ids = [t.id for t, _, _ in rows]
    counts: dict = defaultdict(lambda: {"taken": 0, "waitlist": 0})
    if ids:
        for tid, status, n in (await db.execute(
            select(TournamentEntry.tournament_id, TournamentEntry.status, func.count())
            .where(TournamentEntry.tournament_id.in_(ids), TournamentEntry.status.in_(("held", "confirmed", "waitlist")),
                   (TournamentEntry.status != "held") | (TournamentEntry.hold_expires_at > now_utc()))
            .group_by(TournamentEntry.tournament_id, TournamentEntry.status)
        )).all():
            counts[tid]["waitlist" if status == "waitlist" else "taken"] += n
    return [await card(db, t, c, o, counts[t.id]) for t, c, o in rows]


def _entry_brief(e: TournamentEntry) -> dict:
    return {"id": str(e.id), "name": display_name(e), "gamerTag": e.gamer_tag, "teamName": e.team_name,
            "seed": e.seed, "place": e.final_place, "points": e.points, "checkedIn": bool(e.checked_in_at)}


async def bracket(db: AsyncSession, t: Tournament) -> dict:
    ms = await matches_of(db, t.id)
    if not ms:
        return {"rounds": [], "thirdPlace": None, "nowPlaying": [], "upNext": []}
    entries = {e.id: e for e in await entries_of(db, t.id)}
    rounds = max(m.round for m in ms) + 1

    def side(eid):
        e = entries.get(eid)
        return {"entryId": str(eid), "name": display_name(e), "seed": e.seed if e else None} if eid else None

    def mrow(m: TournamentMatch) -> dict:
        return {"id": str(m.id), "round": m.round, "position": m.position, "name": tb.round_name(m.round, rounds, m.is_third_place),
                "a": side(m.entry_a_id), "b": side(m.entry_b_id), "scoreA": m.score_a, "scoreB": m.score_b,
                "winner": str(m.winner_entry_id) if m.winner_entry_id else None, "status": m.status,
                "walkover": m.walkover, "bye": _is_bye(m), "station": m.station,
                "calledAt": aware(m.called_at).isoformat() if m.called_at else None}

    out_rounds = []
    for r in range(rounds):
        out_rounds.append({"round": r, "name": tb.round_name(r, rounds),
                           "matches": [mrow(m) for m in ms if m.round == r and not m.is_third_place]})
    third = next((mrow(m) for m in ms if m.is_third_place), None)
    now_playing = [mrow(m) for m in ms if m.status == "called"]
    up_next = [mrow(m) for m in ms if m.status == "ready"]
    up_next.sort(key=lambda x: (x["round"], x["position"]))
    return {"rounds": out_rounds, "thirdPlace": third, "nowPlaying": now_playing, "upNext": up_next[:8]}


async def detail(db: AsyncSession, t: Tournament, user: Optional[User]) -> dict:
    data = await card(db, t)
    data["about"], data["rules"], data["houseRules"] = t.about, t.rules, games.HOUSE_RULES
    confirmed = await entries_of(db, t.id, ["confirmed"])
    data["players"] = [_entry_brief(e) for e in confirmed]
    data["bracket"] = await bracket(db, t)
    data["results"] = sorted([_entry_brief(e) for e in confirmed if e.final_place], key=lambda x: x["place"])
    mine = await my_entry(db, t, user)
    data["myEntry"] = await _entry_payload(db, t, mine) if mine else None
    data["registrationOpen"] = registration_open(t)
    return data


async def _entry_payload(db: AsyncSession, t: Tournament, e: TournamentEntry) -> dict:
    out = {
        "id": str(e.id), "status": e.status, "gamerTag": e.gamer_tag, "teamName": e.team_name, "teammates": e.teammates or [],
        "phone": e.phone, "code": e.check_in_code if e.status == "confirmed" else None,
        "checkedIn": bool(e.checked_in_at), "amount": float(e.amount or 0), "paid": bool(e.paid_at),
        "holdExpiresAt": aware(e.hold_expires_at).isoformat() if e.hold_expires_at else None,
        "place": e.final_place, "points": e.points, "refundDue": e.refund_due, "seed": e.seed,
        "entryNumber": None, "nextMatch": None, "payment": None,
    }
    if e.status == "held" and e.razorpay_order_id:
        out["payment"] = {"orderId": e.razorpay_order_id, "amount": float(e.amount), "currency": "INR",
                          "keyId": razorpay_client.public_key()}
    if e.status == "confirmed":
        order = [x.id for x in await entries_of(db, t.id, ["confirmed"])]
        out["entryNumber"] = order.index(e.id) + 1 if e.id in order else None
        for m in await matches_of(db, t.id):
            if m.status in ("ready", "called") and e.id in (m.entry_a_id, m.entry_b_id):
                opp_id = m.entry_b_id if m.entry_a_id == e.id else m.entry_a_id
                rounds = max(x.round for x in await matches_of(db, t.id)) + 1
                out["nextMatch"] = {"opponent": display_name(await db.get(TournamentEntry, opp_id)), "status": m.status,
                                    "station": m.station, "round": tb.round_name(m.round, rounds, m.is_third_place)}
                break
    return out


async def my_passes(db: AsyncSession, user: User) -> list[dict]:
    rows = (await db.execute(
        select(TournamentEntry, Tournament).join(Tournament, Tournament.id == TournamentEntry.tournament_id)
        .where(TournamentEntry.user_id == user.id, TournamentEntry.status.in_(("held", "confirmed", "waitlist")))
        .order_by(Tournament.starts_at.desc())
    )).all()
    out = []
    for e, t in rows:
        if e.status == "held" and e.hold_expires_at and aware(e.hold_expires_at) < now_utc():
            continue
        out.append({"tournament": await card(db, t), "entry": await _entry_payload(db, t, e)})
    return out


async def leaderboard(db: AsyncSession, city: Optional[str] = None, limit: int = 50) -> list[dict]:
    q = (select(TournamentEntry, Tournament).join(Tournament, Tournament.id == TournamentEntry.tournament_id)
         .where(Tournament.status == "completed", TournamentEntry.user_id.is_not(None), TournamentEntry.seed.is_not(None)))
    if city:
        q = q.join(Cafe, Cafe.id == Tournament.cafe_id).where(func.lower(Cafe.city) == city.strip().lower())
    agg: dict = {}
    for e, t in (await db.execute(q)).all():
        a = agg.setdefault(e.user_id, {"points": 0, "played": 0, "wins": 0, "podiums": 0, "name": e.gamer_tag, "last": None})
        a["points"] += e.points or 0
        a["played"] += 1
        a["wins"] += 1 if e.final_place == 1 else 0
        a["podiums"] += 1 if e.final_place and e.final_place <= 3 else 0
        if a["last"] is None or aware(t.starts_at) > a["last"]:
            a["last"], a["name"] = aware(t.starts_at), e.gamer_tag
    ranked = sorted(agg.items(), key=lambda kv: (-kv[1]["points"], -kv[1]["wins"], kv[1]["name"].lower()))[:limit]
    return [{"rank": i + 1, "userId": str(uid), "name": a["name"], "points": a["points"], "played": a["played"],
             "wins": a["wins"], "podiums": a["podiums"]} for i, (uid, a) in enumerate(ranked)]


async def host_detail(db: AsyncSession, user: User, tournament_id: UUID) -> dict:
    t, org = await get_for_manager(db, user, tournament_id)
    data = await detail(db, t, None)
    entries = await entries_of(db, t.id)
    data["entries"] = [{
        **_entry_brief(e), "status": e.status, "phone": e.phone, "code": e.check_in_code, "source": e.source,
        "teammates": e.teammates or [], "amount": float(e.amount or 0), "paid": bool(e.paid_at),
        "refundDue": e.refund_due, "checkedInAt": aware(e.checked_in_at).isoformat() if e.checked_in_at else None,
        "createdAt": aware(e.created_at).isoformat(),
    } for e in entries if e.status in ("held", "confirmed", "waitlist", "removed", "cancelled")]
    data["money"] = {
        "collected": round(sum(float(e.amount or 0) for e in entries if e.paid_at and e.status == "confirmed"), 2),
        "atCounter": round(sum(float(e.amount or 0) for e in entries if e.source == "walk_in"), 2),
        "refundDue": round(sum(float(e.amount or 0) for e in entries if e.refund_due), 2),
    }
    data["checkedIn"] = sum(1 for e in entries if e.status == "confirmed" and e.checked_in_at)
    data["editable"] = {k: _edit_value(t, k) for k in EDITABLE}
    data["estimate"] = estimate(t.max_teams, t.stations, t.match_minutes, t.third_place)
    data["hardwareTierId"] = str(t.hardware_tier_id) if t.hardware_tier_id else None
    return data


def _edit_value(t: Tournament, k: str):
    v = getattr(t, k)
    if isinstance(v, datetime):
        return aware(v).isoformat()
    if isinstance(v, UUID):
        return str(v)
    if k == "entry_fee":
        return float(v or 0)
    return v


async def host_list(db: AsyncSession, user: User) -> list[dict]:
    orgs = await my_organisers(db, user)
    if not orgs:
        return []
    ts = (await db.execute(select(Tournament).where(Tournament.organiser_id.in_([o.id for o in orgs]))
                           .order_by(Tournament.starts_at.desc()))).scalars().all()
    out = []
    for t in ts:
        c = await card(db, t)
        entries = await entries_of(db, t.id)
        c["collected"] = round(sum(float(e.amount or 0) for e in entries if e.paid_at and e.status == "confirmed"), 2)
        c["checkedIn"] = sum(1 for e in entries if e.status == "confirmed" and e.checked_in_at)
        out.append(c)
    return out
