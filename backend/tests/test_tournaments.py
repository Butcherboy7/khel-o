"""Tournament flow end to end through the API: a café owner creates and
publishes, players register (free and paid), the waitlist fills, the door
checks people in, the bracket runs to a champion, and the café's stations are
held for the window."""
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.tournament import Tournament, TournamentEntry
from app.models.user import UserRole
from app.models.user_badge import UserBadge
from app.services import tournament_service as ts
from tests.conftest import auth_headers, create_test_user

IST = timezone(timedelta(hours=5, minutes=30))


async def _venue(db):
    owner = await create_test_user(db, role=UserRole.CAFE_OWNER, full_name="Owner")
    await db.flush()
    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name=f"Arena {uuid4().hex[:4]}", address_line1="1 Test St",
        city="Hyderabad", state="Telangana", pincode="500001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(10, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db.add(cafe)
    await db.flush()
    tier = HardwareTier(id=uuid4(), cafe_id=cafe.id, name="PS5", specs={}, price_per_hour=150.0,
                        total_seats=6, app_bookable_seats=6, active_seats_count=6, is_active=True)
    db.add(tier)
    await db.commit()
    return owner, cafe, tier


async def _org_id(client, owner):
    r = await client.get("/api/v1/host/me", headers=auth_headers(owner))
    assert r.status_code == 200, r.text
    orgs = r.json()["data"]["organisers"]
    assert len(orgs) == 1 and orgs[0]["kind"] == "cafe"
    return orgs[0]["id"]


def _start(days=2, hour=18):
    d = datetime.now(IST).date() + timedelta(days=days)
    return datetime.combine(d, time(hour, 0), tzinfo=IST)


async def _create(client, owner, cafe, tier, **extra):
    org = await _org_id(client, owner)
    body = {"organiserId": org, "cafeId": str(cafe.id), "hardwareTierId": str(tier.id), "title": "FC Friday",
            "gameKey": "ea_fc", "maxTeams": 4, "stations": 2, "startsAt": _start().isoformat(),
            "prizes": [{"place": "1st", "prize": "₹2,000"}], **extra}
    r = await client.post("/api/v1/host/tournaments", json=body, headers=auth_headers(owner))
    assert r.status_code == 200, r.text
    tid = r.json()["data"]["id"]
    r = await client.post(f"/api/v1/host/tournaments/{tid}/publish", headers=auth_headers(owner))
    assert r.status_code == 200, r.text
    return r.json()["data"]


async def _players(db, n):
    users = [await create_test_user(db, full_name=f"P{i}") for i in range(n)]
    await db.commit()
    return users


