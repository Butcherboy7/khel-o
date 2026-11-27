"""The sign-up funnel for one team challenge: what people did, and what actually happened.

Two kinds of numbers, kept apart on purpose:

* BROWSER events (page opened, Sign up tapped, payment window opened...). Counted as distinct browser
  sessions, so a person who taps three times counts once. Internal devices (?internal=1, staff and
  owner accounts) and bots are left out, and a session with even one internal or bot event is left out
  whole. Nothing is deleted: this is only how the numbers are read.
* DATABASE outcomes (payments paid / refunded / failed, teams and solo players registered). Money and
  registrations always come from here, never from a browser event.

`build_funnel` is pure (rows in, dict out) so it is tested without a database.
`challenge_funnel` (the loader) is in the API module so it can reuse the same session.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional

IST = timezone(timedelta(hours=5, minutes=30))
DIRECT = "direct"
NOT_TRACKED = "not tracked"

# ui_action names this report reads (existing names, unchanged).
PAGE_VIEW = "challenge_page_view"
SIGNUP = "challenge_signup_started"
DETAILS = "challenge_details_done"
PAY_STARTED = "challenge_pay_started"
PAID = "challenge_paid"
COMMUNITY = "challenge_community_click"
SHARE_SHEET = "challenge_share_open"
MAP = "challenge_map_click"
KHELO = "challenge_khelo_click"
# New in this change: how a payment window ended (never a success).
PAY_FAILED = "challenge_pay_failed"
PAY_DISMISSED = "challenge_pay_dismissed"
PAY_VERIFY_ERROR = "challenge_pay_verify_error"


@dataclass
class FEv:
    """One analytics event. `type` is the event_type ('ui_action', 'share_created', 'share_opened')."""
    session: str
    at: datetime
    type: str
    meta: dict[str, Any]
    user: Optional[str] = None

    @property
    def action(self) -> str:
        return str(self.meta.get("action") or "") if self.type == "ui_action" else self.type


@dataclass
class FPay:
    """One challenge payment row. `paid` = status 'paid' (the money is held); `linked` = it has a team or player."""
    user: Optional[str]
    kind: str
    status: str
    linked: bool = False


@dataclass
class Session:
    id: str
    events: list[FEv] = field(default_factory=list)


def _touch_label(meta: dict[str, Any]) -> str:
    u = meta.get("utm") if isinstance(meta.get("utm"), dict) else {}
    return str(u.get("c") or u.get("s") or DIRECT)


def _pct(part: int, whole: int) -> Optional[int]:
    return round(100 * part / whole) if whole else None


def _day(at: datetime) -> str:
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    return at.astimezone(IST).date().isoformat()


def build_funnel(
    events: Iterable[FEv],
    payments: Iterable[FPay],
    *,
    registered_teams: int = 0,
    registered_solos: int = 0,
) -> dict[str, Any]:
    pays = list(payments)
    ordered = sorted(events, key=lambda e: e.at)

    # Sessions with any internal or bot event are dropped whole.
    skip: set[str] = {e.session for e in ordered if e.meta.get("internal") or e.meta.get("bot")}
    sessions: dict[str, Session] = {}
    for e in ordered:
        if e.session in skip:
            continue
        sessions.setdefault(e.session, Session(e.session)).events.append(e)

    # One label and one device per session. The label is the first real campaign or source it came through.
    label_of: dict[str, str] = {}
    device_of: dict[str, str] = {}
    for sid, s in sessions.items():
        tagged = [_touch_label(e.meta) for e in s.events if _touch_label(e.meta) != DIRECT]
        label_of[sid] = tagged[0] if tagged else DIRECT
        device_of[sid] = str(next((e.meta.get("dev") for e in s.events if e.meta.get("dev")), "unknown"))
    # A paying account is credited to the first real label / device its own browser had.
    user_label: dict[str, str] = {}
    user_device: dict[str, str] = {}
    for e in ordered:
        if not e.user or e.session not in sessions:
            continue
        lab = label_of[e.session]
        if e.user not in user_label or (user_label[e.user] == DIRECT and lab != DIRECT):
            user_label[e.user] = lab
        user_device.setdefault(e.user, device_of[e.session])

    def with_action(*names: str) -> set[str]:
        return {sid for sid, s in sessions.items() if any(e.action in names for e in s.events)}

    def by_kind(name: str) -> dict[str, int]:
        team: set[str] = set()
        solo: set[str] = set()
        anyk: set[str] = set()
        for sid, s in sessions.items():
            for e in s.events:
                if e.action != name:
                    continue
                anyk.add(sid)
                k = e.meta.get("kind")
                if k == "team":
                    team.add(sid)
                elif k == "solo":
                    solo.add(sid)
        return {"team": len(team), "solo": len(solo), "unspecified": len(anyk - team - solo), "all": len(anyk)}

    visitors = with_action(PAGE_VIEW)
    returned = 0
    for sid in visitors:
        days = {_day(e.at) for e in sessions[sid].events if e.action == PAGE_VIEW}
        if len(days) >= 2:
            returned += 1

    signup = by_kind(SIGNUP)
    details = by_kind(DETAILS)
    started = by_kind(PAY_STARTED)
    browser_paid = by_kind(PAID)
    failed_s = with_action(PAY_FAILED)
    dismissed_s = with_action(PAY_DISMISSED)
    verify_err_s = with_action(PAY_VERIFY_ERROR)

    paid = [p for p in pays if p.status == "paid"]
    refunded = [p for p in pays if p.status == "refunded"]
    refund_due = [p for p in pays if p.status == "refund_due"]  # money taken, refund not done yet
    failed_db = [p for p in pays if p.status == "failed"]
    unpaid = [p for p in pays if p.status in ("created", "expired")]
    registered = [p for p in paid if p.linked]
    paid_unlinked = [p for p in paid if not p.linked]

    steps_raw = [
        ("visitors", "Opened the page", len(visitors), "browser"),
        ("signup", "Tapped Sign up", signup["all"], "browser"),
        ("details", "Finished the details", details["all"], "browser"),
        ("pay_started", "Opened the payment window", started["all"], "browser"),
        ("paid", "Payment confirmed (database)", len(paid), "database"),
        ("registered", "Registered: team or solo spot made (database)", len(registered), "database"),
    ]
    steps = []
    prev: Optional[int] = None
    first = steps_raw[0][2]
    for key, label, n, source in steps_raw:
        steps.append({
            "key": key, "label": label, "count": n, "source": source,
            "ofPrevious": _pct(n, prev) if prev is not None else None,
            "ofVisitors": _pct(n, first) if key != "visitors" else None,
        })
        prev = n

    def table(keys_of: dict[str, str], user_map: dict[str, str]) -> list[dict[str, Any]]:
        rows: dict[str, dict[str, int]] = defaultdict(lambda: {"visitors": 0, "signup": 0, "payStarted": 0, "paid": 0})
        sets = {"visitors": visitors, "signup": with_action(SIGNUP), "payStarted": with_action(PAY_STARTED)}
        for field_, members in sets.items():
            for sid in members:
                rows[keys_of[sid]][field_] += 1
        for p in paid:
            rows[user_map.get(p.user or "", NOT_TRACKED)]["paid"] += 1
        out = [{"name": k, **v} for k, v in rows.items()]
        out.sort(key=lambda r: (-r["visitors"], -r["paid"], r["name"]))
        return out

    browser_paid_n = browser_paid["all"]
    return {
        "note": "Browser events count distinct browser sessions (internal and bot traffic removed). "
                "Payments and registrations come from the payment records.",
        "visitors": {"unique": len(visitors), "returnedAnotherDay": returned},
        "steps": steps,
        "signupByKind": signup,
        "detailsByKind": details,
        "payStartedByKind": started,
        "checkout": {
            "failedSessions": len(failed_s),
            "dismissedSessions": len(dismissed_s),
            "couldNotConfirmSessions": len(verify_err_s),
            "note": "Failed = Razorpay said an attempt failed. Closed = the person closed the window. "
                    "Could not confirm = our server could not confirm a payment Razorpay reported (money may have been taken).",
        },
        "outcomes": {
            "paid": len(paid),
            "paidTeam": sum(1 for p in paid if p.kind == "team"),
            "paidSolo": sum(1 for p in paid if p.kind == "solo"),
            "refunded": len(refunded),
            "refundDue": len(refund_due),
            "failedRecorded": len(failed_db),
            "startedNotPaid": len(unpaid),
            "registeredPayments": len(registered),
            "registeredTeams": registered_teams,
            "registeredSolos": registered_solos,
            "paidWithoutEntry": len(paid_unlinked),
        },
        "reconciliation": {
            "browserSaidPaid": browser_paid_n,
            "databasePaid": len(paid) + len(refunded) + len(refund_due),
            "match": browser_paid_n == len(paid) + len(refunded) + len(refund_due),
            "note": "The browser's paid event is only a hint. Money is read from the payment records.",
        },
        "engagement": {
            "communityClicks": len(with_action(COMMUNITY)),
            "shareSheetOpened": len(with_action(SHARE_SHEET)),
            "shareLinksCreated": len(with_action("share_created")),
            "shareLinksOpenedByOthers": len(with_action("share_opened")),
            "mapClicks": len(with_action(MAP)),
            "kheloLinkClicks": len(with_action(KHELO)),
            "note": "A community click is not a confirmed join. Opening the share sheet is not a referral.",
        },
        "sources": table(label_of, user_label),
        "devices": table(device_of, user_device),
    }
