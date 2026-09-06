import pytest
from uuid import uuid4
from sqlalchemy import select
from app.models.user import User
from app.models.analytics_event import AnalyticsEvent


@pytest.mark.asyncio
async def test_register_persists_city_and_acquisition(async_client, db_session):
    email = f"newuser_{uuid4().hex[:8]}@test.com"
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "testpass123",
            "fullName": "New User",
            "city": "Hyderabad",
            "acquisitionSource": "whatsapp",
            "acquisitionMedium": "share",
            "acquisitionCampaign": "launch",
        },
    )
    assert resp.status_code == 201

    result = await db_session.execute(select(User).where(User.email == email))
    user = result.scalars().first()
    assert user.city == "Hyderabad"
    assert user.acquisition_source == "whatsapp"


@pytest.mark.asyncio
async def test_register_without_acquisition_fields_still_succeeds(async_client):
    email = f"newuser_{uuid4().hex[:8]}@test.com"
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "testpass123", "fullName": "New User"},
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_register_backfills_anonymous_session_events(async_client, db_session):
    session_id = f"sess-{uuid4().hex[:8]}"
    pre_signup_event = AnalyticsEvent(
        id=uuid4(), session_id=session_id, user_id=None,
        event_type="venue_viewed", event_metadata={},
    )
    db_session.add(pre_signup_event)
    await db_session.commit()

    email = f"newuser_{uuid4().hex[:8]}@test.com"
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "testpass123", "fullName": "New User", "sessionId": session_id},
    )
    assert resp.status_code == 201
    new_user_id = resp.json()["data"]["user"]["id"]

    await db_session.refresh(pre_signup_event)
    assert str(pre_signup_event.user_id) == new_user_id
