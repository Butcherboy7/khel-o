"""Challenge day (wave 2): QR check-in, closing check-in, the draw, results,
standings, and rewards locked to the people who earned them."""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from app.database import AsyncSessionLocal
from app.models.challenge import ChallengeEntry
from app.models.promotion import OfferCampaign, Promotion
from app.services import challenge_bracket as bracket
from app.services import challenge_day as day
from app.services.promotion_service import PromotionService
from app.repositories.promotion_repository import PromotionRepository
from tests.conftest import auth_headers
from tests.test_challenges import _challenge, _join, _player
from tests.test_khelo_promo_codes import _make_cafe_owner_gamer
from tests.test_offer_campaigns import _body, _second_gamer


async def _admin_headers(admin):
    return auth_headers(admin, is_admin=True)


async def _field(async_client, db_session, n, capacity=None):
    """A challenge with n confirmed players, all checked in."""
    ch, admin = await _challenge(async_client, db_session, capacity=capacity or n)
    players = []
    for i in range(n):
        p = await _player(db_session, f"Player {i}")
        assert (await _join(async_client, ch["slug"], p, displayName=f"Tag{i}")).status_code == 201
        players.append(p)
    detail = (await async_client.get(f"/api/v1/admin/challenges/{ch['id']}", headers=auth_headers(admin, is_admin=True))).json()["data"]
    for e in detail["entries"]:
        if e["status"] == "confirmed":
            res = await async_client.post(
                f"/api/v1/admin/challenges/{ch['id']}/entries/{e['id']}/checkin", headers=auth_headers(admin, is_admin=True)
            )
            assert res.status_code == 200, res.text
    return ch, admin, players


def _all_matches(b):
    out = [m for r in b["rounds"] for m in r["matches"]]
    if b["thirdPlace"]:
        out.append(b["thirdPlace"])
    return out


async def _play_out(async_client, ch, admin, bracket_data):
    """Enter results until nothing is left to play: side a always wins by one
    game (2-1 in a best of 3, 3-2 in the best-of-5 final)."""
    b = bracket_data
    while b["upNext"]:
        m = b["upNext"]
        need = m["bestOf"] // 2 + 1
        res = await async_client.post(
            f"/api/v1/admin/challenges/{ch['id']}/matches/{m['id']}/result",
            json={"winner": "a", "scoreA": need, "scoreB": need - 1}, headers=auth_headers(admin, is_admin=True),
        )
        assert res.status_code == 200, res.text
        b = res.json()["data"]
    return b


def test_bracket_plan_gives_top_seeds_the_byes():
    p = bracket.plan(5, third_place=True)
    first = [m for m in p.matches if m.round == 0]
    assert len(first) == 4 and sum(m.bye for m in first) == 3
    assert any(m.is_third_place for m in p.matches)


def test_checkin_token_is_signed():
    entry_id = uuid.uuid4()
    token = day.checkin_token(entry_id)
    assert day.entry_id_from_token(token) == entry_id
    assert day.entry_id_from_token(token[:-1] + ("0" if token[-1] != "0" else "1")) is None
    assert day.entry_id_from_token(uuid.uuid4().hex + token[32:]) is None
    assert day.entry_id_from_token("nonsense") is None


@pytest.mark.asyncio
async def test_me_shows_a_checkin_qr_and_the_door_only_lets_staff_in(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session, capacity=2)
    p = await _player(db_session)
    assert (await _join(async_client, ch["slug"], p)).status_code == 201
    me = (await async_client.get(f"/api/v1/challenges/{ch['slug']}/me", headers=auth_headers(p))).json()["data"]
    assert me["entry"]["checkinQr"].startswith("data:image/png;base64,")
    token = day.checkin_token(uuid.UUID(me["entry"]["id"]))
    url = f"/api/v1/challenges/{ch['slug']}/checkin/{token}"

    # The player can't check themselves in, and a stranger can't either.
    assert (await async_client.post(url, json={}, headers=auth_headers(p))).status_code == 403
    # A bad token is refused.
    bad = f"/api/v1/challenges/{ch['slug']}/checkin/{uuid.uuid4().hex}{'0' * 16}"
    assert (await async_client.post(bad, json={}, headers=auth_headers(admin, is_admin=True))).status_code == 404

    # The café's owner can.
    async with AsyncSessionLocal() as db:
        from app.models.cafe import Cafe
        from app.models.user import User
        cafe = await db.get(Cafe, uuid.UUID(ch["cafe"]["id"]))
        owner = await db.get(User, cafe.owner_id)
    res = await async_client.post(url, json={}, headers=auth_headers(owner))
    assert res.status_code == 200, res.text
    assert res.json()["data"]["present"] is True and res.json()["data"]["alreadyIn"] is False
    again = await async_client.post(url, json={}, headers=auth_headers(admin, is_admin=True))
    assert again.json()["data"]["alreadyIn"] is True


