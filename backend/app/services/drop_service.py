"""Drops: reserve a seat in a fixed block by paying a deposit.

Seat safety: a block's seats_taken only changes through one conditional
UPDATE ... WHERE seats_taken + n <= seats_total (take) or a matching decrement
(give back), each tied to a conditional status change on the reservation, so
two buyers can never both get the last seat and a seat is never given back
twice. Nothing reads the count and then writes it.

A reservation holds its seat for HOLD_MINUTES while the deposit is paid. After
that it expires (lazily, the next time anyone looks at the drop) and the seat
goes back on sale. A payment that still arrives later takes a seat if one is
free, otherwise it is refunded automatically.

No offers, coupons or café discounts ever apply to a drop.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional
from urllib.parse import quote_plus
from uuid import UUID

from sqlalchemy import and_, func, literal_column, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundException
from app.core.logging import logger
from app.core.time import IST
from app.models.analytics_event import AnalyticsEvent
from app.models.cafe import Cafe
from app.models.drop import Drop, DropBlock, DropReservation, DropWaitlist
from app.models.user import User

HOLD_MINUTES = 10
# Holding a seat: paid, or still paying inside the hold window.
HOLDING = ("pending_payment", "confirmed", "checked_in")
PAID = ("confirmed", "checked_in")
SUGGESTED_PRICE = (250, 300)
FUNNEL_ACTIONS = ("drop_page_view", "drop_block_selected", "drop_payment_started", "drop_payment_success", "drop_share_clicked")


class DropError(BadRequestException):
    def __init__(self, message: str, code: str):
        super().__init__(message=message, error_code=code)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def block_hours(block: DropBlock) -> Decimal:
    s, e = span(block.start_time, block.end_time)
    return (Decimal(e - s) / Decimal(60)).quantize(Decimal("0.01"))


def block_price_per_seat(drop: Drop, block: DropBlock) -> Decimal:
    return money(Decimal(str(drop.price_per_hour)) * block_hours(block))


def block_starts_at(block: DropBlock) -> datetime:
    return datetime.combine(block.session_date, block.start_time).replace(tzinfo=IST)


def _day0(block: DropBlock) -> datetime:
    return datetime.combine(block.session_date, time(0, 0)).replace(tzinfo=IST)


def open_from(drop: Drop, block: DropBlock) -> int:
    """First minute (from the session day's midnight) people can book in this session.
    A drop that starts on 19 Nov at 12 AM runs on the night block of 18 Nov, so that
    block only opens from midnight; the hours before it are not part of the drop."""
    bs, _ = block_span(block)
    if drop.max_hours and drop.starts_on and block.session_date < drop.starts_on:
        return max(bs, (drop.starts_on - block.session_date).days * DAY_MIN)
    return bs


def open_at(drop: Drop, block: DropBlock) -> datetime:
    return _day0(block) + timedelta(minutes=open_from(drop, block))


def block_closed(drop: Drop, block: DropBlock, at: Optional[datetime] = None) -> bool:
    """Nothing left to book. Fixed sessions are gone once they start; flexible ones (play by
    the hour) stay open until their last hour has started."""
    at = at or now_utc()
    if drop.max_hours:
        return _day0(block) + timedelta(minutes=block_span(block)[1] - STEP) <= at
    return block_starts_at(block) <= at


def in_range(drop: Drop, block: DropBlock) -> bool:
    """Is this session part of the drop? Includes the night before launch when it runs into launch day."""
    if getattr(block, "closed", False):
        return False
    if drop.ends_on is not None and block.session_date > drop.ends_on:
        return False
    if drop.starts_on is None or block.session_date >= drop.starts_on:
        return True
    return bool(drop.max_hours) and open_from(drop, block) < block_span(block)[1]


def _iv(x: dict) -> tuple[int, int]:
    return span(time.fromisoformat(str(x["start"])[:5]), time.fromisoformat(str(x["end"])[:5]))


def default_intervals(drop: Drop) -> list[tuple[int, int]]:
    if drop.daily_start_time is None or drop.daily_end_time is None:
        return []
    return [span(drop.daily_start_time, drop.daily_end_time)]


def day_intervals(drop: Drop, day: date) -> list[tuple[int, int]]:
    """Open stretches of one event date, as minutes from that date's midnight (an end past
    1440 runs into the next morning). [] = closed that day."""
    over = (drop.day_hours or {}).get(day.isoformat())
    if over is not None:
        return sorted(_iv(x) for x in over)
    return default_intervals(drop)


def runs_on(drop: Drop, day: date) -> bool:
    return drop.starts_on is not None and drop.starts_on <= day and (drop.ends_on is None or drop.ends_on >= day)


def launch_night(drop: Drop) -> bool:
    """A by-the-hour drop whose daily hours run past midnight also opens on the night before
    launch day, from 12 AM, unless launch day's own hours already start at midnight."""
    if not drop.max_hours or drop.starts_on is None:
        return False
    dflt = default_intervals(drop)
    if not dflt or dflt[0][1] <= DAY_MIN:
        return False
    tail_end = dflt[0][1] - DAY_MIN
    return not any(s < tail_end for s, _e in day_intervals(drop, drop.starts_on))


def tails_into(drop: Drop, day: date) -> list[tuple[int, int]]:
    """The part of the night before that runs into this date (minutes from this date's midnight)."""
    prev = day - timedelta(days=1)
    if runs_on(drop, prev):
        return [(max(0, s - DAY_MIN), e - DAY_MIN) for s, e in day_intervals(drop, prev) if e > DAY_MIN]
    if drop.starts_on is not None and prev == drop.starts_on - timedelta(days=1) and launch_night(drop):
        return [(0, e - DAY_MIN) for _s, e in default_intervals(drop) if e > DAY_MIN]
    return []


def clean_intervals(raw) -> list[dict]:
    """Owner's opening stretches for a date: on the hour or half hour, not overlapping."""
    out, used = [], set()
    for x in raw or []:
        a, b = str(x["start"])[:5], str(x["end"])[:5]
        ta, tb = time.fromisoformat(a), time.fromisoformat(b)
        if ta.minute % 30 or tb.minute % 30:
            raise DropError("Opening times start and end on the hour or half hour.", "BAD_HOURS")
        s, e = span(ta, tb)
        mins = set(range(s, e, STEP))
        if mins & used:
            raise DropError("Two opening times overlap. Change one so they don't.", "HOURS_OVERLAP")
        used |= mins
        out.append({"start": a, "end": b})
    if len(out) > 4:
        raise DropError("Use 4 opening stretches a day at most.", "BAD_HOURS")
    return sorted(out, key=lambda x: _iv(x)[0])


def bookable_until(drop: Drop, at: Optional[datetime] = None) -> Optional[datetime]:
    """Latest start people can book online, or None for no limit."""
    if not drop.advance_hours:
        return None
    at = at or now_utc()
    if drop.advance_from is not None and at.astimezone(IST).date() < drop.advance_from:
        return None
    return at + timedelta(hours=drop.advance_hours)


def state(drop: Drop, at: Optional[datetime] = None) -> str:
    """draft | cancelled | soon (nothing open yet) | early (code only) | open | ended"""
    at = at or now_utc()
    if drop.status == "cancelled":
        return "cancelled"
    if drop.status != "live":
        return "draft"
    if drop.ends_on is not None and at.astimezone(IST).date() > drop.ends_on:
        return "ended"
    if at < _aware(drop.early_access_starts_at):
        return "soon"
    if at < _aware(drop.public_starts_at):
        return "early"
    return "open"


def maps_url(cafe: Cafe) -> str:
    if cafe.google_maps_url:
        return cafe.google_maps_url
    if cafe.latitude is not None and cafe.longitude is not None:
        return f"https://www.google.com/maps/search/?api=1&query={cafe.latitude},{cafe.longitude}"
    where = ", ".join(p for p in (cafe.name, cafe.address_line1, cafe.city) if p)
    return f"https://www.google.com/maps/search/?api=1&query={quote_plus(where)}"


def code_ok(drop: Drop, code: Optional[str]) -> bool:
    expected = (drop.early_access_code or "").strip().upper()
    given = (code or "").strip().upper()
    return bool(expected) and bool(given) and hmac.compare_digest(given, expected)


SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def clean_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) != 10 or digits[0] not in "6789":
        raise DropError("Please type a 10-digit mobile number.", "BAD_PHONE")
    return digits


# ---------------------------------------------------------------- reading

async def get_drop_by_slug(db: AsyncSession, slug: str) -> Drop:
    drop = (await db.execute(select(Drop).where(Drop.slug == slug))).scalars().first()
    if drop is None:
        raise NotFoundException(message="We couldn't find this drop.", error_code="DROP_NOT_FOUND")
    return drop


VISIBLE_DAYS = 7
MAX_DAYS = 14


