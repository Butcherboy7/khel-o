"""Phase 2 integrity: results locked after Finish, results that can't have
happened refused (Tekken best-of and EA SPORTS FC penalties), the whole
bracket checked before Finish, sign-ups ending with check-in, check-in only
for active players, no rewards for test entries, one booking per waitlist
reward even when checked at the last moment, and practice players only on an
explicit dev environment.

These run on SQLite, which has no row locks: the simultaneous-booking
guarantee is proven separately against dev PostgreSQL."""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.config import settings
from app.core.exceptions import ValidationException
from app.database import AsyncSessionLocal
from app.models.challenge import ChallengeEntry, ChallengeMatch
from app.models.promotion import OfferCampaign
from app.repositories.promotion_repository import PromotionRepository
from app.services import challenge_results as results
from app.services.promotion_service import PromotionService
from tests.conftest import auth_headers
from tests.test_challenge_day import _all_matches, _play_out, _reward, _ten_off
from tests.test_challenges import _challenge, _join, _player
from tests.test_khelo_promo_codes import _make_cafe_owner_gamer
from tests.test_offer_campaigns import _body


async def _field(async_client, db_session, n, capacity=None, **over):
    """A challenge with n confirmed players, all checked in."""
    ch, admin = await _challenge(async_client, db_session, capacity=capacity or n, **over)
    h = auth_headers(admin, is_admin=True)
    players = []
    for i in range(n):
        p = await _player(db_session, f"Player {i}")
        assert (await _join(async_client, ch["slug"], p, displayName=f"Tag{i}")).status_code == 201
        players.append(p)
    detail = (await async_client.get(f"/api/v1/admin/challenges/{ch['id']}", headers=h)).json()["data"]
    for e in detail["entries"]:
        if e["status"] == "confirmed":
            assert (await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/entries/{e['id']}/checkin", headers=h)).status_code == 200
    return ch, admin, players


def _u(ch, tail=""):
    return f"/api/v1/admin/challenges/{ch['id']}{tail}"


async def _result(async_client, ch, h, m, **body):
    return await async_client.post(_u(ch, f"/matches/{m['id']}/result"), json=body, headers=h)


# ── Result rules ───────────────────────────────────────────────────────────


def test_games_results_need_the_winner_to_take_the_majority():
    ok = [(3, "a", 2, 0), (3, "a", 2, 1), (3, "b", 1, 2), (5, "a", 3, 2), (1, "b", 0, 1), (3, "a", None, None)]
    for best_of, w, a, b in ok:
        results.check_result("games", best_of, w, a, b)
    bad = [
        (3, "a", 1, 2),     # winner lower
        (3, "a", 2, 2),     # a draw
        (3, "a", 3, 0),     # more games than a best of 3 needs
        (5, "a", 2, 1),     # a best of 5 needs 3
        (3, "a", 2, None),  # half a score
        (3, "a", 0, 0),
    ]
    for best_of, w, a, b in bad:
        with pytest.raises(results.ResultError):
            results.check_result("games", best_of, w, a, b)
    with pytest.raises(results.ResultError):
        results.check_result("games", 3, "a", 2, 1, "penalties", 4, 3)
    with pytest.raises(results.ResultError):
        results.check_result("games", 3, "c", 2, 1)


def test_goals_results_and_penalties():
    results.check_result("goals", 1, "a", 3, 1)
    results.check_result("goals", 1, "b", 0, 2)
    results.check_result("goals", 1, "a", 2, 2, "penalties", 5, 4)
    results.check_result("goals", 1, "b", 0, 0, "penalties", 3, 4)
    results.check_result("goals", 1, "a", None, None)
    cases = {
        ("a", 1, 2, None, None, None): "INVALID_RESULT",      # winner has fewer goals
        ("a", 2, 2, None, None, None): "TIEBREAK_NEEDED",     # level with no shoot-out
        ("a", 2, 2, "penalties", 3, 4): "INVALID_RESULT",     # loser won the shoot-out
        ("a", 2, 2, "penalties", 4, 4): "INVALID_RESULT",     # shoot-out level
        ("a", 2, 2, "penalties", 4, None): "TIEBREAK_NEEDED",
        ("a", 3, 1, "penalties", 4, 3): "INVALID_RESULT",     # penalties only for a level score
        ("a", 31, 1, None, None, None): "INVALID_RESULT",
        ("a", None, None, "penalties", 4, 3): "INVALID_RESULT",
    }
    for (w, a, b, tb, ta, tbb), code in cases.items():
        with pytest.raises(results.ResultError) as err:
            results.check_result("goals", 1, w, a, b, tb, ta, tbb)
        assert err.value.code == code, (w, a, b, tb, ta, tbb)


@pytest.mark.asyncio
async def test_a_tekken_result_that_cannot_happen_is_refused_and_changes_nothing(async_client, db_session):
    ch, admin, _ = await _field(async_client, db_session, 4)
    h = auth_headers(admin, is_admin=True)
    b = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    m = b["upNext"]
    for body in ({"winner": "a", "scoreA": 1, "scoreB": 2}, {"winner": "a", "scoreA": 2}, {"winner": "a", "scoreA": 3, "scoreB": 0},
                 {"winner": "a", "scoreA": 2, "scoreB": 1, "tiebreak": "penalties", "tiebreakA": 3, "tiebreakB": 1}):
        res = await _result(async_client, ch, h, m, **body)
        assert res.status_code == 422, (body, res.text)
    br = (await async_client.get(_u(ch, "/bracket"), headers=h)).json()["data"]
    assert next(x for x in _all_matches(br) if x["id"] == m["id"])["winner"] is None
    assert (await _result(async_client, ch, h, m, winner="a", scoreA=2, scoreB=0)).status_code == 200


@pytest.mark.asyncio
async def test_ea_fc_level_scores_need_penalties_and_are_stored_apart(async_client, db_session):
    # A goals challenge must be one game per match.
    with pytest.raises(AssertionError):
        await _challenge(async_client, db_session, resultType="goals")
    ch, admin, _ = await _field(async_client, db_session, 2, game="EA SPORTS FC 25", resultType="goals", bestOf=1, finalBestOf=1)
    assert ch["resultType"] == "goals"
    h = auth_headers(admin, is_admin=True)
    b = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    final = b["upNext"]
    res = await _result(async_client, ch, h, final, winner="a", scoreA=1, scoreB=1)
    assert res.status_code == 422 and res.json()["error"]["code"] == "TIEBREAK_NEEDED"
    res = await _result(async_client, ch, h, final, winner="a", scoreA=1, scoreB=1, tiebreak="penalties", tiebreakA=2, tiebreakB=4)
    assert res.status_code == 422
    res = await _result(async_client, ch, h, final, winner="b", scoreA=1, scoreB=1, tiebreak="penalties", tiebreakA=2, tiebreakB=4)
    assert res.status_code == 200, res.text
    async with AsyncSessionLocal() as db:
        row = await db.get(ChallengeMatch, uuid.UUID(final["id"]))
        assert (row.score_a, row.score_b, row.tiebreak, row.tiebreak_a, row.tiebreak_b) == (1, 1, "penalties", 2, 4)
        assert row.winner_entry_id == row.entry_b_id
    fin = await async_client.post(_u(ch, "/finish"), headers=h)
    assert fin.status_code == 200 and fin.json()["data"]["challenge"]["status"] == "finished"


@pytest.mark.asyncio
async def test_how_results_are_scored_cannot_change_after_the_draw(async_client, db_session):
    from tests.test_challenge_status import _edit
    ch, admin, _ = await _field(async_client, db_session, 2)
    h = auth_headers(admin, is_admin=True)
    await async_client.post(_u(ch, "/draw"), headers=h)
    res = await _edit(async_client, ch, admin, status="live", resultType="goals", bestOf=1, finalBestOf=1)
    assert res.status_code == 409 and res.json()["error"]["code"] == "RESULT_TYPE_LOCKED"


# ── Finish checks the whole bracket, then locks it ──────────────────────────


@pytest.mark.asyncio
async def test_finish_refuses_an_unfinished_or_inconsistent_bracket(async_client, db_session):
    ch, admin, _ = await _field(async_client, db_session, 4)
    h = auth_headers(admin, is_admin=True)
    b = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    # Semi-finals only: the final and 3rd place are still to play.
    for _ in range(2):
        b = (await _result(async_client, ch, h, b["upNext"], winner="a", scoreA=2, scoreB=1)).json()["data"]
    res = await async_client.post(_u(ch, "/finish"), headers=h)
    assert res.status_code == 409 and res.json()["error"]["code"] == "BRACKET_INCOMPLETE"
    assert "no result yet" in res.json()["error"]["message"]
    b = await _play_out(async_client, ch, admin, b)

    async def corrupt(change, expect):
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(ChallengeMatch.__table__.select().where(ChallengeMatch.challenge_id == uuid.UUID(ch["id"])))).all()
            saved = {r.id: dict(r._mapping) for r in rows}
            await change(db, rows)
            await db.commit()
        res = await async_client.post(_u(ch, "/finish"), headers=h)
        assert res.status_code == 409 and expect in res.json()["error"]["message"], res.text
        async with AsyncSessionLocal() as db:  # put it back exactly
            await db.execute(ChallengeMatch.__table__.delete().where(ChallengeMatch.challenge_id == uuid.UUID(ch["id"])))
            await db.execute(ChallengeMatch.__table__.insert(), list(saved.values()))
            await db.commit()

    final_id = next(m["id"] for m in _all_matches(b) if m["name"] == "Final")

    async def stranger_wins(db, rows):
        m = await db.get(ChallengeMatch, uuid.UUID(final_id))
        m.winner_entry_id = uuid.uuid4()
    async def impossible_score(db, rows):
        m = await db.get(ChallengeMatch, uuid.UUID(final_id))
        m.score_a, m.score_b = 2, 2
    async def wrong_player_in_final(db, rows):
        m = await db.get(ChallengeMatch, uuid.UUID(final_id))
        third = next(r for r in rows if r.is_third_place)
        m.entry_b_id = third.entry_a_id
    async def no_third_place(db, rows):
        third = next(r for r in rows if r.is_third_place)
        await db.execute(ChallengeMatch.__table__.delete().where(ChallengeMatch.id == third.id))

    await corrupt(stranger_wins, "isn't one of its two players")
    await corrupt(impossible_score, "best of 5")
    await corrupt(wrong_player_in_final, "didn't win the match before")
    await corrupt(no_third_place, "3rd-place match is missing")

    fin = await async_client.post(_u(ch, "/finish"), headers=h)
    assert fin.status_code == 200 and fin.json()["data"]["challenge"]["status"] == "finished"
    async with AsyncSessionLocal() as db:
        from app.models.challenge import Challenge
        assert (await db.get(Challenge, uuid.UUID(ch["id"]))).finished_at is not None


