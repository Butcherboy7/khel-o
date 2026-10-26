"""Hosting a challenge: practice players for a dev rehearsal, the list of
matches ready to play, rewards the café owner can't change, and the
player's home screen card."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.challenge import Challenge, ChallengeEntry
from app.models.promotion import OfferCampaign, Promotion
from tests.conftest import auth_headers
from tests.test_challenge_day import _field
from tests.test_challenges import _challenge, _join, _player
from tests.test_khelo_promo_codes import _make_cafe_owner_gamer


@pytest.fixture(autouse=True)
def _rehearsal_environment(monkeypatch):
    # Practice players need ENVIRONMENT set on purpose; CI has no .env file.
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")


def _url(ch, tail=""):
    return f"/api/v1/admin/challenges/{ch['id']}{tail}"


@pytest.mark.asyncio
async def test_practice_players_fill_the_spots_plus_a_waitlist_and_clear_away(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session, capacity=6)
    h = auth_headers(admin, is_admin=True)
    real = await _player(db_session, "Real Player")
    assert (await _join(async_client, ch["slug"], real)).status_code == 201

    res = await async_client.post(_url(ch, "/practice-players"), headers=h)
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert data["practiceAllowed"] is True
    assert data["added"] == 8 and data["practicePlayers"] == 8
    statuses = [e["status"] for e in data["entries"]]
    assert statuses.count("confirmed") == 6 and statuses.count("waitlist") == 3
    assert not any(e["present"] for e in data["entries"])
    names = {e["displayName"] for e in data["entries"]}
    assert {"Rohan", "Ronak"} <= names

    # Pressing again adds nobody new.
    again = (await async_client.post(_url(ch, "/practice-players"), headers=h)).json()["data"]
    assert again["added"] == 0 and again["practicePlayers"] == 8

    # Rehearse: check everyone in, close, draw, play one match.
    for e in again["entries"]:
        if e["status"] == "confirmed":
            await async_client.post(_url(ch, f"/entries/{e['id']}/checkin"), headers=h)
    await async_client.post(_url(ch, "/close-checkin"), headers=h)
    b = (await async_client.post(_url(ch, "/draw"), headers=h)).json()["data"]
    assert b["drawn"]
    # The draw is done: filling again is refused.
    assert (await async_client.post(_url(ch, "/practice-players"), headers=h)).json()["error"]["code"] == "ALREADY_DRAWN"

    cleared = (await async_client.delete(_url(ch, "/practice-players"), headers=h)).json()["data"]
    assert cleared["removed"] == 8 and cleared["practicePlayers"] == 0
    # Only the real player is left, back in their spot after the rehearsal's no-show.
    assert [(e["userId"], e["status"], e["present"]) for e in cleared["entries"]] == [(str(real.id), "confirmed", False)]
    assert cleared["challenge"]["status"] == "open"
    br = (await async_client.get(_url(ch, "/bracket"), headers=h)).json()["data"]
    assert not br["drawn"] and br["rounds"] == []
    async with AsyncSessionLocal() as db:
        row = await db.get(Challenge, uuid.UUID(ch["id"]))
        assert row.drawn_at is None and row.checkin_closed_at is None


@pytest.mark.asyncio
async def test_practice_players_are_refused_on_production(async_client, db_session, monkeypatch):
    ch, admin = await _challenge(async_client, db_session, capacity=4)
    h = auth_headers(admin, is_admin=True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    for method in (async_client.post, async_client.delete):
        res = await method(_url(ch, "/practice-players"), headers=h)
        assert res.status_code == 403 and res.json()["error"]["code"] == "PRACTICE_DEV_ONLY"
    detail = (await async_client.get(_url(ch), headers=h)).json()["data"]
    assert detail["practiceAllowed"] is False
    # Players can't call it either.
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    p = await _player(db_session)
    assert (await async_client.post(_url(ch, "/practice-players"), headers=auth_headers(p))).status_code == 403


@pytest.mark.asyncio
async def test_every_ready_match_is_listed_in_playing_order(async_client, db_session):
    ch, admin, _ = await _field(async_client, db_session, 8)
    h = auth_headers(admin, is_admin=True)
    b = (await async_client.post(_url(ch, "/draw"), headers=h)).json()["data"]
    assert len(b["ready"]) == 4
    assert b["ready"][0]["id"] == b["upNext"]["id"]
    assert len({m["round"] for m in b["ready"]}) == 1
    # Play the third one first (whichever setup was free): it leaves the list.
    third = b["ready"][2]
    b = (await async_client.post(
        _url(ch, f"/matches/{third['id']}/result"), json={"winner": "b", "scoreA": 0, "scoreB": 2}, headers=h,
    )).json()["data"]
    assert third["id"] not in [m["id"] for m in b["ready"]] and len(b["ready"]) == 3
    # The public bracket and the projector get the same list.
    pub = (await async_client.get(f"/api/v1/challenges/{ch['slug']}/bracket")).json()["data"]
    assert [m["id"] for m in pub["ready"]] == [m["id"] for m in b["ready"]]


async def _challenge_reward(async_client, db_session):
    """A café owner's café with a challenge reward on it, and an ordinary offer."""
    async with AsyncSessionLocal() as db:
        owner, gamer, cafe, _tier = await _make_cafe_owner_gamer(db)
        await db.commit()
    ch, _ = await _challenge(async_client, db_session, capacity=2, cafeId=str(cafe.id))
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        camp = OfferCampaign(
            id=uuid.uuid4(), cafe_id=cafe.id, name="1st place reward", access_code="R" + uuid.uuid4().hex[:9].upper(),
            starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=30), is_active=True,
            allowed_user_ids=[str(gamer.id)], max_seats=1, max_uses_per_user=1, challenge_id=uuid.UUID(ch["id"]),
        )
        db.add(camp)
        await db.flush()

        def promo(campaign_id, title):
            return Promotion(
                id=uuid.uuid4(), cafe_id=cafe.id, campaign_id=campaign_id, title=title, discount_percentage=10,
                valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=30),
                days_of_week=[0, 1, 2, 3, 4, 5, 6], start_hour=0, end_hour=24, max_uses=None, current_uses=0, is_active=True,
            )
        locked, plain = promo(camp.id, "Reward"), promo(None, "Weekday 10% off")
        db.add_all([locked, plain])
        await db.commit()
    return owner, cafe, locked, plain


