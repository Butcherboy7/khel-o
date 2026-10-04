"""Plain-language campaign advice: each rule fires on the numbers it quotes."""
from datetime import date

from app.services.campaign_advisor import advise, biggest_leak


def _report(visitors=55, viewed=1, acted=1, signed_in=0, paid=0, booked=0, **over):
    funnel = [
        ("landed", "Landed on KHEL-O", visitors), ("viewed", "Opened a café", viewed),
        ("acted", "Tapped Book or Notify me", acted), ("signed_in", "Signed in", signed_in),
        ("payment_opened", "Opened payment", paid), ("booked", "Booked", booked),
    ]
    r = {
        "funnel": [{"key": k, "label": l, "sessions": n} for k, l, n in funnel],
        "totals": {
            "visitors": visitors, "viewedCafe": viewed, "bookingStarted": acted, "signedIn": signed_in,
            "booked": booked, "bookings": booked, "gmv": 150.0 * booked, "cameBack": 0, "googleSigninFailed": 0,
        },
        "checkout": {"bookingStarted": acted, "loginShown": 0, "paymentOpened": paid, "paymentFailed": 0,
                     "paymentDismissed": 0, "completed": booked},
        "actions": {}, "engagement": {"measured": 0, "stayed10s": 0, "bounced": 0, "medianSecs": 0, "medianScroll": 0},
        "inAppBrowser": [{"name": "instagram", "sessions": 38}, {"name": "browser", "sessions": 16}],
        "daily": [{"date": "2026-10-04", "sessions": 54}, {"date": "2026-10-05", "sessions": 1}],
        "cafes": [],
    }
    for k, val in over.items():
        r[k] = {**r[k], **val} if isinstance(val, dict) else val
    return r


def keys(advice):
    return [s["key"] for s in advice["steps"]]


def test_special_access_first_day_points_at_the_first_screen_and_the_spend():
    a = advise(_report(), spend=400, paid=True, today=date(2026, 10, 5))
    assert a["verdict"] == "leaking"
    assert a["biggestLeak"]["key"] == "viewed" and a["biggestLeak"]["lost"] == 54
    assert "55 came, nobody has booked yet" in a["headline"] and "first screen" in a["headline"]
    first = a["steps"][0]
    assert first["key"] == "first_screen" and first["title"] == "54 of 55 people left without opening a café"
    spend = next(s for s in a["steps"] if s["key"] == "spend_no_bookings")
    assert spend["tone"] == "fix" and "₹400 spent, ₹7 per visitor" in spend["title"]
    assert "in_app" in keys(a) and "no_time_data" in keys(a)
    # Fixes come before context.
    tones = [s["tone"] for s in a["steps"]]
    assert tones == sorted(tones, key=["fix", "watch", "good", "info"].index)


def test_popup_taps_are_quoted_when_tracked():
    a = advise(_report(actions={"campaign_popup_shown": 40, "campaign_popup_close": 30, "campaign_popup_book_cafe": 3}))
    first = next(s for s in a["steps"] if s["key"] == "first_screen")
    assert "40 saw the welcome pop-up: 3 tapped a café or the prices, 30 closed it." in first["detail"]


def test_checkout_walls_and_payment_problems():
    r = _report(visitors=60, viewed=30, acted=10, signed_in=1, paid=1,
                checkout={"loginShown": 4, "paymentFailed": 1, "paymentDismissed": 2},
                totals={"googleSigninFailed": 3})
    k = keys(advise(r))
    for expected in ("signin_wall", "google_failed", "payment_failed", "payment_closed", "stalled_in_booking"):
        assert expected in k
    assert "first_screen" not in k  # half opened a café: the first screen is fine


def test_bookings_and_cost_per_booking():
    a = advise(_report(visitors=100, viewed=40, acted=10, signed_in=5, paid=4, booked=4), spend=400, today=date(2026, 10, 5))
    assert a["verdict"] == "working" and a["headline"].startswith("4 people booked out of 100")
    cost = next(s for s in a["steps"] if s["key"] == "cost_per_booking")
    assert cost["tone"] == "good" and cost["title"] == "Each booking cost ₹100 and brought in ₹150"


def test_traffic_stopped_only_for_live_campaigns():
    r = _report()
    assert "traffic_stopped" in keys(advise(r, today=date(2026, 10, 9)))
    assert "traffic_stopped" not in keys(advise(r, today=date(2026, 10, 9), live=False))
    assert "traffic_stopped" not in keys(advise(r, today=date(2026, 10, 6)))


def test_no_spend_hint_for_paid_campaigns_and_empty_campaign():
    assert "no_spend" in keys(advise(_report(), paid=True))
    assert "no_spend" not in keys(advise(_report(), paid=False))
    empty = advise(_report(visitors=0, viewed=0, acted=0))
    assert empty["verdict"] == "empty" and keys(empty) == ["no_visitors"]


def test_lead_cafes_and_early_numbers():
    r = _report(visitors=12, viewed=6, acted=2, cafes=[{"views": 4, "isLeadListing": True}, {"views": 2, "isLeadListing": False}])
    a = advise(r)
    assert a["verdict"] == "early"
    assert "lead_cafes" in keys(a) and keys(a)[-1] == "early"


def test_biggest_leak_ignores_flat_steps():
    assert biggest_leak({"funnel": [{"key": "landed", "label": "L", "sessions": 3},
                                    {"key": "viewed", "label": "V", "sessions": 3}]}) is None
