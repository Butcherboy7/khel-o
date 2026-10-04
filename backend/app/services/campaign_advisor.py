"""Plain-language advice for one campaign, worked out from its report.

The Campaigns page shows a lot of numbers; this turns them into "here is
where you are losing people and what to do about it". Every sentence quotes
the real counts it is based on, so the admin can check it. Pure function over
campaign_report()'s output: no database access, easy to test.

Each step: {key, tone, title, detail, todo}
  tone: "fix" (losing people here now), "watch" (worth keeping an eye on),
        "good" (working, keep doing it), "info" (context for reading the rest).
"""
from __future__ import annotations

from datetime import date
from typing import Optional

# Below this many visitors, rates swing too much to judge.
ENOUGH_VISITORS = 30
# A reasonable first step for a paid reel: at least 1 in 4 opens a café.
GOOD_FIRST_STEP = 0.25

_TONE_ORDER = {"fix": 0, "watch": 1, "good": 2, "info": 3}

# Where in the journey each funnel step loses people, in words.
_LEAK_WHERE = {
    "viewed": "on the first screen, before opening a café",
    "acted": "on the café page, before tapping Book",
    "signed_in": "at sign-in",
    "payment_opened": "after signing in, before paying",
    "booked": "at payment",
}


def _pct(n: float, d: float) -> int:
    return round(100 * n / d) if d else 0


def _rs(n: float) -> str:
    return f"₹{round(n):,}"


def _people(n: int) -> str:
    return f"{n} {'person' if n == 1 else 'people'}"


def biggest_leak(report: dict) -> Optional[dict]:
    """The funnel step that lost the most people: {key, label, lost, of}."""
    funnel = report.get("funnel") or []
    best = None
    for prev, cur in zip(funnel, funnel[1:]):
        lost = prev["sessions"] - cur["sessions"]
        if lost > 0 and (best is None or lost > best["lost"]):
            best = {"key": cur["key"], "label": cur["label"], "lost": lost, "of": prev["sessions"]}
    return best


