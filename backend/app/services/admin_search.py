"""Admin global search: one box that finds people, phone numbers, cafés,
bookings, payments, drops, challenges, offers and links.

Each group is its own small query (top `PER_GROUP` + 1 to know whether there
is more), so one slow table never hides the rest. A typed phone number is
matched digits-only against every place we keep one, with +91 / 0 ignored.
"""
from __future__ import annotations

import re
from typing import Any, Awaitable, Callable

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.demo import DEMO_SLUG_PREFIX
from app.core.phone_search import phone_column_digits, phone_digits
from app.models.booking import Booking
from app.models.cafe import Cafe
from app.models.cafe_suggestion import CafeSuggestion
from app.models.cafe_waitlist import CafeWaitlistEntry
from app.models.challenge import Challenge, ChallengeEntry
from app.models.community import CommunityLead
from app.models.drop import Drop, DropReservation, DropWaitlist
from app.models.gta6_request import Gta6SlotRequest
from app.models.launch_signup import LaunchSignup
from app.models.marketing_campaign import MarketingCampaign
from app.models.owner_intro import OwnerIntro
from app.models.payment import Payment
from app.models.promotion import OfferCampaign
from app.models.user import User

PER_GROUP = 5


def _like(term: str) -> str:
    return f"%{term.lower()}%"


def _val(v: Any) -> Any:
    return getattr(v, "value", v)


def _date(d: Any) -> str | None:
    return d.isoformat() if d is not None else None


class Query:
    """What was typed, read once: text, phone digits, email, payment id."""

    def __init__(self, raw: str):
        self.raw = " ".join(raw.strip().split())[:100]
        self.text = self.raw.lower()
        self.digits = phone_digits(self.raw)
        # "98480 22338" is a number; "KH8Q2" or "PS5 2" are not phone searches.
        letters = re.sub(r"[\d\s+\-()]", "", self.raw)
        self.is_phone = self.digits is not None and not letters
        self.is_email = "@" in self.raw
        self.is_payment_id = bool(re.match(r"^(pay|order)_[A-Za-z0-9]+$", self.raw))

    def phone_match(self, column):
        return phone_column_digits(column).like(f"%{self.digits}%")

    def text_match(self, *columns):
        t = _like(self.text)
        return or_(*[func.lower(func.coalesce(cast(c, String), "")).like(t) for c in columns])


def _group(key: str, label: str, rows: list[dict[str, Any]], see_all: str | None) -> dict[str, Any]:
    return {"key": key, "label": label, "items": rows[:PER_GROUP], "more": len(rows) > PER_GROUP, "seeAll": see_all}


async def _users(db: AsyncSession, q: Query) -> dict[str, Any]:
    conds = [q.text_match(User.full_name, User.email)]
    if q.digits:
        conds.append(q.phone_match(User.phone_number))
    bookings = (
        select(func.count(Booking.id)).where(Booking.gamer_id == User.id).correlate(User).scalar_subquery()
    )
    rows = (await db.execute(
        select(User, bookings).where(or_(*conds), ~User.email.like("khelo.demo.%"))
        .order_by(User.created_at.desc()).limit(PER_GROUP + 1)
    )).all()
    items = [{
        "kind": "user", "id": str(u.id), "title": u.full_name or u.email, "subtitle": u.email,
        "phone": u.phone_number, "badge": _val(u.role), "meta": f"{n} booking{'s' if n != 1 else ''}",
        "href": f"/admin/users?q={u.email}", "date": _date(u.created_at), "active": u.is_active,
    } for u, n in rows]
    return _group("users", "People with an account", items, f"/admin/users?q={q.raw}")