async def ensure_blocks(db: AsyncSession, drop: Drop) -> None:
    """Rolling drops: make sure each of the next 7 days (not past ends_on) has its day.
    Safe to call on every read; a race on the same day is stopped by the unique key."""
    from sqlalchemy.exc import IntegrityError
    if drop.status != "live" or drop.starts_on is None or (drop.daily_start_time is None and not drop.day_hours):
        return
    today = now_utc().astimezone(IST).date()
    first = max(today, drop.starts_on)
    # Before launch the first week from launch day is already open for booking; after launch the
    # window rolls: today plus the next 6 days.
    last = min(first + timedelta(days=VISIBLE_DAYS - 1), drop.ends_on or drop.starts_on + timedelta(days=MAX_DAYS - 1))
    have = set((await db.execute(select(DropBlock.session_date).where(DropBlock.drop_id == drop.id))).scalars().all())
    made = False
    eve = drop.starts_on - timedelta(days=1)
    if today <= drop.starts_on and eve not in have and launch_night(drop):
        # Runs past midnight: the night before launch day carries the first hours after 12 AM.
        db.add(DropBlock(drop_id=drop.id, session_date=eve, start_time=drop.daily_start_time,
                         end_time=drop.daily_end_time, seats_total=drop.daily_seats or 1))
        made = True
    d = first
    while d <= last:
        if d not in have:
            # Each opening stretch of the date is its own session; a closed date gets none.
            for s, e in day_intervals(drop, d):
                db.add(DropBlock(drop_id=drop.id, session_date=d, start_time=clock_of(s),
                                 end_time=clock_of(e), seats_total=drop.daily_seats or 1))
                made = True
        d += timedelta(days=1)
    if made:
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()


async def blocks_of(db: AsyncSession, drop_id: UUID) -> list[DropBlock]:
    rows = await db.execute(
        select(DropBlock).where(DropBlock.drop_id == drop_id, DropBlock.closed.is_(False))
        .order_by(DropBlock.session_date, DropBlock.start_time)
    )
    return list(rows.scalars().all())


async def release_expired(db: AsyncSession, drop_id: Optional[UUID] = None) -> int:
    """Give back the seats of reservations whose payment window closed.
    Each one is claimed by its own conditional status change first, so a seat
    is returned exactly once even if two requests do this at the same time."""
    stmt = select(DropReservation.id).where(
        DropReservation.status == "pending_payment", DropReservation.expires_at < now_utc()
    )
    if drop_id is not None:
        stmt = stmt.where(DropReservation.drop_id == drop_id)
    released = 0
    for rid in (await db.execute(stmt)).scalars().all():
        claimed = await db.execute(
            update(DropReservation)
            .where(DropReservation.id == rid, DropReservation.status == "pending_payment")
            .values(status="expired", updated_at=now_utc())
            .returning(DropReservation.block_id, DropReservation.seats)
        )
        row = claimed.first()
        if row is None:
            continue
        await _give_back(db, row.block_id, row.seats)
        released += 1
    if released:
        await db.commit()
    return released


STEP = 30  # minutes: seats are counted per half hour


def _mins(t) -> int:
    return t.hour * 60 + t.minute


DAY_MIN = 24 * 60


def span(start: time, end: time) -> tuple[int, int]:
    """Minutes from the session day's midnight. An end at or before the start is the next
    day, so 18:00-04:00 runs overnight and 00:00-00:00 (or 10:00-10:00) is a full 24 hours."""
    s, e = _mins(start), _mins(end)
    if e <= s:
        e += DAY_MIN
    return s, e


def block_span(block: DropBlock) -> tuple[int, int]:
    return span(block.start_time, block.end_time)


def at_in_block(t: time, block: DropBlock) -> int:
    """A clock time inside a session, as minutes from the session day's midnight:
    01:00 in an 18:00-04:00 session is 25:00 (1500)."""
    m, bs = _mins(t), _mins(block.start_time)
    return m + DAY_MIN if m < bs else m


def res_window(res_or_none, block: DropBlock) -> tuple[int, int]:
    """Window a reservation occupies, in minutes from the session day's midnight
    (can run past 1440 overnight). The whole session if not flexible."""
    if res_or_none is not None and res_or_none.start_time is not None:
        s = at_in_block(res_or_none.start_time, block)
        length = (_mins(res_or_none.end_time) - _mins(res_or_none.start_time)) % DAY_MIN or DAY_MIN
        return s, s + length
    return block_span(block)


