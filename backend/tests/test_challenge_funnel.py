"""The challenge funnel: browser events beside payment records, internal and bot traffic left out."""
from datetime import datetime, timedelta, timezone

from app.services.challenge_funnel import FEv, FPay, build_funnel

T0 = datetime(2026, 11, 25, 6, 0, tzinfo=timezone.utc)


def ui(session, action, at=0, user=None, utm=None, dev="mobile", **meta):
    m = {"action": action, "challenge": "valorant-5v5-xqz", "dev": dev, **meta}
    if utm:
        m["utm"] = utm
    return FEv(session=session, at=T0 + timedelta(seconds=at), type="ui_action", meta=m, user=user)


def step(f, key):
    return next(s for s in f["steps"] if s["key"] == key)


def test_bot_and_internal_sessions_are_dropped_whole_and_humans_stay():
    events = [
        ui("human", "challenge_page_view"),
        ui("human", "challenge_signup_started", 5, kind="team"),
        # a bot: even its first page view is flagged, so the whole session goes
        ui("bot", "challenge_page_view", bot=True),
        ui("bot", "challenge_signup_started", 1),
        # our own phone: flagged on one event only, the rest of the session still goes
        ui("me", "challenge_page_view"),
        ui("me", "challenge_signup_started", 2, internal=True),
    ]
    f = build_funnel(events, [])
    assert f["visitors"]["unique"] == 1
    assert step(f, "signup")["count"] == 1
    assert [r["name"] for r in f["sources"]] == ["direct"]


def test_sessions_not_events_are_counted_and_team_solo_split_does_not_double_count():
    events = [
        ui("a", "challenge_page_view"), ui("a", "challenge_page_view", 60),  # came back to the page: still one visitor
        ui("a", "challenge_signup_started", 10, kind="team"), ui("a", "challenge_signup_started", 20, kind="team"),
        ui("b", "challenge_page_view"), ui("b", "challenge_signup_started", 3, kind="solo"),
        ui("b", "challenge_signup_started", 4, kind="team"),  # tried both: counted in each, once in the total
        ui("c", "challenge_page_view"), ui("c", "challenge_signup_started", 3),  # no kind on the tap
    ]
    f = build_funnel(events, [])
    assert f["visitors"]["unique"] == 3
    assert f["signupByKind"] == {"team": 2, "solo": 1, "unspecified": 1, "all": 3}
    assert step(f, "signup")["count"] == 3
    assert step(f, "signup")["ofVisitors"] == 100


def test_repeat_visitor_means_a_different_calendar_day_in_india():
    events = [
        ui("a", "challenge_page_view", 0), ui("a", "challenge_page_view", 3600),  # same day
        ui("b", "challenge_page_view", 0), ui("b", "challenge_page_view", 86400 + 60),  # next day
    ]
    assert build_funnel(events, [])["visitors"]["returnedAnotherDay"] == 1


def test_money_and_registrations_come_from_payment_records_not_browser_events():
    events = [
        ui("a", "challenge_page_view", user="u1"), ui("a", "challenge_paid", 30, user="u1", kind="solo"),
        # a second browser reported "paid" but there is no payment row for it (the 24 Nov case)
        ui("b", "challenge_page_view", user="u2"), ui("b", "challenge_paid", 30, user="u2", kind="solo"),
        ui("c", "challenge_page_view", user="u3"), ui("c", "challenge_paid", 30, user="u3", kind="team"),
    ]
    pays = [FPay("u1", "solo", "paid", linked=True), FPay("u3", "team", "paid", linked=True)]
    f = build_funnel(events, pays, registered_teams=1, registered_solos=1)
    assert f["outcomes"]["paid"] == 2 and f["outcomes"]["paidSolo"] == 1 and f["outcomes"]["paidTeam"] == 1
    assert step(f, "paid")["source"] == "database"
    assert f["reconciliation"] == {
        "browserSaidPaid": 3, "databasePaid": 2, "match": False,
        "note": f["reconciliation"]["note"],
    }
    assert f["outcomes"]["registeredTeams"] == 1 and f["outcomes"]["registeredSolos"] == 1