def advise(
    report: dict,
    *,
    spend: Optional[float] = None,
    paid: bool = False,
    live: bool = True,
    today: Optional[date] = None,
) -> dict:
    """`spend` only when the report covers the whole campaign (else cost per
    visitor would be wrong). `today` (IST) is used to spot traffic that stopped."""
    t = report["totals"]
    c = report.get("checkout") or {}
    a = report.get("actions") or {}
    e = report.get("engagement") or {}
    v = t["visitors"]
    steps: list[dict] = []

    def add(key: str, tone: str, title: str, detail: str, todo: str) -> None:
        steps.append({"key": key, "tone": tone, "title": title, "detail": detail, "todo": todo})

    if v == 0:
        add(
            "no_visitors", "fix",
            "Nobody came through this link in these dates",
            "No taps on the short link or its extra tags were recorded.",
            "Check the ad or bio uses the short link shown above, that the boost is approved and running, "
            "and that the dates above include the day it went out.",
        )
        return {"verdict": "empty", "headline": "Nobody came through this link in these dates.", "steps": steps}

    viewed, started, booked = t["viewedCafe"], t["bookingStarted"], t["booked"]
    leak = biggest_leak(report)

    # ---- first screen: did they even open a café?
    if v >= 10 and viewed / v < GOOD_FIRST_STEP:
        popup = ""
        shown = a.get("campaign_popup_shown", 0)
        if shown:
            tapped = a.get("campaign_popup_book_cafe", 0) + a.get("campaign_popup_see_prices", 0)
            closed = a.get("campaign_popup_close", 0)
            popup = (
                f" {shown} saw the welcome pop-up: {tapped} tapped a café or the prices, "
                f"{closed} closed it."
            )
        add(
            "first_screen", "fix",
            f"{v - viewed} of {v} people left without opening a café",
            f"Only {viewed} ({_pct(viewed, v)}%) opened a café. A healthy first step is at least 1 in 4.{popup}",
            "People leave when the page doesn't show what the reel promised. Put one café and one price in the "
            "reel's first 3 seconds (for example “PS5, 1 hr, ₹99”) and say “tap the link to book”. "
            "The page they land on already lists each café with its special price and a Book button.",
        )

    # ---- how long they stayed
    measured = e.get("measured", 0)
    if measured >= 10:
        quick = measured - e.get("stayed10s", 0)
        if quick / measured >= 0.6:
            add(
                "quick_exits", "fix" if quick / measured >= 0.75 else "watch",
                f"{quick} of {measured} left within 10 seconds",
                f"Half the visitors stayed {e.get('medianSecs', 0)} seconds or less.",
                "That is either a slow page inside Instagram or a page that didn't match the ad. Open the short "
                "link inside Instagram on your own phone: prices should be on screen within 3 seconds.",
            )
    elif v > 0 and measured == 0:
        add(
            "no_time_data", "info",
            "Time-on-page isn't measured for these visits yet",
            "That tracking is newer than these visits, so how long people stayed fills in from new visits only.",
            "Nothing to do. Check back after the next 20 visitors.",
        )

    # ---- inside Instagram / Facebook
    in_app = sum(r["sessions"] for r in report.get("inAppBrowser") or [] if r["name"] in ("instagram", "facebook"))
    failed = t.get("googleSigninFailed", 0)
    if failed:
        add(
            "google_failed", "fix",
            f"Google sign-in failed for {_people(failed)}",
            f"{in_app} of {v} visitors ({_pct(in_app, v)}%) opened the link inside Instagram or Facebook, "
            "where Google sign-in is often blocked.",
            "Add to the caption: “Tap ⋯ → Open in browser to book”. Email sign-in also works inside Instagram.",
        )
    elif v >= 10 and in_app / v >= 0.5:
        add(
            "in_app", "info",
            f"{_pct(in_app, v)}% opened the link inside Instagram",
            f"{in_app} of {v} visitors never left Instagram's own browser. Sign-in there is harder, which is why "
            "people only sign in at checkout.",
            "If you see people stopping at sign-in below, add “Tap ⋯ → Open in browser” to the caption.",
        )

    # ---- checkout
    login_shown, signed_in = c.get("loginShown", 0), t["signedIn"]
    if login_shown >= 2 and signed_in < login_shown / 2:
        add(
            "signin_wall", "fix",
            f"{login_shown} reached sign-in at checkout, only {signed_in} signed in",
            "These people picked a café, a setup and a time, and stopped when asked to sign in.",
            "Try the checkout yourself inside Instagram on a phone. If Google fails there, point people to email "
            "sign-in or “Open in browser”.",
        )
    reached_pay = c.get("paymentOpened", 0)
    stalled = started - max(login_shown, reached_pay)
    if started >= 3 and stalled >= max(2, started // 2):
        add(
            "stalled_in_booking", "fix",
            f"{stalled} of {started} who started a booking stopped before checkout",
            "They saw the time slots and the price breakdown, then left.",
            "Check those cafés have open evening slots, and that the final price matches the one in the reel.",
        )
    if c.get("paymentFailed", 0):
        n = c["paymentFailed"]
        add(
            "payment_failed", "fix",
            f"{_people(n)} saw a failed payment",
            "The payment itself failed after they tried to pay.",
            "Open the Razorpay dashboard and check the failure reasons (UPI timeouts are the usual cause).",
        )
    if c.get("paymentDismissed", 0):
        n = c["paymentDismissed"]
        add(
            "payment_closed", "watch",
            f"{_people(n)} closed the payment window without paying",
            "They were one step from booking.",
            "Usually a price surprise or the wrong payment app. Make sure the price in the reel is the price "
            "they see at checkout.",
        )

    # ---- cafés that can't take bookings
    lead_views = sum(cf["views"] for cf in report.get("cafes") or [] if cf.get("isLeadListing"))
    if viewed and lead_views >= max(3, 0.3 * viewed):
        add(
            "lead_cafes", "watch",
            f"{lead_views} café visits went to “Booking soon” cafés",
            "Those cafés can't take bookings yet, so those visitors can't convert.",
            "Use these numbers in owner pitches (Areas and Leads pages). In ads, show cafés people can book today.",
        )

    # ---- money
    if spend:
        per_visitor = spend / v
        if booked == 0 and v >= 20:
            add(
                "spend_no_bookings", "fix",
                f"{_rs(spend)} spent, {_rs(per_visitor)} per visitor, no bookings yet",
                f"{v} people came for that money; none booked.",
                "Don't add more budget yet: more money buys more of the same drop-off. Fix the top item on this "
                "list, then boost again.",
            )
        elif booked:
            per_booking = spend / booked
            avg = t["gmv"] / t["bookings"] if t["bookings"] else 0
            ok = per_booking <= avg
            add(
                "cost_per_booking", "good" if ok else "watch",
                f"Each booking cost {_rs(per_booking)} and brought in {_rs(avg)}",
                f"{_rs(spend)} spent, {_rs(per_visitor)} per visitor.",
                "Worth boosting again with the same reel." if ok else
                "You pay more per booking than it brings in. Fine for a launch; to bring it down, fix the top "
                "item on this list before adding budget.",
            )
    elif paid:
        add(
            "no_spend", "info",
            "Add what you spent to see cost per visitor and per booking",
            "This campaign is a paid boost but no spend is saved.",
            "Type the amount in “Campaign details” below and press Save.",
        )

    # ---- traffic stopped
    daily = report.get("daily") or []
    if live and today and daily:
        last = date.fromisoformat(daily[-1]["date"])
        gap = (today - last).days
        if gap >= 2:
            add(
                "traffic_stopped", "watch",
                f"No new visitors for {gap} days",
                f"The last visit came on {last.strftime('%d %b').lstrip('0')}.",
                "If the boost ended, renew it or post a new reel. Reach from one post usually fades in 2 days.",
            )

    # ---- what's working
    if booked:
        add(
            "bookings", "good",
            f"{_people(booked)} booked, {_rs(t['gmv'])} in",
            f"That is {_pct(booked, v)}% of everyone who came.",
            "Ask them to post a story at the café. Keep the same café and price in the next reel.",
        )
    if t.get("cameBack"):
        add(
            "came_back", "good",
            f"{_people(t['cameBack'])} came back on another day",
            "They remembered KHEL-O after the first visit.",
            "A reminder works on these people: post a story with the same link.",
        )

    if v < ENOUGH_VISITORS:
        add(
            "early", "info",
            f"Only {v} visitors so far",
            f"Under {ENOUGH_VISITORS} visitors one or two people swing every percentage.",
            "Read the advice above as early signs. Check again after more visits.",
        )

    steps.sort(key=lambda s: _TONE_ORDER[s["tone"]])

    if booked:
        verdict = "working"
        headline = f"{_people(booked)} booked out of {v} who came ({_pct(booked, v)}%)."
    else:
        verdict = "early" if v < ENOUGH_VISITORS else "leaking"
        where = _LEAK_WHERE.get(leak["key"], "") if leak else ""
        headline = f"{v} came, nobody has booked yet." + (
            f" Most were lost {where}: {leak['lost']} of {leak['of']}." if leak and where else ""
        )
    if leak:
        leak = {**leak, "where": _LEAK_WHERE.get(leak["key"])}
    return {"verdict": verdict, "headline": headline, "biggestLeak": leak, "steps": steps}
