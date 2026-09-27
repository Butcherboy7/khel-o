"""Two admin reports built on the first-party event log.

* Campaign report: one paid/UTM campaign followed from landing to booking,
  counted in unique visitors (sessions), with where each step loses people.
* Area report: where players are, where they look, and what cafés in each
  neighbourhood earn — the numbers behind an owner pitch.

Both read `analytics_events` (every event carries the visitor's latest UTM
tags as metadata.utm and the device as metadata.dev/iab) and join bookings
and the waitlist through user / café. Nothing new is stored.
"""
import uuid
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.localities import locality_for
from app.models.analytics_event import AnalyticsEvent
from app.models.booking import Booking, BookingStatus
from app.models.cafe import Cafe
from app.models.cafe_waitlist import CafeWaitlistEntry
from app.models.user import User

IST = timezone(timedelta(hours=5, minutes=30))
PAID = [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.ACTIVE, BookingStatus.COMPLETED]
OTHER_AREA = "Other areas"
LOW_DATA_BOOKINGS = 5


def _utc(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=IST).astimezone(timezone.utc)


def _aware(ts: datetime) -> datetime:
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


def _ist_day(ts: datetime) -> date:
    return _aware(ts).astimezone(IST).date()


def _utm(meta: dict) -> dict:
    u = meta.get("utm") if isinstance(meta, dict) else None
    return u if isinstance(u, dict) else {}


def _searched(meta: dict) -> bool:
    return any(meta.get(k) not in (None, "") for k in ("queryText", "activity", "minPrice", "maxPrice"))


async def _events(db: AsyncSession, start: datetime, end: datetime, types: Optional[list[str]] = None):
    stmt = select(
        AnalyticsEvent.session_id, AnalyticsEvent.user_id, AnalyticsEvent.event_type,
        AnalyticsEvent.cafe_id, AnalyticsEvent.event_metadata, AnalyticsEvent.created_at,
    ).where(AnalyticsEvent.created_at >= start, AnalyticsEvent.created_at < end)
    if types:
        stmt = stmt.where(AnalyticsEvent.event_type.in_(types))
    return (await db.execute(stmt.order_by(AnalyticsEvent.created_at))).all()


def _cafe_area(cafe: Cafe) -> str:
    _, locality = locality_for(cafe.latitude, cafe.longitude)
    return locality or OTHER_AREA


# --------------------------------------------------------------- campaigns

async def campaign_options(db: AsyncSession, days: int = 90) -> list[dict]:
    """Every (source, campaign) seen recently, busiest first, for the picker."""
    end = datetime.now(timezone.utc)
    seen: dict[tuple[str, str], dict[str, Any]] = {}
    for sid, _, _, _, meta, ts in await _events(db, end - timedelta(days=days), end):
        u = _utm(meta)
        if not u.get("s"):
            continue
        key = (u["s"], u.get("c") or "")
        row = seen.setdefault(key, {"source": key[0], "campaign": key[1] or None, "sessions": set(), "first": ts, "last": ts})
        row["sessions"].add(sid)
        row["last"] = ts
    out = [
        {**{k: v for k, v in r.items() if k != "sessions"}, "sessions": len(r["sessions"])}
        for r in seen.values()
    ]
    return sorted(out, key=lambda r: r["sessions"], reverse=True)


