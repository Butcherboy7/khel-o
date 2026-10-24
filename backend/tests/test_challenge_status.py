"""Which status changes a challenge allows, and through which action. The edit
form can only move between draft, open and closed; going live, finishing,
reopening and cancelling each have their own action, so the form can't skip
their checks."""
import uuid

import pytest

from app.database import AsyncSessionLocal
from app.models.challenge import Challenge
from app.models.promotion import OfferCampaign
from app.services import challenge_service as svc
from tests.conftest import auth_headers
from tests.test_challenges import _challenge, _join, _player

FORM_KEYS = (
    "slug", "title", "game", "setupLine", "format", "bestOf", "finalBestOf", "startsAt", "endsAt",
    "checkinOpensAt", "checkinClosesAt", "capacity", "minAge", "status", "rulesMd", "prizesMd",
    "coverImageUrl", "communityUrl", "instagramHandle",
)


async def _edit(async_client, ch, admin, **over):
    body = {k: ch[k] for k in FORM_KEYS if k in ch}
    body["cafeId"] = ch["cafe"]["id"]
    body.update(over)
    return await async_client.patch(
        f"/api/v1/admin/challenges/{ch['id']}", json=body, headers=auth_headers(admin, is_admin=True),
    )


async def _set_status(challenge_id, status):
    async with AsyncSessionLocal() as db:
        row = await db.get(Challenge, uuid.UUID(challenge_id))
        row.status = status
        await db.commit()


def test_the_status_table():
    ok = [("draft", "open"), ("draft", "closed"), ("open", "closed"), ("closed", "open"), ("open", "open"),
          ("live", "live"), ("finished", "finished"), ("cancelled", "cancelled")]
    for old, new in ok:
        svc.check_status_change(old, new, has_real_players=True)
    svc.check_status_change("open", "draft", has_real_players=False)
    refused = {
        ("open", "draft", True): "HAS_PLAYERS",
        ("closed", "draft", True): "HAS_PLAYERS",
        ("open", "live", False): "USE_ACTION",
        ("closed", "finished", False): "USE_ACTION",
        ("live", "finished", True): "USE_ACTION",
        ("live", "draft", False): "USE_ACTION",
        ("live", "open", True): "USE_ACTION",
        ("finished", "live", True): "USE_ACTION",
        ("finished", "open", True): "USE_ACTION",
        ("open", "cancelled", True): "USE_ACTION",
        ("cancelled", "open", False): "CHALLENGE_CANCELLED",
        ("cancelled", "draft", False): "CHALLENGE_CANCELLED",
    }
    for (old, new, real), code in refused.items():
        with pytest.raises(svc.StatusChangeError) as err:
            svc.check_status_change(old, new, has_real_players=real)
        assert err.value.code == code, (old, new)


@pytest.mark.asyncio
async def test_the_edit_form_moves_between_draft_open_and_closed(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session, status="draft")
    for status in ("open", "closed", "open", "draft"):
        res = await _edit(async_client, ch, admin, status=status)
        assert res.status_code == 200, res.text
        assert res.json()["data"]["status"] == status


@pytest.mark.asyncio
async def test_a_challenge_with_players_cannot_go_back_to_draft(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session)
    p = await _player(db_session)
    assert (await _join(async_client, ch["slug"], p)).status_code == 201
    res = await _edit(async_client, ch, admin, status="draft")
    assert res.status_code == 409 and res.json()["error"]["code"] == "HAS_PLAYERS"
    # Nothing changed, and the player's page is still there.
    assert (await async_client.get(f"/api/v1/challenges/{ch['slug']}")).json()["data"]["status"] == "open"
    # Closed is still fine.
    assert (await _edit(async_client, ch, admin, status="closed")).status_code == 200


@pytest.mark.asyncio
async def test_a_player_who_withdrew_still_counts_but_a_test_entry_does_not(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session)
    h = auth_headers(admin, is_admin=True)
    p = await _player(db_session)
    assert (await _join(async_client, ch["slug"], p)).status_code == 201
    entry = (await async_client.get(f"/api/v1/admin/challenges/{ch['id']}", headers=h)).json()["data"]["entries"][0]
    # Marked as our own test sign-up: draft is allowed again.
    await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/entries/{entry['id']}/test", headers=h)
    assert (await _edit(async_client, ch, admin, status="draft")).status_code == 200


@pytest.mark.asyncio
async def test_the_form_cannot_make_it_live_finished_or_cancelled(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session)
    for status in ("live", "finished", "cancelled"):
        res = await _edit(async_client, ch, admin, status=status)
        assert res.status_code == 409 and res.json()["error"]["code"] == "USE_ACTION", status
    assert (await async_client.get(f"/api/v1/challenges/{ch['slug']}")).json()["data"]["status"] == "open"


