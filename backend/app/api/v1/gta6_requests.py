"""GTA 6 slot requests (launch period).

While the founder's switch is on, a player booking a GTA 6-capable console asks for a slot instead of paying
straight away. The founder checks it with the café on WhatsApp, then taps Allow in admin: that creates a held
(pending-payment, 15 minutes) booking for the player, who pays it like any booking. Off = normal booking.
"""
import random
import string
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.admin_alerts import alert_admins
from app.api.deps import get_current_active_user, get_user_roles, require_admin, require_gamer
from app.api.v1.owner_intros import normalise_phone
from app.config import settings as app_settings
from app.core.exceptions import ForbiddenException, NotFoundException, ValidationException
from app.core.game_platforms import tier_runs_gta6
from app.core.logging import logger
from app.core.time import IST
from app.database import get_db
from app.models.booking import Booking, BookingStatus
from app.models.cafe import Cafe
from app.models.gta6_request import Gta6SlotRequest
from app.models.gta6_offer import Gta6SlotOffer
from app.models.hardware_tier import HardwareTier
from app.models.notification import Notification, NotificationType
from app.models.platform_setting import PlatformSetting
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.repositories.booking_repository import BookingRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.repositories.platform_settings_repository import PlatformSettingsRepository
from app.schemas.booking import BookingCreateRequest
from app.services.booking_service import BookingService
from app.services.notification_service import NotificationService
from app.services.push_service import PushService

router = APIRouter(prefix="/gta6-requests", tags=["GTA 6 requests"])
admin_router = APIRouter(prefix="/admin/gta6-requests", tags=["Admin GTA 6 requests"])

ASK_EXPIRES_AFTER = timedelta(minutes=60)   # an unanswered request lapses
MAX_DAYS_AHEAD = 7                          # requests are taken for the next week
HOLD_MINUTES = 15                           # the held (pending-payment) booking, set by BookingService


def effective(s: PlatformSetting, today: Optional[date] = None) -> bool:
    """The launch switch is on and its end date (if any) has not passed."""
    today = today or datetime.now(IST).date()
    return bool(s.gta6_requests_on) and (s.gta6_requests_until is None or today <= s.gta6_requests_until)


def _ref() -> str:
    return "GR-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=5))


def _hhmm(t: time) -> str:
    return f"{t.hour:02d}:{t.minute:02d}"


class RequestIn(BaseModel):
    cafe_id: UUID
    hardware_tier_id: UUID
    session_date: date
    start_time: time
    duration_hours: float = Field(..., ge=0.25, le=8.0)
    seats_count: int = Field(1, ge=1, le=6)
    phone: Optional[str] = Field(None, max_length=20)
    # "gta6": priced from the café's GTA 6 listing. "other": any other game on the same console.
    game: Literal["gta6", "other"] = "gta6"
    console_label: Optional[str] = Field(None, max_length=60)
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class NoteIn(BaseModel):
    note: Optional[str] = Field(None, max_length=300)
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SuggestIn(BaseModel):
    suggestion: str = Field(..., min_length=2, max_length=300)
    note: Optional[str] = Field(None, max_length=300)
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SettingsIn(BaseModel):
    on: Optional[bool] = None
    until: Optional[date] = None
    whatsapp: Optional[str] = Field(None, max_length=20)
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ------------------------------------------------------------------ helpers
async def _platform(db: AsyncSession) -> PlatformSetting:
    return await PlatformSettingsRepository(db).get_or_create()


async def _expire_stale(db: AsyncSession) -> None:
    """Unanswered for 60 minutes: lapse it. Done on read, so no cron is needed."""
    cutoff = datetime.now(timezone.utc) - ASK_EXPIRES_AFTER
    res = await db.execute(
        update(Gta6SlotRequest)
        .where(Gta6SlotRequest.status == "requested", Gta6SlotRequest.created_at < cutoff)
        .values(status="expired")
    )
    if res.rowcount:
        await db.commit()


