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
async def test_signup_does_not_ask_for_an_age_tick(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session)
    p = await _player(db_session)
    body = _join_body(); body.pop("consentAge")
    res = await async_client.post(f"/api/v1/challenges/{ch['slug']}/entries", json=body, headers=auth_headers(p))
    assert res.status_code == 201, res.text


@pytest.mark.asyncio
async def test_public_page_shows_the_visitor_offer_only_when_set(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session)
    assert (await async_client.get(f"/api/v1/challenges/{ch['slug']}")).json()["data"]["visitorOffer"] is None
    async with TestAsyncSessionLocal() as db:
        row = await db.get(Challenge, uuid.UUID(ch["id"]))
        row.plan_config = {"visitorOffer": "20% off at the café for everyone who comes on the day"}
        await db.commit()
    data = (await async_client.get(f"/api/v1/challenges/{ch['slug']}")).json()["data"]
    assert data["visitorOffer"] == "20% off at the café for everyone who comes on the day"


@pytest.mark.asyncio
async def test_public_page_carries_the_optional_first_screen_lines(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session)
    data = (await async_client.get(f"/api/v1/challenges/{ch['slug']}")).json()["data"]
    assert data["heroLine"] is None and data["heroSub"] is None
    async with TestAsyncSessionLocal() as db:
        row = await db.get(Challenge, uuid.UUID(ch["id"]))
        row.plan_config = {"heroLine": "Wallet enduku bro?", "heroSub": "Free ga aadu."}
        await db.commit()
    data = (await async_client.get(f"/api/v1/challenges/{ch['slug']}")).json()["data"]
    assert (data["heroLine"], data["heroSub"]) == ("Wallet enduku bro?", "Free ga aadu.")


@pytest.mark.asyncio
async def test_signup_needs_an_account_and_the_required_ticks(async_client, db_session):
    ch, _ = await _challenge(async_client, db_session)
    res = await async_client.post(f"/api/v1/challenges/{ch['slug']}/entries", json=_join_body())
    assert res.status_code == 401
    p = await _player(db_session)
    assert (await _join(async_client, ch["slug"], p, consentRules=False)).json()["error"]["code"] == "RULES_REQUIRED"
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


async def test_create_names_the_field_that_failed_and_takes_empty_optionals(async_client, db_session):
    """The admin form used to show only "Request validation failed": every
    error now names its own field, in plain words, all at once."""
    admin = await _admin(db_session)
    cafe = await _make_cafe(db_session, f"Den {uuid.uuid4().hex[:6]}")
    h = auth_headers(admin, is_admin=True)
    # What ChallengeForm sends with every optional box left empty.
    base = {
        "slug": f"t8-{uuid.uuid4().hex[:6]}", "title": "KHELO Tekken Challenge #01", "cafeId": str(cafe.id),
        "game": "tekken 8", "setupLine": None, "format": "Single elimination + 3rd-place match", "bestOf": 3,
        "finalBestOf": 5, "startsAt": "2026-10-25T11:00:00+05:30", "endsAt": "2026-10-25T18:00:00+05:30",
        "checkinOpensAt": "2026-10-25T10:30:00+05:30", "checkinClosesAt": "2026-10-25T11:15:00+05:30",
        "capacity": 10, "minAge": 18, "status": "open", "rulesMd": "", "prizesMd": "",
        "coverImageUrl": None, "communityUrl": None, "instagramHandle": None,
    }
    ok = await async_client.post("/api/v1/admin/challenges", json=base, headers=h)
    assert ok.status_code == 201, ok.text

    async def fields(**over):
        res = await async_client.post("/api/v1/admin/challenges", json={**base, "slug": f"t8-{uuid.uuid4().hex[:6]}", **over}, headers=h)
        assert res.status_code == 422, res.text
        details = res.json()["error"]["details"]
        assert all(not d["message"].startswith("Value error") for d in details), details
        return {d["field"]: d["message"] for d in details}

    assert set(await fields(prizesMd="Prizes\n- 1st: 2 hours")) == {"prizesMd"}
    assert set(await fields(title="KHELO Tekken Tournament")) == {"title"}
    assert set(await fields(slug="tekken 01")) == {"slug"}
    assert set(await fields(endsAt="2026-10-25T10:00:00+05:30")) == {"endsAt"}
    # The schedule from the bug report: check-in two days before the start.
    early = await fields(checkinOpensAt="2026-10-22T12:00:00+05:30", checkinClosesAt="2026-10-23T18:46:00+05:30")
    assert set(early) == {"checkinOpensAt"} and "on the day" in early["checkinOpensAt"]
    assert set(await fields(checkinClosesAt="2026-10-25T19:00:00+05:30")) == {"checkinClosesAt"}
    # Several problems come back together, not one per attempt.
    assert set(await fields(title="Tournament", rulesMd="- Buy a ticket")) == {"title", "rulesMd"}


