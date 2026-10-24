"""Finding your own sign-ups (My challenges), the move-up notification and the
"Coming?" answer the home card asks for."""
import uuid

import pytest
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.challenge import Challenge, ChallengeEntry
from app.models.notification import Notification
from app.services import challenge_service as svc
from tests.conftest import auth_headers
from tests.test_challenges import _challenge, _join, _player


async def _tells(user_id):
    async with AsyncSessionLocal() as db:
        return (await db.execute(
            select(Notification).where(Notification.user_id == user_id, Notification.dedupe_key.like("challenge_moved_up:%"))
        )).scalars().all()


@pytest.mark.asyncio
async def test_moving_up_tells_that_player_once_and_only_them(async_client, db_session):
    ch, _admin = await _challenge(async_client, db_session, capacity=1)
    first, second, third = await _player(db_session, "A"), await _player(db_session, "B"), await _player(db_session, "C")
    for p in (first, second, third):
        assert (await _join(async_client, ch["slug"], p)).status_code == 201
    assert await _tells(second.id) == []

    r = await async_client.post(f"/api/v1/challenges/{ch['slug']}/me/withdraw", headers=auth_headers(first))
    assert r.status_code == 200
    told = await _tells(second.id)
    assert len(told) == 1 and told[0].link == f"/challenge/{ch['slug']}/me" and told[0].is_read is False
    assert "prize" not in (told[0].title + told[0].message).lower()
    assert await _tells(first.id) == [] and await _tells(third.id) == []

    # The same change run again (a retry, a second click) can't tell them twice.
    async with AsyncSessionLocal() as db:
        locked = await db.get(Challenge, uuid.UUID(ch["id"]))
        entry = (await db.execute(select(ChallengeEntry).where(ChallengeEntry.user_id == second.id))).scalar_one()
        await svc.tell_moved_up(db, locked, [entry])
        await db.commit()
    assert len(await _tells(second.id)) == 1


@pytest.mark.asyncio
async def test_a_failed_spot_change_leaves_no_notification(async_client, db_session, monkeypatch):
    ch, _admin = await _challenge(async_client, db_session, capacity=1)
    first, second = await _player(db_session, "A"), await _player(db_session, "B")
    for p in (first, second):
        assert (await _join(async_client, ch["slug"], p)).status_code == 201

    async def boom(*_a, **_k):
        raise RuntimeError("the save failed")
    monkeypatch.setattr(svc, "_claim", boom)
    with pytest.raises(RuntimeError):
        async with AsyncSessionLocal() as db:
            await svc.withdraw(db, uuid.UUID(ch["id"]), (await svc.entry_for(db, uuid.UUID(ch["id"]), user_id=first.id)).id, "player")
    assert await _tells(second.id) == []
    async with AsyncSessionLocal() as db:
        assert (await svc.entry_for(db, uuid.UUID(ch["id"]), user_id=second.id)).status == "waitlist"


@pytest.mark.asyncio
async def test_my_challenges_lists_my_signups_current_and_past_and_nobody_elses(async_client, db_session):
    ch, _admin = await _challenge(async_client, db_session, capacity=1)
    me, other = await _player(db_session, "A"), await _player(db_session, "B")
    assert (await _join(async_client, ch["slug"], me)).status_code == 201
    assert (await _join(async_client, ch["slug"], other)).status_code == 201

    mine = (await async_client.get("/api/v1/challenges/mine", headers=auth_headers(me))).json()["data"]
    theirs = (await async_client.get("/api/v1/challenges/mine", headers=auth_headers(other))).json()["data"]
    assert [(x["slug"], x["entryStatus"], x["rank"], x["upcoming"], x["coming"]) for x in mine] == [(ch["slug"], "confirmed", 1, True, None)]
    assert [(x["entryStatus"], x["rank"]) for x in theirs] == [("waitlist", 1)]
    assert "phone" not in str(mine).lower()
    assert (await async_client.get("/api/v1/challenges/mine")).status_code == 401
    assert (await async_client.get("/api/v1/challenges/mine", headers=auth_headers(await _player(db_session, "Z")))).json()["data"] == []

    # Dropped out: still findable, no place in line. Finished: still findable, marked past.
    await async_client.post(f"/api/v1/challenges/{ch['slug']}/me/withdraw", headers=auth_headers(me))
    gone = (await async_client.get("/api/v1/challenges/mine", headers=auth_headers(me))).json()["data"]
    assert [(x["entryStatus"], x["rank"]) for x in gone] == [("withdrawn", None)]
    async with AsyncSessionLocal() as db:
        row = await db.get(Challenge, uuid.UUID(ch["id"]))
        row.status = "finished"
        await db.commit()
    past = (await async_client.get("/api/v1/challenges/mine", headers=auth_headers(other))).json()["data"]
    assert past[0]["upcoming"] is False and past[0]["status"] == "finished"


@pytest.mark.asyncio
async def test_the_home_card_knows_whether_the_player_has_answered_coming(async_client, db_session):
    ch, _admin = await _challenge(async_client, db_session, capacity=2)
    me = await _player(db_session, "A")
    assert (await _join(async_client, ch["slug"], me)).status_code == 201
    card = (await async_client.get("/api/v1/challenges/mine/active", headers=auth_headers(me))).json()["data"][0]
    assert card["entryStatus"] == "confirmed" and card["coming"] is None

    r = await async_client.post(f"/api/v1/challenges/{ch['slug']}/me/coming", json={"coming": "yes"}, headers=auth_headers(me))
    assert r.status_code == 200
    card = (await async_client.get("/api/v1/challenges/mine/active", headers=auth_headers(me))).json()["data"][0]
    assert card["coming"] == "yes"