def _state(req: Gta6SlotRequest, booking: Optional[Booking]) -> str:
    """What the player and admin see: an approved request follows its held booking."""
    if req.status != "approved" or booking is None:
        return req.status
    if booking.status in (BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.ACTIVE, BookingStatus.COMPLETED):
        return "booked"
    if booking.status == BookingStatus.PENDING_PAYMENT:
        return "approved"
    return "expired"   # failed / cancelled / released: the hold lapsed unpaid


async def _out(db: AsyncSession, req: Gta6SlotRequest, *, admin: bool = False) -> dict:
    cafe = await db.get(Cafe, req.cafe_id)
    tier = await db.get(HardwareTier, req.tier_id)
    booking = await db.get(Booking, req.booking_id) if req.booking_id else None
    out = {
        "id": str(req.id), "reference": req.reference, "status": _state(req, booking),
        "cafe": {"id": str(cafe.id), "name": cafe.name, "slug": cafe.slug, "city": cafe.city} if cafe else None,
        "tier": {"id": str(tier.id), "name": tier.name} if tier else None,
        "date": req.session_date.isoformat(), "startTime": _hhmm(req.start_time), "hours": req.hours, "seats": req.seats,
        "game": req.game, "consoleLabel": req.console_label,
        "note": req.admin_note, "suggestion": req.suggestion,
        "bookingId": str(req.booking_id) if req.booking_id else None,
        "payBy": (booking.created_at + timedelta(minutes=HOLD_MINUTES)).isoformat() if booking and _state(req, booking) == "approved" else None,
        "createdAt": req.created_at.isoformat(),
        "answerBy": (req.created_at + ASK_EXPIRES_AFTER).isoformat(),
    }
    if admin:
        user = await db.get(User, req.user_id)
        out["player"] = {"name": user.full_name if user else "", "phone": req.phone, "email": user.email if user else ""}
        out["cafePhone"] = cafe.phone_number if cafe else None
    return out


async def _tell_player(db: AsyncSession, req: Gta6SlotRequest, title: str, message: str, link: str, email_label: str) -> None:
    """In-app notification + push + email. The decision is already saved, so none of this may fail it."""
    try:
        db.add(Notification(user_id=req.user_id, title=title, message=message,
                            notification_type=NotificationType.SYSTEM, link=link))
        await db.commit()
        await PushService().send_to_users(db, [req.user_id], {"title": title, "body": message, "url": link, "type": "system"})
        user = await db.get(User, req.user_id)
        if user and user.email:
            await NotificationService().send_gta6_mail(
                user.email, title, title, [("Request", req.reference), ("Message", message)],
                f"{app_settings.FRONTEND_URL}{link}", email_label)
    except Exception as e:  # noqa: BLE001
        logger.error("gta6_request_tell_player_failed", error=str(e), request=str(req.id))


async def _tell_admins(db: AsyncSession, req: Gta6SlotRequest, user: User, cafe: Cafe, tier: HardwareTier) -> None:
    try:
        when = f"{req.session_date:%a %d %b}, {_hhmm(req.start_time)} for {req.hours:g} hr"
        msg = f"{user.full_name} wants {cafe.name} ({tier.name}), {when}."
        await alert_admins(db, "GTA 6 slot request", msg, "/admin/gta6-requests")
        platform = await _platform(db)
        await NotificationService().send_gta6_mail(
            platform.support_email, "GTA 6 slot request", "New GTA 6 slot request",
            [("Player", f"{user.full_name} {req.phone or ''}".strip()), ("Café", cafe.name), ("Console", tier.name),
             ("When", when), ("Reference", req.reference)],
            f"{app_settings.FRONTEND_URL}/admin/gta6-requests", "Open requests")
    except Exception as e:  # noqa: BLE001
        logger.error("gta6_request_tell_admins_failed", error=str(e), request=str(req.id))


