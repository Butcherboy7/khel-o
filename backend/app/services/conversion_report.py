"""Why people don't book: one report for Admin > Insights > Conversion.

Everything is computed per browser session from the first-party
analytics_events table (internal devices left out), and "paid" always comes
from the database (bookings, drop reservations), never from a browser event.

`build_report` is pure (rows in, dict out) so it is tested without a database;
`conversion_report` loads the rows.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.demo import demo_cafe_ids
from app.models.analytics_event import AnalyticsEvent
from app.models.booking import Booking, BookingStatus
from app.models.cafe import Cafe
from app.models.drop import Drop, DropReservation
from app.models.payment import Payment, PaymentStatus

PAID_BOOKING = {BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.ACTIVE, BookingStatus.COMPLETED, BookingStatus.NO_SHOW}
PAID_DROP = {"confirmed", "checked_in", "given_away"}
# Pages that are not the customer product (owner portal, debug) are left out of the customer funnel.
NOT_CUSTOMER = ("/owner", "/admin", "/debug")

AI_HOSTS = ("chatgpt.com", "chat.openai.com", "perplexity.ai", "claude.ai", "gemini.google.com", "copilot.microsoft.com", "bing.com/chat")


@dataclass
class Ev:
    session: str
    type: str
    at: datetime
    meta: dict[str, Any]
    user: str | None = None


@dataclass
class Session:
    id: str
    events: list[Ev] = field(default_factory=list)

    @property
    def views(self) -> list[Ev]:
        return [e for e in self.events if e.type == "page_view"]

    def has(self, type_: str, action: str | None = None) -> bool:
        return any(e.type == type_ and (action is None or e.meta.get("action") == action) for e in self.events)


def channel(meta: dict[str, Any]) -> str:
    """Where a visit came from, in words an owner reads: utm first, else the referrer host."""
    utm = meta.get("utm") or {}
    s = str(utm.get("s") or "").lower()
    m = str(utm.get("m") or "").lower()
    if s:
        if s in ("meta", "fb", "facebook") or (m in ("paid", "cpc", "ads") and s in ("ig", "instagram")):
            return "Meta ads"
        if s in ("ig", "instagram"):
            return "Instagram"
        if s == "whatsapp":
            return "WhatsApp"
        if s in ("friends", "share", "referral"):
            return "Friends' links"
        if any(h in s for h in ("chatgpt", "openai", "perplexity", "claude", "gemini", "copilot")):
            return "AI assistants"
        if s in ("seo", "google", "bing"):
            return "Google / Bing"
        if s in ("qr", "card", "nfc", "poster"):
            return "QR & posters"
        if s == "email":
            return "Email"
        return "Other links"
    ref = str(meta.get("ref") or "").lower()
    if ref:
        if ref == "direct":
            return "Direct / typed"
        if any(h in ref for h in AI_HOSTS):
            return "AI assistants"
        if "google." in ref or ref.startswith("google") or "bing." in ref or "duckduckgo" in ref or "yahoo." in ref:
            return "Google / Bing"
        if "instagram" in ref:
            return "Instagram"
        if "facebook" in ref or ref in ("fb.com", "m.facebook.com", "l.facebook.com", "lm.facebook.com"):
            return "Facebook"
        if "whatsapp" in ref or ref == "wa.me":
            return "WhatsApp"
        if "youtube" in ref:
            return "YouTube"
        return "Other sites"
    if meta.get("iab") == "instagram":
        return "Instagram"
    if meta.get("iab") == "facebook":
        return "Facebook"
    return "Not recorded"


def _pct(a: int, b: int) -> float | None:
    return round(100 * a / b, 1) if b else None


def _section(path: str) -> str:
    for prefix in ("/cafe/", "/drops/", "/challenge/", "/gta6/", "/cafes/", "/c/", "/bookings/"):
        if path.startswith(prefix):
            return prefix + "…"
    return path


def _collapse_searches(evs: list[Ev]) -> list[Ev]:
    """'G', 'Gt', 'Gta', 'Gta 6' typed in one go count once, as the last one."""
    typed = [e for e in evs if (e.meta.get("queryText") or "").strip()]
    out: list[Ev] = []
    for i, e in enumerate(typed):
        q = e.meta["queryText"].strip().lower()
        nxt = typed[i + 1] if i + 1 < len(typed) else None
        if nxt is not None:
            nq = nxt.meta["queryText"].strip().lower()
            if (nxt.at - e.at) <= timedelta(seconds=20) and (nq.startswith(q) or q.startswith(nq)):
                continue
        out.append(e)
    return out


def is_instant_bounce(s: Session) -> bool:
    """One page, nothing done, gone within a second: link scanners and bots, mostly."""
    if any(e.meta.get("bot") for e in s.events):
        return True
    if len(s.views) > 1:
        return False
    if any(e.type not in ("page_view", "page_exit") for e in s.events):
        return False
    secs = [int(e.meta.get("secs") or 0) for e in s.events if e.type == "page_exit"]
    return all(x <= 1 for x in secs)


def build_report(
    events: Iterable[Ev],
    *,
    days: int,
    paid_bookings: int,
    paid_drops: int,
    unpaid: list[dict[str, Any]],
) -> dict[str, Any]:
    sessions: dict[str, Session] = {}
    for e in sorted(events, key=lambda e: e.at):
        if e.meta.get("internal"):
            continue
        sessions.setdefault(e.session, Session(e.session)).events.append(e)

    bots = [s for s in sessions.values() if is_instant_bounce(s)]
    real = [
        s for s in sessions.values()
        if s not in bots and s.views and not all(str(v.meta.get("path", "")).startswith(NOT_CUSTOMER) for v in s.views)
    ]
    n = len(real)

    # ---- funnels -------------------------------------------------------
    def count(pred) -> int:
        return sum(1 for s in real if pred(s))

    saw_cafe = count(lambda s: s.has("venue_viewed") or any(str(v.meta.get("path", "")).startswith("/cafe/") for v in s.views))
    started = count(lambda s: s.has("booking_flow_started"))
    login_asked = count(lambda s: s.has("checkout_login_shown"))
    pay_opened = count(lambda s: s.has("payment_opened"))
    pay_failed = count(lambda s: s.has("payment_failed") or s.has("payment_dismissed"))
    booking_funnel = [
        {"key": "visit", "label": "Visited KHEL-O", "sessions": n},
        {"key": "cafe", "label": "Looked at a café", "sessions": saw_cafe},
        {"key": "start", "label": "Picked a time to book", "sessions": started},
        {"key": "pay", "label": "Opened payment", "sessions": pay_opened},
        {"key": "paid", "label": "Paid", "sessions": paid_bookings, "fromDatabase": True},
    ]
    drop_seen = count(lambda s: s.has("ui_action", "drop_page_view") or any(str(v.meta.get("path", "")).startswith("/drops/") for v in s.views))
    drop_block = count(lambda s: s.has("ui_action", "drop_block_selected"))
    drop_console = count(lambda s: s.has("ui_action", "drop_console_selected"))
    drop_pay = count(lambda s: s.has("ui_action", "drop_payment_started"))
    drop_funnel = [
        {"key": "seen", "label": "Opened a GTA 6 drop", "sessions": drop_seen},
        {"key": "block", "label": "Picked a time", "sessions": drop_block},
        {"key": "console", "label": "Picked a console", "sessions": drop_console},
        {"key": "pay", "label": "Started payment", "sessions": drop_pay},
        {"key": "paid", "label": "Paid", "sessions": paid_drops, "fromDatabase": True},
    ]
    for f in (booking_funnel, drop_funnel):
        for i, step in enumerate(f):
            prev = f[i - 1]["sessions"] if i else None
            step["fromPrevious"] = _pct(step["sessions"], prev) if prev is not None else None
            step["lost"] = max(0, prev - step["sessions"]) if prev is not None else 0

    # ---- channels ------------------------------------------------------
    by_channel: dict[str, dict[str, int]] = defaultdict(lambda: {"sessions": 0, "cafe": 0, "start": 0, "pay": 0, "bounced": 0})
    for s in real:
        first = s.views[0]
        row = by_channel[channel(first.meta)]
        row["sessions"] += 1
        row["cafe"] += int(s.has("venue_viewed") or any(str(v.meta.get("path", "")).startswith("/cafe/") for v in s.views))
        row["start"] += int(s.has("booking_flow_started") or s.has("ui_action", "drop_block_selected"))
        row["pay"] += int(s.has("payment_opened") or s.has("ui_action", "drop_payment_started"))
        row["bounced"] += int(_bounced(s))
    channels = sorted(
        ({"channel": k, **v, "bounceRate": _pct(v["bounced"], v["sessions"]), "startRate": _pct(v["start"], v["sessions"])} for k, v in by_channel.items()),
        key=lambda r: -r["sessions"],
    )

    # ---- pages ---------------------------------------------------------
    views: Counter[str] = Counter()
    exits: Counter[str] = Counter()
    secs: dict[str, list[int]] = defaultdict(list)
    scroll: dict[str, list[int]] = defaultdict(list)
    sec_views: Counter[str] = Counter()
    sec_exits: Counter[str] = Counter()
    sec_secs: dict[str, list[int]] = defaultdict(list)
    for s in real:
        for v in s.views:
            p = str(v.meta.get("path", ""))
            views[p] += 1
            sec_views[_section(p)] += 1
        last = str(s.views[-1].meta.get("path", ""))
        exits[last] += 1
        sec_exits[_section(last)] += 1
        for e in s.events:
            if e.type == "page_exit":
                p = str(e.meta.get("path", ""))
                t = max(0, min(int(e.meta.get("secs") or 0), 1800))
                secs[p].append(t)
                sec_secs[_section(p)].append(t)
                if e.meta.get("scroll") is not None:
                    scroll[p].append(int(e.meta.get("scroll") or 0))

    def page_rows(v: Counter[str], x: Counter[str], t: dict[str, list[int]], sc: dict[str, list[int]] | None, limit: int):
        rows = []
        for p, cnt in v.most_common(limit):
            ts = t.get(p) or []
            rows.append({
                "path": p,
                "views": cnt,
                "avgSecs": round(sum(ts) / len(ts)) if ts else None,
                "medianSecs": round(median(ts)) if ts else None,
                "avgScroll": (round(sum(sc[p]) / len(sc[p])) if sc and sc.get(p) else None),
                "exits": x.get(p, 0),
                "exitRate": _pct(x.get(p, 0), cnt),
            })
        return rows

    pages = page_rows(views, exits, secs, scroll, 30)
    sections = page_rows(sec_views, sec_exits, sec_secs, None, 15)

    # ---- landings ------------------------------------------------------
    land: dict[str, dict[str, int]] = defaultdict(lambda: {"sessions": 0, "bounced": 0, "start": 0})
    for s in real:
        p = str(s.views[0].meta.get("path", ""))
        row = land[p]
        row["sessions"] += 1
        row["bounced"] += int(_bounced(s))
        row["start"] += int(s.has("booking_flow_started") or s.has("ui_action", "drop_block_selected"))
    landings = sorted(
        ({"path": p, **r, "bounceRate": _pct(r["bounced"], r["sessions"]), "startRate": _pct(r["start"], r["sessions"])} for p, r in land.items()),
        key=lambda r: -r["sessions"],
    )[:20]

    # ---- searches ------------------------------------------------------
    searches_total = 0
    typed: Counter[str] = Counter()
    zero: dict[str, dict[str, Any]] = {}
    for s in real:
        evs = [e for e in s.events if e.type == "search_performed"]
        searches_total += len(evs)
        for e in _collapse_searches(evs):
            q = " ".join(e.meta["queryText"].strip().lower().split())[:60]
            typed[q] += 1
            if int(e.meta.get("resultCount") or 0) == 0:
                z = zero.setdefault(q, {"query": q, "times": 0, "cities": set()})
                z["times"] += 1
                if e.meta.get("city"):
                    z["cities"].add(str(e.meta["city"]))
    zero_rows = sorted(({**z, "cities": sorted(z["cities"])} for z in zero.values()), key=lambda r: -r["times"])[:20]

    # ---- devices -------------------------------------------------------
    dev: dict[str, dict[str, int]] = defaultdict(lambda: {"sessions": 0, "start": 0, "pay": 0})
    for s in real:
        meta = s.views[0].meta
        key = str(meta.get("dev") or "unknown")
        if meta.get("iab"):
            key += f" · {meta['iab']} app browser"
        r = dev[key]
        r["sessions"] += 1
        r["start"] += int(s.has("booking_flow_started") or s.has("ui_action", "drop_block_selected"))
        r["pay"] += int(s.has("payment_opened") or s.has("ui_action", "drop_payment_started"))
    devices = sorted(({"device": k, **v} for k, v in dev.items()), key=lambda r: -r["sessions"])

    # ---- taps: what people press (pop-ups, CTAs, invites, filters) ----
    taps: dict[str, set[str]] = defaultdict(set)
    tap_count: Counter[str] = Counter()
    for s in real:
        for e in s.events:
            if e.type == "ui_action" and e.meta.get("action"):
                where = e.meta.get("where") or e.meta.get("from")
                key = f"{e.meta['action']}" + (f" · {where}" if isinstance(where, str) and where else "")
                taps[key].add(s.id)
                tap_count[key] += 1
    actions = sorted(({"action": k, "sessions": len(v), "times": tap_count[k]} for k, v in taps.items()), key=lambda r: -r["sessions"])[:30]
    invited = sum(1 for s in real if any(v.meta.get("inv") for v in s.views))

    report = {
        "days": days,
        "actions": actions,
        "invitedVisits": invited,
        "sessions": n,
        "instantBounces": len(bots),
        "loginAsked": login_asked,
        "paymentProblems": pay_failed,
        "bookingFunnel": booking_funnel,
        "dropFunnel": drop_funnel,
        "channels": channels,
        "pages": pages,
        "sections": sections,
        "landings": landings,
        "searches": {"total": searches_total, "typed": sum(typed.values()), "top": [{"query": q, "times": c} for q, c in typed.most_common(20)], "zeroResults": zero_rows},
        "devices": devices,
        "unpaid": unpaid,
    }
    report["leaks"] = leaks(report)
    return report


def _bounced(s: Session) -> bool:
    if len(s.views) > 1:
        return False
    secs = [int(e.meta.get("secs") or 0) for e in s.events if e.type == "page_exit"]
    return (max(secs) if secs else 0) < 10


def leaks(r: dict[str, Any]) -> list[dict[str, str]]:
    """The few things worth fixing first, in plain words, biggest first."""
    out: list[tuple[int, dict[str, str]]] = []
    for name, f in (("Booking", r["bookingFunnel"]), ("GTA 6 drop", r["dropFunnel"])):
        for i in range(1, len(f)):
            a, b = f[i - 1], f[i]
            if a["sessions"] >= 5 and b["lost"] > 0:
                out.append((b["lost"], {
                    "title": f"{name}: {b['lost']} of {a['sessions']} stopped between “{a['label']}” and “{b['label']}”",
                    "detail": f"Only {b['fromPrevious'] if b['fromPrevious'] is not None else 0}% made it to the next step.",
                    "area": name,
                }))
    unpaid = r.get("unpaid") or []
    if unpaid:
        total = sum(float(u.get("amount") or 0) for u in unpaid)
        out.append((len(unpaid) * 20, {
            "title": f"{len(unpaid)} people opened payment and never paid (₹{round(total):,})",
            "detail": "Usually the UPI app switch failing inside Instagram's or Facebook's browser, or the 15-minute timer running out. Call them: their numbers are on the booking.",
            "area": "Payment",
        }))
    zero = r["searches"]["zeroResults"]
    if zero:
        top = ", ".join(f"“{z['query']}”" for z in zero[:4])
        out.append((sum(z["times"] for z in zero) * 5, {
            "title": f"{sum(z['times'] for z in zero)} searches found nothing: {top}",
            "detail": "Each is a player who wanted something we didn't show. Add those cafés or cities, or check the spelling we match.",
            "area": "Search",
        }))
    bounce_landings = [l for l in r["landings"] if l["sessions"] >= 20 and (l["bounceRate"] or 0) >= 60]
    for l in bounce_landings[:2]:
        out.append((l["bounced"], {
            "title": f"{l['bounceRate']}% leave {l['path']} without doing anything ({l['bounced']} of {l['sessions']})",
            "detail": "This is a first page people land on. Make the first screen say what to do next, with one button.",
            "area": "Landing",
        }))
    if r["instantBounces"] > max(50, r["sessions"] // 5):
        out.append((0, {
            "title": f"{r['instantBounces']} visits were one page and gone within a second",
            "detail": "Mostly link scanners and bots. They are left out of every number on this page.",
            "area": "Data",
        }))
    return [d for _, d in sorted(out, key=lambda x: -x[0])][:8]


async def conversion_report(db: AsyncSession, days: int) -> dict[str, Any]:
    days = max(1, min(days, 90))
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (await db.execute(
        select(AnalyticsEvent.session_id, AnalyticsEvent.event_type, AnalyticsEvent.created_at, AnalyticsEvent.event_metadata, AnalyticsEvent.user_id)
        .where(AnalyticsEvent.created_at >= since)
    )).all()
    events = [Ev(r[0], r[1], r[2], r[3] or {}, str(r[4]) if r[4] else None) for r in rows]

    paid_bookings = (await db.execute(
        select(Booking.id).where(Booking.created_at >= since, Booking.status.in_(PAID_BOOKING), Booking.cafe_id.not_in(demo_cafe_ids()))
    )).all()
    paid_drops = (await db.execute(
        select(DropReservation.id).where(
            DropReservation.created_at >= since, DropReservation.status.in_(PAID_DROP), DropReservation.source == "online"
        )
    )).all()
    unpaid_rows = (await db.execute(
        select(Booking.booking_reference, Booking.status, Payment.amount, Payment.failure_reason, Payment.created_at, Cafe.name)
        .join(Payment, Payment.booking_id == Booking.id)
        .join(Cafe, Cafe.id == Booking.cafe_id)
        .where(Payment.created_at >= since, Payment.status.in_([PaymentStatus.CREATED, PaymentStatus.FAILED]), Booking.status.not_in(PAID_BOOKING), Booking.cafe_id.not_in(demo_cafe_ids()))
        .order_by(Payment.created_at.desc())
        .limit(30)
    )).all()
    unpaid = [
        {
            "reference": r[0], "bookingStatus": getattr(r[1], "value", r[1]), "amount": float(r[2] or 0),
            "reason": r[3], "at": r[4].isoformat() if r[4] else None, "cafe": r[5],
        }
        for r in unpaid_rows
    ]
    drop_unpaid = (await db.execute(
        select(DropReservation.reference, DropReservation.status, DropReservation.deposit_amount, DropReservation.created_at, Drop.title)
        .join(Drop, Drop.id == DropReservation.drop_id)
        .where(DropReservation.created_at >= since, DropReservation.status.in_(["pending_payment", "expired"]), DropReservation.source == "online")
        .order_by(DropReservation.created_at.desc())
        .limit(20)
    )).all()
    unpaid += [
        {"reference": r[0], "bookingStatus": r[1], "amount": float(r[2] or 0), "reason": "GTA 6 drop seat not paid in time" if r[1] == "expired" else None,
         "at": r[3].isoformat() if r[3] else None, "cafe": r[4]}
        for r in drop_unpaid
    ]
    return build_report(events, days=days, paid_bookings=len(paid_bookings), paid_drops=len(paid_drops), unpaid=unpaid)
