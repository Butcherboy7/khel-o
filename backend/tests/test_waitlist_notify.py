"""Notify-me v2: the go-live send, unsubscribe, play-time answer, the public
owner demand page, and the admin CSV export / broadcast."""
import uuid

import pytest
from sqlalchemy import select

from app.models.cafe_waitlist import CafeWaitlistEntry
from app.models.notification import Notification
from app.models.user import UserRole
from app.services import waitlist_mailer
from tests.conftest import auth_headers, create_test_user
from tests.waitlist_helpers import seed_anon
from tests.test_lead_demand import _make_cafe


@pytest.fixture
def outbox(monkeypatch):
    sent: list[tuple[str, str, str]] = []

    async def fake_send(to, subject, body, ref):
        sent.append((to, subject, body))
        return True

    monkeypatch.setattr(waitlist_mailer, "_send", fake_send)
    return sent


async def _join(client, cafe_id, session_id, contact=None, headers=None):
    body = {"sessionId": session_id}
    if contact:
        body["contact"] = contact
    if not headers:
        # Signed-out votes are no longer accepted by the API; legacy rows are seeded.
        await seed_anon(cafe_id, session_id, contact)
        return
    r = await client.post(f"/api/v1/cafes/{cafe_id}/waitlist", json=body, headers=headers)
    assert r.status_code == 200, r.text


async def test_launch_notifies_each_person_once(db_session, async_client, outbox):
    cafe = await _make_cafe(db_session, "Launching Cafe", slug="launching-cafe")
    fan = await create_test_user(db_session, email="fan@gmail.com")
    await db_session.commit()
    await _join(async_client, cafe.id, "s-fan", headers=auth_headers(fan))
    await _join(async_client, cafe.id, "s-anon", contact="anon@test.com")
    await _join(async_client, cafe.id, "s-dupe", contact="ANON@test.com")  # same inbox
    await _join(async_client, cafe.id, "s-phone", contact="9876543210")

    cafe.is_lead_listing = False
    await db_session.commit()

    assert await waitlist_mailer.send_launch_notifications(db_session, cafe.id) == 2
    assert sorted(to.lower() for to, _, _ in outbox) == ["anon@test.com", "fan@gmail.com"]
    assert "/waitlist/unsubscribe?e=" in outbox[0][2]
    notes = (await db_session.execute(select(Notification).where(Notification.user_id == fan.id))).scalars().all()
    assert len(notes) == 1 and notes[0].link == "/cafe/launching-cafe"

    # A second go-live (double click, re-verify) sends nothing new.
    assert await waitlist_mailer.send_launch_notifications(db_session, cafe.id) == 0
    assert len(outbox) == 2


async def test_launch_skips_cafes_still_in_lead_mode(db_session, async_client, outbox):
    cafe = await _make_cafe(db_session, "Still Lead Cafe")
    await _join(async_client, cafe.id, "s-1", contact="a@test.com")
    assert await waitlist_mailer.send_launch_notifications(db_session, cafe.id) == 0
    assert outbox == []