async def campaign_report(
    db: AsyncSession, source: str, campaign: Optional[str], start_day: date, end_day: date
) -> dict:
    start, end = _utc(start_day), _utc(end_day + timedelta(days=1))
    rows = await _events(db, start, end)

    by_session: dict[str, list] = defaultdict(list)
    for r in rows:
        by_session[r[0]].append(r)

    def matches(meta: dict) -> bool:
        u = _utm(meta)
        return u.get("s") == source and (campaign is None or (u.get("c") or None) == campaign)

    cohort = {sid: evs for sid, evs in by_session.items() if any(matches(e[4]) for e in evs)}

    # Returning visitor = this browser was seen before the window opened.
    first_seen: dict[str, datetime] = {}
    if cohort:
        first_seen = dict((await db.execute(
            select(AnalyticsEvent.session_id, func.min(AnalyticsEvent.created_at))
            .where(AnalyticsEvent.session_id.in_(list(cohort)))
            .group_by(AnalyticsEvent.session_id)
        )).all())

    users_of: dict[str, set[uuid.UUID]] = {sid: {e[1] for e in evs if e[1]} for sid, evs in cohort.items()}
    all_users = set().union(*users_of.values()) if users_of else set()

    new_accounts: set[uuid.UUID] = set()
    booked_by: dict[uuid.UUID, list[Booking]] = defaultdict(list)
    if all_users:
        new_accounts = set((await db.execute(
            select(User.id).where(User.id.in_(all_users), User.created_at >= start, User.created_at < end)
        )).scalars().all())
        for b in (await db.execute(
            select(Booking).where(
                Booking.gamer_id.in_(all_users), Booking.status.in_(PAID),
                Booking.created_at >= start, Booking.created_at < end,
            )
        )).scalars().all():
            booked_by[b.gamer_id].append(b)

    stage = Counter()
    by_ad: dict[str, Counter] = defaultdict(Counter)
    device, in_app, visitor_type = Counter(), Counter(), Counter()
    areas, cities, daily = Counter(), Counter(), Counter()
    cafe_views, cafe_notify, cafe_starts = Counter(), Counter(), Counter()
    gmv, bookings = 0.0, 0

    for sid, evs in cohort.items():
        types = {e[2] for e in evs}
        tagged = next(e for e in evs if matches(e[4]))
        ad = _utm(tagged[4]).get("t") or "(not tagged)"
        meta0 = next((e[4] for e in evs if isinstance(e[4], dict) and e[4].get("dev")), {})
        users = users_of[sid]
        s_bookings = [b for u in users for b in booked_by.get(u, [])]

        flags = {
            "landed": True,
            "searched": any(e[2] == "search_performed" and _searched(e[4]) for e in evs),
            "viewed": "venue_viewed" in types,
            "acted": bool(types & {"notify_me", "booking_flow_started"}),
            "notify": "notify_me" in types,
            "started": "booking_flow_started" in types,
            "signed_in": bool(users),
            "signed_up": bool(users & new_accounts),
            "booked": bool(s_bookings),
            "returned": len({_ist_day(e[5]) for e in evs}) >= 2,
            "located": "location_shared" in types,
            "signin_failed": "google_signin_failed" in types,
        }
        for k, v in flags.items():
            if v:
                stage[k] += 1
                by_ad[ad][k] += 1

        device[meta0.get("dev") or "unknown"] += 1
        in_app[meta0.get("iab") or "browser"] += 1
        fs = first_seen.get(sid)
        visitor_type["returning" if fs and _aware(fs) < start else "new"] += 1
        daily[_ist_day(tagged[5]).isoformat()] += 1
        s_areas, s_cities = set(), set()
        for e in evs:
            meta = e[4] if isinstance(e[4], dict) else {}
            if e[2] == "location_shared" and meta.get("locality"):
                s_areas.add(meta["locality"])
            if e[2] in ("search_performed", "location_shared", "city_selected") and meta.get("city"):
                s_cities.add(meta["city"])
        areas.update(s_areas)
        cities.update(s_cities)
        for cid in {e[3] for e in evs if e[2] == "venue_viewed" and e[3]}:
            cafe_views[cid] += 1
        for cid in {e[3] for e in evs if e[2] == "notify_me" and e[3]}:
            cafe_notify[cid] += 1
        for cid in {e[3] for e in evs if e[2] == "booking_flow_started" and e[3]}:
            cafe_starts[cid] += 1
        bookings += len(s_bookings)
        gmv += sum(float(b.total_amount) for b in s_bookings)

    cafe_ids = set(cafe_views) | set(cafe_notify) | set(cafe_starts)
    cafes = {c.id: c for c in (await db.execute(select(Cafe).where(Cafe.id.in_(cafe_ids)))).scalars().all()} if cafe_ids else {}
    cafe_booked = Counter(b.cafe_id for bs in booked_by.values() for b in bs)

    funnel_keys = [
        ("landed", "Landed on KHEL-O"),
        ("viewed", "Opened a café"),
        ("acted", "Tapped Book or Notify me"),
        ("signed_in", "Signed in"),
        ("booked", "Booked"),
    ]
    funnel = []
    prev = None
    for key, label in funnel_keys:
        n = stage[key]
        funnel.append({
            "key": key, "label": label, "sessions": n,
            "ofLanded": round(n / stage["landed"], 4) if stage["landed"] else 0,
            "ofPrevious": round(n / prev, 4) if prev else None,
        })
        prev = n

    def counter_list(c: Counter, key: str = "name") -> list[dict]:
        return [{key: k, "sessions": v} for k, v in c.most_common()]

    return {
        "source": source,
        "campaign": campaign,
        "from": start_day.isoformat(),
        "to": end_day.isoformat(),
        "funnel": funnel,
        "totals": {
            "visitors": stage["landed"],
            "searched": stage["searched"],
            "viewedCafe": stage["viewed"],
            "notifyMe": stage["notify"],
            "bookingStarted": stage["started"],
            "signedIn": stage["signed_in"],
            "newAccounts": stage["signed_up"],
            "booked": stage["booked"],
            "bookings": bookings,
            "gmv": round(gmv, 2),
            "cameBack": stage["returned"],
            "sharedLocation": stage["located"],
            "googleSigninFailed": stage["signin_failed"],
        },
        "byAd": [
            {"ad": ad, "sessions": c["landed"], "viewedCafe": c["viewed"], "acted": c["acted"], "booked": c["booked"]}
            for ad, c in sorted(by_ad.items(), key=lambda kv: kv[1]["landed"], reverse=True)
        ],
        "devices": counter_list(device),
        "inAppBrowser": counter_list(in_app),
        "visitorType": counter_list(visitor_type),
        "areas": counter_list(areas),
        "cities": counter_list(cities),
        "daily": [{"date": d, "sessions": n} for d, n in sorted(daily.items())],
        "cafes": sorted(
            (
                {
                    "cafeId": str(cid),
                    "name": cafes[cid].name,
                    "area": _cafe_area(cafes[cid]),
                    "isLeadListing": bool(cafes[cid].is_lead_listing),
                    "views": cafe_views[cid],
                    "notifyMe": cafe_notify[cid],
                    "bookingStarts": cafe_starts[cid],
                    "bookings": cafe_booked[cid],
                }
                for cid in cafe_ids if cid in cafes
            ),
            key=lambda r: (r["views"], r["notifyMe"]),
            reverse=True,
        ),
    }


