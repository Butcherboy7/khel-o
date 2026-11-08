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
    minutes = (block.end_time.hour * 60 + block.end_time.minute) - (block.start_time.hour * 60 + block.start_time.minute)
    return (Decimal(minutes) / Decimal(60)).quantize(Decimal("0.01"))


def block_price_per_seat(drop: Drop, block: DropBlock) -> Decimal:
    return money(Decimal(str(drop.price_per_hour)) * block_hours(block))


def block_starts_at(block: DropBlock) -> datetime:
    return datetime.combine(block.session_date, block.start_time).replace(tzinfo=IST)


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
    if drop.daily_start_time is None or drop.status != "live" or drop.starts_on is None:
        return
    today = now_utc().astimezone(IST).date()
    first = max(today, drop.starts_on)
    # Before launch the first week from launch day is already open for booking; after launch the
    # window rolls: today plus the next 6 days.
    last = min(first + timedelta(days=VISIBLE_DAYS - 1), drop.ends_on or drop.starts_on + timedelta(days=MAX_DAYS - 1))
    have = set((await db.execute(select(DropBlock.session_date).where(DropBlock.drop_id == drop.id))).scalars().all())
    made = False
    d = first
    while d <= last:
        if d not in have:
            db.add(DropBlock(drop_id=drop.id, session_date=d, start_time=drop.daily_start_time,
                             end_time=drop.daily_end_time, seats_total=drop.daily_seats or 1))
            made = True
        d += timedelta(days=1)
    if made:
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()