@pytest.mark.asyncio
async def test_the_owner_sees_a_challenge_reward_but_cannot_change_it(async_client, db_session):
    owner, cafe, locked, plain = await _challenge_reward(async_client, db_session)
    h = auth_headers(owner)

    listed = (await async_client.get(f"/api/v1/promotions/owner/cafe/{cafe.id}", headers=h)).json()["data"]
    rows = listed["promotions"] if isinstance(listed, dict) else listed
    by_id = {r["id"]: r for r in rows}
    assert by_id[str(locked.id)]["challengeReward"] is True
    assert by_id[str(plain.id)]["challengeReward"] is False

    for res in (
        await async_client.patch(f"/api/v1/promotions/{locked.id}", json={"title": "Changed"}, headers=h),
        await async_client.delete(f"/api/v1/promotions/{locked.id}", headers=h),
        await async_client.delete(f"/api/v1/promotions/{locked.id}?permanent=true", headers=h),
    ):
        assert res.status_code == 403 and res.json()["error"]["code"] == "CHALLENGE_REWARD_LOCKED", res.text
    async with AsyncSessionLocal() as db:
        row = await db.get(Promotion, locked.id)
        assert row.is_active and row.title == "Reward"

    # Their own offers still work as before.
    edit = await async_client.patch(f"/api/v1/promotions/{plain.id}", json={"title": "Weekday 15% off"}, headers=h)
    assert edit.status_code != 403 and "CHALLENGE_REWARD_LOCKED" not in edit.text
    assert (await async_client.delete(f"/api/v1/promotions/{plain.id}", headers=h)).status_code == 200


@pytest.mark.asyncio
async def test_home_card_lists_the_players_upcoming_challenges(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session, capacity=1)
    first, second, outsider = await _player(db_session, "A"), await _player(db_session, "B"), await _player(db_session, "C")
    assert (await _join(async_client, ch["slug"], first)).status_code == 201
    assert (await _join(async_client, ch["slug"], second)).status_code == 201

    a = (await async_client.get("/api/v1/challenges/mine/active", headers=auth_headers(first))).json()["data"]
    b = (await async_client.get("/api/v1/challenges/mine/active", headers=auth_headers(second))).json()["data"]
    assert [(x["slug"], x["entryStatus"], x["rank"]) for x in a] == [(ch["slug"], "confirmed", 1)]
    assert [(x["entryStatus"], x["rank"]) for x in b] == [("waitlist", 1)]
    assert a[0]["title"] and a[0]["startsAt"] and a[0]["cafeName"]
    assert "phone" not in str(a).lower()
    assert (await async_client.get("/api/v1/challenges/mine/active", headers=auth_headers(outsider))).json()["data"] == []
    assert (await async_client.get("/api/v1/challenges/mine/active")).status_code == 401

    # Dropped out, or the challenge is over: no card.
    await async_client.post(f"/api/v1/challenges/{ch['slug']}/me/withdraw", headers=auth_headers(second))
    async with AsyncSessionLocal() as db:
        e = (await db.execute(
            ChallengeEntry.__table__.select().where(ChallengeEntry.user_id == second.id)
        )).first()
        assert e.status == "withdrawn"
    assert (await async_client.get("/api/v1/challenges/mine/active", headers=auth_headers(second))).json()["data"] == []
    async with AsyncSessionLocal() as db:
        row = await db.get(Challenge, uuid.UUID(ch["id"]))
        row.status = "finished"
        await db.commit()
    assert (await async_client.get("/api/v1/challenges/mine/active", headers=auth_headers(first))).json()["data"] == []


@pytest.mark.asyncio
async def test_the_winners_poster_qr_opens_their_own_page_and_holds_no_code(async_client, db_session):
    import base64
    import io

    ch, admin, _ = await _field(async_client, db_session, 2)
    h = auth_headers(admin, is_admin=True)
    b = (await async_client.post(_url(ch, "/draw"), headers=h)).json()["data"]
    m = b["ready"][0]
    await async_client.post(_url(ch, f"/matches/{m['id']}/result"), json={"winner": "a"}, headers=h)
    await async_client.post(_url(ch, "/finish"), headers=h)
    made = (await async_client.post(_url(ch, "/rewards/make/prizes"), headers=h)).json()["data"]
    assert made["posterUrl"].endswith(f"/challenge/{ch['slug']}/me")
    assert made["posterQr"].startswith("data:image/png;base64,")
    for r in made["rewards"]:
        assert r["code"] not in made["posterUrl"]
    try:
        from PIL import Image
        from pyzbar.pyzbar import decode
    except ImportError:
        return
    img = Image.open(io.BytesIO(base64.b64decode(made["posterQr"].split(",", 1)[1])))
    assert decode(img)[0].data.decode() == made["posterUrl"]