@pytest.mark.asyncio
async def test_results_are_locked_after_finish(async_client, db_session):
    ch, admin, _ = await _field(async_client, db_session, 2)
    h = auth_headers(admin, is_admin=True)
    b = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    final = b["upNext"]
    b = (await _result(async_client, ch, h, final, winner="a", scoreA=3, scoreB=1)).json()["data"]
    assert (await async_client.post(_u(ch, "/finish"), headers=h)).status_code == 200
    before = (await async_client.get(_u(ch, "/bracket"), headers=h)).json()["data"]
    for path, body in ((f"/matches/{final['id']}/result", {"winner": "b", "scoreA": 1, "scoreB": 3}), (f"/matches/{final['id']}/clear", None), ("/draw", None)):
        res = await async_client.post(_u(ch, path), json=body, headers=h)
        assert res.status_code == 409 and res.json()["error"]["code"] == "CHALLENGE_FINISHED", (path, res.text)
    after = (await async_client.get(_u(ch, "/bracket"), headers=h)).json()["data"]
    assert before["standings"] == after["standings"] and _all_matches(before) == _all_matches(after)


# ── Sign-ups and check-in ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_closing_checkin_ends_sign_ups(async_client, db_session):
    ch, admin, _ = await _field(async_client, db_session, 2, capacity=4)
    h = auth_headers(admin, is_admin=True)
    # Before the close, sign-ups still work.
    early = await _player(db_session, "Early")
    assert (await _join(async_client, ch["slug"], early)).status_code == 201
    data = (await async_client.post(_u(ch, "/close-checkin"), headers=h)).json()["data"]
    assert data["challenge"]["status"] == "closed"
    late = await _player(db_session, "Late")
    res = await _join(async_client, ch["slug"], late)
    assert res.status_code == 400 and res.json()["error"]["code"] == "CHALLENGE_CLOSED"
    # An admin can still bring back someone who was marked a no-show.
    entry = next(e for e in data["entries"] if e["status"] == "no_show")
    res = await async_client.post(_u(ch, f"/entries/{entry['id']}/restore"), headers=h)
    assert res.status_code == 200, res.text
    # Even reopened by mistake, a closed check-in keeps sign-ups shut.
    from tests.test_challenge_status import _edit
    assert (await _edit(async_client, ch, admin, status="open")).status_code == 200
    res = await _join(async_client, ch["slug"], late)
    assert res.status_code == 400 and res.json()["error"]["code"] == "CHALLENGE_CLOSED"