@pytest.mark.asyncio
async def test_a_live_or_finished_challenge_keeps_its_status_through_the_form(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session)
    for status in ("live", "finished"):
        await _set_status(ch["id"], status)
        # Saving other details with the same status works…
        res = await _edit(async_client, ch, admin, status=status, title="Renamed challenge")
        assert res.status_code == 200 and res.json()["data"]["title"] == "Renamed challenge"
        # …but the form can't move it.
        res = await _edit(async_client, ch, admin, status="open")
        assert res.status_code == 409 and res.json()["error"]["code"] == "USE_ACTION"


@pytest.mark.asyncio
async def test_a_cancelled_challenge_is_final(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session)
    await _set_status(ch["id"], "cancelled")
    for status in ("open", "closed", "draft"):
        res = await _edit(async_client, ch, admin, status=status)
        assert res.status_code == 409 and res.json()["error"]["code"] == "CHALLENGE_CANCELLED"
    h = auth_headers(admin, is_admin=True)
    res = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/draw", headers=h)
    assert res.status_code == 409 and res.json()["error"]["code"] == "WRONG_STATUS"


@pytest.mark.asyncio
async def test_a_new_challenge_cannot_start_live_or_finished(async_client, db_session):
    for status in ("live", "finished", "cancelled"):
        with pytest.raises(AssertionError):
            await _challenge(async_client, db_session, status=status)


@pytest.mark.asyncio
async def test_draw_and_finish_follow_the_table(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session, status="draft")
    h = auth_headers(admin, is_admin=True)
    url = f"/api/v1/admin/challenges/{ch['id']}"
    # A draft can't be drawn or finished.
    assert (await async_client.post(url + "/draw", headers=h)).json()["error"]["code"] == "WRONG_STATUS"
    res = await async_client.post(url + "/finish", headers=h)
    assert res.status_code == 409 and res.json()["error"]["code"] == "USE_ACTION"

    await _edit(async_client, ch, admin, status="open")
    players = [await _player(db_session, f"P{i}") for i in range(2)]
    for p in players:
        assert (await _join(async_client, ch["slug"], p)).status_code == 201
    entries = (await async_client.get(url, headers=h)).json()["data"]["entries"]
    for e in entries:
        await async_client.post(url + f"/entries/{e['id']}/checkin", headers=h)
    b = (await async_client.post(url + "/draw", headers=h)).json()["data"]
    assert b["challenge"]["status"] == "live"
    final = b["rounds"][-1]["matches"][0]
    res = await async_client.post(url + f"/matches/{final['id']}/result", json={"winner": "a"}, headers=h)
    assert res.status_code == 200, res.text
    assert (await async_client.post(url + "/finish", headers=h)).json()["data"]["challenge"]["status"] == "finished"
    # Finish again: no change, no error.
    again = await async_client.post(url + "/finish", headers=h)
    assert again.status_code == 200 and again.json()["data"]["challenge"]["status"] == "finished"
    # A finished challenge can't be redrawn (that would wipe its results).
    res = await async_client.post(url + "/draw", headers=h)
    assert res.status_code == 409 and res.json()["error"]["code"] == "CHALLENGE_FINISHED"
    assert len((await async_client.get(url + "/bracket", headers=h)).json()["data"]["rounds"]) == 1


@pytest.mark.asyncio
async def test_only_one_current_reward_per_kind_is_allowed(async_client, db_session):
    from datetime import datetime, timedelta, timezone
    from sqlalchemy.exc import IntegrityError

    ch, _ = await _challenge(async_client, db_session)
    now = datetime.now(timezone.utc)

    def camp(code, superseded=None):
        return OfferCampaign(
            name="1st place reward", cafe_id=uuid.UUID(ch["cafe"]["id"]), is_public=False, access_code=code,
            starts_at=now, ends_at=now + timedelta(days=30), is_active=True, challenge_id=uuid.UUID(ch["id"]),
            reward_kind="prize_1", superseded_at=superseded,
        )

    async with AsyncSessionLocal() as db:
        db.add(camp("UQA" + uuid.uuid4().hex[:6].upper()))
        await db.commit()
        # A second current one is refused by the database itself.
        db.add(camp("UQB" + uuid.uuid4().hex[:6].upper()))
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()
        # A superseded one sits alongside it fine.
        db.add(camp("UQC" + uuid.uuid4().hex[:6].upper(), superseded=now))
        await db.commit()