async def _contacts(db: AsyncSession, q: Query) -> dict[str, Any]:
    """Numbers and names left without an account (or beside one): every list we keep."""
    items: list[dict[str, Any]] = []

    async def add(stmt, make: Callable[[Any], dict[str, Any]]):
        for r in (await db.execute(stmt.limit(PER_GROUP + 1))).all():
            items.append(make(r))

    def ph(col):
        return q.phone_match(col) if q.digits else None

    def where(*parts):
        return or_(*[p for p in parts if p is not None])

    await add(
        select(LaunchSignup).where(where(ph(LaunchSignup.phone), q.text_match(LaunchSignup.name, LaunchSignup.email))).order_by(LaunchSignup.created_at.desc()),
        lambda r: {"kind": "contact", "id": str(r[0].id), "title": r[0].name, "phone": r[0].phone, "subtitle": r[0].email,
                   "badge": "GTA 6 list", "href": f"/admin/launch-list?q={r[0].phone}", "date": _date(r[0].created_at)},
    )
    await add(
        select(Gta6SlotRequest, User.full_name, Cafe.name).join(User, User.id == Gta6SlotRequest.user_id).join(Cafe, Cafe.id == Gta6SlotRequest.cafe_id)
        .where(where(ph(Gta6SlotRequest.phone), q.text_match(Gta6SlotRequest.reference, User.full_name))).order_by(Gta6SlotRequest.created_at.desc()),
        lambda r: {"kind": "contact", "id": str(r[0].id), "title": r[1], "phone": r[0].phone,
                   "subtitle": f"{r[2]} · {r[0].session_date:%d %b} · {r[0].status}", "badge": "Slot request",
                   "href": "/admin/gta6-requests", "date": _date(r[0].created_at)},
    )
    await add(
        select(DropReservation, Drop.title).join(Drop, Drop.id == DropReservation.drop_id)
        .where(DropReservation.guest_phone.is_not(None) | DropReservation.guest_name.is_not(None),
               where(ph(DropReservation.guest_phone), q.text_match(DropReservation.guest_name))).order_by(DropReservation.created_at.desc()),
        lambda r: {"kind": "contact", "id": str(r[0].id), "title": r[0].guest_name or "Walk-in guest", "phone": r[0].guest_phone,
                   "subtitle": f"{r[1]} · {r[0].status}", "badge": "Drop guest", "href": f"/admin/drops/{r[0].drop_id}", "date": _date(r[0].created_at)},
    )
    if q.digits:
        await add(
            select(DropWaitlist, Drop.title).join(Drop, Drop.id == DropWaitlist.drop_id).where(ph(DropWaitlist.phone)).order_by(DropWaitlist.created_at.desc()),
            lambda r: {"kind": "contact", "id": str(r[0].id), "title": r[0].phone, "phone": r[0].phone, "subtitle": r[1],
                       "badge": "Drop waitlist", "href": f"/admin/drops/{r[0].drop_id}", "date": _date(r[0].created_at)},
        )
        await add(
            select(CafeWaitlistEntry, Cafe.name).join(Cafe, Cafe.id == CafeWaitlistEntry.cafe_id).where(ph(CafeWaitlistEntry.phone)).order_by(CafeWaitlistEntry.created_at.desc()),
            lambda r: {"kind": "contact", "id": str(r[0].id), "title": r[0].phone, "phone": r[0].phone, "subtitle": f"Wants {r[1]}",
                       "badge": "Notify me", "href": "/admin/leads", "date": _date(r[0].created_at)},
        )
    await add(
        select(ChallengeEntry, Challenge.title).join(Challenge, Challenge.id == ChallengeEntry.challenge_id)
        .where(where(ph(ChallengeEntry.phone), q.text_match(ChallengeEntry.name, ChallengeEntry.display_name))).order_by(ChallengeEntry.created_at.desc()),
        lambda r: {"kind": "contact", "id": str(r[0].id), "title": r[0].display_name or r[0].name, "phone": r[0].phone, "subtitle": r[1],
                   "badge": "Challenge", "href": f"/admin/challenges/{r[0].challenge_id}", "date": _date(r[0].created_at)},
    )
    await add(
        select(CommunityLead).where(where(ph(CommunityLead.phone), q.text_match(CommunityLead.email))).order_by(CommunityLead.created_at.desc()),
        lambda r: {"kind": "contact", "id": str(r[0].id), "title": r[0].email or r[0].phone, "phone": r[0].phone, "subtitle": r[0].email,
                   "badge": "Community", "href": "/admin/community", "date": _date(r[0].created_at)},
    )
    await add(
        select(CafeSuggestion).where(where(ph(CafeSuggestion.suggester_phone), ph(CafeSuggestion.cafe_phone),
                                           q.text_match(CafeSuggestion.suggester_name, CafeSuggestion.cafe_name))).order_by(CafeSuggestion.created_at.desc()),
        lambda r: {"kind": "contact", "id": str(r[0].id), "title": r[0].suggester_name, "phone": r[0].suggester_phone,
                   "subtitle": f"Suggested {r[0].cafe_name}, {r[0].city}", "badge": "Café suggestion", "href": "/admin/cafe-suggestions", "date": _date(r[0].created_at)},
    )
    await add(
        select(OwnerIntro).where(where(ph(OwnerIntro.owner_phone), q.text_match(OwnerIntro.owner_name, OwnerIntro.cafe_name))).order_by(OwnerIntro.created_at.desc()),
        lambda r: {"kind": "contact", "id": str(r[0].id), "title": r[0].owner_name, "phone": r[0].owner_phone,
                   "subtitle": f"Owner of {r[0].cafe_name}", "badge": "Owner intro", "href": "/admin/leads", "date": _date(r[0].created_at)},
    )
    items.sort(key=lambda i: i.get("date") or "", reverse=True)
    return {"key": "contacts", "label": "Numbers on our lists", "items": items[:8], "more": len(items) > 8, "seeAll": None}