@pytest.mark.asyncio
async def test_only_active_players_at_a_running_challenge_can_be_checked_in(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session, capacity=3)
    h = auth_headers(admin, is_admin=True)
    gone, stays = await _player(db_session, "Gone"), await _player(db_session, "Stays")
    for p in (gone, stays):
        assert (await _join(async_client, ch["slug"], p)).status_code == 201
    entries = (await async_client.get(_u(ch), headers=h)).json()["data"]["entries"]
    gone_e = next(e for e in entries if e["userId"] == str(gone.id))
    stays_e = next(e for e in entries if e["userId"] == str(stays.id))
    assert (await async_client.post(_u(ch, f"/entries/{gone_e['id']}/withdraw"), headers=h)).status_code == 200

    res = await async_client.post(_u(ch, f"/entries/{gone_e['id']}/checkin"), headers=h)
    assert res.status_code == 400 and res.json()["error"]["code"] == "ENTRY_NOT_ACTIVE"
    # Same at the door, with their own QR.
    me = (await async_client.get(f"/api/v1/challenges/{ch['slug']}/me", headers=auth_headers(stays))).json()["data"]
    token_stays = me["entry"]["checkinQrUrl"].rsplit("/", 1)[-1] if me["entry"].get("checkinQrUrl") else None
    from app.services import challenge_day as day
    token_gone = day.checkin_token(uuid.UUID(gone_e["id"]))
    res = await async_client.post(f"/api/v1/challenges/{ch['slug']}/checkin/{token_gone}", json={"present": True}, headers=h)
    assert res.status_code == 400 and res.json()["error"]["code"] == "ENTRY_NOT_ACTIVE"
    async with AsyncSessionLocal() as db:
        assert (await db.get(ChallengeEntry, uuid.UUID(gone_e["id"]))).present is False

    # A draft can't check anyone in.
    from tests.test_challenge_status import _set_status
    await _set_status(ch["id"], "draft")
    res = await async_client.post(_u(ch, f"/entries/{stays_e['id']}/checkin"), headers=h)
    assert res.status_code == 409 and res.json()["error"]["code"] == "WRONG_STATUS"
    for status in ("finished", "cancelled"):
        await _set_status(ch["id"], status)
        token = day.checkin_token(uuid.UUID(stays_e["id"]))
        res = await async_client.post(_u(ch, f"/entries/{stays_e['id']}/checkin"), headers=h)
        assert res.status_code == 409, (status, res.text)
    assert token_stays is None or token_stays


