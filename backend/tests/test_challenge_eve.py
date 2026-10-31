"""The night-before checklist for Tekken Challenge #01: brackets of real sizes run
to exactly three podium rewards, Draw can't be reshuffled by a double tap, the door
QR checks in people already on the list (signed in or not) without touching the
bracket, /me says when a player is out, and the checked-in reward can be one day."""
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.challenge import ChallengeEntry
from app.models.promotion import OfferCampaign, Promotion
from app.services import challenge_day as day
from app.services import challenge_rewards as rewards
from tests.conftest import auth_headers
from tests.test_challenge_day import _all_matches, _play_out
from tests.test_challenge_door import _on_the_day, _walk_in
from tests.test_challenge_integrity import _field, _u
from tests.test_challenge_settlement import _campaigns, _finished
from tests.test_challenges import _join, _phone, _player


@pytest.mark.asyncio
@pytest.mark.parametrize("n", [3, 5, 10, 11, 17, 25])
async def test_a_bracket_of_n_players_runs_to_exactly_three_podium_rewards(async_client, db_session, n):
    ch, admin, h, fin = await _finished(async_client, db_session, n)
    b = (await async_client.get(_u(ch, "/bracket"), headers=h)).json()["data"]
    size = 1 << (n - 1).bit_length()
    first = b["rounds"][0]["matches"]
    assert len(first) == size // 2
    assert sum(m["bye"] for m in first) == size - n
    # Everyone who was drawn is in round one exactly once.
    ids = [s["entryId"] for m in first for s in (m["a"], m["b"]) if s and s.get("entryId")]
    assert len(ids) == n and len(set(ids)) == n
    # A 3rd-place match is there (with 3 players it is a walkover for the lone semi loser).
    assert b["thirdPlace"] is not None and b["thirdPlace"]["winner"]
    assert [s["place"] for s in b["standings"]] == [1, 2, 3]
    assert len({s["entryId"] for s in b["standings"]}) == 3
    prizes = [c for c in await _campaigns(ch["id"], current_only=True) if (c.reward_kind or "").startswith("prize_")]
    assert sorted(c.reward_kind for c in prizes) == ["prize_1", "prize_2", "prize_3"]
    # Finish twice changes nothing.
    assert (await async_client.post(_u(ch, "/finish"), headers=h)).status_code == 200
    again = [c for c in await _campaigns(ch["id"], current_only=True) if (c.reward_kind or "").startswith("prize_")]
    assert len(again) == 3


@pytest.mark.asyncio
async def test_a_second_draw_keeps_the_bracket_unless_redo_is_asked_for(async_client, db_session):
    ch, admin, _ = await _field(async_client, db_session, 6)
    h = auth_headers(admin, is_admin=True)
    one = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    for _ in range(3):
        same = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
        assert _all_matches(same) == _all_matches(one)
    redone = await async_client.post(_u(ch, "/draw"), json={"redo": True}, headers=h)
    assert redone.status_code == 200
    assert {m["id"] for m in _all_matches(redone.json()["data"])}.isdisjoint({m["id"] for m in _all_matches(one)})


@pytest.mark.asyncio
async def test_signed_out_player_on_the_list_is_checked_in_by_the_door_qr(async_client, db_session, monkeypatch):
    ch, admin = await _challenge_open(async_client, db_session)
    p = await _player(db_session, "Listed")
    phone = _phone()
    assert (await _join(async_client, ch["slug"], p, phone=phone)).status_code == 201
    monkeypatch.setattr("app.services.challenge_service.now", lambda: _on_the_day(ch))
    url = f"/api/v1/challenges/{ch['slug']}/quick-join"
    token = day.door_token(ch["slug"])

    # Same number, any email: their own entry is marked here. No account access is handed out.
    res = await async_client.post(url, json=_walk_in(ch, token, phone=phone, name="Listed"))
    assert res.status_code == 201, res.text
    data = res.json()["data"]
    assert data["checkedIn"] is True and data["signInNeeded"] is True and "accessToken" not in data
    # Their account's email, no entry yet: an entry is made on that account, here.
    known = await _player(db_session, "Has Account")
    res = await async_client.post(url, json=_walk_in(ch, token, email=known.email))
    assert res.status_code == 201 and res.json()["data"]["checkedIn"] is True
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(ChallengeEntry).where(ChallengeEntry.challenge_id == uuid.UUID(ch["id"])))).scalars().all()
    mine = [e for e in rows if e.user_id in (p.id, known.id)]
    assert len(mine) == 2 and all(e.present and e.status == "confirmed" for e in mine)
    assert len(rows) == 2
    # Without the door code the old rule holds: an existing email signs in instead.
    res = await async_client.post(url, json=_walk_in(ch, None, email=known.email))
    assert res.json()["error"]["code"] in ("EMAIL_ALREADY_EXISTS", "CHALLENGE_CLOSED")


async def _challenge_open(async_client, db_session):
    from tests.test_challenges import _challenge
    return await _challenge(async_client, db_session, capacity=5)