async def _cafes(db: AsyncSession, q: Query) -> dict[str, Any]:
    conds = [q.text_match(Cafe.name, Cafe.slug, Cafe.email, Cafe.address_line1, Cafe.city), q.text_match(User.full_name, User.email)]
    if q.digits:
        conds += [q.phone_match(Cafe.phone_number), q.phone_match(User.phone_number)]
    rows = (await db.execute(
        select(Cafe, User.full_name, User.phone_number).outerjoin(User, User.id == Cafe.owner_id)
        .where(or_(*conds), or_(Cafe.slug.is_(None), ~Cafe.slug.like(DEMO_SLUG_PREFIX + "%")))
        .order_by(Cafe.is_active.desc(), Cafe.name).limit(PER_GROUP + 1)
    )).all()
    items = [{
        "kind": "cafe", "id": str(c.id), "title": c.name, "subtitle": f"{c.city} · owner {owner or '—'}",
        "phone": c.phone_number or owner_phone, "badge": _val(c.verification_status), "active": c.is_active,
        "href": f"/admin/cafes/{c.id}/review", "external": f"/cafe/{c.slug or c.id}",
    } for c, owner, owner_phone in rows]
    return _group("cafes", "Cafés", items, f"/admin/cafes?q={q.raw}")


async def _bookings(db: AsyncSession, q: Query) -> dict[str, Any]:
    conds = [q.text_match(Booking.booking_reference)]
    if not q.is_phone:
        conds.append(q.text_match(User.full_name, User.email))
    if q.digits:
        conds.append(q.phone_match(User.phone_number))
    rows = (await db.execute(
        select(Booking, User.full_name, User.phone_number, Cafe.name).join(User, User.id == Booking.gamer_id).join(Cafe, Cafe.id == Booking.cafe_id)
        .where(or_(*conds), or_(Cafe.slug.is_(None), ~Cafe.slug.like(DEMO_SLUG_PREFIX + "%")))
        .order_by(Booking.created_at.desc()).limit(PER_GROUP + 1)
    )).all()
    items = [{
        "kind": "booking", "id": str(b.id), "title": f"{b.booking_reference} · {name}", "phone": phone,
        "subtitle": f"{cafe} · {b.session_date:%d %b} {b.start_time:%H:%M} · ₹{float(b.total_amount or 0):,.0f}",
        "badge": _val(b.status), "href": f"/admin/bookings?q={b.booking_reference}", "date": _date(b.created_at),
    } for b, name, phone, cafe in rows]
    return _group("bookings", "Bookings", items, f"/admin/bookings?q={q.raw}")


async def _drop_seats(db: AsyncSession, q: Query) -> dict[str, Any]:
    conds = [q.text_match(DropReservation.reference)]
    if not q.is_phone:
        conds.append(q.text_match(User.full_name, User.email))
    if q.digits:
        conds.append(q.phone_match(User.phone_number))
    rows = (await db.execute(
        select(DropReservation, User.full_name, User.phone_number, Drop.title).join(User, User.id == DropReservation.user_id).join(Drop, Drop.id == DropReservation.drop_id)
        .where(or_(*conds), DropReservation.source == "online").order_by(DropReservation.created_at.desc()).limit(PER_GROUP + 1)
    )).all()
    items = [{
        "kind": "drop_seat", "id": str(r.id), "title": f"{r.reference} · {name}", "phone": phone,
        "subtitle": f"{title} · ₹{float(r.deposit_amount or 0):,.0f} paid ahead", "badge": r.status,
        "href": f"/admin/drops/{r.drop_id}", "date": _date(r.created_at),
    } for r, name, phone, title in rows]
    return _group("drop_seats", "GTA 6 drop seats", items, None)


async def _payments(db: AsyncSession, q: Query) -> dict[str, Any]:
    if not (q.is_payment_id or len(q.raw) >= 6):
        return _group("payments", "Payments", [], None)
    rows = (await db.execute(
        select(Payment, Booking.booking_reference, Cafe.name).join(Booking, Booking.id == Payment.booking_id).join(Cafe, Cafe.id == Booking.cafe_id)
        .where(q.text_match(Payment.razorpay_payment_id, Payment.razorpay_order_id)).order_by(Payment.created_at.desc()).limit(PER_GROUP + 1)
    )).all()
    items = [{
        "kind": "payment", "id": str(p.id), "title": p.razorpay_payment_id or p.razorpay_order_id,
        "subtitle": f"{ref} · {cafe} · ₹{float(p.amount or 0):,.0f}", "badge": _val(p.status),
        "href": f"/admin/bookings?q={ref}", "date": _date(p.created_at),
    } for p, ref, cafe in rows]
    drop_rows = (await db.execute(
        select(DropReservation, Drop.title).join(Drop, Drop.id == DropReservation.drop_id)
        .where(q.text_match(DropReservation.razorpay_payment_id, DropReservation.razorpay_order_id)).limit(PER_GROUP + 1)
    )).all()
    items += [{
        "kind": "payment", "id": str(r.id), "title": r.razorpay_payment_id or r.razorpay_order_id,
        "subtitle": f"{r.reference} · {title}", "badge": r.status, "href": f"/admin/drops/{r.drop_id}", "date": _date(r.created_at),
    } for r, title in drop_rows]
    return _group("payments", "Payments", items, "/admin/payments")


