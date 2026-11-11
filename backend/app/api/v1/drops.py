"""Drops: public page + reserving (/drops) and the café's view (/owner/drops).

The public page needs no login; reserving does. See services/drop_service.py
for the seat and payment rules.
"""
from __future__ import annotations

import csv
import io
import re
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_optional_user, get_user_roles, require_admin
from app.config import settings
from app.core.exceptions import ForbiddenException, NotFoundException
from app.database import get_db
from app.models.cafe import Cafe
from app.models.drop import Drop, DropBlock, DropReservation, DropWaitlist
from app.models.hardware_tier import HardwareTier
from app.models.user import User
from app.services import drop_service as svc
from app.services.challenge_day import qr_data_url

public_router = APIRouter(prefix="/drops", tags=["Drops"])
owner_router = APIRouter(prefix="/owner/drops", tags=["Owner Drops"])


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return svc._aware(dt).isoformat() if dt else None


def _site() -> str:
    return settings.FRONTEND_URL.rstrip("/")


def _block_out(drop: Drop, b: DropBlock, hour_free: Optional[dict] = None) -> dict:
    per_seat = svc.block_price_per_seat(drop, b)
    return {
        "id": str(b.id),
        "date": b.session_date.isoformat(),
        "startTime": b.start_time.strftime("%H:%M"),
        "endTime": b.end_time.strftime("%H:%M"),
        "hours": float(svc.block_hours(b)),
        "seatsTotal": b.seats_total,
        "seatsLeft": max(0, b.seats_total - b.seats_taken),
        "pricePerSeat": float(per_seat),
        "balancePerSeat": float(max(0, per_seat - svc.money(drop.deposit_amount))),
        "hourFree": hour_free or {},
        "started": svc.block_starts_at(b) <= svc.now_utc(),
    }


def _reservation_out(drop: Drop, r: DropReservation, block: Optional[DropBlock]) -> dict:
    pass_url = f"{_site()}/drops/{drop.slug}/pass/{r.checkin_token}"
    paid = r.status in svc.PAID
    return {
        "id": str(r.id),
        "reference": r.reference,
        "status": r.status,
        "seats": r.seats,
        "blockId": str(r.block_id),
        "block": _block_out(drop, block) if block else None,
        "blockPrice": float(r.block_price),
        "depositPaid": float(r.deposit_amount) if paid or r.status == "refunded" else 0,
        "deposit": float(r.deposit_amount),
        "balanceDue": float(r.balance_due),
        "hours": r.hours,
        "startTime": (r.start_time or block.start_time).strftime("%H:%M") if (r.start_time or block) else None,
        "endTime": (r.end_time or block.end_time).strftime("%H:%M") if (r.end_time or block) else None,
        "arriveFrom": _iso(svc.reservation_start(r, block) - timedelta(minutes=svc.GRACE_MINUTES)) if block else None,
        "arriveUntil": _iso(svc.reservation_start(r, block) + timedelta(minutes=svc.GRACE_MINUTES)) if block else None,
        "givenAwayAt": _iso(r.given_away_at),
        "expiresAt": _iso(r.expires_at),
        # Lets the holder reopen the payment if they closed it inside the hold.
        "orderId": r.razorpay_order_id if r.status == "pending_payment" else None,
        "checkedInAt": _iso(r.checked_in_at),
        "refundedAt": _iso(r.refunded_at),
        "passUrl": pass_url if paid else None,
        "qr": qr_data_url(pass_url) if paid else None,
    }


async def _out(db: AsyncSession, drop: Drop, cafe: Cafe, blocks: list[DropBlock]) -> dict:
    """_drop_out plus the rig (PS5, Xbox, PC...) the drop runs on."""
    data = _drop_out(drop, cafe, blocks)
    tier = await db.get(HardwareTier, drop.hardware_tier_id) if drop.hardware_tier_id else None
    data["tierId"] = str(tier.id) if tier else None
    data["playsOn"] = (tier.model or tier.name) if tier else None
    data["platform"] = tier.platform.value if tier is not None and tier.platform else None
    return data


def _cafe_photo(cafe: Cafe) -> Optional[str]:
    """First https photo of the café, preferring the play area."""
    items = cafe.photos if isinstance(cafe.photos, list) else []
    urls = []
    for it in items:
        u = it.get("url") if isinstance(it, dict) else it
        cat = it.get("category") if isinstance(it, dict) else None
        if isinstance(u, str) and u.startswith("https://"):
            urls.append((0 if cat == "play_area" else 1, u))
    return sorted(urls, key=lambda x: x[0])[0][1] if urls else None