@pytest.mark.asyncio
async def test_closing_checkin_marks_no_shows_and_moves_up_waitlisters_who_came(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session, capacity=2)
    users = [await _player(db_session, f"P{i}") for i in range(4)]
    for u in users:
        assert (await _join(async_client, ch["slug"], u)).status_code == 201
    h = auth_headers(admin, is_admin=True)
    entries = (await async_client.get(f"/api/v1/admin/challenges/{ch['id']}", headers=h)).json()["data"]["entries"]
    by_pos = sorted(entries, key=lambda e: e["position"])
    # Confirmed #1 came, confirmed #2 didn't; both waitlisters came.
    for e in (by_pos[0], by_pos[2], by_pos[3]):
        await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/entries/{e['id']}/checkin", headers=h)
    res = (await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/close-checkin", headers=h)).json()["data"]
    assert (res["noShows"], res["movedUp"]) == (1, 1)
    status = {e["id"]: e["status"] for e in res["entries"]}
    assert [status[e["id"]] for e in by_pos] == ["confirmed", "no_show", "confirmed", "waitlist"]
    assert res["challenge"]["checkinClosedAt"]


@pytest.mark.asyncio
async def test_draw_needs_two_players_and_results_run_to_a_podium(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session, capacity=4)
    h = auth_headers(admin, is_admin=True)
    res = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/draw", headers=h)
    assert res.json()["error"]["code"] == "TOO_FEW_PLAYERS"

    ch, admin, _ = await _field(async_client, db_session, 5)
    h = auth_headers(admin, is_admin=True)
    res = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/draw", headers=h)
    assert res.status_code == 200, res.text
    b = res.json()["data"]
    assert b["drawn"] and b["challenge"]["status"] == "live"
    byes = [m for m in _all_matches(b) if m["bye"]]
    assert len(byes) == 3 and all(m["winner"] for m in byes)

    # Redrawing is fine until a real result is in.
    assert (await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/draw", headers=h)).status_code == 200
    b = (await async_client.get(f"/api/v1/admin/challenges/{ch['id']}/bracket", headers=h)).json()["data"]
    b = await _play_out(async_client, ch, admin, b)
    assert [s["place"] for s in b["standings"]] == [1, 2, 3]
    assert len({s["entryId"] for s in b["standings"]}) == 3
    redo = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/draw", headers=h)
    assert redo.json()["error"]["code"] == "RESULTS_IN"

    # The public bracket has display names only.
    pub = await async_client.get(f"/api/v1/challenges/{ch['slug']}/bracket")
    assert pub.status_code == 200 and "Tag" in pub.text and "+91" not in pub.text and "Player " not in pub.text

    fin = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/finish", headers=h)
    assert fin.json()["data"]["challenge"]["status"] == "finished"


@pytest.mark.asyncio
async def test_a_result_can_be_corrected_only_while_the_next_match_is_open(async_client, db_session):
    ch, admin, _ = await _field(async_client, db_session, 4)
    h = auth_headers(admin, is_admin=True)
    b = (await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/draw", headers=h)).json()["data"]
    semi0, semi1 = b["rounds"][0]["matches"]
    url = lambda m: f"/api/v1/admin/challenges/{ch['id']}/matches/{m['id']}/result"
    await async_client.post(url(semi0), json={"winner": "a"}, headers=h)
    # Changed mind: b won. Final and 3rd-place update with it.
    b = (await async_client.post(url(semi0), json={"winner": "b", "scoreA": 1, "scoreB": 2}, headers=h)).json()["data"]
    assert b["rounds"][1]["matches"][0]["a"]["entryId"] == semi0["b"]["entryId"]
    assert b["thirdPlace"]["a"]["entryId"] == semi0["a"]["entryId"]
    await async_client.post(url(semi1), json={"winner": "a"}, headers=h)
    final = (await async_client.get(f"/api/v1/admin/challenges/{ch['id']}/bracket", headers=h)).json()["data"]["rounds"][1]["matches"][0]
    await async_client.post(url(final), json={"winner": "a"}, headers=h)
    res = await async_client.post(url(semi0), json={"winner": "a"}, headers=h)
    assert res.json()["error"]["code"] == "NEXT_MATCH_DECIDED"


@pytest.mark.asyncio
async def test_three_players_third_place_goes_to_the_lone_semi_loser(async_client, db_session):
    ch, admin, _ = await _field(async_client, db_session, 3)
    h = auth_headers(admin, is_admin=True)
    b = (await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/draw", headers=h)).json()["data"]
    b = await _play_out(async_client, ch, admin, b)
    assert [s["place"] for s in b["standings"]] == [1, 2, 3]
    assert b["thirdPlace"]["bye"] is True


# ── Rewards ────────────────────────────────────────────────────────────────


def _reward(cafe, code, users, **kw):
    now = datetime.now(timezone.utc)
    base = dict(id=uuid.uuid4(), cafe_id=cafe.id, name="Prize", access_code=code, max_uses=None,
                starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=30), is_active=True,
                allowed_user_ids=[str(u) for u in users], max_seats=1, max_uses_per_user=1)
    base.update(kw)
    return OfferCampaign(**base)


def _ten_off(cafe, camp):
    now = datetime.now(timezone.utc)
    return Promotion(
        id=uuid.uuid4(), cafe_id=cafe.id, campaign_id=camp.id, title="10% off", discount_percentage=10,
        valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=30),
        days_of_week=[0, 1, 2, 3, 4, 5, 6], start_hour=0, end_hour=24, max_uses=None, current_uses=0, is_active=True,
    )


@pytest.mark.asyncio
async def test_a_reward_code_only_opens_for_its_own_account_and_seat_limit(async_client):
    code = "R" + uuid.uuid4().hex[:9].upper()
    async with AsyncSessionLocal() as db:
        _o, gamer, cafe, tier = await _make_cafe_owner_gamer(db)
        stranger = await _second_gamer(db)
        camp = _reward(cafe, code, [gamer.id])
        db.add(camp)
        await db.flush()
        db.add(_ten_off(cafe, camp))
        await db.commit()
        svc = PromotionService(PromotionRepository(db))
        assert await svc.resolve_campaign(code, cafe.id, user_id=gamer.id) is not None
        assert await svc.resolve_campaign(code, cafe.id, user_id=stranger.id) is None
        assert await svc.resolve_campaign(code, cafe.id, user_id=None) is None
        assert await svc.resolve_campaign(code, cafe.id, user_id=gamer.id, seats=2) is None

    # Someone else with the link gets no discount.
    res = await async_client.post("/api/v1/bookings", json=_body(cafe, tier, promoCode=code), headers=auth_headers(stranger))
    assert res.status_code != 201 or float(res.json()["data"]["booking"]["discountAmount"]) == 0
    # Signed out, the quote shows nothing either.
    q = (await async_client.post("/api/v1/bookings/quote", json=_body(cafe, tier, promoCode=code))).json()["data"]
    assert q["discountAmount"] == 0

    # The winner gets it, once.
    q = (await async_client.post("/api/v1/bookings/quote", json=_body(cafe, tier, promoCode=code), headers=auth_headers(gamer))).json()["data"]
    assert q["discountAmount"] > 0
    res = await async_client.post("/api/v1/bookings", json=_body(cafe, tier, promoCode=code), headers=auth_headers(gamer))
    assert res.status_code == 201, res.text
    assert float(res.json()["data"]["booking"]["discountAmount"]) > 0
    async with AsyncSessionLocal() as db:
        svc = PromotionService(PromotionRepository(db))
        assert await svc.resolve_campaign(code, cafe.id, user_id=gamer.id) is None

    # A personal reward never earns the Day One badge.
    claim = await async_client.post(f"/api/v1/promotions/campaign/{code}/claim", headers=auth_headers(gamer))
    assert claim.status_code == 404


@pytest.mark.asyncio
async def test_prizes_and_waitlist_rewards_go_to_the_right_people(async_client, db_session):
    ch, admin, players = await _field(async_client, db_session, 4, capacity=4)
    h = auth_headers(admin, is_admin=True)
    late = await _player(db_session, "Late Joiner")
    assert (await _join(async_client, ch["slug"], late)).json()["data"]["entry"]["status"] == "waitlist"

    early = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/rewards/make/prizes", headers=h)
    assert early.json()["error"]["code"] == "NO_WINNER"

    b = (await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/draw", headers=h)).json()["data"]
    b = await _play_out(async_client, ch, admin, b)
    winner_entry = b["standings"][0]["entryId"]

    made = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/rewards/make/prizes", headers=h)
    assert made.status_code == 200, made.text
    kinds = {r["kind"] for r in made.json()["data"]["rewards"]}
    assert {"prize_1", "prize_2", "prize_3"} <= kinds
    # Pressing again makes nothing new.
    again = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/rewards/make/prizes", headers=h)
    assert len(again.json()["data"]["rewards"]) == len(made.json()["data"]["rewards"])

    wl = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/rewards/make/waitlist", headers=h)
    assert wl.status_code == 200, wl.text
    waitlist = next(r for r in wl.json()["data"]["rewards"] if r["kind"] == "waitlist")
    assert waitlist["peopleCount"] == 1

    async with AsyncSessionLocal() as db:
        winner_user = (await db.get(ChallengeEntry, uuid.UUID(winner_entry))).user_id
    seen = {}
    for u in players + [late]:
        me = (await async_client.get(f"/api/v1/challenges/{ch['slug']}/me", headers=auth_headers(u))).json()["data"]
        seen[u.id] = {r["kind"] for r in me["rewards"]}
        for r in me["rewards"]:
            assert all("?promoCode=R" in c["href"] and c["href"].startswith("/cafe/") for c in r["cafes"])
    assert "prize_1" in seen[winner_user]
    assert seen[late.id] == {"waitlist"}
    assert sum("prize_1" in k for k in seen.values()) == 1

    # Codes never reach the public pages.
    code = made.json()["data"]["rewards"][0]["code"]
    for path in (f"/api/v1/challenges/{ch['slug']}", f"/api/v1/challenges/{ch['slug']}/bracket"):
        assert code not in (await async_client.get(path)).text


@pytest.mark.asyncio
async def test_a_locked_reward_says_why_instead_of_invalid_code(async_client):
    code = "R" + uuid.uuid4().hex[:9].upper()
    async with AsyncSessionLocal() as db:
        _o, gamer, cafe, tier = await _make_cafe_owner_gamer(db)
        camp = _reward(cafe, code, [gamer.id])
        db.add(camp)
        await db.flush()
        db.add(_ten_off(cafe, camp))
        await db.commit()
    q = (await async_client.post(
        "/api/v1/bookings/quote", json=_body(cafe, tier, promoCode=code, seatsCount=2), headers=auth_headers(gamer),
    )).json()["data"]
    assert q["discountAmount"] == 0 and "1 seat" in q["offerNote"]


@pytest.mark.asyncio
async def test_a_test_run_can_skip_the_partner_cafe_offer(async_client, db_session):
    ch, admin, _ = await _field(async_client, db_session, 2)
    h = auth_headers(admin, is_admin=True)
    cfg = (await async_client.get(f"/api/v1/admin/challenges/{ch['id']}/rewards", headers=h)).json()["data"]["config"]
    cfg["winnerPartnersOn"] = False
    assert (await async_client.patch(f"/api/v1/admin/challenges/{ch['id']}/rewards-config", json=cfg, headers=h)).status_code == 200
    b = (await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/draw", headers=h)).json()["data"]
    await _play_out(async_client, ch, admin, b)
    made = (await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/rewards/make/prizes", headers=h)).json()["data"]
    assert {r["kind"] for r in made["rewards"]} == {"prize_1", "prize_2"}
