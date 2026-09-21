import uuid
from unittest.mock import AsyncMock, patch
import pytest
from sqlalchemy import select

from app.models.notification import Notification
from app.models.user import UserRole
from app.services.cafe_notifier import CafeNotifier
from tests.conftest import create_test_user


async def _make_cafe_with_owner(db_session):
    from app.models.cafe import Cafe
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    cafe = Cafe(
        id=uuid.uuid4(),
        owner_id=owner.id,
        name="Test Cafe",
        address_line1="1 Test St",
        city="Hyderabad",
        # state and pincode are NOT NULL on cafes — omitting either makes every
        # test in this file fail at commit with an opaque IntegrityError.
        state="Telangana",
        pincode="500001",
        phone_number="+919876543210",
    )
    db_session.add(cafe)
    await db_session.commit()
    return cafe, owner


async def _add_staff(db_session, cafe, is_active=True):
    # cafe_id= makes create_test_user build the UserRoleMapping itself; adding
    # a second one by hand would give this user two mappings for one café.
    staff = await create_test_user(db_session, role=UserRole.STAFF, cafe_id=cafe.id)
    staff.is_active = is_active
    await db_session.commit()
    return staff


@pytest.mark.asyncio
async def test_resolves_owner_and_active_staff(db_session):
    cafe, owner = await _make_cafe_with_owner(db_session)
    staff = await _add_staff(db_session, cafe)
    recipients = await CafeNotifier().resolve_recipients(db_session, cafe.id)
    assert set(recipients) == {owner.id, staff.id}


@pytest.mark.asyncio
async def test_excludes_inactive_staff(db_session):
    cafe, owner = await _make_cafe_with_owner(db_session)
    await _add_staff(db_session, cafe, is_active=False)
    recipients = await CafeNotifier().resolve_recipients(db_session, cafe.id)
    assert recipients == [owner.id]


@pytest.mark.asyncio
async def test_excludes_staff_of_other_cafes(db_session):
    cafe_a, owner_a = await _make_cafe_with_owner(db_session)
    cafe_b, _ = await _make_cafe_with_owner(db_session)
    await _add_staff(db_session, cafe_b)
    recipients = await CafeNotifier().resolve_recipients(db_session, cafe_a.id)
    assert recipients == [owner_a.id]


@pytest.mark.asyncio
async def test_writes_one_notification_per_recipient(db_session):
    cafe, owner = await _make_cafe_with_owner(db_session)
    staff = await _add_staff(db_session, cafe)
    with patch.object(CafeNotifier, "_push", new=AsyncMock(return_value=0)):
        count = await CafeNotifier().notify_cafe(
            db_session, cafe.id, "New booking", "msg",
            notification_type="booking_confirmed", dedupe_key="booking_confirmed:abc",
        )
    assert count == 2
    rows = (await db_session.execute(
        select(Notification).where(Notification.user_id.in_([owner.id, staff.id]))
    )).scalars().all()
    assert {r.user_id for r in rows} == {owner.id, staff.id}


@pytest.mark.asyncio
async def test_same_dedupe_key_twice_writes_once_and_pushes_once(db_session):
    """Razorpay delivers payment.captured at-least-once and the client's own
    verify call races it. Both must not produce two alerts."""
    cafe, owner = await _make_cafe_with_owner(db_session)
    push_mock = AsyncMock(return_value=1)
    with patch.object(CafeNotifier, "_push", new=push_mock):
        first = await CafeNotifier().notify_cafe(
            db_session, cafe.id, "New booking", "msg", dedupe_key="booking_confirmed:xyz")
        second = await CafeNotifier().notify_cafe(
            db_session, cafe.id, "New booking", "msg", dedupe_key="booking_confirmed:xyz")
    assert first == 1
    assert second == 0
    # Filter to this test's owner: db_session is shared across the whole test
    # session (see conftest.py's session-scoped init_test_database), so an
    # unfiltered select(Notification) would also pick up rows from earlier
    # tests in this file.
    rows = (await db_session.execute(
        select(Notification).where(Notification.user_id == owner.id)
    )).scalars().all()
    assert len(rows) == 1
    assert push_mock.await_count == 1


@pytest.mark.asyncio
async def test_no_dedupe_key_always_writes(db_session):
    cafe, owner = await _make_cafe_with_owner(db_session)
    with patch.object(CafeNotifier, "_push", new=AsyncMock(return_value=0)):
        await CafeNotifier().notify_cafe(db_session, cafe.id, "A", "msg")
        await CafeNotifier().notify_cafe(db_session, cafe.id, "A", "msg")
    rows = (await db_session.execute(
        select(Notification).where(Notification.user_id == owner.id)
    )).scalars().all()
    assert len(rows) == 2


@pytest.mark.asyncio
async def test_push_failure_does_not_raise(db_session):
    """The caller is mid-payment. A push blowing up must not surface."""
    cafe, owner = await _make_cafe_with_owner(db_session)
    with patch.object(CafeNotifier, "_push", new=AsyncMock(side_effect=RuntimeError("boom"))):
        count = await CafeNotifier().notify_cafe(
            db_session, cafe.id, "A", "msg", dedupe_key="booking_confirmed:safe")
    assert count == 1


@pytest.mark.asyncio
async def test_unknown_cafe_is_a_no_op(db_session):
    with patch.object(CafeNotifier, "_push", new=AsyncMock(return_value=0)):
        count = await CafeNotifier().notify_cafe(db_session, uuid.uuid4(), "A", "msg")
    assert count == 0