def test_refunded_failed_unpaid_and_paid_without_entry_are_kept_apart():
    pays = [
        FPay("u1", "team", "paid", linked=True),
        FPay("u2", "team", "paid", linked=False),      # money held, nothing made: needs a human
        FPay("u3", "solo", "refunded", linked=False),
        FPay("u4", "solo", "failed"),
        FPay("u5", "solo", "created"),
        FPay("u6", "team", "expired"),
    ]
    f = build_funnel([], pays)
    o = f["outcomes"]
    assert (o["paid"], o["refunded"], o["failedRecorded"], o["startedNotPaid"]) == (2, 1, 1, 2)
    assert o["registeredPayments"] == 1 and o["paidWithoutEntry"] == 1
    # a refunded payment is money that did come in, so the reconciliation counts it on the database side
    assert f["reconciliation"]["databasePaid"] == 3


def test_checkout_endings_are_counted_separately_and_never_as_success():
    events = [
        ui("a", "challenge_page_view"), ui("a", "challenge_pay_started", 10, kind="team"),
        ui("a", "challenge_pay_failed", 20, kind="team", reason="payment_failed", attempt=1),
        ui("a", "challenge_pay_failed", 40, kind="team", reason="payment_failed", attempt=2),  # same person, two tries: one session
        ui("b", "challenge_page_view"), ui("b", "challenge_pay_started", 10, kind="solo"),
        ui("b", "challenge_pay_dismissed", 20, kind="solo", via="closed"),
        ui("c", "challenge_page_view"), ui("c", "challenge_pay_started", 10, kind="solo"),
        ui("c", "challenge_pay_verify_error", 20, kind="solo", code="NETWORK"),
    ]
    f = build_funnel(events, [])
    assert f["checkout"]["failedSessions"] == 1
    assert f["checkout"]["dismissedSessions"] == 1
    assert f["checkout"]["couldNotConfirmSessions"] == 1
    assert step(f, "paid")["count"] == 0  # none of them is a payment
    assert step(f, "pay_started")["count"] == 3


def test_engagement_keeps_clicks_and_shares_in_their_own_lanes():
    events = [
        ui("a", "challenge_page_view"), ui("a", "challenge_community_click", 5, where="hero"),
        ui("a", "challenge_community_click", 9, where="band"),
        ui("a", "challenge_share_open", 12, where="hero"),
        FEv("a", T0 + timedelta(seconds=15), "share_created", {"path": "/challenge/valorant-5v5-xqz", "dev": "mobile"}),
        FEv("z", T0 + timedelta(seconds=99), "share_opened", {"path": "/challenge/valorant-5v5-xqz", "dev": "mobile"}),
        ui("a", "challenge_map_click", 20), ui("a", "challenge_khelo_click", 21),
    ]
    e = build_funnel(events, [])["engagement"]
    assert e["communityClicks"] == 1  # one person, two taps
    assert (e["shareSheetOpened"], e["shareLinksCreated"], e["shareLinksOpenedByOthers"]) == (1, 1, 1)
    assert (e["mapClicks"], e["kheloLinkClicks"]) == (1, 1)


def test_sources_devices_and_paid_by_source_through_the_account():
    events = [
        ui("a", "challenge_page_view", user="u1", utm={"s": "instagram", "c": "valorant-instagram"}),
        ui("a", "challenge_signup_started", 5, user="u1", utm={"s": "instagram", "c": "valorant-instagram"}),
        ui("b", "challenge_page_view", dev="desktop"),
        ui("c", "challenge_page_view", user="u3", utm={"s": "whatsapp"}),
    ]
    pays = [FPay("u1", "team", "paid", linked=True), FPay("u3", "solo", "paid", linked=True), FPay("ghost", "solo", "paid", linked=True)]
    f = build_funnel(events, pays)
    src = {r["name"]: r for r in f["sources"]}
    assert src["valorant-instagram"] == {"name": "valorant-instagram", "visitors": 1, "signup": 1, "payStarted": 0, "paid": 1}
    assert src["whatsapp"]["paid"] == 1 and src["direct"]["visitors"] == 1
    assert src["not tracked"]["paid"] == 1  # a payment whose account never showed up in a tagged event
    dev = {r["name"]: r for r in f["devices"]}
    assert dev["mobile"]["visitors"] == 2 and dev["desktop"]["visitors"] == 1


def test_percentages_between_steps_and_empty_data():
    events = []
    for i in range(10):
        events.append(ui(f"s{i}", "challenge_page_view"))
    for i in range(4):
        events.append(ui(f"s{i}", "challenge_signup_started", 5, kind="team"))
    events += [ui("s0", "challenge_details_done", 9, kind="team"), ui("s1", "challenge_details_done", 9, kind="team")]
    f = build_funnel(events, [])
    assert step(f, "signup")["ofPrevious"] == 40 and step(f, "details")["ofPrevious"] == 50
    assert step(f, "details")["ofVisitors"] == 20
    empty = build_funnel([], [])
    assert empty["visitors"]["unique"] == 0 and step(empty, "signup")["ofPrevious"] is None