@pytest.mark.asyncio
async def test_free_tournament_runs_to_a_champion(async_client, db_session):
    owner, cafe, tier = await _venue(db_session)
    t = await _create(async_client, owner, cafe, tier, thirdPlace=True)
    assert t["status"] == "published" and t["game"]["name"].startswith("EA SPORTS FC")
    slug = t["slug"]

    players = await _players(db_session, 5)
    codes = []
    for i, p in enumerate(players):
        r = await async_client.post(f"/api/v1/tournaments/{slug}/register", json={"gamerTag": f"tag{i}"},
                                    headers=auth_headers(p))
        assert r.status_code == 200, r.text
        codes.append(r.json()["data"])
    assert [c["status"] for c in codes] == ["confirmed"] * 4 + ["waitlist"]
    assert codes[0]["code"] and len(codes[0]["code"]) == 6

    # Registering twice is a no-op.
    r = await async_client.post(f"/api/v1/tournaments/{slug}/register", json={"gamerTag": "tag0"},
                                headers=auth_headers(players[0]))
    assert r.json()["data"]["id"] == codes[0]["id"]

    # Player 3 drops out; the waitlisted player can now take the spot.
    r = await async_client.post(f"/api/v1/tournaments/{slug}/cancel-entry", headers=auth_headers(players[3]))
    assert r.status_code == 200
    r = await async_client.post(f"/api/v1/tournaments/{slug}/register", json={"gamerTag": "tag4"},
                                headers=auth_headers(players[4]))
    assert r.json()["data"]["status"] == "confirmed"
    codes[3] = r.json()["data"]
    in_play = [players[0], players[1], players[2], players[4]]

    # Bracket needs check-ins.
    r = await async_client.post(f"/api/v1/host/tournaments/{t['id']}/bracket", json={}, headers=auth_headers(owner))
    assert r.status_code == 400
    for c in (codes[0], codes[1], codes[2], codes[3]):
        r = await async_client.post(f"/api/v1/host/tournaments/{t['id']}/check-in", json={"code": c["code"].lower()},
                                    headers=auth_headers(owner))
        assert r.status_code == 200, r.text
    r = await async_client.post(f"/api/v1/host/tournaments/{t['id']}/bracket", json={}, headers=auth_headers(owner))
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["status"] == "live"
    semis = d["bracket"]["rounds"][0]["matches"]
    assert len(semis) == 2 and all(m["status"] == "ready" for m in semis)

    # Call and score both semis, then the 3rd-place match and the final.
    for m in semis:
        r = await async_client.post(f"/api/v1/host/tournaments/{t['id']}/matches/{m['id']}/call", json={"station": 1},
                                    headers=auth_headers(owner))
        assert r.status_code == 200, r.text
    r = await async_client.post(f"/api/v1/host/tournaments/{t['id']}/matches/{semis[0]['id']}/score",
                                json={"scoreA": 2, "scoreB": 2}, headers=auth_headers(owner))
    assert r.status_code == 400  # no draws
    for m in semis:
        r = await async_client.post(f"/api/v1/host/tournaments/{t['id']}/matches/{m['id']}/score",
                                    json={"scoreA": 3, "scoreB": 1}, headers=auth_headers(owner))
        assert r.status_code == 200, r.text
    d = r.json()["data"]
    final = d["bracket"]["rounds"][1]["matches"][0]
    third = d["bracket"]["thirdPlace"]
    assert final["status"] == "ready" and third["status"] == "ready"
    assert final["a"]["entryId"] == semis[0]["a"]["entryId"]

    r = await async_client.post(f"/api/v1/host/tournaments/{t['id']}/matches/{third['id']}/score",
                                json={"walkoverWinner": "b"}, headers=auth_headers(owner))
    assert r.status_code == 200
    r = await async_client.post(f"/api/v1/host/tournaments/{t['id']}/matches/{final['id']}/score",
                                json={"scoreA": 0, "scoreB": 1}, headers=auth_headers(owner))
    d = r.json()["data"]
    assert d["status"] == "completed"
    places = {x["id"]: x["place"] for x in d["results"]}
    assert sorted(places.values()) == [1, 2, 3, 4]
    champ_entry = final["b"]["entryId"]
    assert places[champ_entry] == 1

    champ = await db_session.get(TournamentEntry, __import__("uuid").UUID(champ_entry))
    badge = (await db_session.execute(select(UserBadge).where(UserBadge.user_id == champ.user_id,
                                                              UserBadge.badge_key == "champion"))).scalars().first()
    assert badge is not None

    r = await async_client.get("/api/v1/tournaments/leaderboard")
    board = r.json()["data"]
    assert board[0]["points"] == 100 and board[0]["wins"] == 1
    assert {row["userId"] for row in board} == {str(p.id) for p in in_play}


@pytest.mark.asyncio
async def test_paid_entry_holds_then_confirms_and_cannot_self_cancel(async_client, db_session, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "ENABLE_SANDBOX_MOCK_PAYMENTS", True)
    owner, cafe, tier = await _venue(db_session)
    t = await _create(async_client, owner, cafe, tier, entryFee=199, maxTeams=2)
    (p,) = await _players(db_session, 1)
    r = await async_client.post(f"/api/v1/tournaments/{t['slug']}/register", json={"gamerTag": "payer"},
                                headers=auth_headers(p))
    e = r.json()["data"]
    assert e["status"] == "held" and e["payment"]["amount"] == 199 and e["code"] is None

    r = await async_client.post(f"/api/v1/tournaments/{t['slug']}/verify-payment", headers=auth_headers(p), json={
        "entryId": e["id"], "razorpayOrderId": e["payment"]["orderId"], "razorpayPaymentId": "pay_x",
        "razorpaySignature": "wrong"})
    assert r.status_code == 400
    r = await async_client.post(f"/api/v1/tournaments/{t['slug']}/verify-payment", headers=auth_headers(p), json={
        "entryId": e["id"], "razorpayOrderId": e["payment"]["orderId"], "razorpayPaymentId": "pay_x",
        "razorpaySignature": "mock_signature_valid"})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "confirmed" and r.json()["data"]["paid"]

    r = await async_client.post(f"/api/v1/tournaments/{t['slug']}/cancel-entry", headers=auth_headers(p))
    assert r.status_code == 400

    # Organiser cancels: the paid entry is flagged for refund.
    r = await async_client.post(f"/api/v1/host/tournaments/{t['id']}/cancel", json={"reason": "Power cut"},
                                headers=auth_headers(owner))
    assert r.status_code == 200
    assert r.json()["data"]["money"]["refundDue"] == 199


