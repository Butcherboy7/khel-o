from datetime import datetime, timedelta, timezone

from app.services.conversion_report import Ev, build_report, channel

T0 = datetime(2026, 11, 20, 10, tzinfo=timezone.utc)


def ev(s, t, at=0, **meta):
    return Ev(s, t, T0 + timedelta(seconds=at), meta)


def test_channels():
    assert channel({"utm": {"s": "meta", "m": "paid"}}) == "Meta ads"
    assert channel({"utm": {"s": "chatgpt.com"}}) == "AI assistants"
    assert channel({"ref": "google.com"}) == "Google / Bing"
    assert channel({"ref": "l.instagram.com"}) == "Instagram"
    assert channel({"ref": "direct"}) == "Direct / typed"
    assert channel({}) == "Not recorded"


def test_funnel_bots_internal_and_search_collapse():
    events = [
        # a bot: one page, gone in a second
        ev("bot", "page_view", path="/login"), ev("bot", "page_exit", 1, path="/login", secs=1),
        # internal device: ignored
        ev("me", "page_view", path="/", internal=True),
        # a real player who searched, saw a café and started booking
        ev("p1", "page_view", 0, path="/", ref="google.com"),
        ev("p1", "search_performed", 1, queryText="G", resultCount=0),
        ev("p1", "search_performed", 2, queryText="Gta", resultCount=0),
        ev("p1", "search_performed", 3, queryText="Gta 6", resultCount=0),
        ev("p1", "page_exit", 30, path="/", secs=30, scroll=50),
        ev("p1", "page_view", 31, path="/cafe/x"),
        ev("p1", "venue_viewed", 32),
        ev("p1", "booking_flow_started", 40),
        # a bouncer
        ev("p2", "page_view", 0, path="/gta6", utm={"s": "meta"}),
        ev("p2", "page_exit", 4, path="/gta6", secs=4),
    ]
    r = build_report(events, days=30, paid_bookings=0, paid_drops=0, unpaid=[])
    assert r["sessions"] == 2 and r["instantBounces"] == 1
    steps = {s["key"]: s["sessions"] for s in r["bookingFunnel"]}
    assert steps == {"visit": 2, "cafe": 1, "start": 1, "pay": 0, "paid": 0}
    assert r["searches"]["top"] == [{"query": "gta 6", "times": 1}]
    assert r["searches"]["zeroResults"][0]["query"] == "gta 6"
    chans = {c["channel"]: c for c in r["channels"]}
    assert chans["Google / Bing"]["start"] == 1 and chans["Meta ads"]["bounced"] == 1
    home = next(p for p in r["pages"] if p["path"] == "/")
    assert home["avgSecs"] == 30 and home["avgScroll"] == 50
    assert any("searches found nothing" in l["title"] for l in r["leaks"])


def test_empty():
    r = build_report([], days=7, paid_bookings=0, paid_drops=0, unpaid=[])
    assert r["sessions"] == 0 and r["leaks"] == []
