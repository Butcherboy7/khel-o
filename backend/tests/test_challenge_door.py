"""Walk-ins on the day (the door QR) and putting a match off when a player is late."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.services import challenge_day as day
from tests.conftest import auth_headers
from tests.test_challenge_day import _field
from tests.test_challenges import _challenge, _join, _phone, _player


def _on_the_day(ch):
    """An hour after check-in opens. The test database (SQLite) keeps the wall-clock time and drops the zone, so read it that way."""
    return datetime.fromisoformat(ch["checkinOpensAt"]).replace(tzinfo=timezone.utc) + timedelta(hours=1)


def _walk_in(ch, door, **over):
    body = {
        "name": "Walk In", "phone": _phone(), "email": f"w-{uuid.uuid4().hex[:8]}@example.com",
        "consentRules": True, "door": door,
    }
    body.update(over)
    return body


def test_door_token_is_the_same_each_time_and_differs_per_challenge():
    assert day.door_token("tekken-01") == day.door_token("tekken-01")
    assert day.door_token("tekken-01") != day.door_token("tekken-02")
    assert len(day.door_token("tekken-01")) == 16


@pytest.mark.asyncio
async def test_a_walk_in_is_in_and_here_even_when_full_and_check_in_is_closed(async_client, db_session, monkeypatch):
    ch, admin = await _challenge(async_client, db_session, capacity=1)
    h = auth_headers(admin, is_admin=True)
    first = await _player(db_session, "First")
    assert (await _join(async_client, ch["slug"], first)).status_code == 201
    monkeypatch.setattr("app.services.challenge_service.now", lambda: _on_the_day(ch))
    token = day.door_token(ch["slug"])
    url = f"/api/v1/challenges/{ch['slug']}/quick-join"

    # Full: the normal sign-up would be the waitlist, the door one is a player who is here.
    res = await async_client.post(url, json=_walk_in(ch, token))
    assert res.status_code == 201, res.text
    entry = res.json()["data"]["entry"]
    assert entry["status"] == "confirmed" and entry["present"] is True

    # Check-in closed: the normal sign-up is refused, the door still works.
    assert (await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/close-checkin", headers=h)).status_code == 200
    assert (await async_client.post(url, json=_walk_in(ch, None))).json()["error"]["code"] == "CHALLENGE_CLOSED"
    late = await async_client.post(url, json=_walk_in(ch, token))
    assert late.status_code == 201 and late.json()["data"]["entry"]["present"] is True


@pytest.mark.asyncio
async def test_the_door_code_is_ignored_when_wrong_or_off_the_day(async_client, db_session, monkeypatch):
    ch, admin = await _challenge(async_client, db_session, capacity=3, status="closed")
    url = f"/api/v1/challenges/{ch['slug']}/quick-join"
    token = day.door_token(ch["slug"])

    # Not the day yet (today is before check-in opens): refused like any closed sign-up.
    monkeypatch.setattr("app.services.challenge_service.now", lambda: _on_the_day(ch) - timedelta(days=2))
    assert (await async_client.post(url, json=_walk_in(ch, token))).json()["error"]["code"] == "CHALLENGE_CLOSED"
    # On the day but the wrong code.
    monkeypatch.setattr("app.services.challenge_service.now", lambda: _on_the_day(ch))
    assert (await async_client.post(url, json=_walk_in(ch, "0" * 16))).json()["error"]["code"] == "CHALLENGE_CLOSED"
    # A day later: over.
    monkeypatch.setattr("app.services.challenge_service.now", lambda: _on_the_day(ch) + timedelta(days=1))
    assert (await async_client.post(url, json=_walk_in(ch, token))).json()["error"]["code"] == "CHALLENGE_CLOSED"
    # And the right code on the day works even though the challenge status is "closed".
    monkeypatch.setattr("app.services.challenge_service.now", lambda: _on_the_day(ch))
    assert (await async_client.post(url, json=_walk_in(ch, token))).status_code == 201


@pytest.mark.asyncio
async def test_someone_already_signed_up_who_scans_the_door_qr_is_marked_here(async_client, db_session, monkeypatch):
    ch, admin = await _challenge(async_client, db_session, capacity=3)
    p = await _player(db_session, "Early Bird")
    assert (await _join(async_client, ch["slug"], p)).status_code == 201
    monkeypatch.setattr("app.services.challenge_service.now", lambda: _on_the_day(ch))
    res = await async_client.post(
        f"/api/v1/challenges/{ch['slug']}/entries",
        json={"name": "Early Bird", "phone": _phone(), "consentRules": True, "door": day.door_token(ch["slug"])},
        headers=auth_headers(p),
    )
    assert res.status_code == 201, res.text
    assert res.json()["data"]["created"] is False and res.json()["data"]["entry"]["present"] is True


@pytest.mark.asyncio
async def test_admin_detail_has_the_door_link_and_qr(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session, capacity=3)
    res = await async_client.get(f"/api/v1/admin/challenges/{ch['id']}", headers=auth_headers(admin, is_admin=True))
    door = res.json()["data"]["door"]
    assert door["url"].endswith(f"/challenge/{ch['slug']}?join=1&door={day.door_token(ch['slug'])}")
    assert door["qr"].startswith("data:image/png;base64,")


@pytest.mark.asyncio
async def test_a_late_players_match_waits_at_the_back_and_comes_back(async_client, db_session):
    ch, admin, _ = await _field(async_client, db_session, 4)
    h = auth_headers(admin, is_admin=True)
    base = f"/api/v1/admin/challenges/{ch['id']}"
    b = (await async_client.post(f"{base}/draw", headers=h)).json()["data"]
    first, second = b["ready"][0], b["ready"][1]
    assert first["postponed"] is False

    # Put the first match off: the next one is up, and the first waits at the back.
    res = await async_client.post(f"{base}/matches/{first['id']}/postpone", json={"postponed": True}, headers=h)
    assert res.status_code == 200, res.text
    b = res.json()["data"]
    assert b["upNext"]["id"] == second["id"]
    assert [m["id"] for m in b["ready"]] == [second["id"], first["id"]]
    assert b["ready"][-1]["postponed"] is True

    # The public bracket shows it too, and the late player is still in their spot.
    pub = (await async_client.get(f"/api/v1/challenges/{ch['slug']}/bracket")).json()["data"]
    assert any(m["postponed"] for m in pub["ready"])

    # Bring it back: the original order returns.
    b = (await async_client.post(f"{base}/matches/{first['id']}/postpone", json={"postponed": False}, headers=h)).json()["data"]
    assert b["upNext"]["id"] == first["id"] and not any(m["postponed"] for m in b["ready"])

    # Postponing then playing it clears the flag, and a played match can't be put off.
    await async_client.post(f"{base}/matches/{first['id']}/postpone", json={"postponed": True}, headers=h)
    done = await async_client.post(
        f"{base}/matches/{first['id']}/result", json={"winner": "a", "scoreA": 2, "scoreB": 0}, headers=h,
    )
    assert done.status_code == 200, done.text
    assert not any(m["postponed"] for m in done.json()["data"]["ready"])
    again = await async_client.post(f"{base}/matches/{first['id']}/postpone", json={"postponed": True}, headers=h)
    assert again.json()["error"]["code"] == "MATCH_NOT_PENDING"


@pytest.mark.asyncio
async def test_only_admins_can_put_a_match_off(async_client, db_session):
    ch, admin, players = await _field(async_client, db_session, 4)
    h = auth_headers(admin, is_admin=True)
    b = (await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/draw", headers=h)).json()["data"]
    res = await async_client.post(
        f"/api/v1/admin/challenges/{ch['id']}/matches/{b['ready'][0]['id']}/postpone",
        json={"postponed": True}, headers=auth_headers(players[0]),
    )
    assert res.status_code in (401, 403)
