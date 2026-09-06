import pytest
from sqlalchemy import select
from app.models.analytics_event import AnalyticsEvent


@pytest.mark.asyncio
async def test_post_event_unauthenticated_succeeds(async_client, db_session):
    resp = await async_client.post(
        "/api/v1/analytics/events",
        json={"sessionId": "sess-abc", "eventType": "search_performed", "metadata": {"resultCount": 0}},
    )
    assert resp.status_code == 204

    result = await db_session.execute(select(AnalyticsEvent).where(AnalyticsEvent.session_id == "sess-abc"))
    row = result.scalars().first()
    assert row is not None
    assert row.event_type == "search_performed"
    assert row.event_metadata["resultCount"] == 0


@pytest.mark.asyncio
async def test_post_event_rejects_unknown_event_type(async_client):
    resp = await async_client.post(
        "/api/v1/analytics/events",
        json={"sessionId": "sess-abc", "eventType": "not_a_real_event"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_post_event_rejects_oversized_metadata(async_client):
    resp = await async_client.post(
        "/api/v1/analytics/events",
        json={"sessionId": "sess-abc", "eventType": "venue_viewed", "metadata": {"pad": "x" * 3000}},
    )
    assert resp.status_code == 422
