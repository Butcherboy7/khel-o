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

from sqlalchemy import and_, func, select, update
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


async def _take(db: AsyncSession, block_id: UUID, seats: int) -> bool:
    res = await db.execute(
        update(DropBlock)
        .where(DropBlock.id == block_id, DropBlock.seats_taken + seats <= DropBlock.seats_total)
        .values(seats_taken=DropBlock.seats_taken + seats)
    )
    return res.rowcount == 1


async def _give_back(db: AsyncSession, block_id: UUID, seats: int) -> None:
    await db.execute(
        update(DropBlock)
        .where(DropBlock.id == block_id, DropBlock.seats_taken >= seats)
        .values(seats_taken=DropBlock.seats_taken - seats)
    )


async def user_seats(db: AsyncSession, drop_id: UUID, user_id: UUID) -> int:
    total = (await db.execute(
        select(func.coalesce(func.sum(DropReservation.seats), 0)).where(
            DropReservation.drop_id == drop_id,
            DropReservation.user_id == user_id,
            DropReservation.status.in_(HOLDING),
        )
    )).scalar_one()
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
) -> Reserved:
    await release_expired(db, drop.id)
    st = state(drop)
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

    # One reservation at a time per person: lock their row so two taps (or two
    # tabs) can't both pass the 2-seat check.
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    have = await user_seats(db, drop.id, user.id)
    if have + seats > drop.max_seats_per_user:
        left = max(0, drop.max_seats_per_user - have)
        msg = (f"You already have {have} seat{'s' if have != 1 else ''} in this drop. "
               + (f"You can add {left} more." if left else f"The most is {drop.max_seats_per_user} per person."))
        raise DropError(msg, "SEAT_LIMIT")

    if not await _take(db, block.id, seats):
        await db.rollback()
        raise DropError("Sorry, these seats just got taken. Pick another time.", "SOLD_OUT")

    per_seat = block_price_per_seat(drop, block)
    deposit = money(Decimal(str(drop.deposit_amount)) * seats)
    total = money(per_seat * seats)
    reservation = DropReservation(
        reference=_reference(), drop_id=drop.id, block_id=block.id, user_id=user.id, seats=seats,
        status="pending_payment", block_price=total, deposit_amount=deposit,
        balance_due=max(Decimal("0.00"), total - deposit),
        expires_at=now_utc() + timedelta(minutes=HOLD_MINUTES),
        checkin_token=secrets.token_urlsafe(18), used_early_access=early,
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
    elif res.status == "expired" and await _take(db, res.block_id, res.seats):
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
        .group_by(action, AnalyticsEvent.event_metadata["channel"].as_string())
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