async def _things(db: AsyncSession, q: Query) -> dict[str, Any]:
    """Drops, challenges, offer codes and campaign links: the things admin runs."""
    if q.is_phone:
        return _group("things", "Drops, challenges, offers and links", [], None)
    items: list[dict[str, Any]] = []
    for d, cafe in (await db.execute(
        select(Drop, Cafe.name).join(Cafe, Cafe.id == Drop.cafe_id).where(q.text_match(Drop.title, Drop.slug, Drop.game, Cafe.name)).order_by(Drop.created_at.desc()).limit(4)
    )).all():
        items.append({"kind": "drop", "id": str(d.id), "title": d.title, "subtitle": f"{cafe} · {d.game}", "badge": d.status, "href": f"/admin/drops/{d.id}", "external": f"/drops/{d.slug}"})
    for c in (await db.execute(
        select(Challenge).where(q.text_match(Challenge.title, Challenge.slug, Challenge.game)).order_by(Challenge.created_at.desc()).limit(4)
    )).scalars():
        items.append({"kind": "challenge", "id": str(c.id), "title": c.title, "subtitle": c.game, "badge": c.status, "href": f"/admin/challenges/{c.id}", "external": f"/challenge/{c.slug}"})
    for o in (await db.execute(
        select(OfferCampaign).where(q.text_match(OfferCampaign.name, OfferCampaign.access_code)).order_by(OfferCampaign.created_at.desc()).limit(4)
    )).scalars():
        items.append({"kind": "offer", "id": str(o.id), "title": o.name, "subtitle": f"Code {o.access_code}", "badge": "live" if o.is_active else "off", "href": "/admin/promotions"})
    for m in (await db.execute(
        select(MarketingCampaign).where(q.text_match(MarketingCampaign.name, MarketingCampaign.slug, MarketingCampaign.utm_source)).order_by(MarketingCampaign.started_on.desc()).limit(4)
    )).scalars():
        items.append({"kind": "link", "id": str(m.id), "title": m.name, "subtitle": f"khel-o.com/c/{m.slug} · {m.channel}", "badge": m.status, "href": "/admin/analytics/ads", "external": f"/c/{m.slug}"})
    return {"key": "things", "label": "Drops, challenges, offers and links", "items": items[:8], "more": len(items) > 8, "seeAll": None}


async def admin_search(db: AsyncSession, raw: str) -> dict[str, Any]:
    q = Query(raw)
    if len(q.raw) < 2 and not q.digits:
        return {"query": q.raw, "kind": "short", "groups": []}
    groups: list[Callable[[AsyncSession, Query], Awaitable[dict[str, Any]]]]
    if q.is_phone:
        groups = [_users, _contacts, _bookings, _drop_seats, _cafes]
    elif q.is_payment_id:
        groups = [_payments, _bookings]
    elif q.is_email:
        groups = [_users, _contacts, _cafes, _bookings]
    else:
        groups = [_users, _cafes, _bookings, _drop_seats, _contacts, _things, _payments]
    out = []
    for g in groups:  # one session: run in order (asyncpg forbids concurrent use of a connection)
        res = await g(db, q)
        if res["items"]:
            out.append(res)
    return {
        "query": q.raw,
        "kind": "phone" if q.is_phone else "payment" if q.is_payment_id else "email" if q.is_email else "text",
        "digits": q.digits if q.is_phone else None,
        "groups": out,
    }


async def person_by_phone(db: AsyncSession, raw: str) -> dict[str, Any]:
    """Everywhere one phone number appears: accounts, bookings, drop seats and every list."""
    digits = phone_digits(raw, minimum=7)
    if not digits:
        return {"digits": None, "groups": []}
    q = Query(digits)
    q.is_phone = True
    groups = []
    for g in (_users, _bookings, _drop_seats, _contacts):
        res = await g(db, q)
        if res["items"]:
            groups.append(res)
    names = [i["title"] for g in groups for i in g["items"] if g["key"] in ("users", "contacts") and i.get("title") and not str(i["title"]).isdigit()]
    return {"digits": digits, "name": names[0] if names else None, "groups": groups}
