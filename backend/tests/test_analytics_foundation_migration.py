import pytest
from uuid import uuid4
from sqlalchemy import select
from app.models.user import User, UserRole
from app.models.booking import Booking
from app.models.analytics_event import AnalyticsEvent
from app.core.security import get_password_hash


@pytest.mark.asyncio
async def test_user_has_acquisition_columns(db_session):
    user = User(
        id=uuid4(),
        email=f"acq_{uuid4().hex[:8]}@test.com",
        full_name="Acq Test",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.GAMER,
        is_active=True,
        city="Hyderabad",
        acquisition_source="whatsapp",
        acquisition_medium="share",
        acquisition_campaign="launch",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    assert user.city == "Hyderabad"
    assert user.acquisition_source == "whatsapp"
    assert user.acquisition_medium == "share"
    assert user.acquisition_campaign == "launch"


@pytest.mark.asyncio
async def test_analytics_event_roundtrip(db_session):
    event = AnalyticsEvent(
        id=uuid4(),
        session_id="sess-123",
        user_id=None,
        event_type="search_performed",
        cafe_id=None,
        event_metadata={"city": "Hyderabad", "result_count": 0},
    )
    db_session.add(event)
    await db_session.commit()
    await db_session.refresh(event)

    result = await db_session.execute(
        select(AnalyticsEvent).where(AnalyticsEvent.session_id == "sess-123")
    )
    fetched = result.scalars().first()
    assert fetched is not None
    assert fetched.event_type == "search_performed"
    assert fetched.event_metadata["result_count"] == 0
    assert fetched.user_id is None
