import uuid
from unittest.mock import patch
import pytest
from sqlalchemy import select
from pywebpush import WebPushException

from app.models.push_subscription import PushSubscription
from app.models.user import UserRole
from app.services.push_service import PushService
from tests.conftest import create_test_user


class _FakeResponse:
    def __init__(self, status_code):
        self.status_code = status_code
        self.text = "fake"


async def _add_sub(db_session, user, endpoint):
    sub = PushSubscription(
        id=uuid.uuid4(),
        user_id=user.id,
        endpoint=endpoint,
        p256dh_key="p256dh-value",
        auth_key="auth-value",
    )
    db_session.add(sub)
    await db_session.commit()
    return sub


@pytest.mark.asyncio
async def test_no_op_when_vapid_key_missing(db_session):
    user = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await _add_sub(db_session, user, "https://push.example/aaa")
    with patch("app.services.push_service.settings.VAPID_PRIVATE_KEY", ""):
        with patch("app.services.push_service.webpush") as mock_push:
            sent = await PushService().send_to_users(db_session, [user.id], {"title": "x"})
    assert sent == 0
    mock_push.assert_not_called()


@pytest.mark.asyncio
async def test_successful_send_counts_once_per_subscription(db_session):
    user = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await _add_sub(db_session, user, "https://push.example/bbb")
    await _add_sub(db_session, user, "https://push.example/ccc")
    with patch("app.services.push_service.settings.VAPID_PRIVATE_KEY", "fake-key"):
        with patch("app.services.push_service.webpush") as mock_push:
            sent = await PushService().send_to_users(db_session, [user.id], {"title": "x"})
    assert sent == 2
    assert mock_push.call_count == 2


@pytest.mark.asyncio
async def test_410_deletes_the_subscription(db_session):
    """410 Gone means the browser dropped this subscription permanently. Keeping
    the row would retry a dead endpoint on every future booking, forever."""
    user = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await _add_sub(db_session, user, "https://push.example/dead")
    with patch("app.services.push_service.settings.VAPID_PRIVATE_KEY", "fake-key"):
        with patch("app.services.push_service.webpush",
                   side_effect=WebPushException("gone", response=_FakeResponse(410))):
            sent = await PushService().send_to_users(db_session, [user.id], {"title": "x"})
    assert sent == 0
    rows = (await db_session.execute(select(PushSubscription).where(PushSubscription.user_id == user.id))).scalars().all()
    assert rows == []


@pytest.mark.asyncio
async def test_500_keeps_the_subscription(db_session):
    """A push service outage is transient. Deleting on 5xx would silently
    unsubscribe every owner during someone else's incident."""
    user = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await _add_sub(db_session, user, "https://push.example/flaky")
    with patch("app.services.push_service.settings.VAPID_PRIVATE_KEY", "fake-key"):
        with patch("app.services.push_service.webpush",
                   side_effect=WebPushException("boom", response=_FakeResponse(500))):
            sent = await PushService().send_to_users(db_session, [user.id], {"title": "x"})
    assert sent == 0
    rows = (await db_session.execute(select(PushSubscription).where(PushSubscription.user_id == user.id))).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_unexpected_exception_is_swallowed(db_session):
    user = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await _add_sub(db_session, user, "https://push.example/weird")
    with patch("app.services.push_service.settings.VAPID_PRIVATE_KEY", "fake-key"):
        with patch("app.services.push_service.webpush", side_effect=RuntimeError("nope")):
            sent = await PushService().send_to_users(db_session, [user.id], {"title": "x"})
    assert sent == 0
