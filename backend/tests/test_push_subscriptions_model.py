import uuid
import pytest
from sqlalchemy.exc import IntegrityError

from app.models.push_subscription import PushSubscription
from app.models.notification import Notification, NotificationType
from app.models.user import UserRole
from tests.conftest import create_test_user


async def _owner(db_session):
    """create_test_user only db.add()s — nothing exists until this commit."""
    user = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_push_subscription_endpoint_is_unique(db_session):
    user = await _owner(db_session)
    for _ in range(2):
        db_session.add(PushSubscription(
            id=uuid.uuid4(),
            user_id=user.id,
            endpoint="https://fcm.googleapis.com/fcm/send/AAA",
            p256dh_key="p256dh-value",
            auth_key="auth-value",
        ))
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_notification_dedupe_key_blocks_duplicate_per_user(db_session):
    user = await _owner(db_session)
    booking_id = uuid.uuid4()
    for _ in range(2):
        db_session.add(Notification(
            id=uuid.uuid4(),
            user_id=user.id,
            title="New booking confirmed",
            message="x",
            notification_type=NotificationType.BOOKING_CONFIRMED,
            dedupe_key=f"booking_confirmed:{booking_id}",
        ))
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_null_dedupe_keys_do_not_collide(db_session):
    """Every pre-existing notification row has a NULL dedupe_key. A plain
    unique index would treat them as duplicates on some engines; the partial
    index must let any number of them coexist."""
    user = await _owner(db_session)
    for _ in range(3):
        db_session.add(Notification(
            id=uuid.uuid4(),
            user_id=user.id,
            title="Legacy row",
            message="x",
            notification_type=NotificationType.SYSTEM,
        ))
    await db_session.commit()