def clock_of(m: int) -> time:
    m %= DAY_MIN
    return time(m // 60, m % 60)


def hhmm(m: int) -> str:
    """Minutes past the session day's midnight as "HH:MM"; past midnight it reads 25:00,
    the form the booking slider understands."""
    return f"{m // 60:02d}:{m % 60:02d}"


def _peak(windows: list[tuple[int, int, int]], block: DropBlock) -> int:
    """Most seats in use at any one hour of the session. windows = (start, end, seats)."""
    peak = 0
    bs, be = block_span(block)
    for h in range(bs, be, STEP):
        used = sum(n for s, e, n in windows if s < h + STEP and e > h)
        peak = max(peak, used)
    return peak


async def _holding_windows(db: AsyncSession, block: DropBlock) -> list[tuple[int, int, int]]:
    rows = (await db.execute(
        select(DropReservation).where(DropReservation.block_id == block.id, DropReservation.status.in_(HOLDING))
        .execution_options(populate_existing=True)
    )).scalars().all()
    return [(*res_window(r, block), r.seats) for r in rows]


# ---------------------------------------------------------------- consoles
# Each console of a drop is "<tier id>:<number>" (PS5 Pro 1 = "<ps5 tier>:1"). Consoles are numbered
# from the setup's own count; there is no separate console table (hardware_tier_units means "broken").

def console_keys(drop: Drop) -> list[str]:
    if drop.consoles:
        return [str(k) for k in drop.consoles]
    n = drop.daily_seats or 1
    tier = str(drop.hardware_tier_id) if drop.hardware_tier_id else "_"
    return [f"{tier}:{i}" for i in range(1, n + 1)]


def key_tier(key: str) -> str:
    return key.rsplit(":", 1)[0]


def tier_counts(drop: Drop) -> dict[str, int]:
    out: dict[str, int] = {}
    for k in console_keys(drop):
        out[key_tier(k)] = out.get(key_tier(k), 0) + 1
    return out


def tier_seats(drop: Drop, tier_id) -> int:
    """How many consoles of this setup the drop keeps."""
    return tier_counts(drop).get(str(tier_id), 0)


def primary_tier(drop: Drop) -> str:
    return str(drop.hardware_tier_id) if drop.hardware_tier_id else key_tier(console_keys(drop)[0])


def block_keys(drop: Drop, block: DropBlock) -> list[str]:
    """The consoles of one session. A session whose seat count was set by hand (old fixed drops)
    gets plain numbered seats past the drop's own consoles."""
    keys = console_keys(drop)
    n = block.seats_total
    if n <= len(keys):
        return keys[:n]
    return keys + [f"_:{i}" for i in range(len(keys) + 1, n + 1)]


def short_name(tier) -> str:
    name = (tier.model or tier.name or "Console").strip() if tier is not None else "Seat"
    return re.sub(r"PlayStation\s*", "PS", name)


def same_setup(keys: list[str], units: Optional[list], fallback: str) -> list[str]:
    """Consoles a booking may move to: the same setup(s) it is on (an Xbox booking stays on an Xbox)."""
    tiers = {key_tier(u) for u in units} if units else {fallback}
    return [k for k in keys if key_tier(k) in tiers] or list(keys)


def fit_consoles(keys: list[str], items: list[dict]) -> Optional[dict]:
    """Put every booking of a session on its own console(s). items: {id, s, e, n, allowed, fixed, cur}.
    fixed bookings (the café picked the console) never move; the rest keep their console when they can,
    else move to another allowed one. Returns {id: [keys]} or None when it can't be done."""
    import itertools
    busy: dict[str, list] = {k: [] for k in keys}
    out: dict = {}

    def free(k: str, s: int, e: int) -> bool:
        return all(not (a < e and s < b) for a, b in busy[k])

    for it in items:
        if it.get("fixed"):
            for k in it["fixed"]:
                if k not in busy or not free(k, it["s"], it["e"]):
                    return None
                busy[k].append((it["s"], it["e"]))
            out[it["id"]] = list(it["fixed"])
    movable = sorted((it for it in items if not it.get("fixed")), key=lambda x: (x["s"], -x["e"]))
    steps = [0]

    def go(i: int) -> bool:
        if i == len(movable):
            return True
        steps[0] += 1
        if steps[0] > 20000:
            return False
        it = movable[i]
        cand = [k for k in it["allowed"] if k in busy and free(k, it["s"], it["e"])]
        if len(cand) < it["n"]:
            return False
        cur = it.get("cur") or []
        cand.sort(key=lambda k: (k not in cur, keys.index(k)))
        for combo in itertools.combinations(cand, it["n"]):
            for k in combo:
                busy[k].append((it["s"], it["e"]))
            out[it["id"]] = list(combo)
            if go(i + 1):
                return True
            for k in combo:
                busy[k].pop()
        out.pop(it["id"], None)
        return False

    return out if go(0) else None


def _item(drop: Drop, block: DropBlock, keys: list[str], r: DropReservation) -> dict:
    s, e = res_window(r, block)
    units = [u for u in (r.units or [])]
    pinned = bool(r.units_pinned and units and all(u in keys for u in units))
    return {"id": str(r.id), "s": s, "e": e, "n": r.seats, "fixed": units if pinned else None, "cur": units,
            "allowed": same_setup(keys, units, primary_tier(drop))}


async def _place(db: AsyncSession, drop: Drop, block_id: UUID, new: Optional[dict] = None) -> Optional[list[str]]:
    """Fit a new booking (s, e, n, allowed, fixed) next to everything already held in this session.
    The session row is locked first, so two people can never get the same console at the same time.
    Bookings that were not pinned may move to another console of their setup. Returns the new
    booking's consoles ([] when new is None), or None when it doesn't fit. seats_taken keeps the
    busiest half hour, as before."""
    for _attempt in range(8):
        block = (await db.execute(select(DropBlock).where(DropBlock.id == block_id).with_for_update()
                                  .execution_options(populate_existing=True))).scalars().first()
        if block is None:
            return None
        rev = block.rev
        keys = block_keys(drop, block)
        rows = (await db.execute(
            select(DropReservation).where(DropReservation.block_id == block.id, DropReservation.status.in_(HOLDING))
            .execution_options(populate_existing=True)
        )).scalars().all()
        items = [_item(drop, block, keys, r) for r in rows if new is None or str(r.id) != new.get("id")]
        if new is not None:
            items.append({**new, "id": "new"})
        got = fit_consoles(keys, items)
        if got is None:
            return None
        peak = _peak([(it["s"], it["e"], it["n"]) for it in items], block)
        if peak > block.seats_total:
            return None
        # The row lock already makes this safe on Postgres; the rev check also stops a write made from a
        # stale read anywhere else (another request changed this session after we looked): then look again.
        res = await db.execute(update(DropBlock).where(DropBlock.id == block.id, DropBlock.rev == rev)
                               .values(seats_taken=peak, rev=rev + 1).execution_options(synchronize_session="fetch"))
        if res.rowcount != 1:
            continue
        for r in rows:
            if str(r.id) in got and got[str(r.id)] != (r.units or []):
                r.units = got[str(r.id)]
        return got.get("new", [])
    return None


def _window(block: DropBlock, start: Optional[time], end: Optional[time]) -> tuple[int, int]:
    if start is None:
        return block_span(block)
    s = at_in_block(start, block)
    return s, s + ((_mins(end) - _mins(start)) % DAY_MIN or DAY_MIN)


async def console_list(db: AsyncSession, drop: Drop) -> list[dict]:
    """The drop's consoles with names, in order: [{key, label, tierId, setup, platform}]."""
    from app.models.hardware_tier import HardwareTier
    keys = console_keys(drop)
    ids = {key_tier(k) for k in keys if key_tier(k) != "_"}
    tiers = {}
    if ids:
        rows = (await db.execute(select(HardwareTier).where(HardwareTier.id.in_([UUID(i) for i in ids])))).scalars().all()
        tiers = {str(t.id): t for t in rows}
    out = []
    for k in keys:
        t = tiers.get(key_tier(k))
        name = short_name(t)
        out.append({"key": k, "label": f"{name} {k.rsplit(':', 1)[1]}", "tierId": key_tier(k), "setup": name,
                    "platform": t.platform.value if t is not None and t.platform else None})
    return out


def setup_windows(drop: Drop, block: DropBlock, rows: list[DropReservation]) -> dict[str, list[tuple[int, int, int]]]:
    """Booked stretches per setup (an Xbox booking only counts against the Xboxes)."""
    prim = primary_tier(drop)
    out: dict[str, list] = {t: [] for t in tier_counts(drop)}
    for r in rows:
        s, e = res_window(r, block)
        per: dict[str, int] = {}
        if r.units:
            for u in r.units:
                per[key_tier(u)] = per.get(key_tier(u), 0) + 1
        else:
            per[prim] = r.seats
        for t, n in per.items():
            out.setdefault(t, []).append((s, e, n))
    return out


async def holding_rows(db: AsyncSession, block: DropBlock) -> list[DropReservation]:
    return list((await db.execute(
        select(DropReservation).where(DropReservation.block_id == block.id, DropReservation.status.in_(HOLDING))
    )).scalars().all())


async def settle_units(db: AsyncSession, drop: Drop, block: DropBlock) -> None:
    """Give older bookings (made before consoles had names) a console. Safe to call on every read."""
    rows = await holding_rows(db, block)
    if any(not r.units for r in rows):
        if await _place(db, drop, block.id) is not None:
            await db.commit()


async def set_consoles(db: AsyncSession, drop: Drop, keys: list[str], actor: User) -> None:
    """Choose which consoles the drop uses (any mix of the café's setups). Refused when a console
    the café picked for a booking would go, when the bookings would no longer fit, or when normal
    bookings already hold those consoles in the drop's hours."""
    from app.models.hardware_tier import HardwareTier, TierType
    from app.models.owner_audit_log import OwnerAuditLog
    tiers = {str(t.id): t for t in (await db.execute(select(HardwareTier).where(
        HardwareTier.cafe_id == drop.cafe_id, HardwareTier.is_active.is_(True),
        HardwareTier.tier_type == TierType.GAMING.value))).scalars().all()}
    clean: list[str] = []
    for k in keys:
        k = str(k)
        t = tiers.get(key_tier(k))
        try:
            n = int(k.rsplit(":", 1)[1])
        except (IndexError, ValueError):
            n = 0
        if t is None or not 1 <= n <= (t.total_seats or 0):
            raise DropError("One of those consoles isn't at your café. Refresh and pick again.", "BAD_CONSOLE")
        if k not in clean:
            clean.append(k)
    if not clean:
        raise DropError("Pick at least one console for the drop.", "NO_CONSOLES")
    if len(clean) > 40:
        raise DropError("Use 40 consoles at most.", "BAD_CONSOLE")
    order = list(tiers)
    clean.sort(key=lambda k: (order.index(key_tier(k)), int(k.rsplit(":", 1)[1])))
    before = console_keys(drop)
    old_counts = tier_counts(drop)
    labels = {c["key"]: c["label"] for c in await console_list(db, drop)}
    drop.consoles = clean
    drop.daily_seats = len(clean)
    if drop.hardware_tier_id is None or str(drop.hardware_tier_id) not in {key_tier(k) for k in clean}:
        drop.hardware_tier_id = UUID(key_tier(clean[0]))
    today = now_utc().astimezone(IST).date()
    blocks = (await db.execute(select(DropBlock).where(
        DropBlock.drop_id == drop.id, DropBlock.session_date >= today - timedelta(days=1), DropBlock.closed.is_(False))
        .order_by(DropBlock.session_date, DropBlock.start_time))).scalars().all()
    for b in blocks:
        rows = await holding_rows(db, b)
        for r in rows:
            gone = [u for u in (r.units or []) if r.units_pinned and u not in clean]
            if gone:
                raise DropError(f"{labels.get(gone[0], 'That console')} has a booking on {b.session_date.day} {b.session_date:%b}. "
                                "Remove that booking first, or keep the console.", "CONSOLE_IN_USE")
        b.seats_total = len(clean)
        await db.flush()
        if rows and await _place(db, drop, b.id) is None:
            raise DropError(f"The bookings on {b.session_date.day} {b.session_date:%b} would not fit on those consoles. "
                            "Keep more consoles, or move those bookings first.", "CONSOLES_FULL")
    if drop.status == "live" and drop.starts_on is not None:
        last = drop.ends_on or drop.starts_on + timedelta(days=MAX_DAYS - 1)
        d, days = max(today, drop.starts_on), {}
        while d <= last:
            days[d] = day_intervals(drop, d)
            d += timedelta(days=1)
        for tid, n in tier_counts(drop).items():
            if tid in tiers and n > old_counts.get(tid, 0):
                await check_rig_free_days(db, tiers[tid], days, n, drop.id)
    db.add(OwnerAuditLog(owner_id=actor.id, action="drop.consoles.updated", entity_type="drop", entity_id=str(drop.id),
                         before_summary=json.dumps(before)[:4000], after_summary=json.dumps(clean)[:4000]))
    await db.commit()


async def _give_back(db: AsyncSession, block_id: UUID, seats: int = 0) -> None:
    """Recount after a reservation stops holding (its status is already changed)."""
    await db.flush()
    block = (await db.execute(select(DropBlock).where(DropBlock.id == block_id).with_for_update())).scalars().first()
    if block is None:
        return
    await db.execute(update(DropBlock).where(DropBlock.id == block_id).values(
        seats_taken=_peak(await _holding_windows(db, block), block), rev=DropBlock.rev + 1))


def seats_free(windows: list[tuple[int, int, int]], block: DropBlock, total: Optional[int] = None) -> dict[str, int]:
    """Free seats for each hour of a session, keyed 'HH:MM'."""
    out = {}
    bs, be = block_span(block)
    cap = block.seats_total if total is None else total
    for h in range(bs, be, STEP):
        used = sum(n for s, e, n in windows if s < h + STEP and e > h)
        out[hhmm(h)] = max(0, cap - used)
    return out


def lengths(drop: Drop) -> list[int]:
    """Hours people can book: the package lengths when the café sells packages, else 1..max_hours."""
    if drop.length_prices:
        return sorted(int(x["hours"]) for x in drop.length_prices)
    return list(range(1, (drop.max_hours or 0) + 1))


def bands_for(drop: Drop, day: Optional[date] = None) -> list[dict]:
    """Price windows for a date: that date's own if the café set them, else the drop's."""
    if day is not None:
        over = (drop.day_prices or {}).get(day.isoformat())
        if over is not None:
            return over
    return drop.time_prices or []


def _band_at(bands: list[dict], m: int) -> Optional[dict]:
    m %= DAY_MIN
    for b in bands:
        s, e = _iv(b)
        if s <= m < e or s <= m + DAY_MIN < e:
            return b
    return None


def _band_rate(drop: Drop, m: int, day: Optional[date] = None) -> Optional[Decimal]:
    b = _band_at(bands_for(drop, day), m)
    return Decimal(str(b["perHour"])) if b else None


def min_minutes(drop: Drop, day: Optional[date], begin: int) -> int:
    """Shortest booking that may start at minute `begin`: set by the price window it starts in."""
    b = _band_at(bands_for(drop, day), begin)
    if b and b.get("minHours"):
        return int(round(float(b["minHours"]) * 60))
    return 60


def seat_price(drop: Drop, begin: int, length: int, day: Optional[date] = None) -> Decimal:
    """Price of one seat for `length` minutes from minute `begin` of the session day.
    Package price (or hourly price x hours), then each half hour inside a time band moves
    by the difference between that band's hourly price and the normal one."""
    base = Decimal(str(drop.price_per_hour))
    packs = {int(x["hours"]): Decimal(str(x["price"])) for x in drop.length_prices or []}
    total = packs[length // 60] if length % 60 == 0 and length // 60 in packs else base * Decimal(length) / Decimal(60)
    for m in range(begin, begin + length, STEP):
        rate = _band_rate(drop, m % DAY_MIN, day)
        if rate is not None:
            total += (rate - base) * Decimal(STEP) / Decimal(60)
    return money(max(total, Decimal("0")))


def clean_price_options(length_prices, time_prices) -> tuple[Optional[list], Optional[list]]:
    """Check and normalise the owner's package and time prices. Raises DropError in plain words."""
    lp = None
    if length_prices:
        seen = set()
        lp = []
        for x in length_prices:
            h, price = int(x["hours"]), float(x["price"])
            if not 1 <= h <= 12:
                raise DropError("A package can be 1 to 12 hours.", "BAD_PACKAGE")
            if h in seen:
                raise DropError(f"There are two prices for {h} {'hour' if h == 1 else 'hours'}. Keep one.", "BAD_PACKAGE")
            if not 0 < price <= 100000:
                raise DropError("Each package needs a price.", "BAD_PACKAGE")
            seen.add(h)
            lp.append({"hours": h, "price": price})
        lp.sort(key=lambda x: x["hours"])
    tp = None
    if time_prices:
        if len(time_prices) > 6:
            raise DropError("Use 6 time prices at most.", "BAD_TIME_PRICE")
        tp, used = [], set()
        for x in time_prices:
            a, b = str(x["start"])[:5], str(x["end"])[:5]
            ta, tb = time.fromisoformat(a), time.fromisoformat(b)
            if ta == tb:
                raise DropError("A time price needs a different start and end.", "BAD_TIME_PRICE")
            if ta.minute % 30 or tb.minute % 30:
                raise DropError("Time prices start and end on the hour or half hour.", "BAD_TIME_PRICE")
            rate = float(x["perHour"])
            if not 0 < rate <= 10000:
                raise DropError("Each time price needs an hourly price.", "BAD_TIME_PRICE")
            mh = x.get("minHours")
            if mh not in (None, "", 0):
                mh = int(mh)
                if not 1 <= mh <= 12:
                    raise DropError("The shortest booking is 1 to 12 hours.", "BAD_TIME_PRICE")
            else:
                mh = None
            s_, e_ = span(ta, tb)
            mins = {m % DAY_MIN for m in range(s_, e_, STEP)}
            if mins & used:
                raise DropError("Two time prices cover the same hours. Make them not overlap.", "BAD_TIME_PRICE")
            used |= mins
            tp.append({"start": a, "end": b, "perHour": rate, **({"minHours": mh} if mh else {})})
    return lp, tp


def fee_per_seat(drop: Drop, hours: float) -> Decimal:
    """₹100 up to 3 hours, ₹200 for 4 or 5 (owner can change both)."""
    short = Decimal(str(drop.deposit_amount))
    if hours <= 3:
        return money(short)
    return money(Decimal(str(drop.deposit_amount_long)) if drop.deposit_amount_long is not None else short * 2)


async def owner_windows(db: AsyncSession, block: DropBlock) -> list[dict]:
    """Booked stretches with what they are: online (paid in the app), walk-in (sold at the café) or
    blocked (the café kept the hours off sale). For the café's own slider."""
    rows = (await db.execute(
        select(DropReservation).where(DropReservation.block_id == block.id, DropReservation.status.in_(HOLDING))
    )).scalars().all()
    kinds = {"online": "online", "offline": "walkin", "block": "blocked"}
    return [{"startTime": hhmm(s), "endTime": hhmm(e), "seatsCount": r.seats, "kind": kinds.get(r.source, "online"),
             "id": str(r.id), "label": r.guest_name if r.source != "online" else None,
             "units": list(r.units or []), "pinned": bool(r.units_pinned)}
            for r in rows for s, e in [res_window(r, block)]]


def booked_windows(windows: list[tuple[int, int, int]]) -> list[dict]:
    """The shape the booking slider already understands (who is not shown)."""
    return [{"startTime": hhmm(s), "endTime": hhmm(e), "seatsCount": n} for s, e, n in windows]


async def user_seats(db: AsyncSession, drop_id: UUID, user_id: UUID, block_id: Optional[UUID] = None) -> int:
    """Seats this person holds. The per-person cap is per day (block), so booking a
    second night is never blocked by the first."""
    q = select(func.coalesce(func.sum(DropReservation.seats), 0)).where(
        DropReservation.drop_id == drop_id,
        DropReservation.user_id == user_id,
        DropReservation.source == "online",
        DropReservation.status.in_(HOLDING),
    )
    if block_id is not None:
        q = q.where(DropReservation.block_id == block_id)
    total = (await db.execute(q)).scalar_one()
    return int(total or 0)


# ---------------------------------------------------------------- Razorpay

def _rzp_auth() -> str:
    return base64.b64encode(f"{settings.RAZORPAY_KEY_ID}:{settings.RAZORPAY_KEY_SECRET}".encode()).decode()


def _rzp_post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"https://api.razorpay.com/v1/{path}", data=json.dumps(body).encode(), method="POST",
        headers={"Authorization": f"Basic {_rzp_auth()}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode())


def _mock_allowed() -> bool:
    return bool(settings.ENABLE_SANDBOX_MOCK_PAYMENTS)


def create_order(amount: Decimal, receipt: str) -> str:
    """A Razorpay order for the deposit. Fails closed: no made-up order id on a
    real key, so nobody is ever shown a checkout that can't be paid."""
    try:
        return _rzp_post("orders", {"amount": int(amount * 100), "currency": "INR", "receipt": receipt})["id"]
    except Exception as exc:  # network, bad keys, Razorpay down
        if _mock_allowed():
            return f"order_mock_{receipt}_{secrets.token_hex(3)}"
        logger.error("drop_order_failed", error=str(exc)[:300])
        raise DropError("Payments aren't working right now. Please try again in a few minutes.", "PAYMENT_UNAVAILABLE")


def signature_ok(order_id: str, payment_id: str, signature: str) -> bool:
    expected = hmac.new(settings.RAZORPAY_KEY_SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    if hmac.compare_digest(signature or "", expected):
        return True
    return _mock_allowed() and signature == "mock_signature_valid"


def refund_payment(payment_id: str, amount: Decimal, note: str) -> str:
    if payment_id.startswith("pay_mock_") and _mock_allowed():
        return f"rfnd_mock_{secrets.token_hex(4)}"
    res = _rzp_post(f"payments/{payment_id}/refund", {"amount": int(amount * 100), "notes": {"reason": note[:200]}})
    return res["id"]


# ---------------------------------------------------------------- reserving

def _reference() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "DR-" + "".join(secrets.choice(alphabet) for _ in range(6))


@dataclass
class Reserved:
    reservation: DropReservation
    order_id: str
    key_id: str


async def reserve(
    db: AsyncSession, drop: Drop, block_id: UUID, user: User, seats: int, code: Optional[str],
    start: Optional[time] = None, hours: Optional[float] = None, setup: Optional[str] = None,
) -> Reserved:
    await release_expired(db, drop.id)
    await ensure_blocks(db, drop)
    st = state(drop)
    if st == "ended":
        raise DropError("This drop is over. You can still book a normal slot at the café.", "DROP_ENDED")
    if st in ("draft", "cancelled"):
        raise DropError("This drop isn't taking reservations.", "DROP_CLOSED")
    if st == "soon":
        raise DropError("Reservations haven't opened yet. Tap “Notify me” and we'll tell you.", "DROP_NOT_OPEN")
    early = st == "early"
    if early and not code_ok(drop, code):
        raise DropError("Right now only people with the early access code can reserve. Check the code and try again.", "EARLY_ACCESS_CODE")
    if seats < 1 or seats > drop.max_seats_per_user:
        raise DropError(f"You can reserve 1 to {drop.max_seats_per_user} seats.", "BAD_SEATS")

    block = await db.get(DropBlock, block_id)
    if block is None or block.drop_id != drop.id or block.closed:
        raise NotFoundException(message="We couldn't find that time.", error_code="BLOCK_NOT_FOUND")
    if not drop.max_hours and block_starts_at(block) <= now_utc():
        raise DropError("This time has already started.", "BLOCK_STARTED")
    if drop.max_hours and block_closed(drop, block):
        raise DropError("This day has already started.", "BLOCK_STARTED")
    if drop.ends_on is not None and block.session_date > drop.ends_on:
        raise DropError("This drop has ended for that day.", "DROP_ENDED")
    if not in_range(drop, block):
        raise DropError(f"This drop starts on {drop.starts_on.day} {drop.starts_on.strftime('%b')}. Pick a later day.", "BEFORE_LAUNCH")

    # One reservation at a time per person: lock their row so two taps (or two
    # tabs) can't both pass the 2-seat check.
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    have = await user_seats(db, drop.id, user.id, block.id)
    if have + seats > drop.max_seats_per_user:
        left = max(0, drop.max_seats_per_user - have)
        msg = (f"You already have {have} seat{'s' if have != 1 else ''} on this day. "
               + (f"You can add {left} more." if left else f"The most is {drop.max_seats_per_user} a day. Pick another day to book more."))
        raise DropError(msg, "SEAT_LIMIT")

    r_start = r_end = None
    if drop.max_hours:
        # Flexible: a whole number of hours, starting on the hour inside the session.
        if hours is None or start is None:
            raise DropError("Pick when you want to start and how many hours.", "NEED_HOURS")
        length = round(hours * 60)
        if drop.length_prices:
            if length % 60 or length // 60 not in lengths(drop):
                raise DropError("Pick one of the café's packages: " + ", ".join(f"{h} hr" for h in lengths(drop)) + ".", "BAD_HOURS")
        elif length < 60 or length > drop.max_hours * 60 or length % STEP:
            raise DropError(f"You can play 1 to {drop.max_hours} hours.", "BAD_HOURS")
        bs, be = block_span(block)
        begin = at_in_block(start, block)
        end_min = begin + length
        if (begin - bs) % STEP or end_min > be:
            raise DropError("That time does not fit inside this session.", "BAD_HOURS")
        if begin < open_from(drop, block):
            raise DropError(f"This drop opens at 12 AM on {drop.starts_on.day} {drop.starts_on.strftime('%b')}. Pick a time from then.", "BEFORE_LAUNCH")
        shortest = min_minutes(drop, block.session_date, begin)
        if length < shortest:
            h = shortest // 60
            raise DropError(f"From {hhmm(begin % DAY_MIN)} the shortest booking is {h} {'hour' if h == 1 else 'hours'}.", "BELOW_MIN")
        limit = bookable_until(drop)
        if limit is not None and _day0(block) + timedelta(minutes=begin) > limit:
            raise DropError(f"Online booking is open for the next {drop.advance_hours} hours only. To book further ahead, contact KHEL-O.", "ADVANCE_LIMIT")
        r_start = start
        r_end = clock_of(end_min)
        if datetime.combine(block.session_date, time(0, 0)).replace(tzinfo=IST) + timedelta(minutes=begin) <= now_utc():
            raise DropError("That hour has already started.", "BLOCK_STARTED")

    # Which console type the player wants (PS5 or Xbox...). Old pages send nothing: the main one.
    counts = tier_counts(drop)
    tier = str(setup) if setup else primary_tier(drop)
    if tier not in counts:
        raise DropError("That console isn't part of this drop. Pick another.", "BAD_SETUP")
    s_, e_ = _window(block, r_start, r_end)
    keys = block_keys(drop, block)
    units = await _place(db, drop, block.id, {"s": s_, "e": e_, "n": seats, "fixed": None, "cur": [],
                                              "allowed": [k for k in keys if key_tier(k) == tier]})
    if units is None:
        await db.rollback()
        raise DropError("Sorry, these seats just got taken. Pick another time.", "SOLD_OUT")

    if r_start is not None:
        per_seat = seat_price(drop, begin, length, block.session_date)
        deposit = money(fee_per_seat(drop, hours) * seats)
    else:
        per_seat = block_price_per_seat(drop, block)
        deposit = money(Decimal(str(drop.deposit_amount)) * seats)
    total = money(per_seat * seats)
    reservation = DropReservation(
        reference=_reference(), drop_id=drop.id, block_id=block.id, user_id=user.id, seats=seats,
        status="pending_payment", block_price=total, deposit_amount=deposit,
        balance_due=max(Decimal("0.00"), total - deposit),
        expires_at=now_utc() + timedelta(minutes=HOLD_MINUTES),
        checkin_token=secrets.token_urlsafe(18), used_early_access=early,
        start_time=r_start, end_time=r_end, hours=length // 60 if r_start is not None else None, units=units,
    )
    db.add(reservation)
    await db.flush()
    try:
        order_id = create_order(deposit, reservation.reference)
    except DropError:
        await db.rollback()  # the seat goes straight back
        raise
    reservation.razorpay_order_id = order_id
    db.add(AnalyticsEvent(session_id=f"server-{user.id}", user_id=user.id, event_type="ui_action",
                          cafe_id=drop.cafe_id, event_metadata={"action": "drop_payment_started", "drop": drop.slug}))
    await db.commit()
    await db.refresh(reservation)
    return Reserved(reservation, order_id, settings.RAZORPAY_KEY_ID)


async def book_offline(
    db: AsyncSession, drop: Drop, block_id: UUID, staff: User, seats: int, name: str, phone: Optional[str],
    note: Optional[str], start: Optional[time] = None, hours: Optional[float] = None, amount: Optional[Decimal] = None,
    kind: str = "walkin", units: Optional[list[str]] = None,
) -> DropReservation:
    """The café sold these seats itself and took the cash. They hold the seats
    exactly like a paid online reservation (so nobody else can book them), but
    no money moves through the app and nothing is ever refunded by it."""
    if not await can_manage(db, staff, drop.cafe_id):
        raise ForbiddenException(message="This drop belongs to another café.", error_code="FORBIDDEN")
    await release_expired(db, drop.id)
    await ensure_blocks(db, drop)
    if drop.status == "cancelled" or state(drop) == "ended":
        raise DropError("This drop is over, so it can't take bookings.", "DROP_ENDED")
    name = (name or "").strip() or ("Blocked" if kind == "block" else "Booked at the café")
    if len(name) > 120:
        raise DropError("Write the customer's name (up to 120 letters).", "NEED_NAME")
    phone = (phone or "").strip()
    if phone:
        try:
            phone = clean_phone(phone)
        except Exception:
            raise DropError("That phone number doesn't look right. Leave it empty or fix it.", "BAD_PHONE")
    block = await db.get(DropBlock, block_id)
    if block is None or block.drop_id != drop.id or block.closed:
        raise NotFoundException(message="We couldn't find that time.", error_code="BLOCK_NOT_FOUND")
    keys = block_keys(drop, block)
    if units:
        # The café picked the console(s): exactly those, and they never move.
        units = list(dict.fromkeys(str(u) for u in units))
        if any(u not in keys for u in units):
            raise DropError("One of those consoles isn't part of this drop. Refresh and pick again.", "BAD_CONSOLE")
        seats = len(units)
    if seats < 1 or seats > 20:
        raise DropError("Choose 1 to 20 seats.", "BAD_SEATS")
    r_start = r_end = None
    length = None
    if drop.max_hours:
        if hours is None or start is None:
            raise DropError("Pick when it starts and how many hours.", "NEED_HOURS")
        length = round(hours * 60)
        # The café can block any stretch inside the day (a whole evening if it sold it by phone).
        if length < 60 or length % STEP:
            raise DropError("Pick at least 1 hour.", "BAD_HOURS")
        bs, be = block_span(block)
        begin = at_in_block(start, block)
        end_min = begin + length
        if (begin - bs) % STEP or end_min > be:
            raise DropError("That time does not fit inside this session.", "BAD_HOURS")
        r_start = start
        r_end = clock_of(end_min)
    s_, e_ = _window(block, r_start, r_end)
    got = await _place(db, drop, block.id, {"s": s_, "e": e_, "n": seats, "fixed": units or None, "cur": [], "allowed": keys})
    if got is None:
        await db.rollback()
        if units:
            raise DropError("That console is already taken for some of that time. Pick another console or time.", "SOLD_OUT")
        raise DropError("Not enough seats are free at that time. Pick another time or fewer seats.", "SOLD_OUT")
    if kind == "block":
        total = Decimal("0.00")  # a block is not a sale
    elif amount is not None:
        total = money(amount)
    elif r_start is not None:
        total = money(seat_price(drop, begin, length, block.session_date) * seats)
    else:
        total = money(block_price_per_seat(drop, block) * seats)
    now = now_utc()
    res = DropReservation(
        reference=_reference(), drop_id=drop.id, block_id=block.id, user_id=staff.id, seats=seats,
        status="confirmed", block_price=total, deposit_amount=Decimal("0.00"), balance_due=Decimal("0.00"),
        expires_at=now, paid_at=now, checkin_token=secrets.token_urlsafe(18), used_early_access=False,
        start_time=r_start, end_time=r_end, hours=length // 60 if length else None,
        units=got, units_pinned=bool(units),
        source="block" if kind == "block" else "offline", guest_name=name, guest_phone=phone or None, note=(note or "").strip()[:200] or None,
    )
    db.add(res)
    await db.commit()
    await db.refresh(res)
    return res


async def cancel_offline(db: AsyncSession, res: DropReservation, staff: User) -> DropReservation:
    """The café wrote it down by mistake or the customer called off. Frees the seats."""
    drop = await db.get(Drop, res.drop_id)
    if not await can_manage(db, staff, drop.cafe_id):
        raise ForbiddenException(message="Only the café can do this.", error_code="FORBIDDEN")
    res = (await db.execute(select(DropReservation).where(DropReservation.id == res.id).with_for_update())).scalars().one()
    if res.source not in ("offline", "block"):
        raise DropError("Only a booking you wrote down yourself can be removed here.", "NOT_OFFLINE")
    if res.status not in HOLDING:
        raise DropError("That booking is already closed.", "NOT_ACTIVE")
    res.status = "cancelled"
    await _give_back(db, res.block_id)
    await db.commit()
    await db.refresh(res)
    return res


async def _lock_by_order(db: AsyncSession, order_id: str) -> Optional[DropReservation]:
    return (await db.execute(
        select(DropReservation).where(DropReservation.razorpay_order_id == order_id).with_for_update()
    )).scalars().first()


async def _retake(db: AsyncSession, res: DropReservation) -> Optional[list[str]]:
    """A late payment: is a console of the same setup still free for its time?"""
    drop = await db.get(Drop, res.drop_id)
    block = await db.get(DropBlock, res.block_id)
    if drop is None or block is None:
        return None
    s, e = res_window(res, block)
    keys = block_keys(drop, block)
    return await _place(db, drop, block.id, {"s": s, "e": e, "n": res.seats, "fixed": None, "cur": res.units or [],
                                             "allowed": same_setup(keys, res.units, primary_tier(drop)), "id": str(res.id)})


async def mark_paid(db: AsyncSession, res: DropReservation, payment_id: str) -> str:
    """Record a captured deposit. Safe to call twice (verify + webhook race)."""
    if res.status in PAID:
        return "already_paid"
    if res.status == "refunded":
        return "already_refunded"
    res.razorpay_payment_id = payment_id
    res.paid_at = now_utc()
    if res.status == "pending_payment":
        res.status = "confirmed"
        outcome = "confirmed"
    elif res.status == "expired" and (late := await _retake(db, res)) is not None:
        # Paid after the hold ran out, but a seat was still free.
        res.units = late
        res.status = "confirmed"
        outcome = "confirmed_late"
    else:
        # Paid after the hold ran out and the seats are gone (or the drop was
        # cancelled): give the money back straight away.
        try:
            res.refund_id = refund_payment(payment_id, Decimal(str(res.deposit_amount)), "Seat no longer free")
            res.status, res.refunded_at = "refunded", now_utc()
            res.refund_reason = "Paid after the 10-minute hold ended and the seat was gone"
        except Exception as exc:
            logger.error("drop_late_refund_failed", reservation=res.reference, error=str(exc)[:300])
            res.refund_reason = f"NEEDS MANUAL REFUND: {str(exc)[:200]}"
        outcome = "refunded_late"
    if res.status == "confirmed":
        drop = await db.get(Drop, res.drop_id)
        db.add(AnalyticsEvent(session_id=f"server-{res.user_id}", user_id=res.user_id, event_type="ui_action",
                              cafe_id=drop.cafe_id if drop else None,
                              event_metadata={"action": "drop_payment_success", "drop": drop.slug if drop else None}))
    await db.commit()
    return outcome


async def verify(db: AsyncSession, user: User, order_id: str, payment_id: str, signature: str) -> tuple[DropReservation, str]:
    res = await _lock_by_order(db, order_id)
    if res is None:
        raise NotFoundException(message="We couldn't find this payment.", error_code="RESERVATION_NOT_FOUND")
    if res.user_id != user.id:
        raise ForbiddenException(message="This isn't your reservation.", error_code="FORBIDDEN")
    if not signature_ok(order_id, payment_id, signature):
        raise DropError("We couldn't confirm this payment. If money left your account, it comes back in 5-7 days.", "INVALID_SIGNATURE")
    outcome = await mark_paid(db, res, payment_id)
    await db.refresh(res)
    return res, outcome


async def handle_webhook_capture(db: AsyncSession, order_id: str, payment_id: str) -> Optional[str]:
    """Called by the Razorpay webhook for orders that aren't normal bookings."""
    res = await _lock_by_order(db, order_id)
    if res is None:
        return None
    return await mark_paid(db, res, payment_id)


# ---------------------------------------------------------------- refunds and check-in

async def refund(db: AsyncSession, res: DropReservation, reason: str, dry_run: bool = False) -> str:
    """Give back one reservation's deposit (game delayed, café cancelled)."""
    if res.status == "refunded":
        return "already_refunded"
    if res.status not in PAID or not res.razorpay_payment_id:
        return "nothing_paid"
    if dry_run:
        return "would_refund"
    try:
        refund_id = refund_payment(res.razorpay_payment_id, Decimal(str(res.deposit_amount)), reason)
    except Exception as exc:
        logger.error("drop_refund_failed", reservation=res.reference, error=str(exc)[:300])
        res.refund_reason = f"REFUND FAILED: {str(exc)[:200]}"
        await db.commit()
        return "failed"
    holding = res.status in PAID
    res.refund_id, res.refunded_at, res.refund_reason, res.status = refund_id, now_utc(), reason[:500], "refunded"
    if holding:
        await _give_back(db, res.block_id, res.seats)
    await db.commit()
    return "refunded"


async def can_manage(db: AsyncSession, user: User, cafe_id: UUID) -> bool:
    from app.api.deps import get_user_roles
    roles = await get_user_roles(user.id, db)
    if "admin" in roles:
        return True
    cafe = await db.get(Cafe, cafe_id)
    return cafe is not None and cafe.owner_id == user.id


async def dedicated_windows(db: AsyncSession, tier_id: UUID, day) -> list[tuple[int, int, int, str]]:
    """Seats of a rig kept for a live drop on this calendar day: (start_min, end_min, seats, title),
    end_min at most 1440. Normal booking sees these seats as taken during the drop's hours on
    that date (each date can have its own hours), plus the night before's hours past midnight."""
    out = []
    for d in await dedicated_drops(db, tier_id, day):
        n = tier_seats(d, tier_id)
        if runs_on(d, day):
            for s, e in day_intervals(d, day):
                out.append((s, min(e, DAY_MIN), n, d.title))
        for s, e in tails_into(d, day):
            out.append((s, e, n, d.title))
    return out


async def _cafe_drops(db: AsyncSession, cafe_id, lo: date, hi: date, ignore: Optional[UUID] = None) -> list[Drop]:
    return list((await db.execute(select(Drop).where(
        Drop.cafe_id == cafe_id, Drop.status == "live", Drop.starts_on.is_not(None),
        Drop.starts_on <= hi, or_(Drop.ends_on.is_(None), Drop.ends_on >= lo),
        *([Drop.id != ignore] if ignore else []),
    ))).scalars().all())


async def dedicated_drops(db: AsyncSession, tier_id: UUID, day) -> list[Drop]:
    """Live drops using consoles of this setup that could hold them on this date (its own hours or the night before's)."""
    from app.models.hardware_tier import HardwareTier
    tier = await db.get(HardwareTier, tier_id)
    if tier is None:
        return []
    rows = await _cafe_drops(db, tier.cafe_id, day - timedelta(days=1), day)
    return [d for d in rows if (d.daily_start_time is not None or d.day_hours) and tier_seats(d, tier_id) > 0]


def _cafe_span(cafe: Cafe) -> Optional[tuple[int, int]]:
    """The café's open hours as minutes from midnight; None when not set or open 24 hours."""
    if not cafe.opening_time or not cafe.closing_time:
        return None
    o, c = span(cafe.opening_time, cafe.closing_time)
    return None if c - o >= DAY_MIN else (o, c)


async def check_rig_free(db: AsyncSession, cafe: Cafe, tier, day_from: date, day_to: date,
                         start: time, end: time, seats: int, ignore_drop_id: Optional[UUID] = None) -> None:
    """Refuse a drop whose kept seats would not fit next to normal bookings already made.
    Also keeps the daily hours inside the cafe's opening hours. Hours can run past midnight."""
    s_min, e_min = span(start, end)
    open_span = _cafe_span(cafe)
    if open_span is not None:
        o, c = open_span
        s_in = s_min if s_min >= o else s_min + DAY_MIN
        if s_in + (e_min - s_min) > c:
            raise DropError(
                f"Your café is open {cafe.opening_time:%H:%M} to {cafe.closing_time:%H:%M}. Keep the drop hours inside that.",
                "OUTSIDE_CAFE_HOURS")
    days = {day_from + timedelta(days=i): [(s_min, e_min)] for i in range((day_to - day_from).days + 1)}
    await check_rig_free_days(db, tier, days, seats, ignore_drop_id)


async def check_rig_free_days(db: AsyncSession, tier, windows: dict, seats: int, ignore_drop_id: Optional[UUID] = None) -> None:
    """The same check for any set of dates and opening stretches: {date: [(start_min, end_min)]}.
    Event hours may go past the café's normal hours (a launch night), so only seats are checked."""
    from app.models.booking import Booking, BookingStatus, SEAT_HOLDING_STATUSES
    windows = {k: v for k, v in windows.items() if v}
    if not windows:
        return
    lo, hi = min(windows), max(windows)
    # A drop keeps real consoles, so it is checked against every console of the setup.
    cap = tier.total_seats or tier.app_bookable_seats
    ttl = datetime.now(timezone.utc) - timedelta(minutes=15)
    rows = (await db.execute(select(Booking).where(
        Booking.hardware_tier_id == tier.id,
        Booking.session_date >= lo, Booking.session_date <= hi + timedelta(days=1),
        or_(Booking.status.in_(SEAT_HOLDING_STATUSES),
            and_(Booking.status == BookingStatus.PENDING_PAYMENT, Booking.created_at >= ttl))))).scalars().all()
    others = [d for d in await _cafe_drops(db, tier.cafe_id, lo - timedelta(days=1), hi + timedelta(days=1), ignore_drop_id)
              if tier_seats(d, tier.id) > 0]
    by_day: dict = {}
    for bk in rows:
        by_day.setdefault(bk.session_date, []).append(bk)
    for day in sorted(windows):
        # Everything on one axis: minutes from this day's midnight, the next day after 1440.
        used = []
        for off in (0, 1):
            for bk in by_day.get(day + timedelta(days=off), []):
                bs_, be_ = span(bk.start_time, bk.end_time)
                used.append((bs_ + off * DAY_MIN, be_ + off * DAY_MIN, bk.seats_count))
        for d in others:
            for off in (-1, 0, 1):
                dd = day + timedelta(days=off)
                if runs_on(d, dd):
                    for ds, de in day_intervals(d, dd):
                        used.append((ds + off * DAY_MIN, de + off * DAY_MIN, tier_seats(d, tier.id)))
        for s_min, e_min in windows[day]:
            points = {s_min} | {w[0] for w in used if s_min <= w[0] < e_min}
            worst = max(sum(n for a_, b_, n in used if a_ <= t < b_) for t in points)
            if worst + seats > cap:
                free = max(0, cap - worst)
                raise DropError(
                    f"On {day.day} {day:%b} only {free} of your {tier.model or tier.name} {'is' if free == 1 else 'are'} free in those hours "
                    f"({worst} already booked). Keep fewer seats, move the hours, or sort those bookings out first.",
                    "SEATS_CLASH")


async def _reconcile_day(db: AsyncSession, drop: Drop, day: date, intervals: list[tuple[int, int]]) -> None:
    """Make this date's sessions match its opening stretches. Sessions that hold bookings must
    still cover those bookings (same clock times), or the change is refused. Removed hours are
    closed, not deleted, so old reservations keep their row."""
    blocks = (await db.execute(select(DropBlock).where(DropBlock.drop_id == drop.id, DropBlock.session_date == day)
                               .with_for_update())).scalars().all()
    if not blocks:
        return  # made from the schedule when the date comes into view
    held: dict = {}
    for b in blocks:
        rows = (await db.execute(select(DropReservation).where(
            DropReservation.block_id == b.id, DropReservation.status.in_(HOLDING)))).scalars().all()
        if rows and not b.closed:
            held[b.id] = [(r, res_window(r, b)) for r in rows]
    assigned: dict[int, DropBlock] = {}
    for b in blocks:
        if b.id not in held:
            continue
        wins = [w for _r, w in held[b.id]]
        lo, hi = min(w[0] for w in wins), max(w[1] for w in wins)
        idx = next((i for i, (s, e) in enumerate(intervals) if s <= lo and hi <= e), None)
        if idx is None or idx in assigned:
            raise DropError(f"There are bookings from {hhmm(lo % DAY_MIN)} to {hhmm(hi % DAY_MIN)} on {day.day} {day:%b}. "
                            "Keep those hours open, or remove those bookings first.", "HAS_BOOKINGS")
        assigned[idx] = b
    used_ids = {b.id for b in assigned.values()}
    for i, (s, e) in enumerate(intervals):
        st, en = clock_of(s), clock_of(e)
        b = assigned.get(i)
        same_start = next((x for x in blocks if x.start_time == st and x.id not in used_ids), None)
        if b is None:
            b = same_start
        elif b.start_time != st and same_start is not None:
            # Another (empty) session already uses this start time: move it aside first.
            same_start.closed = True
            same_start.start_time = clock_of((s + 1) % DAY_MIN)
            await db.flush()
        if b is None:
            b = DropBlock(drop_id=drop.id, session_date=day, start_time=st, end_time=en, seats_total=drop.daily_seats or 1)
            db.add(b)
        else:
            b.start_time, b.end_time, b.closed = st, en, False
            for r, w in held.get(b.id, []):
                if res_window(r, b) != w:
                    raise DropError(f"There are bookings from {hhmm(w[0] % DAY_MIN)} to {hhmm(w[1] % DAY_MIN)} on {day.day} {day:%b} "
                                    "that would move with this change. Keep those hours open.", "HAS_BOOKINGS")
        used_ids.add(b.id)
    for x in blocks:
        if x.id not in used_ids:
            x.closed = True
    await db.flush()


async def apply_schedule(db: AsyncSession, drop: Drop, dates: list[date], actor: User, *, hours=None,
                         default_hours: bool = False, prices=None, default_prices: bool = False) -> None:
    """Set the opening hours and/or price windows of some event dates (copy-to-days sends several).
    hours: list of {start, end} ([] = closed) or None to leave as is; default_hours=True goes back
    to the daily hours. Same for prices. Bookings already made are never moved or dropped."""
    from app.models.hardware_tier import HardwareTier
    from app.models.owner_audit_log import OwnerAuditLog
    if not dates:
        raise DropError("Pick at least one day.", "NO_DAYS")
    if drop.starts_on is None:
        raise DropError("This drop has no daily schedule.", "NOT_ROLLING")
    last = drop.ends_on or drop.starts_on + timedelta(days=MAX_DAYS - 1)
    for d in dates:
        if d < drop.starts_on or d > last:
            raise DropError(f"{d.day} {d:%b} is not one of this drop's days.", "NOT_A_DAY")
    before = {"dayHours": drop.day_hours, "dayPrices": drop.day_prices}
    if hours is not None or default_hours:
        clean = clean_intervals(hours) if hours is not None else None
        dh = dict(drop.day_hours or {})
        for d in dates:
            if default_hours:
                dh.pop(d.isoformat(), None)
            else:
                dh[d.isoformat()] = clean
        drop.day_hours = dh or None
        # A night that runs past midnight must not run into the next date's own opening.
        for d in sorted(set(dates) | {x + timedelta(days=1) for x in dates}):
            if not runs_on(drop, d) or (d == drop.starts_on and not drop.day_hours):
                continue
            tails = [t for t in tails_into(drop, d) if runs_on(drop, d - timedelta(days=1))]
            for ts, te in tails:
                for s, e in day_intervals(drop, d):
                    if s < te and ts < e:
                        prev = d - timedelta(days=1)
                        raise DropError(f"{prev.day} {prev:%b} runs past midnight until {hhmm(te)}, into {d.day} {d:%b}'s opening at "
                                        f"{hhmm(s % DAY_MIN)}. Make the night end earlier or the next day open later.", "HOURS_OVERLAP")
        if drop.status == "live":
            for tid, n in tier_counts(drop).items():
                tier = await db.get(HardwareTier, UUID(tid)) if tid != "_" else None
                if tier is not None:
                    await check_rig_free_days(db, tier, {d: day_intervals(drop, d) for d in dates}, n, drop.id)
        for d in dates:
            await _reconcile_day(db, drop, d, day_intervals(drop, d))
        # Launch day now opening at midnight replaces the night-before session.
        eve = drop.starts_on - timedelta(days=1)
        if drop.starts_on in dates and not launch_night(drop):
            for b in (await db.execute(select(DropBlock).where(DropBlock.drop_id == drop.id, DropBlock.session_date == eve,
                                                               DropBlock.closed.is_(False)))).scalars().all():
                n = (await db.execute(select(func.count()).select_from(DropReservation).where(
                    DropReservation.block_id == b.id, DropReservation.status.in_(HOLDING)))).scalar_one()
                if n:
                    raise DropError("There are bookings on launch night. Keep launch day's hours as they are, or remove those bookings first.",
                                    "HAS_BOOKINGS")
                b.closed = True
    if prices is not None or default_prices:
        if prices is not None:
            _lp, tp = clean_price_options(None, prices)
        dp = dict(drop.day_prices or {})
        for d in dates:
            if default_prices:
                dp.pop(d.isoformat(), None)
            else:
                dp[d.isoformat()] = tp or []
        drop.day_prices = dp or None
    db.add(OwnerAuditLog(owner_id=actor.id, action="drop.schedule.updated", entity_type="drop", entity_id=str(drop.id),
                         before_summary=json.dumps(before)[:4000],
                         after_summary=json.dumps({"dates": [d.isoformat() for d in dates], "dayHours": drop.day_hours,
                                                   "dayPrices": drop.day_prices})[:4000]))
    await db.commit()


async def owner_day_grid(db: AsyncSession, drop: Drop, day) -> tuple[list[dict], list[dict], Optional[dict]]:
    """One day of a drop in the same shape as the normal Free slots grid:
    hour by hour (total, booked, pending, available), who is behind it, and the
    live "right now" counts when the day is today."""
    block = (await db.execute(select(DropBlock).where(DropBlock.drop_id == drop.id, DropBlock.session_date == day,
                                                       DropBlock.closed.is_(False)).order_by(DropBlock.start_time.desc()))).scalars().first()
    if block is None:
        return [], [], None
    rows = (await db.execute(
        select(DropReservation, User.full_name).join(User, User.id == DropReservation.user_id)
        .where(DropReservation.block_id == block.id, DropReservation.status.in_(HOLDING))
        .order_by(DropReservation.created_at)
    )).all()
    now = now_utc()
    live = [(r, (r.guest_name if r.source in ("offline", "block") else n)) for r, n in rows
            if r.status in PAID or (r.expires_at is not None and _aware(r.expires_at) > now)]

    def clock(m: int) -> str:
        m %= DAY_MIN
        return f"{m // 60:02d}:{m % 60:02d}"

    def counts(lo: int, hi: int) -> tuple[int, int]:
        booked = pending = 0
        for r, _ in live:
            s, e = res_window(r, block)
            if s < hi and e > lo:
                if r.status in PAID:
                    booked += r.seats
                else:
                    pending += r.seats
        return booked, pending

    timeline = []
    for h in range(*block_span(block), 60):
        booked, pending = counts(h, h + 60)
        timeline.append({
            "label": clock(h), "startTime": clock(h), "endTime": clock(h + 60),
            "available": max(0, block.seats_total - booked - pending),
            "booked": booked, "pending": pending, "blocked": 0, "total": block.seats_total,
        })
    bookings = []
    for r, name in live:
        s, e = res_window(r, block)
        bookings.append({"startTime": clock(s), "endTime": clock(e), "seatsCount": r.seats, "status": r.status,
                         "name": name, "reference": r.reference, "_s": s})
    bookings.sort(key=lambda b: b.pop("_s"))
    now_stats = None
    ist_now = now.astimezone(IST)
    if day in (ist_now.date(), ist_now.date() - timedelta(days=1)):
        m = (ist_now.date() - day).days * DAY_MIN + ist_now.hour * 60 + ist_now.minute
        booked, pending = counts(m, m + 1)
        now_stats = {"available": max(0, block.seats_total - booked - pending), "occupied": booked,
                     "pending": pending, "blocked": 0, "total": block.seats_total}
    return timeline, bookings, now_stats


async def check_in(db: AsyncSession, token: str, staff: User) -> tuple[DropReservation, str]:
    res = (await db.execute(
        select(DropReservation).where(DropReservation.checkin_token == token).with_for_update()
    )).scalars().first()
    if res is None:
        raise NotFoundException(message="This pass isn't valid.", error_code="PASS_NOT_FOUND")
    drop = await db.get(Drop, res.drop_id)
    if not await can_manage(db, staff, drop.cafe_id):
        raise ForbiddenException(message="Only the café can check people in.", error_code="FORBIDDEN")
    if res.status == "checked_in":
        return res, "already"
    if res.status == "given_away":
        raise DropError("This seat was given to someone else after the 15-minute wait.", "GIVEN_AWAY")
    if res.status != "confirmed":
        raise DropError("This reservation isn't paid, so it can't be checked in.", "NOT_PAID")
    res.status, res.checked_in_at, res.checked_in_by = "checked_in", now_utc(), staff.id
    await db.commit()
    await db.refresh(res)
    return res, "checked_in"


async def join_waitlist(db: AsyncSession, drop: Drop, phone: str, user: Optional[User]) -> tuple[int, bool]:
    clean = clean_phone(phone)
    existing = (await db.execute(
        select(DropWaitlist).where(DropWaitlist.drop_id == drop.id, DropWaitlist.phone == clean)
    )).scalars().first()
    added = existing is None
    if added:
        db.add(DropWaitlist(drop_id=drop.id, phone=clean, user_id=user.id if user else None))
        await db.commit()
    count = (await db.execute(select(func.count()).select_from(DropWaitlist).where(DropWaitlist.drop_id == drop.id))).scalar_one()
    return int(count), added


async def funnel(db: AsyncSession, drop: Drop) -> dict:
    """Counts of each tracked step, plus share taps by channel."""
    action = AnalyticsEvent.event_metadata["action"].as_string()
    rows = (await db.execute(
        select(action, AnalyticsEvent.event_metadata["channel"].as_string(), func.count())
        .where(
            AnalyticsEvent.event_type == "ui_action",
            action.in_(FUNNEL_ACTIONS),
            AnalyticsEvent.event_metadata["drop"].as_string() == drop.slug,
        )
        # By position: Postgres sees each ->> with a bound key as a different
        # expression, so grouping by the expressions fails there (not on SQLite).
        .group_by(literal_column("1"), literal_column("2"))
    )).all()
    out = {a: 0 for a in FUNNEL_ACTIONS}
    channels: dict[str, int] = {}
    for act, channel, n in rows:
        out[act] += n
        if act == "drop_share_clicked":
            channels[channel or "other"] = channels.get(channel or "other", 0) + n
    return {
        "pageViews": out["drop_page_view"], "blockSelected": out["drop_block_selected"],
        "paymentStarted": out["drop_payment_started"], "paymentSuccess": out["drop_payment_success"],
        "shareClicked": out["drop_share_clicked"], "shareByChannel": channels,
    }


GRACE_MINUTES = 15


def reservation_start(res: DropReservation, block: DropBlock) -> datetime:
    s, _ = res_window(res, block)
    return datetime.combine(block.session_date, time(0, 0)).replace(tzinfo=IST) + timedelta(minutes=s)


async def give_away(db: AsyncSession, res: DropReservation, staff: User) -> DropReservation:
    """The cafe frees a seat after the 15-minute wait. The fee is kept, no refund."""
    drop = await db.get(Drop, res.drop_id)
    if not await can_manage(db, staff, drop.cafe_id):
        raise ForbiddenException(message="Only the café can do this.", error_code="FORBIDDEN")
    res = (await db.execute(select(DropReservation).where(DropReservation.id == res.id).with_for_update())).scalars().one()
    if res.status != "confirmed":
        raise DropError("Only a paid seat that has not arrived can be given away.", "NOT_GIVABLE")
    block = await db.get(DropBlock, res.block_id)
    if now_utc() < reservation_start(res, block) + timedelta(minutes=GRACE_MINUTES):
        raise DropError("Wait until 15 minutes after the start time before giving this seat away.", "TOO_EARLY")
    res.status, res.given_away_at = "given_away", now_utc()
    await _give_back(db, res.block_id)
    await db.commit()
    await db.refresh(res)
    return res