def _drop_out(drop: Drop, cafe: Cafe, blocks: list[DropBlock]) -> dict:
    return {
        "id": str(drop.id),
        "slug": drop.slug,
        "title": drop.title,
        "game": drop.game,
        "tagline": drop.tagline,
        "coverImageUrl": drop.cover_image_url,
        "pricePerHour": float(drop.price_per_hour),
        "deposit": float(drop.deposit_amount),
        "depositLong": float(drop.deposit_amount_long if drop.deposit_amount_long is not None else svc.money(drop.deposit_amount) * 2),
        "maxHours": drop.max_hours,
        "startsOn": drop.starts_on.isoformat() if drop.starts_on else None,
        "endsOn": drop.ends_on.isoformat() if drop.ends_on else None,
        "rolling": drop.daily_start_time is not None,
        "seatsPerSlot": drop.daily_seats,
        "maxSeatsPerUser": drop.max_seats_per_user,
        "earlyAccessStartsAt": _iso(drop.early_access_starts_at),
        "publicStartsAt": _iso(drop.public_starts_at),
        "hasEarlyAccessCode": bool(drop.early_access_code),
        "state": svc.state(drop),
        "status": drop.status,
        "cafe": {
            "id": str(cafe.id), "name": cafe.name, "slug": cafe.slug,
            "address": ", ".join(p for p in (cafe.address_line1, cafe.address_line2, cafe.city) if p),
            "city": cafe.city, "mapsUrl": svc.maps_url(cafe),
            # The café's public map pin, so the "pick a café" screen can put the nearest one first.
            "lat": float(cafe.latitude) if cafe.latitude is not None else None,
            "lng": float(cafe.longitude) if cafe.longitude is not None else None,
            # One of the café's own photos, so the "pick a café" list can tell cafés apart.
            "photo": _cafe_photo(cafe),
        },
        "blocks": [_block_out(drop, b) for b in blocks],
        "seatsLeft": sum(max(0, b.seats_total - b.seats_taken) for b in blocks if svc.block_starts_at(b) > svc.now_utc()),
        "seatsTotal": sum(b.seats_total for b in blocks),
    }


async def _public_drop(db: AsyncSession, slug: str, user: Optional[User]) -> tuple[Drop, Cafe]:
    drop = await svc.get_drop_by_slug(db, slug)
    cafe = await db.get(Cafe, drop.cafe_id)
    if drop.status == "draft" and not (user and await svc.can_manage(db, user, drop.cafe_id)):
        raise NotFoundException(message="We couldn't find this drop.", error_code="DROP_NOT_FOUND")
    return drop, cafe


# ---------------------------------------------------------------- public