async def blocks_of(db: AsyncSession, drop_id: UUID) -> list[DropBlock]:
    rows = await db.execute(
        select(DropBlock).where(DropBlock.drop_id == drop_id).order_by(DropBlock.session_date, DropBlock.start_time)
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


def res_window(res_or_none, block: DropBlock) -> tuple[int, int]:
    """Minutes-from-midnight window a reservation occupies (whole session if not flexible)."""
    if res_or_none is not None and res_or_none.start_time is not None:
        return _mins(res_or_none.start_time), _mins(res_or_none.end_time)
    return _mins(block.start_time), _mins(block.end_time)


def _peak(windows: list[tuple[int, int, int]], block: DropBlock) -> int:
    """Most seats in use at any one hour of the session. windows = (start, end, seats)."""
    peak = 0
    for h in range(_mins(block.start_time), _mins(block.end_time), STEP):
        used = sum(n for s, e, n in windows if s < h + STEP and e > h)
        peak = max(peak, used)
    return peak


async def _holding_windows(db: AsyncSession, block: DropBlock) -> list[tuple[int, int, int]]:
    rows = (await db.execute(
        select(DropReservation).where(DropReservation.block_id == block.id, DropReservation.status.in_(HOLDING))
        .execution_options(populate_existing=True)
    )).scalars().all()
    return [(*res_window(r, block), r.seats) for r in rows]


async def _take(db: AsyncSession, block_id: UUID, seats: int, start: Optional[time] = None, end: Optional[time] = None) -> bool:
    """Claim seats for [start, end) of a session (the whole session if omitted).
    The block row is locked first so two people can't both take the last seat
    of an hour; seats_taken then holds the busiest hour."""
    if start is None:
        # The whole session adds to every hour, so the busiest hour grows by the same amount.
        res = await db.execute(
            update(DropBlock)
            .where(DropBlock.id == block_id, DropBlock.seats_taken + seats <= DropBlock.seats_total)
            .values(seats_taken=DropBlock.seats_taken + seats)
        )
        return res.rowcount == 1
    block = (await db.execute(select(DropBlock).where(DropBlock.id == block_id).with_for_update())).scalars().first()
    if block is None:
        return False
    windows = await _holding_windows(db, block)
    s, e = (_mins(start), _mins(end)) if start is not None else (_mins(block.start_time), _mins(block.end_time))
    peak = _peak(windows + [(s, e, seats)], block)
    if peak > block.seats_total:
        return False
    await db.execute(update(DropBlock).where(DropBlock.id == block_id).values(seats_taken=peak))
    return True


async def _give_back(db: AsyncSession, block_id: UUID, seats: int = 0) -> None:
    """Recount after a reservation stops holding (its status is already changed)."""
    await db.flush()
    block = (await db.execute(select(DropBlock).where(DropBlock.id == block_id).with_for_update())).scalars().first()
    if block is None:
        return
    await db.execute(update(DropBlock).where(DropBlock.id == block_id).values(seats_taken=_peak(await _holding_windows(db, block), block)))


def seats_free(windows: list[tuple[int, int, int]], block: DropBlock) -> dict[str, int]:
    """Free seats for each hour of a session, keyed 'HH:MM'."""
    out = {}
    for h in range(_mins(block.start_time), _mins(block.end_time), STEP):
        used = sum(n for s, e, n in windows if s < h + STEP and e > h)
        out[f"{h // 60:02d}:{h % 60:02d}"] = max(0, block.seats_total - used)
    return out


def fee_per_seat(drop: Drop, hours: float) -> Decimal:
    """₹100 up to 3 hours, ₹200 for 4 or 5 (owner can change both)."""
    short = Decimal(str(drop.deposit_amount))
    if hours <= 3:
        return money(short)
    return money(Decimal(str(drop.deposit_amount_long)) if drop.deposit_amount_long is not None else short * 2)


def booked_windows(windows: list[tuple[int, int, int]]) -> list[dict]:
    """The shape the booking slider already understands (who is not shown)."""
    return [{"startTime": f"{s // 60:02d}:{s % 60:02d}", "endTime": f"{e // 60:02d}:{e % 60:02d}", "seatsCount": n} for s, e, n in windows]


async def user_seats(db: AsyncSession, drop_id: UUID, user_id: UUID, block_id: Optional[UUID] = None) -> int:
    """Seats this person holds. The per-person cap is per day (block), so booking a
    second night is never blocked by the first."""
    q = select(func.coalesce(func.sum(DropReservation.seats), 0)).where(
        DropReservation.drop_id == drop_id,
        DropReservation.user_id == user_id,
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
    start: Optional[time] = None, hours: Optional[float] = None,
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
    if block is None or block.drop_id != drop.id:
        raise NotFoundException(message="We couldn't find that time.", error_code="BLOCK_NOT_FOUND")
    if block_starts_at(block) <= now_utc():
        raise DropError("This time has already started.", "BLOCK_STARTED")
    if drop.ends_on is not None and block.session_date > drop.ends_on:
        raise DropError("This drop has ended for that day.", "DROP_ENDED")
    if drop.starts_on is not None and block.session_date < drop.starts_on:
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
        if length < 60 or length > drop.max_hours * 60 or length % STEP:
            raise DropError(f"You can play 1 to {drop.max_hours} hours.", "BAD_HOURS")
        offset = _mins(start) - _mins(block.start_time)
        end_min = _mins(start) + length
        if offset < 0 or offset % STEP or end_min > _mins(block.end_time):
            raise DropError("That time does not fit inside this session.", "BAD_HOURS")
        r_start = start
        r_end = time(end_min // 60, end_min % 60) if end_min < 1440 else time(23, 59)
        if datetime.combine(block.session_date, r_start).replace(tzinfo=IST) <= now_utc():
            raise DropError("That hour has already started.", "BLOCK_STARTED")

    if not await _take(db, block.id, seats, r_start, r_end):
        await db.rollback()
        raise DropError("Sorry, these seats just got taken. Pick another time.", "SOLD_OUT")

    if r_start is not None:
        per_seat = money(Decimal(str(drop.price_per_hour)) * Decimal(length) / Decimal(60))
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
        start_time=r_start, end_time=r_end, hours=length // 60 if r_start is not None else None,
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


async def _lock_by_order(db: AsyncSession, order_id: str) -> Optional[DropReservation]:
    return (await db.execute(
        select(DropReservation).where(DropReservation.razorpay_order_id == order_id).with_for_update()
    )).scalars().first()


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
    elif res.status == "expired" and await _take(db, res.block_id, res.seats, res.start_time, res.end_time):
        # Paid after the hold ran out, but a seat was still free.
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
    """Seats of a rig kept for a live drop on this day: (start_min, end_min, seats, title).
    Normal booking sees these seats as taken during the drop's daily hours."""
    return [(_mins(d.daily_start_time), _mins(d.daily_end_time), d.daily_seats or 0, d.title) for d in await dedicated_drops(db, tier_id, day)]


async def dedicated_drops(db: AsyncSession, tier_id: UUID, day) -> list[Drop]:
    rows = (await db.execute(select(Drop).where(
        Drop.hardware_tier_id == tier_id, Drop.status == "live", Drop.daily_start_time.is_not(None),
        Drop.starts_on <= day, or_(Drop.ends_on.is_(None), Drop.ends_on >= day),
    ))).scalars().all()
    return list(rows)


async def check_rig_free(db: AsyncSession, cafe: Cafe, tier, day_from: date, day_to: date,
                         start: time, end: time, seats: int, ignore_drop_id: Optional[UUID] = None) -> None:
    """Refuse a drop whose kept seats would not fit next to normal bookings already made.
    Also keeps the drop hours inside the cafe's opening hours."""
    from app.models.booking import Booking, BookingStatus, SEAT_HOLDING_STATUSES
    s_min, e_min = _mins(start), _mins(end)
    if cafe.opening_time and cafe.closing_time and cafe.closing_time > cafe.opening_time:
        if s_min < _mins(cafe.opening_time) or e_min > _mins(cafe.closing_time):
            raise DropError(
                f"Your café is open {cafe.opening_time:%H:%M} to {cafe.closing_time:%H:%M}. Keep the drop hours inside that.",
                "OUTSIDE_CAFE_HOURS")
    cap = tier.app_bookable_seats or tier.total_seats
    ttl = datetime.now(timezone.utc) - timedelta(minutes=15)
    rows = (await db.execute(select(Booking).where(
        Booking.hardware_tier_id == tier.id,
        Booking.session_date >= day_from, Booking.session_date <= day_to,
        or_(Booking.status.in_(SEAT_HOLDING_STATUSES),
            and_(Booking.status == BookingStatus.PENDING_PAYMENT, Booking.created_at >= ttl)),
        Booking.start_time < end, Booking.end_time > start))).scalars().all()
    others = (await db.execute(select(Drop).where(
        Drop.hardware_tier_id == tier.id, Drop.status == "live", Drop.daily_start_time.is_not(None),
        Drop.starts_on <= day_to, or_(Drop.ends_on.is_(None), Drop.ends_on >= day_from),
        *( [Drop.id != ignore_drop_id] if ignore_drop_id else [] )))).scalars().all()
    by_day: dict = {}
    for b in rows:
        by_day.setdefault(b.session_date, []).append(b)
    days = set(by_day) | ({day_from} if others else set())
    for day in sorted(days):
        bks = by_day.get(day, [])
        points = {s_min} | {_mins(b.start_time) for b in bks if s_min <= _mins(b.start_time) < e_min}
        worst = 0
        for t in points:
            used = sum(b.seats_count for b in bks if _mins(b.start_time) <= t < _mins(b.end_time))
            used += sum(d.daily_seats or 0 for d in others
                        if d.starts_on <= day and (d.ends_on is None or d.ends_on >= day) and _mins(d.daily_start_time) <= t < _mins(d.daily_end_time))
            worst = max(worst, used)
        if worst + seats > cap:
            free = max(0, cap - worst)
            raise DropError(
                f"On {day.day} {day:%b} only {free} of your {tier.model or tier.name} {'is' if free == 1 else 'are'} free in those hours "
                f"({worst} already booked). Keep fewer seats, move the hours, or sort those bookings out first.",
                "SEATS_CLASH")


async def owner_day_grid(db: AsyncSession, drop: Drop, day) -> tuple[list[dict], list[dict], Optional[dict]]:
    """One day of a drop in the same shape as the normal Free slots grid:
    hour by hour (total, booked, pending, available), who is behind it, and the
    live "right now" counts when the day is today."""
    block = (await db.execute(select(DropBlock).where(DropBlock.drop_id == drop.id, DropBlock.session_date == day))).scalars().first()
    if block is None:
        return [], [], None
    rows = (await db.execute(
        select(DropReservation, User.full_name).join(User, User.id == DropReservation.user_id)
        .where(DropReservation.block_id == block.id, DropReservation.status.in_(HOLDING))
        .order_by(DropReservation.created_at)
    )).all()
    now = now_utc()
    live = [(r, n) for r, n in rows if r.status in PAID or (r.expires_at is not None and _aware(r.expires_at) > now)]

    def clock(m: int) -> str:
        m = min(m, 24 * 60 - 1)
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
    for h in range(_mins(block.start_time), _mins(block.end_time), 60):
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
                         "name": name, "reference": r.reference})
    bookings.sort(key=lambda b: b["startTime"])
    now_stats = None
    ist_now = now.astimezone(IST)
    if day == ist_now.date():
        m = ist_now.hour * 60 + ist_now.minute
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
    t = res.start_time or block.start_time
    return datetime.combine(block.session_date, t).replace(tzinfo=IST)


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