# ── Rewards ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_test_champion_keeps_the_place_but_gets_no_reward(async_client, db_session):
    ch, admin, players = await _field(async_client, db_session, 4)
    h = auth_headers(admin, is_admin=True)
    b = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    b = await _play_out(async_client, ch, admin, b)
    places = {s["place"]: s["entryId"] for s in b["standings"]}
    # The champion turns out to be one of our own test sign-ups.
    assert (await async_client.post(_u(ch, f"/entries/{places[1]}/test"), headers=h)).status_code == 200

    data = (await async_client.post(_u(ch, "/rewards/make/prizes"), headers=h)).json()["data"]
    kinds = {r["kind"] for r in data["rewards"]}
    assert "prize_1" not in kinds and "winner_partners" not in kinds
    assert {"prize_2", "prize_3"} <= kinds
    assert data["testPlaces"] == [1]
    async with AsyncSessionLocal() as db:
        second_user = str((await db.get(ChallengeEntry, uuid.UUID(places[2]))).user_id)
    prize_2 = next(r for r in data["rewards"] if r["kind"] == "prize_2")
    # 2nd place stays 2nd: nobody moves up into the test entry's place.
    assert prize_2["peopleCount"] == 1
    async with AsyncSessionLocal() as db:
        camp = await db.get(OfferCampaign, uuid.UUID(prize_2["id"]))
        assert camp.allowed_user_ids == [second_user]
    br = (await async_client.get(_u(ch, "/bracket"), headers=h)).json()["data"]
    assert {s["place"]: s["entryId"] for s in br["standings"]} == places