@pytest.mark.asyncio
async def test_webhook_confirms_entry_and_late_payment_is_refunded(db_session):
    owner, cafe, tier = await _venue(db_session)
    org = (await ts.my_organisers(db_session, owner))[0]
    t = await ts.create(db_session, owner, org.id, {
        "cafe_id": cafe.id, "title": "Tekken Night", "game_key": "tekken", "max_teams": 2, "entry_fee": 100,
        "starts_at": _start().astimezone(timezone.utc)})
    await ts.publish(db_session, owner, t.id)
    a, b, c = await _players(db_session, 3)
    ea = await ts.register(db_session, a, t, "aa", None, None, [])
    assert await ts.confirm_from_webhook(db_session, ea["payment"]["orderId"], "pay_a")
    assert (await db_session.get(TournamentEntry, __import__("uuid").UUID(ea["id"]))).status == "confirmed"
    assert not await ts.confirm_from_webhook(db_session, "order_unknown", "pay_z")

    eb = await ts.register(db_session, b, t, "bb", None, None, [])
    row_b = await db_session.get(TournamentEntry, __import__("uuid").UUID(eb["id"]))
    row_b.hold_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db_session.commit()
    ec = await ts.register(db_session, c, t, "cc", None, None, [])  # b's hold lapsed, c takes the spot
    assert ec["status"] == "held"
    await ts.confirm_from_webhook(db_session, ec["payment"]["orderId"], "pay_c")
    # b pays late: the event is full, so b is refunded instead of overbooking.
    row_b.status = "held"
    await db_session.commit()
    await ts.confirm_from_webhook(db_session, eb["payment"]["orderId"], "pay_b")
    await db_session.refresh(row_b)
    assert row_b.status == "cancelled" and row_b.refund_due


@pytest.mark.asyncio
async def test_published_tournament_holds_stations(async_client, db_session):
    owner, cafe, tier = await _venue(db_session)
    t = await _create(async_client, owner, cafe, tier, stations=4)
    start = _start()
    r = await async_client.get(f"/api/v1/cafes/{cafe.id}/availability",
                               params={"tier_id": str(tier.id), "date": start.date().isoformat()})
    slots = [s for s in r.json()["data"]["bookedSlots"] if s.get("tournament")]
    assert len(slots) == 1 and slots[0]["seatsCount"] == 4 and slots[0]["startTime"] == "18:00:00"

    from app.repositories.booking_repository import BookingRepository
    n = await BookingRepository(db_session).get_overlapping_bookings_count(tier.id, start.date(), time(19, 0), time(20, 0))
    assert n == 4
    n = await BookingRepository(db_session).get_overlapping_bookings_count(tier.id, start.date(), time(12, 0), time(13, 0))
    assert n == 0


@pytest.mark.asyncio
async def test_permissions_and_validation(async_client, db_session):
    owner, cafe, tier = await _venue(db_session)
    other_owner, other_cafe, _ = await _venue(db_session)
    org = await _org_id(async_client, owner)
    base = {"organiserId": org, "cafeId": str(cafe.id), "title": "X", "gameKey": "ea_fc", "maxTeams": 8,
            "startsAt": _start().isoformat()}

    r = await async_client.post("/api/v1/host/tournaments", json={**base, "cafeId": str(other_cafe.id)},
                                headers=auth_headers(owner))
    assert r.status_code == 403  # a café organiser hosts only at its own café
    r = await async_client.post("/api/v1/host/tournaments", json=base, headers=auth_headers(other_owner))
    assert r.status_code == 403  # not a member of this organiser
    r = await async_client.post("/api/v1/host/tournaments", json={**base, "hardwareTierId": str(tier.id), "stations": 9},
                                headers=auth_headers(owner))
    assert r.status_code == 400  # PS5 has 6 stations
    past = (datetime.now(IST) - timedelta(hours=1)).isoformat()
    r = await async_client.post("/api/v1/host/tournaments", json={**base, "startsAt": past}, headers=auth_headers(owner))
    assert r.status_code == 400

    # Drafts are invisible to players.
    r = await async_client.post("/api/v1/host/tournaments", json=base, headers=auth_headers(owner))
    slug = r.json()["data"]["slug"]
    assert (await async_client.get(f"/api/v1/tournaments/{slug}")).status_code == 404

    r = await async_client.get("/api/v1/tournaments/capacity", params={"teams": 32, "stations": 4, "matchMinutes": 12})
    assert r.json()["data"]["minutes"] == 153
