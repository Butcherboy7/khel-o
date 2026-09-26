import pytest
from datetime import datetime, timezone, time
from uuid import uuid4

from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.analytics_event import AnalyticsEvent
from app.core.security import get_password_hash
from tests.conftest import auth_headers

URL = "/api/v1/admin/analytics/shares"


def _user(role=UserRole.GAMER, **kw):
    return User(
        id=uuid4(), email=f"{role.value}_{uuid4().hex[:8]}@test.com", full_name="T",
        password_hash=get_password_hash("testpass123"), role=role, is_active=True, **kw,
    )


def _ev(kind, sid, channel, at, cafe_id=None, context="cafe"):
    return AnalyticsEvent(
        id=uuid4(), session_id=f"s-{uuid4().hex}", event_type=kind, cafe_id=cafe_id,
        event_metadata={"sid": sid, "channel": channel, "context": context}, created_at=at,
    )


@pytest.mark.asyncio
async def test_share_report_counts_shares_opens_and_signups(async_client, db_session):
    admin, owner = _user(UserRole.ADMIN), _user(UserRole.CAFE_OWNER)
    db_session.add_all([admin, owner])
    await db_session.commit()
    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name=f"Share Café {uuid4().hex[:6]}", address_line1="1 St",
        city="Hyderabad", state="Telangana", pincode="500001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(10, 0), closing_time=time(23, 0), bookable_stations=5,
    )
    db_session.add(cafe)
    await db_session.commit()
    await db_session.refresh(cafe)

    at = datetime(2020, 8, 10, 12, tzinfo=timezone.utc)
    s1, s2 = uuid4().hex, uuid4().hex
    db_session.add_all([
        _ev("share_created", s1, "whatsapp", at, cafe.id),
        _ev("share_created", s2, "copy", at, cafe.id),
        _ev("share_opened", s1, "whatsapp", at),   # opened twice by two people
        _ev("share_opened", s1, "whatsapp", at),
        _ev("share_opened", "unknown-sid", "copy", at),  # stray sid: counted by channel, no café
        _user(acquisition_source="share", acquisition_medium="whatsapp", acquisition_campaign=cafe.slug, created_at=at),
    ])
    await db_session.commit()

    resp = await async_client.get(URL, params={"start": "2020-08-01", "end": "2020-08-31"}, headers=auth_headers(admin))
    assert resp.status_code == 200
    data = resp.json()["data"]

    assert data["totals"] == {"shares": 2, "opens": 3, "signups": 1, "bookings": 0}
    by_channel = {c["channel"]: c for c in data["byChannel"]}
    assert by_channel["whatsapp"]["shares"] == 1 and by_channel["whatsapp"]["opens"] == 2
    assert by_channel["whatsapp"]["signups"] == 1
    assert by_channel["copy"]["opens"] == 1

    row = next(c for c in data["byCafe"] if c["cafeId"] == str(cafe.id))
    assert (row["shares"], row["opens"], row["signups"]) == (2, 2, 1)
    assert row["cafeName"] == cafe.name


@pytest.mark.asyncio
async def test_share_events_accepted_publicly(async_client):
    for kind in ("share_created", "share_opened"):
        resp = await async_client.post(
            "/api/v1/analytics/events",
            json={"sessionId": "sx", "eventType": kind, "metadata": {"sid": "abc", "channel": "whatsapp"}},
        )
        assert resp.status_code == 204


@pytest.mark.asyncio
async def test_share_report_admin_only(async_client, db_session):
    gamer = _user()
    db_session.add(gamer)
    await db_session.commit()
    assert (await async_client.get(URL, headers=auth_headers(gamer))).status_code == 403