@pytest.mark.asyncio
async def test_making_rewards_twice_makes_one_of_each(async_client, db_session):
    ch, admin, _ = await _field(async_client, db_session, 4)
    h = auth_headers(admin, is_admin=True)
    b = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    await _play_out(async_client, ch, admin, b)
    for _ in range(3):
        assert (await async_client.post(_u(ch, "/rewards/make/prizes"), headers=h)).status_code == 200
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(OfferCampaign.__table__.select().where(OfferCampaign.challenge_id == uuid.UUID(ch["id"])))).all()
    kinds = [r.reward_kind for r in rows]
    assert sorted(kinds) == sorted(set(kinds))


@pytest.mark.asyncio
async def test_moved_up_then_no_show_gets_no_waitlist_reward(async_client, db_session):
    ch, admin, players = await _field(async_client, db_session, 2, capacity=2)
    h = auth_headers(admin, is_admin=True)
    waiter, sitter = await _player(db_session, "Waiter"), await _player(db_session, "Sitter")
    for p in (waiter, sitter):
        assert (await _join(async_client, ch["slug"], p)).json()["data"]["entry"]["status"] == "waitlist"
    entries = (await async_client.get(_u(ch), headers=h)).json()["data"]["entries"]
    # One confirmed player drops out: the first waiter moves up, then doesn't come.
    first = next(e for e in entries if e["status"] == "confirmed")
    await async_client.post(_u(ch, f"/entries/{first['id']}/withdraw"), headers=h)
    entries = (await async_client.get(_u(ch), headers=h)).json()["data"]["entries"]
    moved = next(e for e in entries if e["userId"] == str(waiter.id))
    assert moved["status"] == "confirmed" and moved["promotedAt"]
    await async_client.post(_u(ch, f"/entries/{moved['id']}/no_show"), headers=h)

    async with AsyncSessionLocal() as db:
        from app.services import challenge_service as svc
        from app.services import challenge_rewards as rewards
        rows = await svc.entries(db, uuid.UUID(ch["id"]))
    ids = rewards.waitlist_user_ids(rows)
    assert str(waiter.id) not in ids and str(sitter.id) in ids