async def test_challenge_form_edge_cases(async_client, db_session):
    admin = await _admin(db_session)
    cafe = await _make_cafe(db_session, f"Den {uuid.uuid4().hex[:6]}")
    h = auth_headers(admin, is_admin=True)
    base = {
        "title": "KHELO Tekken Challenge #01", "cafeId": str(cafe.id), "game": "Tekken 8",
        "startsAt": "2026-11-01T15:00:00+05:30", "endsAt": "2026-11-01T18:00:00+05:30",
        "checkinOpensAt": "2026-11-01T14:30:00+05:30", "checkinClosesAt": "2026-11-01T15:10:00+05:30",
        "capacity": 10, "status": "draft",
    }

    async def post(**over):
        return await async_client.post(
            "/api/v1/admin/challenges", json={**base, "slug": f"edge-{uuid.uuid4().hex[:6]}", **over}, headers=h,
        )

    async def refused(**over):
        res = await post(**over)
        assert res.status_code == 422, res.text
        return {d["field"]: d["message"] for d in res.json()["error"]["details"]}

    # Boundaries: exactly 6 h before, exactly at the start, closing exactly at the end all save.
    for over in ({"checkinOpensAt": "2026-11-01T09:00:00+05:30"},
                 {"checkinOpensAt": "2026-11-01T15:00:00+05:30", "checkinClosesAt": "2026-11-01T15:20:00+05:30"},
                 {"checkinClosesAt": "2026-11-01T18:00:00+05:30"},
                 # Same moments sent in UTC: compared as instants, not as text.
                 {"startsAt": "2026-11-01T09:30:00Z", "checkinOpensAt": "2026-11-01T09:00:00Z"}):
        res = await post(**over)
        assert res.status_code == 201, (over, res.text)
    # One minute past each boundary is refused, on that field only.
    assert set(await refused(checkinOpensAt="2026-11-01T08:59:00+05:30")) == {"checkinOpensAt"}
    assert set(await refused(checkinOpensAt="2026-11-01T15:01:00+05:30")) == {"checkinOpensAt"}
    assert set(await refused(checkinClosesAt="2026-11-01T18:01:00+05:30")) == {"checkinClosesAt"}
    assert set(await refused(checkinClosesAt="2026-11-01T14:30:00+05:30")) == {"checkinClosesAt"}
    assert set(await refused(endsAt="2026-11-01T15:00:00+05:30")) == {"endsAt"}
    # A time without its zone: only that field is reported, and nothing crashes.
    assert set(await refused(startsAt="2026-11-01T15:00:00")) == {"startsAt"}
    # Missing required fields are named too.
    no_title = {k: v for k, v in base.items() if k != "title"}
    res = await async_client.post("/api/v1/admin/challenges", json={**no_title, "slug": "edge-no-title"}, headers=h)
    assert res.status_code == 422 and {d["field"] for d in res.json()["error"]["details"]} == {"title"}
    assert set(await refused(capacity=0)) == {"capacity"}

    # Ordinary words that merely contain a risky one are fine.
    ok = await post(rulesMd="- Alphabet order seeding\n- Better of 3 goes through\n- Cashback offers stay at the café\n- Stakeholders: AdamsDen",
                    prizesMd="- 1st: 2 hours free play", setupLine="   ")
    assert ok.status_code == 201, ok.text
    assert ok.json()["data"]["setupLine"] is None
    for word in ("PRIZE", "Buy-in", "tickets", "Entry-fee", "betting", "jackpot", "Gambling", "lottery"):
        assert set(await refused(rulesMd=f"- {word} rules")) == {"rulesMd"}, word

    # Same checks on edit, plus the duplicate link name.
    made = (await post(slug="edge-taken")).json()["data"]
    cid = made["id"]
    body = {**base, "slug": "edge-taken"}
    res = await async_client.patch(f"/api/v1/admin/challenges/{cid}", json={**body, "prizesMd": "Prizes"}, headers=h)
    assert res.status_code == 422 and {d["field"] for d in res.json()["error"]["details"]} == {"prizesMd"}
    res = await async_client.patch(f"/api/v1/admin/challenges/{cid}", json={**body, "capacity": 12}, headers=h)
    assert res.status_code == 200, res.text
    res = await post(slug="edge-taken")
    assert res.status_code == 409 and res.json()["error"]["code"] == "SLUG_TAKEN"


@pytest.mark.asyncio
async def test_owner_sees_only_their_cafes_challenges_without_phones(async_client, db_session):
    from app.models.cafe import Cafe
    from app.models.user import User
    ch, _ = await _challenge(async_client, db_session)
    p = await _player(db_session)
    assert (await _join(async_client, ch["slug"], p, phone="9876501234")).status_code == 201
    async with TestAsyncSessionLocal() as db:
        owner = await db.get(User, (await db.get(Cafe, uuid.UUID(ch["cafe"]["id"]))).owner_id)
    res = await async_client.get("/api/v1/challenges/hosting", headers=auth_headers(owner))
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert [c["slug"] for c in data] == [ch["slug"]]
    assert data[0]["confirmed"] == 1 and data[0]["players"][0]["status"] == "confirmed"
    assert "9876501234" not in res.text and "phone" not in res.text.lower()
    stranger = await _player(db_session)
    assert (await async_client.get("/api/v1/challenges/hosting", headers=auth_headers(stranger))).json()["data"] == []
    assert (await async_client.get("/api/v1/challenges/hosting")).status_code == 401
