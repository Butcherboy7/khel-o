"""Ad campaign funnel + area report, and the event stamping they rely on."""
from datetime import date, time, timedelta
from uuid import uuid4

from sqlalchemy import select

from app.core.localities import locality_for
from app.models.analytics_event import AnalyticsEvent
from app.models.booking import Booking, BookingStatus
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.user import UserRole
from tests.conftest import auth_headers, create_test_user

IG_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0"
DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
MADHAPUR = (17.4486, 78.3908)
KUKATPALLY = (17.4950, 78.4000)


async def _cafe(db, owner, name, lat=None, lng=None, lead=False):
    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name=name, address_line1="1 Test St", city="Hyderabad",
        state="Telangana", pincode="500081", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True, is_lead_listing=lead,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
        latitude=lat, longitude=lng,
    )
    db.add(cafe)
    await db.flush()
    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="PC", specs={}, price_per_hour=100.0,
        total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db.add(tier)
    await db.commit()
    return cafe, tier


def _booking(gamer, cafe, tier, amount=208.0, hours=2.0, start=time(19, 0)):
    return Booking(
        id=uuid4(), booking_reference=f"GR-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today(),
        start_time=start, end_time=time(21, 0), duration_hours=hours,
        base_amount=amount - 8, discount_amount=0.0, gateway_fee=8.0, convenience_fee=0.0,
        total_amount=amount, status=BookingStatus.CONFIRMED,
    )


async def _event(client, sid, etype, cafe_id=None, metadata=None, ua=DESKTOP_UA, headers=None):
    body = {"sessionId": sid, "eventType": etype, "metadata": metadata or {}}
    if cafe_id:
        body["cafeId"] = str(cafe_id)
    r = await client.post("/api/v1/analytics/events", json=body, headers={"User-Agent": ua, **(headers or {})})
    assert r.status_code == 204, r.text


def test_locality_snapping():
    assert locality_for(*MADHAPUR) == ("Hyderabad", "Madhapur")
    assert locality_for(12.97, 77.59) == ("Bengaluru", None)
    assert locality_for(None, None) == (None, None)


async def test_location_is_stored_as_area_only_and_device_is_stamped(db_session, async_client):
    sid = f"loc-{uuid4().hex[:8]}"
    await _event(async_client, sid, "location_shared", metadata={"lat": MADHAPUR[0], "lng": MADHAPUR[1]}, ua=IG_UA)
    ev = (await db_session.execute(select(AnalyticsEvent).where(AnalyticsEvent.session_id == sid))).scalar_one()
    assert ev.event_metadata["locality"] == "Madhapur"
    assert ev.event_metadata["city"] == "Hyderabad"
    assert "lat" not in ev.event_metadata and "lng" not in ev.event_metadata
    assert ev.event_metadata["dev"] == "mobile" and ev.event_metadata["iab"] == "instagram"


