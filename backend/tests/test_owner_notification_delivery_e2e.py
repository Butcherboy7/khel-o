"""End-to-end proof that a real notification trigger (CafeNotifier.notify_cafe,
the shared path every booking/payment event goes through) actually reaches the
correct café owner's push subscription -- and only that owner's -- with
nothing mocked below the pywebpush call itself. Existing tests either mock
CafeNotifier._push entirely (test_cafe_notifier.py) or exercise PushService in
isolation (test_push_service.py); this ties the two together."""
import uuid
from unittest.mock import Mock, patch

import pytest
from sqlalchemy import select, delete

from app.models.notification import Notification
from app.models.push_subscription import PushSubscription
from app.models.user import UserRole
from app.services.cafe_notifier import CafeNotifier
from tests.conftest import create_test_user


@pytest.fixture(autouse=True)
async def _cleanup_push_subscriptions(db_session):
    # test_push_api.py asserts unfiltered `select(PushSubscription)` counts
    # against the shared session-scoped test DB -- leaving rows behind here
    # would break those tests when run in the same session.
    yield
    await db_session.execute(
        delete(PushSubscription).where(PushSubscription.endpoint.like("https://push.example.com/%"))
    )
    await db_session.commit()


async def _cafe_with_owner_and_subscription(db_session, endpoint_suffix):
    from app.models.cafe import Cafe
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    cafe = Cafe(
        id=uuid.uuid4(), owner_id=owner.id, name="Cafe", address_line1="1 St",
        city="Hyderabad", state="Telangana", pincode="500001", phone_number="+919876543210",
    )
    db_session.add(cafe)
    sub = PushSubscription(
        id=uuid.uuid4(), user_id=owner.id,
        endpoint=f"https://push.example.com/{endpoint_suffix}",
        p256dh_key="p256dh", auth_key="auth",
    )
    db_session.add(sub)
    await db_session.commit()
    return cafe, owner, sub


@pytest.mark.asyncio
async def test_booking_confirmed_pushes_only_to_that_cafes_owner(db_session):
    cafe_a, owner_a, sub_a = await _cafe_with_owner_and_subscription(db_session, "owner-a")
    cafe_b, owner_b, sub_b = await _cafe_with_owner_and_subscription(db_session, "owner-b")

    with patch("app.services.push_service.settings.VAPID_PRIVATE_KEY", "fake-key"), \
         patch("app.services.push_service.webpush", new=Mock()) as mock_webpush:
        # Simulate what payment_service.py actually calls on booking confirmation.
        count = await CafeNotifier().notify_cafe(
            db_session, cafe_a.id, "New booking", "A gamer booked a slot",
            dedupe_key="booking_confirmed:test-e2e",
        )

    assert count == 1

    # In-app row landed on the right owner only.
    rows_a = (await db_session.execute(
        select(Notification).where(Notification.user_id == owner_a.id)
    )).scalars().all()
    rows_b = (await db_session.execute(
        select(Notification).where(Notification.user_id == owner_b.id)
    )).scalars().all()
    assert len(rows_a) == 1
    assert len(rows_b) == 0

    # Real push call happened, addressed to owner A's subscription endpoint,
    # never owner B's -- proves the pipeline resolves the correct recipient's
    # actual device, not just "a" recipient.
    assert mock_webpush.call_count == 1
    called_endpoint = mock_webpush.call_args.kwargs["subscription_info"]["endpoint"]
    assert called_endpoint == sub_a.endpoint
    assert called_endpoint != sub_b.endpoint


@pytest.mark.asyncio
async def test_no_push_reaches_owner_when_vapid_unconfigured(db_session):
    """Documents the real degrade-path: with no VAPID key (the default in
    every env unless explicitly configured), an owner gets the in-app row but
    zero push -- confirming push is not silently 'working' by default."""
    cafe, owner, _sub = await _cafe_with_owner_and_subscription(db_session, "no-vapid")

    with patch("app.services.push_service.settings.VAPID_PRIVATE_KEY", ""), \
         patch("app.services.push_service.webpush", new=Mock()) as mock_webpush:
        count = await CafeNotifier().notify_cafe(
            db_session, cafe.id, "New booking", "msg", dedupe_key="booking_confirmed:no-vapid"
        )

    assert count == 1
    assert mock_webpush.call_count == 0