@pytest.mark.asyncio
async def test_the_last_moment_check_refuses_a_second_use_of_a_one_booking_reward(async_client):
    """resolve_campaign runs before the lock; two simultaneous bookings can both
    pass it. apply_promotion_to_booking re-checks under the campaign lock."""
    code = "W" + uuid.uuid4().hex[:9].upper()
    async with AsyncSessionLocal() as db:
        _o, gamer, cafe, tier = await _make_cafe_owner_gamer(db)
        camp = _reward(cafe, code, [gamer.id], max_seats=None)
        db.add(camp)
        await db.flush()
        promo = _ten_off(cafe, camp)
        db.add(promo)
        await db.commit()
        camp_id, promo_id = camp.id, promo.id
    res = await async_client.post("/api/v1/bookings", json=_body(cafe, tier, promoCode=code), headers=auth_headers(gamer))
    assert res.status_code == 201 and float(res.json()["data"]["booking"]["discountAmount"]) > 0
    async with AsyncSessionLocal() as db:
        service = PromotionService(PromotionRepository(db))
        with pytest.raises(ValidationException) as err:
            await service.apply_promotion_to_booking(
                promotion_id=promo_id, cafe_id=cafe.id, tier_id=tier.id, base_amount=Decimal("300"),
                campaign_id=camp_id, gamer_id=gamer.id,
            )
        assert err.value.error_code == "CAMPAIGN_ALREADY_USED"
        stranger = uuid.uuid4()
        with pytest.raises(ValidationException) as err:
            await service.apply_promotion_to_booking(
                promotion_id=promo_id, cafe_id=cafe.id, tier_id=tier.id, base_amount=Decimal("300"),
                campaign_id=camp_id, gamer_id=stranger,
            )
        assert err.value.error_code == "CAMPAIGN_NOT_FOR_YOU"


@pytest.mark.asyncio
async def test_superseded_rewards_stay_on_the_rewards_page_without_double_counting(async_client, db_session):
    ch, admin, _ = await _field(async_client, db_session, 2)
    h = auth_headers(admin, is_admin=True)
    b = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    await _play_out(async_client, ch, admin, b)
    first = (await async_client.post(_u(ch, "/rewards/make/prizes"), headers=h)).json()["data"]["rewards"]
    async with AsyncSessionLocal() as db:
        camp = await db.get(OfferCampaign, uuid.UUID(next(r["id"] for r in first if r["kind"] == "prize_1")))
        camp.superseded_at, camp.is_active = datetime.now(timezone.utc), False
        await db.commit()
    data = (await async_client.post(_u(ch, "/rewards/make/prizes"), headers=h)).json()["data"]
    p1 = [r for r in data["rewards"] if r["kind"] == "prize_1"]
    assert len(p1) == 2 and sorted(r["superseded"] for r in p1) == [False, True]
    assert len({r["id"] for r in data["rewards"]}) == len(data["rewards"])
    # The replaced one can't be switched back on; switching it off is harmless.
    old = next(r for r in p1 if r["superseded"])
    res = await async_client.post(_u(ch, f"/rewards/{old['id']}/active/on"), headers=h)
    assert res.status_code == 409 and res.json()["error"]["code"] == "REWARD_SUPERSEDED"
    assert (await async_client.post(_u(ch, f"/rewards/{old['id']}/active/off"), headers=h)).status_code == 200


# ── Practice players: dev only, fail closed ────────────────────────────────


@pytest.mark.asyncio
async def test_practice_players_need_an_explicit_dev_environment(async_client, db_session, monkeypatch):
    ch, admin = await _challenge(async_client, db_session, capacity=2)
    h = auth_headers(admin, is_admin=True)
    url = _u(ch, "/practice-players")
    for value in ("production", "prod", "", "qa-something", "Production "):
        monkeypatch.setattr(settings, "ENVIRONMENT", value)
        res = await async_client.post(url, headers=h)
        assert res.status_code == 403 and res.json()["error"]["code"] == "PRACTICE_DEV_ONLY", value
    # Not set at all: the settings default ("development") must not count.
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    fields = set(settings.model_fields_set)
    monkeypatch.setattr(settings, "__pydantic_fields_set__", fields - {"ENVIRONMENT"})
    res = await async_client.post(url, headers=h)
    assert res.status_code == 403 and res.json()["error"]["code"] == "PRACTICE_DEV_ONLY"
    assert (await async_client.get(_u(ch), headers=h)).json()["data"]["practiceAllowed"] is False
    monkeypatch.setattr(settings, "__pydantic_fields_set__", fields | {"ENVIRONMENT"})
    res = await async_client.post(url, headers=h)
    assert res.status_code == 200, res.text