# ------------------------------------------------------------------- areas

async def area_report(db: AsyncSession, city: str, days: int = 90) -> dict:
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)

    city_cafes = (await db.execute(select(Cafe).where(func.lower(Cafe.city) == city.lower()))).scalars().all()
    area_of = {c.id: _cafe_area(c) for c in city_cafes}

    rows = await _events(db, start, end, ["location_shared", "venue_viewed", "search_performed", "city_selected"])
    home_of: dict[str, str] = {}
    players, viewers = defaultdict(set), defaultdict(set)
    city_sessions: dict[str, set] = defaultdict(set)
    viewed_areas: dict[str, set] = defaultdict(set)
    for sid, _, etype, cafe_id, meta, _ in rows:
        meta = meta if isinstance(meta, dict) else {}
        if meta.get("city"):
            city_sessions[meta["city"]].add(sid)
        if etype == "location_shared" and (meta.get("city") or "").lower() == city.lower():
            home = meta.get("locality") or OTHER_AREA
            home_of[sid] = home
            players[home].add(sid)
        elif etype == "venue_viewed" and cafe_id in area_of:
            viewers[area_of[cafe_id]].add(sid)
            viewed_areas[sid].add(area_of[cafe_id])

    notify = Counter()
    if area_of:
        for (cid,) in (await db.execute(
            select(CafeWaitlistEntry.cafe_id).where(
                CafeWaitlistEntry.cafe_id.in_(list(area_of)), CafeWaitlistEntry.created_at >= start
            )
        )).all():
            notify[area_of[cid]] += 1

    stats: dict[str, dict] = defaultdict(lambda: {"bookings": 0, "gmv": 0.0, "hours": 0.0, "players": set(), "hour": Counter(), "weekday": Counter()})
    if area_of:
        for b in (await db.execute(
            select(Booking).where(
                Booking.cafe_id.in_(list(area_of)), Booking.status.in_(PAID),
                Booking.session_date >= start.astimezone(IST).date(),
            )
        )).scalars().all():
            s = stats[area_of[b.cafe_id]]
            s["bookings"] += 1
            s["gmv"] += float(b.total_amount)
            s["hours"] += float(b.duration_hours or 0)
            s["players"].add(b.gamer_id)
            s["hour"][b.start_time.hour] += 1
            s["weekday"][b.session_date.strftime("%A")] += 1

    cafes_in = defaultdict(lambda: {"live": 0, "comingSoon": 0})
    for c in city_cafes:
        if not c.is_active:
            continue
        cafes_in[area_of[c.id]]["comingSoon" if c.is_lead_listing else "live"] += 1

    flows = Counter()
    for sid, home in home_of.items():
        for there in viewed_areas.get(sid, ()):
            if there != home and home != OTHER_AREA:
                flows[(home, there)] += 1

    names = set(players) | set(viewers) | set(notify) | set(stats) | set(cafes_in)
    areas = []
    for name in names:
        s = stats.get(name) or {"bookings": 0, "gmv": 0.0, "hours": 0.0, "players": set(), "hour": Counter(), "weekday": Counter()}
        n = s["bookings"]
        peak_hour = s["hour"].most_common(1)[0][0] if s["hour"] else None
        areas.append({
            "area": name,
            "playersNearby": len(players.get(name, ())),
            "cafeViewers": len(viewers.get(name, ())),
            "notifyMe": notify.get(name, 0),
            "cafes": cafes_in.get(name, {"live": 0, "comingSoon": 0}),
            "bookings": n,
            "gmv": round(s["gmv"], 2),
            "uniqueBookers": len(s["players"]),
            "avgBookingValue": round(s["gmv"] / n, 2) if n else None,
            "avgHours": round(s["hours"] / n, 2) if n else None,
            "avgPerHour": round(s["gmv"] / s["hours"], 2) if s["hours"] else None,
            "peakHour": peak_hour,
            "peakDay": s["weekday"].most_common(1)[0][0] if s["weekday"] else None,
            "lowData": n < LOW_DATA_BOOKINGS,
        })
    areas.sort(key=lambda a: (a["playersNearby"] + a["cafeViewers"] + a["notifyMe"], a["gmv"]), reverse=True)

    total_bookings = sum(a["bookings"] for a in areas)
    total_gmv = sum(a["gmv"] for a in areas)
    return {
        "city": city,
        "days": days,
        "totals": {
            "visitors": len(city_sessions.get(city, set())),
            "sharedLocation": len(home_of),
            "bookings": total_bookings,
            "gmv": round(total_gmv, 2),
            "avgBookingValue": round(total_gmv / total_bookings, 2) if total_bookings else None,
        },
        "areas": areas,
        "flows": [{"from": a, "to": b, "sessions": n} for (a, b), n in flows.most_common(8)],
        "cities": sorted(
            ({"city": c, "sessions": len(s)} for c, s in city_sessions.items()),
            key=lambda r: r["sessions"], reverse=True,
        ),
    }