@pytest.mark.asyncio
async def test_the_door_after_the_draw_checks_people_in_and_leaves_the_bracket_alone(async_client, db_session, monkeypatch):
    ch, admin, players = await _field(async_client, db_session, 4, capacity=8)
    h = auth_headers(admin, is_admin=True)
    late = await _player(db_session, "Late Listed")
    late_phone = _phone()
    assert (await _join(async_client, ch["slug"], late, phone=late_phone)).status_code == 201
    assert (await async_client.post(_u(ch, "/close-checkin"), headers=h)).status_code == 200
    before = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    monkeypatch.setattr("app.services.challenge_service.now", lambda: _on_the_day(ch))
    url = f"/api/v1/challenges/{ch['slug']}/quick-join"
    token = day.door_token(ch["slug"])

    # A brand-new walk-in and the signed-up player who was marked not here.
    new = await async_client.post(url, json=_walk_in(ch, token))
    assert new.status_code == 201, new.text
    assert new.json()["data"]["entry"]["present"] is True
    back = await async_client.post(url, json=_walk_in(ch, token, phone=late_phone))
    assert back.status_code == 201 and back.json()["data"]["checkedIn"] is True

    after = (await async_client.get(_u(ch, "/bracket"), headers=h)).json()["data"]
    assert _all_matches(after) == _all_matches(before)
    async with AsyncSessionLocal() as db:
        here = await rewards.attended_user_ids(db, uuid.UUID(ch["id"]))
    assert str(late.id) in here and len(here) == 6
    # The new walk-in's /me: here, not in the bracket, not "out".
    me = (await async_client.get(f"/api/v1/challenges/{ch['slug']}/me", headers=auth_headers(late))).json()["data"]
    assert me["entry"]["present"] is True and me["entry"]["inBracket"] is False and me["entry"]["out"] is False


@pytest.mark.asyncio
async def test_me_says_out_only_when_a_player_is_really_out(async_client, db_session):
    ch, admin, players = await _field(async_client, db_session, 4)
    h = auth_headers(admin, is_admin=True)
    b = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    by_entry = {}
    async with AsyncSessionLocal() as db:
        for e in (await db.execute(select(ChallengeEntry).where(ChallengeEntry.challenge_id == uuid.UUID(ch["id"])))).scalars():
            by_entry[str(e.id)] = next(p for p in players if p.id == e.user_id)

    async def me(entry_id):
        res = await async_client.get(f"/api/v1/challenges/{ch['slug']}/me", headers=auth_headers(by_entry[entry_id]))
        return res.json()["data"]["entry"]

    semi = b["upNext"]
    loser = semi["b"]["entryId"]
    assert (await me(loser))["out"] is False
    await async_client.post(_u(ch, f"/matches/{semi['id']}/result"), json={"winner": "a", "scoreA": 2, "scoreB": 1}, headers=h)
    # Lost the semi, but the 3rd-place match is still to play.
    assert (await me(loser))["out"] is False
    b = (await async_client.get(_u(ch, "/bracket"), headers=h)).json()["data"]
    b = await _play_out(async_client, ch, admin, b)
    places = {s["entryId"]: s["place"] for s in b["standings"]}
    fourth = next(i for i in by_entry if i not in places)
    assert (await me(fourth))["out"] is True
    for entry_id in places:
        assert (await me(entry_id))["out"] is False


@pytest.mark.asyncio
async def test_a_first_round_loser_is_out_straight_away(async_client, db_session):
    ch, admin, players = await _field(async_client, db_session, 5)
    h = auth_headers(admin, is_admin=True)
    b = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    m = b["upNext"]
    await async_client.post(_u(ch, f"/matches/{m['id']}/result"), json={"winner": "a", "scoreA": 2, "scoreB": 0}, headers=h)
    async with AsyncSessionLocal() as db:
        e = await db.get(ChallengeEntry, uuid.UUID(m["b"]["entryId"]))
    user = next(p for p in players if p.id == e.user_id)
    res = (await async_client.get(f"/api/v1/challenges/{ch['slug']}/me", headers=auth_headers(user))).json()["data"]
    assert res["entry"]["out"] is True and res["entry"]["inBracket"] is True


@pytest.mark.asyncio
async def test_zero_days_makes_the_checked_in_reward_the_challenge_day_only(async_client, db_session):
    from tests.test_challenge_attended import CONFIG
    ch, admin, _ = await _field(async_client, db_session, 2)
    h = auth_headers(admin, is_admin=True)
    assert (await async_client.patch(_u(ch, "/rewards-config"), json=CONFIG, headers=h)).status_code == 200
    res = await async_client.patch(_u(ch, "/rewards-config"), json={**CONFIG, "attendedDays": 0}, headers=h)
    assert res.status_code == 200, res.text
    async with AsyncSessionLocal() as db:
        camps = (await db.execute(select(OfferCampaign).where(
            OfferCampaign.challenge_id == uuid.UUID(ch["id"]), OfferCampaign.reward_kind == "attended"))).scalars().all()
        assert len(camps) == 1
        camp = camps[0]
        promo = (await db.execute(select(Promotion).where(Promotion.campaign_id == camp.id))).scalar_one()
    assert camp.ends_at - camp.starts_at == timedelta(hours=23, minutes=59, seconds=59)
    assert promo.valid_until == camp.ends_at and "only" in promo.description