@public_router.get("")
async def list_drops(db: AsyncSession = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    """Live drops that still have an upcoming session, for the home Drops tab."""
    drops = (await db.execute(
        select(Drop).where(Drop.status == "live").order_by(Drop.early_access_starts_at)
    )).scalars().all()
    out = []
    for drop in drops:
        await svc.ensure_blocks(db, drop)
        if svc.state(drop) == "ended":
            continue
        blocks = [b for b in await svc.blocks_of(db, drop.id)
                  if (drop.ends_on is None or b.session_date <= drop.ends_on) and (drop.starts_on is None or b.session_date >= drop.starts_on)]
        upcoming = [b for b in blocks if svc.block_starts_at(b) > svc.now_utc()]
        if not upcoming:
            continue  # every session has started: nothing left to book
        cafe = await db.get(Cafe, drop.cafe_id)
        data = await _out(db, drop, cafe, blocks)
        data.pop("blocks", None)
        data["nextStartsAt"] = _iso(min(svc.block_starts_at(b) for b in upcoming))
        # A drop you already hold a seat in never counts as "new" on the home tab.
        data["iHold"] = bool(user is not None and (await db.execute(
            select(func.count()).select_from(DropReservation).where(
                DropReservation.drop_id == drop.id, DropReservation.user_id == user.id,
                DropReservation.status.in_(("pending_payment", "confirmed", "checked_in")),
            )
        )).scalar_one())
        out.append(data)
    return {"success": True, "data": out}


@public_router.get("/me/reservations")
async def my_reservations(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    """Everything this person has reserved across all drops, for the Bookings tab."""
    rows = (await db.execute(
        select(DropReservation, Drop, Cafe)
        .join(Drop, Drop.id == DropReservation.drop_id).join(Cafe, Cafe.id == Drop.cafe_id)
        .where(DropReservation.user_id == user.id,
               DropReservation.status.in_(("confirmed", "checked_in", "refunded", "given_away")))
        .order_by(DropReservation.created_at.desc())
    )).all()
    out = []
    for r, drop, cafe in rows:
        block = await db.get(DropBlock, r.block_id)
        d = _reservation_out(drop, r, block)
        d.pop("qr", None)  # the QR lives on the pass page
        d.pop("block", None)
        d.update({"date": block.session_date.isoformat() if block else None, "dropSlug": drop.slug,
                  "dropTitle": drop.title, "game": drop.game, "cafeName": cafe.name,
                  "passPath": f"/drops/{drop.slug}/pass/{r.checkin_token}"})
        out.append(d)
    return {"success": True, "data": out}


@public_router.get("/{slug}")
async def get_drop(slug: str, db: AsyncSession = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    drop, cafe = await _public_drop(db, slug, user)
    await svc.release_expired(db, drop.id)
    await svc.ensure_blocks(db, drop)
    blocks = [b for b in await svc.blocks_of(db, drop.id)
              if (drop.ends_on is None or b.session_date <= drop.ends_on) and (drop.starts_on is None or b.session_date >= drop.starts_on)]
    data = await _out(db, drop, cafe, blocks)
    if drop.max_hours:
        for bd, blk in zip(data["blocks"], blocks):
            wins = await svc._holding_windows(db, blk)
            bd["hourFree"] = svc.seats_free(wins, blk)
            bd["bookedSlots"] = svc.booked_windows(wins)
    mine = []
    if user is not None:
        by_id = {b.id: b for b in blocks}
        rows = (await db.execute(
            select(DropReservation).where(
                DropReservation.drop_id == drop.id, DropReservation.user_id == user.id,
                DropReservation.status.in_(("pending_payment", "confirmed", "checked_in", "refunded")),
            ).order_by(DropReservation.created_at)
        )).scalars().all()
        mine = [_reservation_out(drop, r, by_id.get(r.block_id)) for r in rows]
        data["needsPhone"] = not bool(user.phone_number)
    data["myReservations"] = mine
    # Real number of people who hold a paid seat (shown once it is worth saying).
    data["reservedCount"] = (await db.execute(select(func.count(func.distinct(DropReservation.user_id))).where(
        DropReservation.drop_id == drop.id, DropReservation.status.in_(svc.PAID)))).scalar_one()
    data["waitlistCount"] = (await db.execute(
        select(func.count()).select_from(DropWaitlist).where(DropWaitlist.drop_id == drop.id)
    )).scalar_one()
    return {"success": True, "data": data}


class ReserveRequest(_Camel):
    block_id: UUID
    start_time: Optional[time] = None  # flexible drops: the hour you start
    hours: Optional[float] = Field(None, ge=0.5, le=12)
    seats: int = Field(1, ge=1, le=10)
    code: Optional[str] = Field(None, max_length=40)
    phone: Optional[str] = Field(None, max_length=20)


@public_router.get("/{slug}/walk-in-qr")
async def walk_in_qr(slug: str, db: AsyncSession = Depends(get_db)):
    """A QR for the drop's own page, for the café counter. It only encodes the public link."""
    drop, _cafe = await _public_drop(db, slug, None)
    link = f"{_site()}/drops/{drop.slug}?utm_source=counter&utm_medium=qr"
    return {"success": True, "data": {"url": link, "qr": qr_data_url(link)}}


@public_router.post("/{slug}/reserve", status_code=status.HTTP_201_CREATED)
async def reserve(slug: str, payload: ReserveRequest, db: AsyncSession = Depends(get_db),
                  user: User = Depends(get_current_active_user)):
    drop, cafe = await _public_drop(db, slug, user)
    if not user.phone_number:
        if not payload.phone:
            raise svc.DropError("Add your mobile number so the café can reach you.", "NEED_PHONE")
        user.phone_number = svc.clean_phone(payload.phone)
        await db.flush()
    done = await svc.reserve(db, drop, payload.block_id, user, payload.seats, payload.code,
                             start=payload.start_time, hours=payload.hours)
    block = await db.get(DropBlock, done.reservation.block_id)
    return {"success": True, "data": {
        "reservation": _reservation_out(drop, done.reservation, block),
        "order": {"orderId": done.order_id, "amount": float(done.reservation.deposit_amount),
                  "currency": "INR", "keyId": done.key_id},
    }}


class VerifyRequest(_Camel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@public_router.post("/reservations/verify")
async def verify(payload: VerifyRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    res, outcome = await svc.verify(db, user, payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature)
    drop = await db.get(Drop, res.drop_id)
    block = await db.get(DropBlock, res.block_id)
    return {"success": True, "data": {"outcome": outcome, "reservation": _reservation_out(drop, res, block)}}


class WaitlistRequest(_Camel):
    phone: str = Field(..., min_length=10, max_length=20)


@public_router.post("/{slug}/waitlist", status_code=status.HTTP_201_CREATED)
async def join_waitlist(slug: str, payload: WaitlistRequest, db: AsyncSession = Depends(get_db),
                        user: Optional[User] = Depends(get_optional_user)):
    drop, _ = await _public_drop(db, slug, user)
    if drop.status != "live":
        raise svc.DropError("This drop isn't open.", "DROP_CLOSED")
    count, added = await svc.join_waitlist(db, drop, payload.phone, user)
    return {"success": True, "data": {"count": count, "added": added}}


@public_router.get("/{slug}/pass/{token}")
async def get_pass(slug: str, token: str, db: AsyncSession = Depends(get_db),
                   user: Optional[User] = Depends(get_optional_user)):
    """What the QR opens. The holder sees their pass; the café sees a Check in button."""
    drop = await svc.get_drop_by_slug(db, slug)
    res = (await db.execute(select(DropReservation).where(
        DropReservation.checkin_token == token, DropReservation.drop_id == drop.id))).scalars().first()
    if res is None:
        raise NotFoundException(message="This pass isn't valid.", error_code="PASS_NOT_FOUND")
    manager = bool(user and await svc.can_manage(db, user, drop.cafe_id))
    if not manager and not (user and user.id == res.user_id):
        # Anyone else only learns whether the pass is real.
        return {"success": True, "data": {"valid": res.status in svc.PAID, "status": res.status, "canCheckIn": False,
                                          "dropTitle": drop.title, "reference": res.reference}}
    block = await db.get(DropBlock, res.block_id)
    holder = await db.get(User, res.user_id)
    out = _reservation_out(drop, res, block)
    out.update({"valid": res.status in svc.PAID, "canCheckIn": manager and res.status == "confirmed",
                "dropTitle": drop.title, "holderName": holder.full_name if manager else None,
                "holderPhone": holder.phone_number if manager else None})
    return {"success": True, "data": out}


# ---------------------------------------------------------------- café

async def _managed(db: AsyncSession, user: User, drop_id: UUID) -> tuple[Drop, Cafe]:
    drop = await db.get(Drop, drop_id)
    if drop is None:
        raise NotFoundException(message="We couldn't find this drop.", error_code="DROP_NOT_FOUND")
    if not await svc.can_manage(db, user, drop.cafe_id):
        raise ForbiddenException(message="This drop belongs to another café.", error_code="FORBIDDEN")
    return drop, await db.get(Cafe, drop.cafe_id)


class BlockIn(_Camel):
    date: date
    start_time: time
    end_time: time
    seats: int = Field(..., ge=1, le=100)

    @model_validator(mode="after")
    def _same_day(self):
        if self.end_time <= self.start_time:
            raise ValueError("A time must end after it starts, before midnight")
        return self


class DropCreate(_Camel):
    cafe_id: UUID
    hardware_tier_id: Optional[UUID] = None
    title: str = Field(..., min_length=3, max_length=120)
    game: str = Field(..., min_length=1, max_length=80)
    slug: Optional[str] = Field(None, max_length=60)
    tagline: Optional[str] = Field(None, max_length=160)
    cover_image_url: Optional[str] = Field(None, max_length=1000)
    price_per_hour: float = Field(..., gt=0, le=10000)
    deposit_amount: float = Field(99, ge=1, le=10000)
    max_hours: Optional[int] = Field(None, ge=1, le=12)
    deposit_amount_long: Optional[float] = Field(None, ge=1, le=10000)
    max_seats_per_user: int = Field(2, ge=1, le=2)
    early_access_code: Optional[str] = Field(None, max_length=40)
    early_access_starts_at: datetime
    public_starts_at: datetime
    status: Literal["draft", "live"] = "draft"
    blocks: list[BlockIn] = Field(default_factory=list, max_length=40)
    # Rolling schedule (the easy way): the same hours every day for up to 14 days.
    daily_start_time: Optional[time] = None
    daily_end_time: Optional[time] = None
    daily_seats: Optional[int] = Field(None, ge=1, le=100)
    starts_on: Optional[date] = None
    days: int = Field(14, ge=1, le=14)

    @field_validator("cover_image_url")
    @classmethod
    def _https(cls, v):
        if v and not v.startswith("https://"):
            raise ValueError("The picture link must start with https://")
        return v or None

    @model_validator(mode="after")
    def _check(self):
        if self.early_access_starts_at > self.public_starts_at:
            raise ValueError("Early access must start before (or when) everyone can reserve")
        if self.daily_start_time is not None:
            if self.daily_end_time is None or self.daily_end_time <= self.daily_start_time or not self.daily_seats or not self.starts_on:
                raise ValueError("Set the daily hours, the seats and the first day")
            hrs = ((self.daily_end_time.hour * 60 + self.daily_end_time.minute) - (self.daily_start_time.hour * 60 + self.daily_start_time.minute)) / 60
            if self.deposit_amount > self.price_per_hour * hrs:
                raise ValueError("The fee can't be more than the price of a day's hours")
        elif not self.blocks:
            raise ValueError("Add at least one time, or set the daily hours")
        for b in self.blocks:
            hours = ((b.end_time.hour * 60 + b.end_time.minute) - (b.start_time.hour * 60 + b.start_time.minute)) / 60
            if self.deposit_amount > self.price_per_hour * hours:
                raise ValueError("The deposit can't be more than the price of a time")
        return self


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:50] or "drop"


@owner_router.get("")
async def list_my_drops(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    roles = await get_user_roles(user.id, db)
    stmt = select(Drop, Cafe).join(Cafe, Cafe.id == Drop.cafe_id).order_by(Drop.created_at.desc())
    if "admin" not in roles:
        stmt = stmt.where(Cafe.owner_id == user.id)
    rows = (await db.execute(stmt)).all()
    out = []
    for drop, cafe in rows:
        blocks = await svc.blocks_of(db, drop.id)
        item = await _out(db, drop, cafe, blocks)
        item["paidReservations"] = (await db.execute(select(func.count()).select_from(DropReservation).where(
            DropReservation.drop_id == drop.id, DropReservation.status.in_(svc.PAID)))).scalar_one()
        out.append(item)
    cafes_stmt = select(Cafe.id, Cafe.name, Cafe.opening_time, Cafe.closing_time).order_by(Cafe.name)
    if "admin" not in roles:
        cafes_stmt = cafes_stmt.where(Cafe.owner_id == user.id)
    # opening/closing let the form offer "the whole day, whenever you're open" without the owner typing hours.
    cafes = [{"id": str(i), "name": n,
              "openingTime": o.strftime("%H:%M") if o else None,
              "closingTime": c_.strftime("%H:%M") if c_ else None}
             for i, n, o, c_ in (await db.execute(cafes_stmt)).all()]
    for c in cafes:
        c["tiers"] = [
            {"id": str(t.id), "name": t.model or t.name, "totalSeats": t.total_seats}
            for t in (await db.execute(select(HardwareTier).where(
                HardwareTier.cafe_id == UUID(c["id"]), HardwareTier.is_active.is_(True)).order_by(HardwareTier.name))).scalars().all()
        ]
    return {"success": True, "data": {"drops": out, "cafes": cafes, "suggestedPrice": list(svc.SUGGESTED_PRICE)}}


@owner_router.post("", status_code=status.HTTP_201_CREATED)
async def create_drop(payload: DropCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    cafe = await db.get(Cafe, payload.cafe_id)
    if cafe is None or not await svc.can_manage(db, user, cafe.id):
        raise ForbiddenException(message="You can only make drops for your own café.", error_code="FORBIDDEN")
    slug = _slugify(payload.slug or f"{payload.title}-{cafe.name.split()[0]}")
    if not svc.SLUG_RE.match(slug):
        raise svc.DropError("The link name can only use small letters, numbers and dashes.", "BAD_SLUG")
    base, n = slug, 2
    while (await db.execute(select(Drop.id).where(Drop.slug == slug))).first():
        slug, n = f"{base}-{n}", n + 1
    if payload.hardware_tier_id is not None:
        tier = await db.get(HardwareTier, payload.hardware_tier_id)
        if tier is None or tier.cafe_id != cafe.id or not tier.is_active:
            raise svc.DropError("Pick one of your own rigs.", "BAD_RIG")
        if payload.daily_seats and payload.daily_seats > tier.total_seats:
            raise svc.DropError(f"You only have {tier.total_seats} of that rig.", "TOO_MANY_SEATS")
    elif payload.daily_start_time is not None:
        raise svc.DropError("Pick which of your rigs this drop runs on.", "NEED_RIG")
    if payload.status == "live" and payload.hardware_tier_id is not None and payload.daily_start_time is not None and payload.starts_on:
        await svc.check_rig_free(db, cafe, tier, payload.starts_on, payload.starts_on + timedelta(days=payload.days - 1),
                                 payload.daily_start_time, payload.daily_end_time, payload.daily_seats or 1)
    drop = Drop(
        slug=slug, cafe_id=cafe.id, title=payload.title.strip(), game=payload.game.strip(),
        tagline=(payload.tagline or "").strip() or None, cover_image_url=payload.cover_image_url,
        price_per_hour=payload.price_per_hour, deposit_amount=payload.deposit_amount,
        max_hours=payload.max_hours, deposit_amount_long=payload.deposit_amount_long,
        daily_start_time=payload.daily_start_time, daily_end_time=payload.daily_end_time, daily_seats=payload.daily_seats,
        hardware_tier_id=payload.hardware_tier_id,
        starts_on=payload.starts_on, ends_on=(payload.starts_on + timedelta(days=payload.days - 1)) if payload.starts_on else None,
        max_seats_per_user=payload.max_seats_per_user,
        early_access_code=(payload.early_access_code or "").strip().upper() or None,
        early_access_starts_at=payload.early_access_starts_at, public_starts_at=payload.public_starts_at,
        status=payload.status,
    )
    db.add(drop)
    await db.flush()
    for b in payload.blocks:
        db.add(DropBlock(drop_id=drop.id, session_date=b.date, start_time=b.start_time, end_time=b.end_time, seats_total=b.seats))
    await db.commit()
    await svc.ensure_blocks(db, drop)
    return {"success": True, "data": await _out(db, drop, cafe, await svc.blocks_of(db, drop.id))}


class DropUpdate(_Camel):
    title: Optional[str] = Field(None, min_length=3, max_length=120)
    tagline: Optional[str] = Field(None, max_length=160)
    cover_image_url: Optional[str] = Field(None, max_length=1000)
    price_per_hour: Optional[float] = Field(None, gt=0, le=10000)
    deposit_amount: Optional[float] = Field(None, ge=1, le=10000)
    deposit_amount_long: Optional[float] = Field(None, ge=1, le=10000)
    early_access_code: Optional[str] = Field(None, max_length=40)
    early_access_starts_at: Optional[datetime] = None
    public_starts_at: Optional[datetime] = None
    status: Optional[Literal["draft", "live"]] = None
    ends_on: Optional[date] = None
    daily_seats: Optional[int] = Field(None, ge=1, le=100)
    add_blocks: list[BlockIn] = Field(default_factory=list, max_length=40)


@owner_router.patch("/{drop_id}")
async def update_drop(drop_id: UUID, payload: DropUpdate, db: AsyncSession = Depends(get_db),
                      user: User = Depends(get_current_active_user)):
    drop, cafe = await _managed(db, user, drop_id)
    if drop.status == "cancelled":
        raise svc.DropError("This drop was cancelled and can't be changed.", "DROP_CANCELLED")
    paid = (await db.execute(select(func.count()).select_from(DropReservation).where(
        DropReservation.drop_id == drop.id, DropReservation.status.in_(svc.HOLDING)))).scalar_one()
    fields = payload.model_dump(exclude_unset=True, exclude={"add_blocks"})
    # Prices can change any time, live or not: every reservation keeps the amounts it was made at,
    # so only new reservations see the new price.
    if "cover_image_url" in fields and fields["cover_image_url"] and not fields["cover_image_url"].startswith("https://"):
        raise svc.DropError("The picture link must start with https://", "BAD_IMAGE")
    if "early_access_code" in fields:
        fields["early_access_code"] = (fields["early_access_code"] or "").strip().upper() or None
    if "ends_on" in fields and fields["ends_on"] is not None:
        if drop.starts_on is None:
            raise svc.DropError("This drop has no daily schedule to extend.", "NOT_ROLLING")
        if fields["ends_on"] > drop.starts_on + timedelta(days=svc.MAX_DAYS - 1):
            raise svc.DropError("A drop runs for 2 weeks at most. After that it is normal booking.", "TOO_LONG")
    if fields.get("daily_seats") is not None:
        if drop.daily_start_time is None:
            raise svc.DropError("This drop has no daily seats to change.", "NOT_ROLLING")
        today = svc.now_utc().astimezone(svc.IST).date()
        for blk in (await db.execute(select(DropBlock).where(
                DropBlock.drop_id == drop.id, DropBlock.session_date >= today).with_for_update())).scalars().all():
            if fields["daily_seats"] < blk.seats_taken:
                raise svc.DropError(f"{blk.seats_taken} seats are already reserved on {blk.session_date.day} {blk.session_date:%b}, so it can't go below that.", "SEATS_BELOW_TAKEN")
            blk.seats_total = fields["daily_seats"]
    wants_live = (fields.get("status") or drop.status) == "live"
    seats_up = fields.get("daily_seats") is not None and fields["daily_seats"] > (drop.daily_seats or 0)
    went_live = fields.get("status") == "live" and drop.status != "live"
    if drop.hardware_tier_id and drop.daily_start_time and wants_live and (seats_up or went_live or fields.get("ends_on")):
        tier = await db.get(HardwareTier, drop.hardware_tier_id)
        today = svc.now_utc().astimezone(svc.IST).date()
        await svc.check_rig_free(db, cafe, tier, max(today, drop.starts_on), fields.get("ends_on") or drop.ends_on,
                                 drop.daily_start_time, drop.daily_end_time, fields.get("daily_seats") or drop.daily_seats or 1,
                                 ignore_drop_id=drop.id)
    for k, v in fields.items():
        setattr(drop, k, v)
    if svc._aware(drop.early_access_starts_at) > svc._aware(drop.public_starts_at):
        raise svc.DropError("Early access must start before everyone can reserve.", "BAD_TIMES")
    for b in payload.add_blocks:
        db.add(DropBlock(drop_id=drop.id, session_date=b.date, start_time=b.start_time, end_time=b.end_time, seats_total=b.seats))
    await db.commit()
    return {"success": True, "data": await _out(db, drop, cafe, await svc.blocks_of(db, drop.id))}


class BlockSeats(_Camel):
    seats: int = Field(..., ge=0, le=100)


@owner_router.post("/{drop_id}/cancel")
async def cancel_drop(drop_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    """Stop the drop and give every paid person their deposit back in full."""
    drop, cafe = await _managed(db, user, drop_id)
    if drop.status == "cancelled":
        raise svc.DropError("This drop is already cancelled.", "ALREADY_CANCELLED")
    drop.status = "cancelled"
    await db.commit()
    rows = (await db.execute(select(DropReservation).where(
        DropReservation.drop_id == drop.id, DropReservation.status.in_(svc.PAID)))).scalars().all()
    results = {"refunded": 0, "failed": 0}
    for r in rows:
        out = await svc.refund(db, r, "The café cancelled the drop")
        results["refunded" if out == "refunded" else "failed"] += 1
    return {"success": True, "data": {"drop": await _out(db, drop, cafe, await svc.blocks_of(db, drop.id)), **results}}


@owner_router.patch("/{drop_id}/blocks/{block_id}")
async def set_block_seats(drop_id: UUID, block_id: UUID, payload: BlockSeats, db: AsyncSession = Depends(get_db),
                          user: User = Depends(get_current_active_user)):
    drop, _ = await _managed(db, user, drop_id)
    block = (await db.execute(select(DropBlock).where(DropBlock.id == block_id, DropBlock.drop_id == drop.id).with_for_update())).scalars().first()
    if block is None:
        raise NotFoundException(message="We couldn't find that time.", error_code="BLOCK_NOT_FOUND")
    if payload.seats < block.seats_taken:
        raise svc.DropError(f"{block.seats_taken} seats are already reserved, so it can't go below that.", "SEATS_BELOW_TAKEN")
    block.seats_total = payload.seats
    await db.commit()
    return {"success": True, "data": _block_out(drop, block)}


async def _detail(db: AsyncSession, drop: Drop, cafe: Cafe) -> dict:
    await svc.release_expired(db, drop.id)
    blocks = await svc.blocks_of(db, drop.id)
    rows = (await db.execute(
        select(DropReservation, User.full_name, User.phone_number, User.email)
        .join(User, User.id == DropReservation.user_id)
        .where(DropReservation.drop_id == drop.id)
        .order_by(DropReservation.created_at)
    )).all()
    by_block: dict[UUID, list] = {b.id: [] for b in blocks}
    for r, name, phone, email in rows:
        if r.status in ("expired", "cancelled"):
            continue
        by_block.setdefault(r.block_id, []).append({
            "id": str(r.id), "reference": r.reference, "name": name, "phone": phone, "seats": r.seats,
            "status": r.status, "deposit": float(r.deposit_amount), "balanceDue": float(r.balance_due),
            "checkedInAt": _iso(r.checked_in_at), "paidAt": _iso(r.paid_at), "earlyAccess": r.used_early_access,
            "checkinToken": r.checkin_token if r.status in svc.PAID else None,
        })
    data = await _out(db, drop, cafe, blocks)
    data["earlyAccessCode"] = drop.early_access_code
    for b in data["blocks"]:
        b["reservations"] = by_block.get(UUID(b["id"]), [])
    data["waitlistCount"] = (await db.execute(
        select(func.count()).select_from(DropWaitlist).where(DropWaitlist.drop_id == drop.id))).scalar_one()
    data["funnel"] = await svc.funnel(db, drop)
    paid = [r for r, *_ in rows if r.status in svc.PAID]
    data["totals"] = {
        "paidReservations": len(paid), "seatsSold": sum(r.seats for r in paid),
        "depositsCollected": float(sum(svc.money(r.deposit_amount) for r in paid)),
        "balanceToCollect": float(sum(svc.money(r.balance_due) for r in paid)),
        "checkedIn": sum(1 for r in paid if r.status == "checked_in"),
    }
    return data


@owner_router.get("/reservations")
async def owner_reservations(since: Optional[date] = None, db: AsyncSession = Depends(get_db),
                             user: User = Depends(get_current_active_user)):
    """Every launch-drop reservation at the owner's cafes from `since` (default today), for the Bookings screen."""
    from app.api.deps import get_user_roles
    roles = await get_user_roles(user.id, db)
    day = since or svc.now_utc().astimezone(svc.IST).date()
    stmt = (
        select(DropReservation, Drop, DropBlock, User)
        .join(Drop, Drop.id == DropReservation.drop_id)
        .join(DropBlock, DropBlock.id == DropReservation.block_id)
        .join(User, User.id == DropReservation.user_id)
        .join(Cafe, Cafe.id == Drop.cafe_id)
        .where(DropBlock.session_date >= day,
               DropReservation.status.in_(("pending_payment", "confirmed", "checked_in", "refunded", "given_away")))
        .order_by(DropBlock.session_date, DropReservation.start_time)
        .limit(500)
    )
    if "admin" not in roles:
        stmt = stmt.where(Cafe.owner_id == user.id)
    now = svc.now_utc()
    out = []
    for r, drop, blk, holder in (await db.execute(stmt)).all():
        if r.status == "pending_payment" and not (r.expires_at is not None and svc._aware(r.expires_at) > now):
            continue
        start, end = svc.res_window(r, blk)
        out.append({
            "id": str(r.id), "reference": r.reference, "status": r.status, "seats": r.seats,
            "name": holder.full_name, "phone": holder.phone_number,
            "date": blk.session_date.isoformat(),
            "startTime": f"{start // 60:02d}:{start % 60:02d}", "endTime": f"{min(end, 1439) // 60:02d}:{min(end, 1439) % 60:02d}",
            "hours": r.hours, "balanceDue": float(r.balance_due), "depositPaid": float(r.deposit_amount),
            "dropId": str(drop.id), "dropTitle": drop.title, "dropSlug": drop.slug,
            "checkinToken": r.checkin_token if r.status == "confirmed" else None,
        })
    return {"success": True, "data": out}


@owner_router.get("/{drop_id}")
async def drop_detail(drop_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    drop, cafe = await _managed(db, user, drop_id)
    return {"success": True, "data": await _detail(db, drop, cafe)}


@owner_router.get("/{drop_id}/export.csv")
async def export_csv(drop_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    drop, cafe = await _managed(db, user, drop_id)
    data = await _detail(db, drop, cafe)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Date", "Start", "End", "Reference", "Name", "Phone", "Seats", "Status", "Deposit paid", "Pay at café", "Checked in"])
    for b in data["blocks"]:
        for r in b["reservations"]:
            w.writerow([b["date"], b["startTime"], b["endTime"], r["reference"], r["name"], r["phone"] or "",
                        r["seats"], r["status"], r["deposit"], r["balanceDue"], _ist_clock(r["checkedInAt"])])
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{drop.slug}-reservations.csv"'},
    )


def _ist_clock(iso: Optional[str]) -> str:
    """'2026-11-19T13:05:00+00:00' -> '2026-11-19 18:35' (café time), for the CSV."""
    if not iso:
        return ""
    return datetime.fromisoformat(iso).astimezone(timezone(timedelta(hours=5, minutes=30))).strftime("%Y-%m-%d %H:%M")


class CheckInRequest(_Camel):
    token: str = Field(..., min_length=8, max_length=200)


@owner_router.post("/check-in")
async def check_in(payload: CheckInRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    token = payload.token.strip().rstrip("/").split("/")[-1]  # a pasted pass link works too
    res, outcome = await svc.check_in(db, token, user)
    drop = await db.get(Drop, res.drop_id)
    block = await db.get(DropBlock, res.block_id)
    holder = await db.get(User, res.user_id)
    out = _reservation_out(drop, res, block)
    out.update({"outcome": outcome, "holderName": holder.full_name})
    return {"success": True, "data": out}


@owner_router.post("/reservations/{reservation_id}/give-away")
async def give_away(reservation_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user)):
    res = await db.get(DropReservation, reservation_id)
    if res is None:
        raise NotFoundException(message="We couldn't find this reservation.", error_code="RESERVATION_NOT_FOUND")
    res = await svc.give_away(db, res, user)
    drop = await db.get(Drop, res.drop_id)
    block = await db.get(DropBlock, res.block_id)
    return {"success": True, "data": _reservation_out(drop, res, block)}


# ---------------------------------------------------------------- admin

admin_router = APIRouter(prefix="/admin/drops", tags=["Admin Drops"])


@admin_router.get("")
async def admin_drops(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    """Every drop with how it is doing: paid seats, money taken, waitlist."""
    drops = (await db.execute(
        select(Drop, Cafe.name).join(Cafe, Cafe.id == Drop.cafe_id).order_by(Drop.created_at.desc())
    )).all()
    paid = {r[0]: r for r in (await db.execute(
        select(DropReservation.drop_id, func.count(), func.coalesce(func.sum(DropReservation.seats), 0),
               func.coalesce(func.sum(DropReservation.deposit_amount), 0))
        .where(DropReservation.paid_at.is_not(None), DropReservation.refunded_at.is_(None))
        .group_by(DropReservation.drop_id)
    )).all()}
    refunded = dict((await db.execute(
        select(DropReservation.drop_id, func.count()).where(DropReservation.refunded_at.is_not(None))
        .group_by(DropReservation.drop_id)
    )).all())
    waiting = dict((await db.execute(select(DropWaitlist.drop_id, func.count()).group_by(DropWaitlist.drop_id))).all())
    out = []
    for d, cafe_name in drops:
        p = paid.get(d.id)
        out.append({
            "id": str(d.id), "slug": d.slug, "title": d.title, "game": d.game, "cafe": cafe_name, "status": d.status,
            "startsOn": d.starts_on.isoformat() if d.starts_on else None,
            "endsOn": d.ends_on.isoformat() if d.ends_on else None,
            "reservations": p[1] if p else 0, "seats": int(p[2]) if p else 0,
            "feesTaken": float(p[3]) if p else 0.0,
            "refunded": refunded.get(d.id, 0), "waitlist": waiting.get(d.id, 0),
        })
    return {"success": True, "data": out}
