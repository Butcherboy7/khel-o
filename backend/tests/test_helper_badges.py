"""Early Voter / Matchmaker / Local Legend: badges and XP for helping a café join.

Sign-in is required to vote, so a badge always belongs to a real account.
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.models.user import UserRole
from app.services import waitlist_mailer
from tests.conftest import auth_headers, create_test_user
from tests.test_lead_listings import _make_cafe


@pytest.fixture(autouse=True)
def _no_email(monkeypatch):
    monkeypatch.setattr(waitlist_mailer, "_send", AsyncMock(return_value=True))
    with patch("app.api.v1.owner_intros.NotificationService.send_owner_intro", new=AsyncMock(return_value=True)):
        yield


async def _rewards(client, user):
    r = await client.get("/api/v1/rewards", headers=auth_headers(user))
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    return d, {a["id"]: a for a in d["achievements"] if a.get("emblem")}


async def test_voting_requires_sign_in(db_session, async_client):
    cafe = await _make_cafe(db_session, "Badge Anon", is_lead_listing=True)
    r = await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist", json={"sessionId": "x"})
    assert r.status_code == 401, r.text


async def test_first_vote_unlocks_day_one_once(db_session, async_client):
    cafe = await _make_cafe(db_session, "Badge Vote A", is_lead_listing=True)
    other = await _make_cafe(db_session, "Badge Vote B", is_lead_listing=True)
    gamer = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()
    h = auth_headers(gamer)

    first = await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist", headers=h, json={"sessionId": "s"})
    assert first.json()["data"]["badgeUnlocked"] == {"key": "day_one", "title": "Early Voter", "xp": 25}

    again = await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist", headers=h, json={"sessionId": "s"})
    second_cafe = await async_client.post(f"/api/v1/cafes/{other.id}/waitlist", headers=h, json={"sessionId": "s"})
    assert again.json()["data"]["badgeUnlocked"] is None
    assert second_cafe.json()["data"]["badgeUnlocked"] is None

    data, badges = await _rewards(async_client, gamer)
    assert badges["day_one"]["isUnlocked"] is True
    assert badges["matchmaker"]["isUnlocked"] is False
    assert badges["local_legend"]["isUnlocked"] is False
    assert data["xp"] == 25


async def test_matchmaker_only_once_admin_has_reached_the_owner(db_session, async_client):
    cafe = await _make_cafe(db_session, "Badge Intro", is_lead_listing=True)
    gamer = await create_test_user(db_session, role=UserRole.GAMER)
    admin = await create_test_user(db_session, role=UserRole.ADMIN)
    await db_session.commit()

    r = await async_client.post("/api/v1/owner-intros", headers=auth_headers(gamer), json={
        "cafeId": str(cafe.id), "ownerName": "Ravi", "ownerPhone": "9876543210",
        "relation": "regular", "ownerConsent": True,
    })
    assert r.status_code == 201, r.text
    intro_id = r.json()["data"]["id"]

    _, badges = await _rewards(async_client, gamer)
    assert badges["matchmaker"]["isUnlocked"] is False, "a typed number alone earns nothing"

    ah = auth_headers(admin, is_admin=True)
    await async_client.patch(f"/api/v1/admin/leads/owner-intros/{intro_id}", headers=ah, json={"status": "dead"})
    _, badges = await _rewards(async_client, gamer)
    assert badges["matchmaker"]["isUnlocked"] is False

    await async_client.patch(f"/api/v1/admin/leads/owner-intros/{intro_id}", headers=ah, json={"status": "contacted"})
    data, badges = await _rewards(async_client, gamer)
    assert badges["matchmaker"]["isUnlocked"] is True
    assert data["xp"] == 100


async def test_going_live_makes_voters_and_introducers_local_legends(db_session, async_client):
    cafe = await _make_cafe(db_session, "Badge Live", is_lead_listing=True)
    voter = await create_test_user(db_session, role=UserRole.GAMER)
    introducer = await create_test_user(db_session, role=UserRole.GAMER)
    bystander = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()

    await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist", headers=auth_headers(voter), json={"sessionId": "v"})
    await async_client.post("/api/v1/owner-intros", headers=auth_headers(introducer), json={
        "cafeId": str(cafe.id), "ownerName": "Meena", "ownerPhone": "9876500000",
        "relation": "friend_family", "ownerConsent": True,
    })

    # Still a lead café: nothing is granted.
    await waitlist_mailer.send_launch_notifications(db_session, cafe.id)
    _, badges = await _rewards(async_client, voter)
    assert badges["local_legend"]["isUnlocked"] is False

    cafe.is_lead_listing = False
    await db_session.commit()
    await waitlist_mailer.send_launch_notifications(db_session, cafe.id)
    await waitlist_mailer.send_launch_notifications(db_session, cafe.id)  # a repeat changes nothing

    vdata, vb = await _rewards(async_client, voter)
    idata, ib = await _rewards(async_client, introducer)
    _, bb = await _rewards(async_client, bystander)
    assert vb["local_legend"]["isUnlocked"] is True
    assert ib["local_legend"]["isUnlocked"] is True
    assert bb["local_legend"]["isUnlocked"] is False
    assert vdata["xp"] == 25 + 500
    assert idata["xp"] == 500


async def test_rewards_always_lists_the_three_emblems(db_session, async_client):
    gamer = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()
    data, badges = await _rewards(async_client, gamer)
    assert list(badges) == ["day_one", "matchmaker", "local_legend"]
    assert data["xp"] == 0


async def test_admin_can_track_helper_badges(db_session, async_client):
    from app.services.badge_service import grant_helper_badge

    gamer = await create_test_user(db_session, role=UserRole.GAMER)
    admin = await create_test_user(db_session, role=UserRole.ADMIN)
    await db_session.commit()
    await grant_helper_badge(db_session, gamer.id, "day_one")

    r = await async_client.get("/api/v1/admin/leads/helper-badges", headers=auth_headers(admin, is_admin=True))
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    totals = {t["key"]: t["count"] for t in d["totals"]}
    assert totals["day_one"] >= 1 and set(totals) == {"day_one", "matchmaker", "local_legend"}
    assert any(x["key"] == "day_one" and x["player"]["email"] == gamer.email for x in d["recent"])

    r = await async_client.get("/api/v1/admin/leads/helper-badges", headers=auth_headers(gamer))
    assert r.status_code in (401, 403)