# ── through the real endpoints (database, permissions) ─────────────────────

import pytest  # noqa: E402

from tests.conftest import auth_headers  # noqa: E402
# _mock_payments is the other file's offline-payments fixture (no network, mock orders); importing it applies it here too.
from tests.test_challenge_teams import _mock_payments, _paid_team, _team_challenge  # noqa: E402,F401


@pytest.mark.asyncio
async def test_links_panel_leaves_out_bots_and_internal_but_keeps_people_and_deletes_nothing(async_client, db_session):
    from sqlalchemy import func, select

    from app.models.analytics_event import AnalyticsEvent

    ch, admin = await _team_challenge(async_client, db_session)

    def row(sid, action, **extra):
        return AnalyticsEvent(session_id=sid, event_type="ui_action", event_metadata={
            "action": action, "challenge": ch["slug"], "utm": {"s": "instagram", "c": "valorant-instagram"}, **extra})

    db_session.add_all([
        row("human", "challenge_page_view"), row("human", "challenge_signup_started"),
        row("crawler", "challenge_page_view", bot=True), row("crawler", "challenge_signup_started", bot=True),
        row("phone-of-ours", "challenge_page_view", internal=True),
    ])
    await db_session.commit()
    h = auth_headers(admin, is_admin=True)
    links = (await async_client.get(f"/api/v1/admin/challenges/{ch['id']}/links", headers=h)).json()["data"]["links"]
    assert links == [{"link": "valorant-instagram", "opened": 1, "tapped": 1, "paid": 0}]
    # reading never removes anything: all 5 rows are still there
    assert (await db_session.execute(select(func.count()).select_from(AnalyticsEvent))).scalar() >= 5


@pytest.mark.asyncio
async def test_funnel_endpoint_reads_payments_from_the_database_and_is_admin_only(async_client, db_session):
    from app.models.analytics_event import AnalyticsEvent

    ch, admin = await _team_challenge(async_client, db_session)
    cap, _ = await _paid_team(async_client, db_session, ch["slug"])

    def row(sid, action, user=None, et="ui_action", **extra):
        meta = {"action": action, "challenge": ch["slug"], "dev": "mobile", "utm": {"s": "whatsapp", "c": "valorant-whatsapp"}, **extra}
        if et != "ui_action":
            meta = {"path": f"/challenge/{ch['slug']}", "dev": "mobile"}
        return AnalyticsEvent(session_id=sid, user_id=user, event_type=et, event_metadata=meta)

    db_session.add_all([
        row("s1", "challenge_page_view", user=cap.id), row("s1", "challenge_signup_started", user=cap.id, kind="team"),
        row("s1", "challenge_pay_started", user=cap.id, kind="team"),
        row("s1", "challenge_paid", user=cap.id, kind="team"),
        row("s1", "x", et="share_created"), row("s2", "x", et="share_opened"),
        row("s2", "challenge_page_view"), row("s2", "challenge_pay_dismissed", kind="team", via="closed"),
        row("bot", "challenge_page_view", bot=True),
    ])
    await db_session.commit()

    h = auth_headers(admin, is_admin=True)
    res = await async_client.get(f"/api/v1/admin/challenges/{ch['id']}/funnel", headers=h)
    assert res.status_code == 200, res.text
    f = res.json()["data"]
    assert f["visitors"]["unique"] == 2
    steps = {s["key"]: s for s in f["steps"]}
    assert steps["pay_started"]["count"] == 1
    assert steps["paid"]["count"] == 1 and steps["paid"]["source"] == "database"
    assert f["outcomes"]["paidTeam"] == 1 and f["outcomes"]["registeredTeams"] == 1
    assert f["outcomes"]["paidWithoutEntry"] == 0
    assert f["reconciliation"]["match"] is True
    assert f["checkout"]["dismissedSessions"] == 1
    assert (f["engagement"]["shareLinksCreated"], f["engagement"]["shareLinksOpenedByOthers"]) == (1, 1)
    src = {r["name"]: r for r in f["sources"]}
    assert src["valorant-whatsapp"]["paid"] == 1  # the paying account came through that link

    # not an admin: refused
    from tests.test_challenges import _player

    gamer = await _player(db_session, "Just A Player")
    denied = await async_client.get(f"/api/v1/admin/challenges/{ch['id']}/funnel", headers=auth_headers(gamer))
    assert denied.status_code in (401, 403)
