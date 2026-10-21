"""Challenges: public page, sign-up with a spot cap and a waitlist, move-ups,
"Coming?" answers, admin actions. Phones never reach a public response."""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.analytics_event import AnalyticsEvent
from app.models.challenge import Challenge, ChallengeEntry
from app.models.user import UserRole
from app.services import challenge_service as svc
from tests.conftest import TestAsyncSessionLocal, auth_headers, create_test_user
from tests.test_lead_listings import _make_cafe


def _phone() -> str:
    return "98" + str(uuid.uuid4().int)[:8]


def _join_body(**over):
    body = {
        "name": "Arjun Rao",
        "phone": _phone(),
        "consentRules": True,
        "consentAge": True,
        "consentFilming": True,
        "consentUpdates": False,
        "mainCharacter": "Jin",
    }
    body.update(over)
    return body


async def _admin(db_session):
    admin = await create_test_user(db_session, role=UserRole.ADMIN)
    await db_session.commit()
    return admin


async def _player(db_session, name="Player"):
    user = await create_test_user(db_session, full_name=name)
    await db_session.commit()
    return user


async def _challenge(async_client, db_session, capacity=3, status="open", **over):
    admin = await _admin(db_session)
    cafe = await _make_cafe(db_session, f"Den {uuid.uuid4().hex[:6]}")
    start = datetime(2026, 11, 1, 15, 0, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    body = {
        "slug": f"tekken-{uuid.uuid4().hex[:6]}",
        "title": "KHELO Tekken Challenge #01",
        "cafeId": str(cafe.id),
        "game": "Tekken 8",
        "setupLine": "One PS5 on a projector",
        "startsAt": start.isoformat(),
        "endsAt": (start + timedelta(hours=3)).isoformat(),
        "checkinOpensAt": (start - timedelta(minutes=30)).isoformat(),
        "checkinClosesAt": (start + timedelta(minutes=10)).isoformat(),
        "capacity": capacity,
        "status": status,
        "rulesMd": "- Best of 3",
        "prizesMd": "- 1st: 2 hours",
        "communityUrl": "https://chat.whatsapp.com/test",
        "instagramHandle": "khelo.journey",
    }
    body.update(over)
    res = await async_client.post("/api/v1/admin/challenges", json=body, headers=auth_headers(admin, is_admin=True))
    assert res.status_code == 201, res.text
    return res.json()["data"], admin


async def _join(async_client, slug, user, **over):
    return await async_client.post(f"/api/v1/challenges/{slug}/entries", json=_join_body(**over), headers=auth_headers(user))


@pytest.mark.asyncio
async def test_draft_is_hidden_from_the_public_but_not_from_admins(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session, status="draft")
    assert (await async_client.get(f"/api/v1/challenges/{ch['slug']}")).status_code == 404
    player = await _player(db_session)
    assert (await async_client.get(f"/api/v1/challenges/{ch['slug']}", headers=auth_headers(player))).status_code == 404
    res = await async_client.get(f"/api/v1/challenges/{ch['slug']}", headers=auth_headers(admin, is_admin=True))
    assert res.status_code == 200
    # Nobody can sign up to a draft either.
    assert (await _join(async_client, ch["slug"], player)).status_code == 404


@pytest.mark.asyncio
async def test_public_page_shows_real_spots_and_no_phones(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session, capacity=2)
    p = await _player(db_session)
    phone = "9876543210"
    assert (await _join(async_client, ch["slug"], p, phone=phone)).status_code == 201
    res = await async_client.get(f"/api/v1/challenges/{ch['slug']}")
    data = res.json()["data"]
    assert (data["confirmed"], data["spotsLeft"], data["waitlist"]) == (1, 1, 0)
    assert "9876543210" not in res.text and phone not in res.text


@pytest.mark.asyncio
async def test_signup_needs_an_account_and_the_required_ticks(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session)
    res = await async_client.post(f"/api/v1/challenges/{ch['slug']}/entries", json=_join_body())
    assert res.status_code == 401
    p = await _player(db_session)
    assert (await _join(async_client, ch["slug"], p, consentRules=False)).json()["error"]["code"] == "RULES_REQUIRED"
    assert (await _join(async_client, ch["slug"], p, consentAge=False)).json()["error"]["code"] == "AGE_REQUIRED"
    assert (await _join(async_client, ch["slug"], p, phone="12345")).status_code == 422


@pytest.mark.asyncio
async def test_spots_then_waitlist_in_join_order(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session, capacity=2)
    seen = []
    for i in range(4):
        p = await _player(db_session, f"P{i}")
        res = await _join(async_client, ch["slug"], p)
        assert res.status_code == 201, res.text
        entry = res.json()["data"]["entry"]
        seen.append((entry["status"], entry["rank"]))
    assert seen == [("confirmed", 1), ("confirmed", 2), ("waitlist", 1), ("waitlist", 2)]


@pytest.mark.asyncio
async def test_signing_up_twice_returns_the_same_entry(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session)
    p = await _player(db_session)
    first = (await _join(async_client, ch["slug"], p)).json()["data"]
    again = (await _join(async_client, ch["slug"], p)).json()["data"]
    assert again["created"] is False
    assert again["entry"]["id"] == first["entry"]["id"]


@pytest.mark.asyncio
async def test_one_phone_cannot_sign_up_on_two_accounts(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session)
    phone = _phone()
    a, b = await _player(db_session), await _player(db_session)
    assert (await _join(async_client, ch["slug"], a, phone=phone)).status_code == 201
    res = await _join(async_client, ch["slug"], b, phone=phone)
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "PHONE_ALREADY_SIGNED_UP"


@pytest.mark.asyncio
async def test_two_people_racing_for_the_last_spot_never_both_get_it(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session, capacity=3)
    users = [await _player(db_session, f"R{i}") for i in range(8)]
    challenge = await db_session.get(Challenge, uuid.UUID(ch["id"]))

    async def one(user):
        async with TestAsyncSessionLocal() as s:
            fields = {"name": user.full_name, "phone": "+91" + _phone(), "consent_rules": True, "consent_age": True}
            entry, _ = await svc.join(s, challenge.id, user.id, fields)
            return entry.status

    results = await asyncio.gather(*(one(u) for u in users))
    assert results.count("confirmed") == 3
    assert results.count("waitlist") == 5
    async with TestAsyncSessionLocal() as s:
        rows = await svc.entries(s, challenge.id)
        positions = [e.position for e in rows]
        assert len(positions) == len(set(positions)) == 8


@pytest.mark.asyncio
async def test_cant_make_it_moves_the_next_waitlist_person_up(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session, capacity=1)
    a, b, c = await _player(db_session), await _player(db_session), await _player(db_session)
    for u in (a, b, c):
        await _join(async_client, ch["slug"], u)
    # B said they aren't coming: C moves up instead of B.
    res = await async_client.post(f"/api/v1/challenges/{ch['slug']}/me/coming", json={"coming": "no"}, headers=auth_headers(b))
    assert res.json()["data"]["entry"]["status"] == "waitlist"

    res = await async_client.post(f"/api/v1/challenges/{ch['slug']}/me/withdraw", headers=auth_headers(a))
    assert res.json()["data"]["entry"]["status"] == "withdrawn"
    mine = (await async_client.get(f"/api/v1/challenges/{ch['slug']}/me", headers=auth_headers(c))).json()["data"]["entry"]
    assert mine["status"] == "confirmed" and mine["promotedAt"]
    assert (await async_client.get(f"/api/v1/challenges/{ch['slug']}/me", headers=auth_headers(b))).json()["data"]["entry"]["status"] == "waitlist"


@pytest.mark.asyncio
async def test_a_confirmed_no_frees_the_spot(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session, capacity=1)
    a, b = await _player(db_session), await _player(db_session)
    await _join(async_client, ch["slug"], a)
    await _join(async_client, ch["slug"], b)
    res = await async_client.post(f"/api/v1/challenges/{ch['slug']}/me/coming", json={"coming": "no"}, headers=auth_headers(a))
    assert res.json()["data"]["entry"]["status"] == "withdrawn"
    assert (await async_client.get(f"/api/v1/challenges/{ch['slug']}/me", headers=auth_headers(b))).json()["data"]["entry"]["status"] == "confirmed"


@pytest.mark.asyncio
async def test_rejoining_after_dropping_out_goes_to_the_back(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session, capacity=1)
    a, b = await _player(db_session), await _player(db_session)
    await _join(async_client, ch["slug"], a)
    await _join(async_client, ch["slug"], b)
    await async_client.post(f"/api/v1/challenges/{ch['slug']}/me/withdraw", headers=auth_headers(a))
    res = await _join(async_client, ch["slug"], a)
    assert res.json()["data"]["created"] is True
    assert res.json()["data"]["entry"]["status"] == "waitlist"


@pytest.mark.asyncio
async def test_release_silent_players_and_fill_from_the_waitlist(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session, capacity=2)
    a, b, c, d = [await _player(db_session) for _ in range(4)]
    for u in (a, b, c, d):
        await _join(async_client, ch["slug"], u)
    await async_client.post(f"/api/v1/challenges/{ch['slug']}/me/coming", json={"coming": "yes"}, headers=auth_headers(a))
    res = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/release-silent", headers=auth_headers(admin, is_admin=True))
    data = res.json()["data"]
    assert (data["released"], data["movedUp"]) == (1, 1)
    status = {e["userId"]: e["status"] for e in data["entries"]}
    assert status[str(a.id)] == "confirmed"
    assert status[str(b.id)] == "withdrawn"
    assert status[str(c.id)] == "confirmed"
    assert status[str(d.id)] == "waitlist"
    assert data["stats"]["movedUpNotTold"] == 1


@pytest.mark.asyncio
async def test_admin_actions_csv_and_role_check(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session, capacity=1)
    a, b = await _player(db_session), await _player(db_session)
    phone = _phone()
    await _join(async_client, ch["slug"], a, phone=phone)
    await _join(async_client, ch["slug"], b)
    h = auth_headers(admin, is_admin=True)

    # A player can't reach any admin endpoint.
    assert (await async_client.get(f"/api/v1/admin/challenges/{ch['id']}", headers=auth_headers(a))).status_code == 403

    detail = (await async_client.get(f"/api/v1/admin/challenges/{ch['id']}", headers=h)).json()["data"]
    ea = next(e for e in detail["entries"] if e["userId"] == str(a.id))
    eb = next(e for e in detail["entries"] if e["userId"] == str(b.id))

    res = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/entries/{eb['id']}/promote", headers=h)
    assert res.json()["error"]["code"] == "NO_FREE_SPOT"
    res = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/entries/{ea['id']}/no_show", headers=h)
    statuses = {e["id"]: e["status"] for e in res.json()["data"]["entries"]}
    assert statuses[ea["id"]] == "no_show" and statuses[eb["id"]] == "confirmed"

    res = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/entries/{eb['id']}/told", headers=h)
    assert next(e for e in res.json()["data"]["entries"] if e["id"] == eb["id"])["toldAt"]
    res = await async_client.post(f"/api/v1/admin/challenges/{ch['id']}/entries/{eb['id']}/test", headers=h)
    assert res.json()["data"]["stats"]["tests"] == 1

    csv = await async_client.get(f"/api/v1/admin/challenges/{ch['id']}/entries.csv", headers=h)
    assert csv.status_code == 200 and phone in csv.text


@pytest.mark.asyncio
async def test_more_capacity_moves_the_waitlist_up(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session, capacity=1)
    a, b = await _player(db_session), await _player(db_session)
    await _join(async_client, ch["slug"], a)
    await _join(async_client, ch["slug"], b)
    body = {k: ch[k] for k in ("slug", "title", "game", "setupLine", "format", "bestOf", "finalBestOf", "startsAt",
                               "endsAt", "checkinOpensAt", "checkinClosesAt", "minAge", "status", "rulesMd", "prizesMd")}
    body.update(cafeId=ch["cafe"]["id"], capacity=2)
    res = await async_client.patch(f"/api/v1/admin/challenges/{ch['id']}", json=body, headers=auth_headers(admin, is_admin=True))
    assert res.status_code == 200, res.text
    assert res.json()["data"]["confirmed"] == 2


@pytest.mark.asyncio
async def test_closed_challenge_takes_no_signups(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session, status="closed")
    p = await _player(db_session)
    assert (await _join(async_client, ch["slug"], p)).json()["error"]["code"] == "CHALLENGE_CLOSED"


def test_public_name_never_shows_a_full_surname():
    e = ChallengeEntry(name="Arjun Kumar Rao", display_name=None)
    assert svc.public_name(e) == "Arjun R."
    e.display_name = "JinMain"
    assert svc.public_name(e) == "JinMain"

@pytest.mark.asyncio
async def test_funnel_counts_people_and_skips_our_own_devices(async_client, db_session):
    ch, admin = await _challenge(async_client, db_session)
    view = {"action": "challenge_page_view", "challenge": ch["slug"]}
    for session_id, meta in [("s1", view), ("s1", view), ("s2", view), ("s3", {**view, "internal": True}),
                             ("s4", {"action": "challenge_page_view", "challenge": "another-one"})]:
        db_session.add(AnalyticsEvent(session_id=session_id, event_type="ui_action", event_metadata=meta))
    await db_session.commit()
    res = await async_client.get(f"/api/v1/admin/challenges/{ch['id']}", headers=auth_headers(admin, is_admin=True))
    assert res.json()["data"]["stats"]["events"] == {"challenge_page_view": {"count": 3, "people": 2}}


@pytest.mark.asyncio
async def test_public_wording_refuses_words_payment_partners_flag(async_client, db_session):
    admin = await _admin(db_session)
    cafe = await _make_cafe(db_session, f"Den {uuid.uuid4().hex[:6]}")
    start = datetime(2026, 11, 1, 15, 0, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    base = {
        "slug": f"words-{uuid.uuid4().hex[:6]}", "title": "KHELO Tekken Challenge #02", "cafeId": str(cafe.id),
        "game": "Tekken 8", "startsAt": start.isoformat(), "endsAt": (start + timedelta(hours=3)).isoformat(),
        "checkinOpensAt": (start - timedelta(minutes=30)).isoformat(),
        "checkinClosesAt": (start + timedelta(minutes=10)).isoformat(), "capacity": 8,
    }
    h = auth_headers(admin, is_admin=True)
    for field, text in [("prizesMd", "- 1st prize: 2 hours"), ("title", "Tekken Tournament"),
                        ("rulesMd", "- No entry fee"), ("prizesMd", "- Cash for the winner"), ("rulesMd", "- Lucky draw")]:
        res = await async_client.post("/api/v1/admin/challenges", json={**base, field: text}, headers=h)
        assert res.status_code == 422, (field, text, res.text)
    ok = await async_client.post(
        "/api/v1/admin/challenges", json={**base, "prizesMd": "- 1st: 2 hours free play", "rulesMd": "- Win 2 games to go through"}, headers=h,
    )
    assert ok.status_code == 201, ok.text