# ------------------------------------------------------------------ player
@router.get("/config")
async def config(db: AsyncSession = Depends(get_db)):
    s = await _platform(db)
    return {"success": True, "data": {
        "enabled": effective(s), "whatsapp": s.gta6_whatsapp,
        "until": s.gta6_requests_until.isoformat() if s.gta6_requests_until else None}}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_request(payload: RequestIn, user: User = Depends(require_gamer), db: AsyncSession = Depends(get_db)):
    s = await _platform(db)
    if not effective(s):
        raise ValidationException(message="GTA 6 requests are closed. You can book this slot normally.", error_code="GTA6_REQUESTS_OFF")
    cafe = await CafeRepository(db).get_by_id(payload.cafe_id)
    tier = await HardwareTierRepository(db).get_by_id(payload.hardware_tier_id)
    if not cafe or not cafe.is_active or not tier or str(tier.cafe_id) != str(cafe.id) or not tier.is_active:
        raise ValidationException(message="That café or console isn't available.", error_code="TIER_NOT_AVAILABLE")
    if not tier_runs_gta6(tier):
        raise ValidationException(message="That console can't run GTA 6. Book it normally.", error_code="NOT_A_GTA6_CONSOLE")
    if datetime.combine(payload.session_date, payload.start_time).replace(tzinfo=IST) <= datetime.now(IST):
        raise ValidationException(message="That start time has already passed. Pick a later time.", error_code="INVALID_START_TIME")
    if payload.session_date > datetime.now(IST).date() + timedelta(days=MAX_DAYS_AHEAD):
        raise ValidationException(message="We take GTA 6 requests for the next 7 days. Pick a nearer day.", error_code="TOO_FAR_AHEAD")
    try:
        phone = normalise_phone(payload.phone or user.phone_number or "")
    except ValueError:
        raise ValidationException(message="Add your mobile number so we can reach you on WhatsApp.", error_code="PHONE_REQUIRED")

    await _expire_stale(db)
    same = (await db.execute(select(Gta6SlotRequest).where(
        Gta6SlotRequest.user_id == user.id, Gta6SlotRequest.tier_id == tier.id,
        Gta6SlotRequest.session_date == payload.session_date, Gta6SlotRequest.start_time == payload.start_time,
        Gta6SlotRequest.status == "requested"))).scalars().first()
    if same is not None:     # a second tap never makes a second request
        return {"success": True, "data": {"request": await _out(db, same)}}

    req = Gta6SlotRequest(reference=_ref(), user_id=user.id, cafe_id=cafe.id, tier_id=tier.id,
                          session_date=payload.session_date, start_time=payload.start_time,
                          hours=payload.duration_hours, seats=payload.seats_count, phone=phone,
                          game=payload.game, console_label=(payload.console_label or "").strip() or None)
    db.add(req)
    await db.commit()
    await db.refresh(req)
    await _tell_admins(db, req, user, cafe, tier)
    return {"success": True, "data": {"request": await _out(db, req)}}