async def test_unsubscribe_requires_valid_token_and_stops_email(db_session, async_client, outbox):
    cafe = await _make_cafe(db_session, "Unsub Cafe")
    other = await _make_cafe(db_session, "Other Cafe")
    await _join(async_client, cafe.id, "s-1", contact="quit@test.com")
    await _join(async_client, other.id, "s-1", contact="quit@test.com")
    entry = (await db_session.execute(
        select(CafeWaitlistEntry).where(CafeWaitlistEntry.cafe_id == cafe.id)
    )).scalar_one()

    # Opening the link only shows a confirm page: mail scanners that
    # prefetch links must not unsubscribe anyone.
    token = waitlist_mailer.unsubscribe_token(entry.id)
    r = await async_client.get(f"/api/v1/waitlist/unsubscribe?e={entry.id}&t={token}")
    assert r.status_code == 200 and "<form" in r.text
    assert (await waitlist_mailer.recipients(db_session, cafe.id))[0].email == "quit@test.com"

    bad = await async_client.post(
        "/api/v1/waitlist/unsubscribe", content=f"e={entry.id}&t={'0' * 32}",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert bad.status_code == 400

    ok = await async_client.post(
        "/api/v1/waitlist/unsubscribe", content=f"e={entry.id}&t={token}",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert ok.status_code == 200, ok.text
    cafe_id, other_id = cafe.id, other.id
    db_session.expire_all()
    # Opted out of every café's list, not just the one emailed.
    assert await waitlist_mailer.recipients(db_session, cafe_id) == []
    assert await waitlist_mailer.recipients(db_session, other_id) == []


async def test_play_time_answer(db_session, async_client):
    cafe = await _make_cafe(db_session, "Play Time Cafe")
    await _join(async_client, cafe.id, "s-pt")
    url = f"/api/v1/cafes/{cafe.id}/waitlist/play-time"

    r = await async_client.patch(url, json={"sessionId": "s-pt", "playTime": "late_nights"})
    assert r.status_code == 200, r.text
    assert (await async_client.patch(url, json={"sessionId": "s-pt", "playTime": "whenever"})).status_code == 400
    assert (await async_client.patch(url, json={"sessionId": "s-nobody", "playTime": "weekends"})).status_code == 404


async def test_public_demand_page_has_counts_but_no_contacts(db_session, async_client):
    cafe = await _make_cafe(db_session, "Demand Cafe", slug="demand-cafe")
    await _join(async_client, cafe.id, "s-1", contact="secret@test.com")
    await _join(async_client, cafe.id, "s-2", contact="9998887776")
    await async_client.patch(
        f"/api/v1/cafes/{cafe.id}/waitlist/play-time", json={"sessionId": "s-1", "playTime": "weekends"}
    )

    r = await async_client.get("/api/v1/waitlist/demand/demand-cafe")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["count"] == 2 and data["last7Days"] == 2 and data["weekly"][-1] == 2
    assert {p["key"]: p["count"] for p in data["playTimes"]}["weekends"] == 1
    assert "secret@test.com" not in r.text and "9998887776" not in r.text
    assert (await async_client.get("/api/v1/waitlist/demand/no-such-cafe")).status_code == 404


async def test_csv_export_is_admin_only_and_escapes_formulas(db_session, async_client):
    admin = await create_test_user(db_session, role=UserRole.ADMIN)
    await db_session.commit()
    gamer = await create_test_user(db_session)
    await db_session.commit()
    cafe = await _make_cafe(db_session, "Export Cafe")
    await _join(async_client, cafe.id, "s-1", contact="=HYPERLINK(\"http://x\")")
    await _join(async_client, cafe.id, "s-2", contact="csv@test.com")

    url = f"/api/v1/admin/leads/{cafe.id}/export.csv"
    assert (await async_client.get(url)).status_code in (401, 403)
    assert (await async_client.get(url, headers=auth_headers(gamer))).status_code == 403

    r = await async_client.get(url, headers=auth_headers(admin, is_admin=True))
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/csv")
    assert "csv@test.com" in r.text
    assert "'=HYPERLINK" in r.text

    all_r = await async_client.get("/api/v1/admin/leads/export.csv", headers=auth_headers(admin, is_admin=True))
    assert all_r.status_code == 200 and "Export Cafe" in all_r.text


async def test_broadcast_test_goes_only_to_admin(db_session, async_client, outbox):
    admin = await create_test_user(db_session, email="boss@khelo.test", role=UserRole.ADMIN)
    await db_session.commit()
    cafe = await _make_cafe(db_session, "Broadcast Cafe")
    await _join(async_client, cafe.id, "s-1", contact="p1@test.com")
    await _join(async_client, cafe.id, "s-2", contact="p2@test.com")
    url = f"/api/v1/admin/leads/{cafe.id}/broadcast"
    body = {"subject": "Opening soon", "message": "Owner is <b>setting up</b>\nsee you soon"}

    r = await async_client.post(url, json={**body, "test": True}, headers=auth_headers(admin, is_admin=True))
    assert r.status_code == 200, r.text
    assert [to for to, _, _ in outbox] == ["boss@khelo.test"]
    assert outbox[0][1] == "[Test] Opening soon"
    assert "&lt;b&gt;setting up&lt;/b&gt;<br>" in outbox[0][2]

    r = await async_client.post(url, json=body, headers=auth_headers(admin, is_admin=True))
    assert r.json()["data"]["sent"] == 2
    assert sorted(to for to, _, _ in outbox[1:]) == ["p1@test.com", "p2@test.com"]

    leads = (await async_client.get("/api/v1/admin/leads/demand", headers=auth_headers(admin, is_admin=True))).json()["data"]["leads"]
    assert {l["cafeName"]: l["emailableCount"] for l in leads}["Broadcast Cafe"] == 2
