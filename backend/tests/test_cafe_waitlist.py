"""Waitlist: players asking to be told when a lead café starts taking bookings.

The count is shown to players ("37 waiting") and quoted to café owners as
evidence of real demand, so these tests are mostly about it staying honest
under repeat taps.

See docs/superpowers/specs/2026-09-10-explore-real-cafes-design.md §6.1
"""
import uuid

from app.models.user import UserRole
from tests.conftest import create_test_user, auth_headers
from tests.test_lead_listings import _make_cafe


async def test_join_is_idempotent_for_signed_in_user(db_session, async_client):
    cafe = await _make_cafe(db_session, "Idempotent Signed In", is_lead_listing=True)
    user = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()
    headers = auth_headers(user)

    r1 = await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist",
                                 headers=headers, json={"sessionId": "s1"})
    r2 = await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist",
                                 headers=headers, json={"sessionId": "s1"})
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text

    resp = await async_client.get(f"/api/v1/cafes/{cafe.id}/waitlist/count")
    assert resp.json()["data"]["count"] == 1


async def test_join_is_idempotent_for_anonymous_session(db_session, async_client):
    cafe = await _make_cafe(db_session, "Idempotent Anon", is_lead_listing=True)
    body = {"sessionId": "anon-1", "contact": "9999999999"}

    await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist", json=body)
    await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist", json=body)

    resp = await async_client.get(f"/api/v1/cafes/{cafe.id}/waitlist/count")
    assert resp.json()["data"]["count"] == 1


async def test_distinct_sessions_count_separately(db_session, async_client):
    cafe = await _make_cafe(db_session, "Distinct Sessions", is_lead_listing=True)
    for i in range(3):
        await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist",
                                json={"sessionId": f"anon-{i}"})

    resp = await async_client.get(f"/api/v1/cafes/{cafe.id}/waitlist/count")
    assert resp.json()["data"]["count"] == 3


async def test_leave_removes_entry(db_session, async_client):
    cafe = await _make_cafe(db_session, "Leave Cafe", is_lead_listing=True)
    user = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()
    headers = auth_headers(user)

    await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist",
                            headers=headers, json={"sessionId": "s2"})
    resp = await async_client.request("DELETE", f"/api/v1/cafes/{cafe.id}/waitlist",
                                      headers=headers, json={"sessionId": "s2"})
    assert resp.status_code == 200, resp.text

    resp = await async_client.get(f"/api/v1/cafes/{cafe.id}/waitlist/count")
    assert resp.json()["data"]["count"] == 0


async def test_count_reports_joined_for_the_caller(db_session, async_client):
    cafe = await _make_cafe(db_session, "Joined Flag", is_lead_listing=True)
    user = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()
    headers = auth_headers(user)

    before = await async_client.get(f"/api/v1/cafes/{cafe.id}/waitlist/count",
                                    headers=headers, params={"sessionId": "s3"})
    assert before.json()["data"]["joined"] is False

    await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist",
                            headers=headers, json={"sessionId": "s3"})

    after = await async_client.get(f"/api/v1/cafes/{cafe.id}/waitlist/count",
                                   headers=headers, params={"sessionId": "s3"})
    assert after.json()["data"]["joined"] is True


async def test_count_is_not_thresholded_by_the_api(db_session, async_client):
    """The >=5 display rule belongs to the card. The API returns the real
    number so the owner-facing demand figure stays accurate."""
    cafe = await _make_cafe(db_session, "Below Threshold", is_lead_listing=True)
    for i in range(2):
        await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist",
                                json={"sessionId": f"low-{i}"})

    resp = await async_client.get(f"/api/v1/cafes/{cafe.id}/waitlist/count")
    assert resp.json()["data"]["count"] == 2