@router.get("/mine")
async def my_requests(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    await _expire_stale(db)
    rows = (await db.execute(select(Gta6SlotRequest).where(Gta6SlotRequest.user_id == user.id)
                             .order_by(Gta6SlotRequest.created_at.desc()).limit(20))).scalars().all()
    return {"success": True, "data": [await _out(db, r) for r in rows]}


@router.get("/{request_id}")
async def get_request(request_id: UUID, user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    await _expire_stale(db)
    req = await db.get(Gta6SlotRequest, request_id)
    if req is None:
        raise NotFoundException(message="We couldn't find that request.", error_code="REQUEST_NOT_FOUND")
    if req.user_id != user.id and "admin" not in await get_user_roles(user.id, db):
        raise ForbiddenException("This isn't your request")
    return {"success": True, "data": {"request": await _out(db, req)}}


# ------------------------------------------------------------------ admin
@admin_router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    s = await _platform(db)
    return {"success": True, "data": {
        "on": s.gta6_requests_on, "until": s.gta6_requests_until.isoformat() if s.gta6_requests_until else None,
        "whatsapp": s.gta6_whatsapp, "effective": effective(s)}}


@admin_router.put("/settings")
async def put_settings(payload: SettingsIn, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    s = await _platform(db)
    sent = payload.model_fields_set
    if "on" in sent and payload.on is not None:
        s.gta6_requests_on = payload.on
    if "until" in sent:
        s.gta6_requests_until = payload.until        # null clears it
    if "whatsapp" in sent:
        digits = "".join(c for c in (payload.whatsapp or "") if c.isdigit())
        s.gta6_whatsapp = digits or None
    s.updated_by = admin.id
    await db.commit()
    return await get_settings(db, admin)


@admin_router.get("/waiting-count")
async def waiting_count(db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    """How many requests are waiting for an answer: drives the red dot in the admin menu."""
    await _expire_stale(db)
    n = (await db.execute(select(func.count()).select_from(Gta6SlotRequest)
                          .where(Gta6SlotRequest.status == "requested"))).scalar_one()
    return {"success": True, "data": {"count": int(n)}}


@admin_router.get("")
async def admin_list(state: str = Query("waiting", pattern="^(waiting|allowed|declined|all)$"),
                     db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    await _expire_stale(db)
    q = select(Gta6SlotRequest).order_by(Gta6SlotRequest.created_at.desc()).limit(200)
    rows = (await db.execute(q)).scalars().all()
    items = [await _out(db, r, admin=True) for r in rows]
    keep = {"waiting": ("requested",), "allowed": ("approved", "booked"), "declined": ("declined", "expired", "cancelled")}
    if state != "all":
        items = [i for i in items if i["status"] in keep[state]]
    waiting = sum(1 for r in rows if r.status == "requested")
    return {"success": True, "data": {"items": items, "waiting": waiting}}


async def _decidable(db: AsyncSession, request_id: UUID) -> Gta6SlotRequest:
    req = await db.get(Gta6SlotRequest, request_id)
    if req is None:
        raise NotFoundException(message="We couldn't find that request.", error_code="REQUEST_NOT_FOUND")
    return req


@admin_router.post("/{request_id}/allow")
async def allow(request_id: UUID, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    req = await _decidable(db, request_id)
    if req.status not in ("requested", "expired"):
        raise ValidationException(message="This request has already been answered.", error_code="ALREADY_DECIDED")
    # The hold is a normal pending-payment booking, so it counts against capacity like any booking and a
    # second Allow for the last console fails here (nothing is created).
    booking_repo, cafe_repo, tier_repo = BookingRepository(db), CafeRepository(db), HardwareTierRepository(db)
    service = BookingService(booking_repo, cafe_repo, tier_repo)
    # The price is worked out here, never taken from the player: GTA 6 uses the café's GTA 6 listing price,
    # anything else on the same console uses the setup's own price.
    from app.services import drop_service as dsvc
    gta = req.game == "gta6"
    price = await dsvc.gta6_price_for(db, req.cafe_id, req.tier_id, req.session_date, req.start_time, req.hours, req.seats) if gta else None
    result = await service.create_booking(req.user_id, BookingCreateRequest(
        cafe_id=req.cafe_id, hardware_tier_id=req.tier_id, session_date=req.session_date,
        start_time=req.start_time, duration_hours=req.hours, seats_count=req.seats, game="GTA 6" if gta else None),
        base_amount_override=price)
    req.booking_id = result.id
    req.status = "approved"
    req.decided_by, req.decided_at = admin.id, datetime.now(timezone.utc)
    await db.commit()
    cafe = await db.get(Cafe, req.cafe_id)
    await _tell_player(
        db, req, "Your GTA 6 slot is confirmed. Pay now",
        f"{cafe.name} said yes. Pay within {HOLD_MINUTES} minutes to lock {req.session_date:%a %d %b} {_hhmm(req.start_time)}.",
        f"/bookings/{result.id}", "Pay now")
    return {"success": True, "data": {"request": await _out(db, req, admin=True)}}


@admin_router.post("/{request_id}/decline")
async def decline(request_id: UUID, payload: NoteIn, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    req = await _decidable(db, request_id)
    if req.status != "requested":
        raise ValidationException(message="This request has already been answered.", error_code="ALREADY_DECIDED")
    req.status, req.admin_note = "declined", (payload.note or "").strip() or None
    req.decided_by, req.decided_at = admin.id, datetime.now(timezone.utc)
    await db.commit()
    cafe = await db.get(Cafe, req.cafe_id)
    await _tell_player(db, req, "That GTA 6 slot isn't available",
                       f"{cafe.name} can't take that time. {req.admin_note or 'Pick another time or café.'}",
                       f"/gta6-requests/{req.id}", "See other options")
    return {"success": True, "data": {"request": await _out(db, req, admin=True)}}


@admin_router.post("/{request_id}/suggest")
async def suggest(request_id: UUID, payload: SuggestIn, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    req = await _decidable(db, request_id)
    if req.status != "requested":
        raise ValidationException(message="This request has already been answered.", error_code="ALREADY_DECIDED")
    req.status, req.suggestion = "declined", payload.suggestion.strip()
    req.admin_note = (payload.note or "").strip() or None
    req.decided_by, req.decided_at = admin.id, datetime.now(timezone.utc)
    await db.commit()
    cafe = await db.get(Cafe, req.cafe_id)
    await _tell_player(db, req, "Another GTA 6 time works",
                       f"{cafe.name} can't do that exact time, but: {req.suggestion}",
                       f"/gta6-requests/{req.id}", "See the suggestion")
    return {"success": True, "data": {"request": await _out(db, req, admin=True)}}


# ------------------------------------------------------------------ confirmed-slot offers (shared on WhatsApp)
OFFER_LIVES = timedelta(minutes=60)


class OfferIn(BaseModel):
    cafe_id: UUID
    hardware_tier_id: UUID
    session_date: date
    start_time: time
    duration_hours: float = Field(..., ge=0.25, le=8.0)
    seats_count: int = Field(1, ge=1, le=6)
    game: Literal["gta6", "other"] = "gta6"
    minutes_open: int = Field(60, ge=10, le=24 * 60)
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


async def _offer_out(db: AsyncSession, o: Gta6SlotOffer) -> dict:
    cafe = await db.get(Cafe, o.cafe_id)
    tier = await db.get(HardwareTier, o.tier_id)
    state = o.status
    ends = o.expires_at if o.expires_at.tzinfo else o.expires_at.replace(tzinfo=timezone.utc)
    if state == "open" and ends <= datetime.now(timezone.utc):
        state = "expired"
    price = None
    try:
        from app.services import drop_service as dsvc
        if o.game == "gta6":
            price = float(await dsvc.gta6_price_for(db, o.cafe_id, o.tier_id, o.session_date, o.start_time, o.hours, o.seats))
        elif tier is not None:
            price = float(tier.price_per_hour) * o.hours * o.seats
    except Exception:  # noqa: BLE001 - the price is a convenience on this card, never a reason to fail
        price = None
    return {
        "id": str(o.id), "token": o.token, "status": state,
        "cafe": {"id": str(cafe.id), "name": cafe.name, "slug": cafe.slug, "city": cafe.city, "area": cafe.address_line2} if cafe else None,
        "tier": {"id": str(tier.id), "name": tier.name} if tier else None,
        "date": o.session_date.isoformat(), "startTime": _hhmm(o.start_time), "hours": o.hours, "seats": o.seats,
        "game": o.game, "price": price, "expiresAt": ends.isoformat(), "bookingId": str(o.booking_id) if o.booking_id else None,
    }


@admin_router.post("/offers", status_code=status.HTTP_201_CREATED)
async def create_offer(payload: OfferIn, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    """The founder has the café's yes (WhatsApp, phone). This makes a link that holds nothing until a player claims it."""
    tier = await db.get(HardwareTier, payload.hardware_tier_id)
    if tier is None or tier.cafe_id != payload.cafe_id:
        raise ValidationException(message="That setup doesn't belong to that café.", error_code="BAD_SETUP")
    token = "".join(random.choices(string.ascii_lowercase + string.digits, k=10))
    o = Gta6SlotOffer(
        token=token, cafe_id=payload.cafe_id, tier_id=payload.hardware_tier_id, session_date=payload.session_date,
        start_time=payload.start_time, hours=payload.duration_hours, seats=payload.seats_count, game=payload.game,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=payload.minutes_open), created_by=admin.id)
    db.add(o)
    await db.commit()
    return {"success": True, "data": {"offer": await _offer_out(db, o)}}


@admin_router.get("/offers")
async def list_offers(db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    rows = (await db.execute(select(Gta6SlotOffer).order_by(Gta6SlotOffer.created_at.desc()).limit(30))).scalars().all()
    return {"success": True, "data": {"offers": [await _offer_out(db, o) for o in rows]}}


@admin_router.post("/offers/{offer_id}/cancel")
async def cancel_offer(offer_id: UUID, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    o = await db.get(Gta6SlotOffer, offer_id)
    if o is None:
        raise NotFoundException(message="We couldn't find that offer.", error_code="OFFER_NOT_FOUND")
    if o.status == "open":
        o.status = "cancelled"
        await db.commit()
    return {"success": True, "data": {"offer": await _offer_out(db, o)}}


@router.get("/offers/{token}")
async def view_offer(token: str, db: AsyncSession = Depends(get_db)):
    o = (await db.execute(select(Gta6SlotOffer).where(Gta6SlotOffer.token == token))).scalar_one_or_none()
    if o is None:
        raise NotFoundException(message="This link isn't valid.", error_code="OFFER_NOT_FOUND")
    return {"success": True, "data": {"offer": await _offer_out(db, o)}}


@router.post("/offers/{token}/claim")
async def claim_offer(token: str, user: User = Depends(require_gamer), db: AsyncSession = Depends(get_db)):
    """First player wins. Takes the offer atomically, then makes the normal held booking (15 minutes to pay)."""
    o = (await db.execute(select(Gta6SlotOffer).where(Gta6SlotOffer.token == token))).scalar_one_or_none()
    if o is None:
        raise NotFoundException(message="This link isn't valid.", error_code="OFFER_NOT_FOUND")
    now = datetime.now(timezone.utc)
    ends = o.expires_at if o.expires_at.tzinfo else o.expires_at.replace(tzinfo=timezone.utc)
    taken = await db.execute(
        update(Gta6SlotOffer)
        .where(Gta6SlotOffer.id == o.id, Gta6SlotOffer.status == "open")
        .values(status="claimed", claimed_by=user.id)) if ends > now else None
    if taken is None or taken.rowcount != 1:
        await db.rollback()
        raise ValidationException(message="Sorry, this slot has been taken or the link has run out. Ask us on WhatsApp for another.", error_code="OFFER_GONE")
    await db.commit()
    try:
        service = BookingService(BookingRepository(db), CafeRepository(db), HardwareTierRepository(db))
        from app.services import drop_service as dsvc
        gta = o.game == "gta6"
        price = await dsvc.gta6_price_for(db, o.cafe_id, o.tier_id, o.session_date, o.start_time, o.hours, o.seats) if gta else None
        result = await service.create_booking(user.id, BookingCreateRequest(
            cafe_id=o.cafe_id, hardware_tier_id=o.tier_id, session_date=o.session_date, start_time=o.start_time,
            duration_hours=o.hours, seats_count=o.seats, game="GTA 6" if gta else None), base_amount_override=price)
    except Exception:
        # The slot could not be held (someone booked it another way): put the link back so it is not wasted.
        await db.rollback()
        await db.execute(update(Gta6SlotOffer).where(Gta6SlotOffer.id == o.id).values(status="open", claimed_by=None))
        await db.commit()
        raise
    o.booking_id = result.id
    await db.commit()
    await alert_admins(db, "Slot link claimed", f"{user.full_name or 'A player'} took the {o.session_date:%a %d %b} {_hhmm(o.start_time)} slot.", "/admin/gta6-requests")
    return {"success": True, "data": {"bookingId": str(result.id), "payBy": (now + timedelta(minutes=HOLD_MINUTES)).isoformat()}}