async def test_campaign_funnel_counts_unique_visitors_per_stage(db_session, async_client):
    admin = await create_test_user(db_session, role=UserRole.ADMIN)
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    gamer = await create_test_user(db_session)
    await db_session.commit()
    cafe, tier = await _cafe(db_session, owner, "Ad Test Arena", *MADHAPUR)
    lead, _ = await _cafe(db_session, owner, "Ad Test Lead", *MADHAPUR, lead=True)
    camp = f"reel-test-{uuid4().hex[:6]}"
    a, b, c, d = (f"s-{x}-{uuid4().hex[:6]}" for x in "abcd")

    utm1 = {"utm": {"s": "meta", "m": "paid_social", "c": camp, "t": "reel-1"}}
    utm2 = {"utm": {"s": "meta", "m": "paid_social", "c": camp, "t": "reel-2"}}
    # A: Instagram visitor who views, starts a booking, signs in and books.
    await _event(async_client, a, "page_view", metadata={"path": "/", **utm1}, ua=IG_UA)
    await _event(async_client, a, "venue_viewed", cafe.id, utm1, ua=IG_UA)
    await _event(async_client, a, "booking_flow_started", cafe.id, utm1, ua=IG_UA, headers=auth_headers(gamer))
    db_session.add(_booking(gamer, cafe, tier))
    await db_session.commit()
    # B: views a lead café and taps Notify me.
    await _event(async_client, b, "page_view", metadata={"path": "/", **utm2})
    await _event(async_client, b, "venue_viewed", lead.id, utm2)
    await _event(async_client, b, "notify_me", lead.id, utm2)
    # C: other campaign; D: organic. Neither counts.
    await _event(async_client, c, "page_view", metadata={"path": "/", "utm": {"s": "meta", "c": "other"}})
    await _event(async_client, d, "page_view", metadata={"path": "/"})

    today = date.today()
    r = await async_client.get(
        "/api/v1/admin/analytics/ad-campaigns/report",
        params={"source": "meta", "campaign": camp, "from": (today - timedelta(days=1)).isoformat(), "to": today.isoformat()},
        headers=auth_headers(admin, is_admin=True),
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    stages = {s["key"]: s["sessions"] for s in data["funnel"]}
    assert stages == {"landed": 2, "viewed": 2, "acted": 2, "signed_in": 1, "payment_opened": 0, "booked": 1}
    assert data["totals"]["notifyMe"] == 1 and data["totals"]["gmv"] == 208.0
    assert {x["ad"]: x["booked"] for x in data["byAd"]} == {"reel-1": 1, "reel-2": 0}
    assert {x["name"]: x["sessions"] for x in data["inAppBrowser"]} == {"instagram": 1, "browser": 1}
    by_cafe = {x["name"]: x for x in data["cafes"]}
    assert by_cafe["Ad Test Lead"]["notifyMe"] == 1 and by_cafe["Ad Test Arena"]["bookings"] == 1
    assert by_cafe["Ad Test Arena"]["area"] == "Madhapur"

    opts = (await async_client.get("/api/v1/admin/analytics/ad-campaigns", headers=auth_headers(admin, is_admin=True))).json()
    assert any(o["campaign"] == camp and o["sessions"] == 2 for o in opts["data"]["campaigns"])


async def test_checkout_steps_and_internal_traffic_left_out(db_session, async_client):
    admin = await create_test_user(db_session, role=UserRole.ADMIN)
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    gamer = await create_test_user(db_session)
    await db_session.commit()
    cafe, _ = await _cafe(db_session, owner, "Checkout Arena")
    camp = f"co-{uuid4().hex[:6]}"
    utm = {"utm": {"s": "meta", "m": "paid_social", "c": camp, "t": "reel-1"}}
    real, tester, staff = (f"s-{x}-{uuid4().hex[:6]}" for x in ("real", "test", "staff"))

    # A real visitor: asked to log in, opens payment, it fails, closes it.
    for etype in ("page_view", "booking_flow_started", "checkout_login_shown"):
        await _event(async_client, real, etype, cafe.id, utm)
    for etype in ("payment_opened", "payment_failed", "payment_dismissed"):
        await _event(async_client, real, etype, cafe.id, utm, headers=auth_headers(gamer))
    # Our test phone (?internal=1) and an owner account browsing: kept out.
    await _event(async_client, tester, "page_view", metadata={**utm, "internal": True})
    await _event(async_client, staff, "page_view", metadata=utm)
    await _event(async_client, staff, "venue_viewed", cafe.id, utm, headers=auth_headers(owner))

    today = date.today()
    params = {"source": "meta", "campaign": camp, "from": (today - timedelta(days=1)).isoformat(), "to": today.isoformat()}
    hdr = auth_headers(admin, is_admin=True)
    data = (await async_client.get("/api/v1/admin/analytics/ad-campaigns/report", params=params, headers=hdr)).json()["data"]
    assert data["totals"]["visitors"] == 1
    assert data["internalExcluded"] == 2
    assert data["checkout"] == {
        "bookingStarted": 1, "loginShown": 1, "paymentOpened": 1,
        "paymentFailed": 1, "paymentDismissed": 1, "completed": 0,
    }
    with_tests = (await async_client.get(
        "/api/v1/admin/analytics/ad-campaigns/report", params={**params, "includeInternal": "true"}, headers=hdr,
    )).json()["data"]
    assert with_tests["totals"]["visitors"] == 3 and with_tests["internalExcluded"] == 0

    stored = (await db_session.execute(
        select(AnalyticsEvent.event_metadata).where(AnalyticsEvent.session_id == staff, AnalyticsEvent.event_type == "venue_viewed")
    )).scalar_one()
    assert stored.get("internal") is True

async def test_one_booking_counted_once_across_visits(db_session, async_client):
    admin = await create_test_user(db_session, role=UserRole.ADMIN)
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    gamer = await create_test_user(db_session)
    await db_session.commit()
    cafe, tier = await _cafe(db_session, owner, "Twice Arena")
    camp = f"twice-{uuid4().hex[:6]}"
    utm = {"utm": {"s": "meta", "c": camp, "t": "reel-1"}}
    # Same person taps the ad on two visits (two sessions) and books once.
    for sid in (f"s1-{uuid4().hex[:6]}", f"s2-{uuid4().hex[:6]}"):
        await _event(async_client, sid, "page_view", metadata=utm, headers=auth_headers(gamer))
    db_session.add(_booking(gamer, cafe, tier, amount=416.0))
    await db_session.commit()
    today = date.today()
    data = (await async_client.get(
        "/api/v1/admin/analytics/ad-campaigns/report",
        params={"source": "meta", "campaign": camp, "from": (today - timedelta(days=1)).isoformat(), "to": today.isoformat()},
        headers=auth_headers(admin, is_admin=True),
    )).json()["data"]
    assert data["totals"]["visitors"] == 2
    assert data["totals"]["booked"] == 1 and data["totals"]["bookings"] == 1
    assert data["totals"]["gmv"] == 416.0



async def test_area_report_rolls_up_bookings_and_player_flows(db_session, async_client):
    admin = await create_test_user(db_session, role=UserRole.ADMIN)
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    gamer = await create_test_user(db_session)
    await db_session.commit()
    headers = auth_headers(admin, is_admin=True)

    async def madhapur():
        data = (await async_client.get("/api/v1/admin/analytics/areas", params={"city": "Hyderabad"}, headers=headers)).json()["data"]
        return data, next((a for a in data["areas"] if a["area"] == "Madhapur"), {"bookings": 0, "gmv": 0, "cafeViewers": 0})

    _, before = await madhapur()
    cafe, tier = await _cafe(db_session, owner, "Area Test Arena", *MADHAPUR)
    db_session.add_all([_booking(gamer, cafe, tier, 208.0, 2.0), _booking(gamer, cafe, tier, 104.0, 1.0)])
    await db_session.commit()
    sid = f"flow-{uuid4().hex[:8]}"
    await _event(async_client, sid, "location_shared", metadata={"lat": KUKATPALLY[0], "lng": KUKATPALLY[1]})
    await _event(async_client, sid, "venue_viewed", cafe.id)

    data, after = await madhapur()
    assert after["bookings"] - before["bookings"] == 2
    assert round(after["gmv"] - before["gmv"], 2) == 312.0
    assert after["cafeViewers"] - before["cafeViewers"] == 1
    assert after["peakHour"] == 19
    assert any(f["from"] == "Kukatpally" and f["to"] == "Madhapur" for f in data["flows"])
    assert (await async_client.get("/api/v1/admin/analytics/areas", headers=auth_headers(gamer))).status_code == 403
