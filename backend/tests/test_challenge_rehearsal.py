"""The worst-case rehearsal on dev, and putting a late arrival into the bracket
without a reshuffle (a round-1 bye becomes a real match)."""
import pytest

from app.config import settings
from tests.conftest import auth_headers
from tests.test_challenge_day import _all_matches
from tests.test_challenge_integrity import _field, _result, _u
from tests.test_challenge_door import _walk_in
from app.services import challenge_day as day


@pytest.fixture(autouse=True)
def _rehearsal_environment(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")


def _round0(b):
    return b["rounds"][0]["matches"]


async def _late_player(async_client, db_session, ch, h, name="Late"):
    """Walks in at the door after the draw: signed up and checked in, not in the bracket."""
    res = await async_client.post(
        f"/api/v1/challenges/{ch['slug']}/quick-join", json=_walk_in(ch, day.door_token(ch["slug"]), name=name),
    )
    assert res.status_code == 201, res.text
    detail = (await async_client.get(_u(ch), headers=h)).json()["data"]
    e = next(x for x in detail["entries"] if x["name"] == name)
    assert e["present"] and e["status"] == "confirmed" and e["inBracket"] is False
    return e


@pytest.fixture(autouse=True)
def _on_day(monkeypatch):
    # The door QR only works on the day; every challenge here is "today".
    import app.services.challenge_day as d
    real = d.door_valid
    monkeypatch.setattr(d, "door_valid", lambda ch, token: token == d.door_token(ch.slug) or real(ch, token))


@pytest.mark.asyncio
async def test_a_late_arrival_takes_a_bye_and_plays_the_player_who_had_it(async_client, db_session):
    # 5 players in an 8 bracket: 3 byes. Capacity 10 so latecomers are confirmed.
    ch, admin, _ = await _field(async_client, db_session, 5, capacity=10)
    h = auth_headers(admin, is_admin=True)
    b = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    assert sum(m["bye"] for m in _round0(b)) == 3

    late = await _late_player(async_client, db_session, ch, h)
    res = await async_client.post(_u(ch, f"/entries/{late['id']}/add-to-bracket"), headers=h)
    assert res.status_code == 200, res.text
    b = res.json()["data"]
    first = _round0(b)
    assert sum(m["bye"] for m in first) == 2
    m = next(x for x in first if late["id"] in (x["a"] or {}).get("entryId", "") + (x["b"] or {}).get("entryId", ""))
    assert m["a"] and m["b"] and m["winner"] is None
    # The player who had the bye is no longer waiting in round 2: they play first.
    other = m["a"]["entryId"] if m["b"]["entryId"] == late["id"] else m["b"]["entryId"]
    round2 = [s["entryId"] for x in b["rounds"][1]["matches"] for s in (x["a"], x["b"]) if s]
    assert other not in round2
    assert any(r["id"] == m["id"] for r in b["ready"])
    # Twice is refused.
    again = await async_client.post(_u(ch, f"/entries/{late['id']}/add-to-bracket"), headers=h)
    assert again.json()["error"]["code"] == "ALREADY_IN_BRACKET"
    detail = (await async_client.get(_u(ch), headers=h)).json()["data"]
    assert next(x for x in detail["entries"] if x["id"] == late["id"])["inBracket"] is True


@pytest.mark.asyncio
async def test_no_free_bye_means_the_bracket_is_full(async_client, db_session):
    ch, admin, _ = await _field(async_client, db_session, 4, capacity=10)  # 4 players: no byes
    h = auth_headers(admin, is_admin=True)
    await async_client.post(_u(ch, "/draw"), headers=h)
    late = await _late_player(async_client, db_session, ch, h)
    res = await async_client.post(_u(ch, f"/entries/{late['id']}/add-to-bracket"), headers=h)
    assert res.json()["error"]["code"] == "BRACKET_FULL"


@pytest.mark.asyncio
async def test_a_bye_whose_next_match_was_played_is_not_offered(async_client, db_session):
    # 3 players: one semi is a bye. Once the final is played the bye can't be reopened.
    ch, admin, _ = await _field(async_client, db_session, 3, capacity=10)
    h = auth_headers(admin, is_admin=True)
    b = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    semi = next(m for m in _round0(b) if not m["bye"])
    b = (await _result(async_client, ch, h, semi, winner="a")).json()["data"]
    final = b["rounds"][1]["matches"][0]
    assert (await _result(async_client, ch, h, final, winner="a")).status_code == 200
    late = await _late_player(async_client, db_session, ch, h)
    res = await async_client.post(_u(ch, f"/entries/{late['id']}/add-to-bracket"), headers=h)
    assert res.json()["error"]["code"] == "BRACKET_FULL"


@pytest.mark.asyncio
async def test_the_worst_case_rehearsal_runs_end_to_end(async_client, db_session):
    from tests.test_challenges import _challenge
    ch, admin = await _challenge(async_client, db_session, capacity=256)
    h = auth_headers(admin, is_admin=True)
    go = lambda **b: async_client.post(_u(ch, "/rehearsal"), json=b, headers=h)  # noqa: E731

    d = (await go(action="start", n=10)).json()["data"]
    assert d["did"]["signedUp"] == 10 and d["rehearsal"]["practicePlayers"] == 10
    assert d["challenge"]["status"] == "open"
    d = (await go(action="arrive", n=7)).json()["data"]
    assert len(d["did"]["arrived"]) == 7
    d = (await go(action="walk_in", n=15)).json()["data"]
    assert len(d["did"]["walkedIn"]) == 15
    here = [e for e in d["entries"] if e["present"]]
    assert len(here) == 22
    assert (await async_client.post(_u(ch, "/close-checkin"), headers=h)).status_code == 200
    b = (await async_client.post(_u(ch, "/draw"), headers=h)).json()["data"]
    assert sum(1 for m in _round0(b) for s in (m["a"], m["b"]) if s) == 22
    # A walk-in after the draw is checked in but not in the bracket, and a bye is free.
    d = (await go(action="walk_in", n=1)).json()["data"]
    assert d["rehearsal"]["hereNotInBracket"] == 1 and d["rehearsal"]["freeBye"] is True
    # A round is played, leaving one for the host.
    d = (await go(action="play", leave=1)).json()["data"]
    assert d["did"]["played"] >= 1
    b = (await async_client.get(_u(ch, "/bracket"), headers=h)).json()["data"]
    assert len([m for m in b["ready"] if m["round"] == 0]) == 1
    d = (await go(action="play_to_final")).json()["data"]
    b = (await async_client.get(_u(ch, "/bracket"), headers=h)).json()["data"]
    left = {m["name"] for m in b["ready"]}
    assert left <= {"Final", "3rd place"} and "Final" in left
    # Starting again wipes it all.
    d = (await go(action="start", n=10)).json()["data"]
    assert d["rehearsal"]["practicePlayers"] == 10 and not any(e["present"] for e in d["entries"])
    assert not _all_matches((await async_client.get(_u(ch, "/bracket"), headers=h)).json()["data"])


@pytest.mark.asyncio
async def test_the_rehearsal_is_refused_on_production(async_client, db_session, monkeypatch):
    from tests.test_challenges import _challenge
    ch, admin = await _challenge(async_client, db_session, capacity=8)
    h = auth_headers(admin, is_admin=True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    res = await async_client.post(_u(ch, "/rehearsal"), json={"action": "start", "n": 5}, headers=h)
    assert res.status_code == 403 and res.json()["error"]["code"] == "PRACTICE_DEV_ONLY"
    assert (await async_client.get(_u(ch), headers=h)).json()["data"]["rehearsal"] is None
