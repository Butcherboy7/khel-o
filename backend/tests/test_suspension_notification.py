import pytest
from unittest.mock import patch, AsyncMock
from uuid import uuid4


@pytest.mark.asyncio
async def test_suspend_cafe_sends_owner_notification_only_on_success(async_client, db_session):
    from tests.test_admin_v2_features import _make_admin
    from app.models.user import User
    from app.models.cafe import Cafe, VerificationStatus
    from app.core.security import get_password_hash
    from tests.conftest import auth_headers

    admin = await _make_admin(db_session)
    owner = User(
        id=uuid4(),
        email="owner_suspend@test.com",
        full_name="Owner Test",
        password_hash=get_password_hash("testpass123"),
        is_active=True,
    )
    db_session.add(owner)
    await db_session.flush()
    cafe = Cafe(
        id=uuid4(),
        owner_id=owner.id, name="Test Cafe", address_line1="1 Main St", city="City",
        state="State", pincode="123456", phone_number="9999999999",
        verification_status=VerificationStatus.VERIFIED,
    )
    db_session.add(cafe)
    await db_session.commit()

    headers = auth_headers(admin, is_admin=True)

    with patch("app.services.notification_service.NotificationService.send_cafe_suspended", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = True
        resp = await async_client.patch(
            f"/api/v1/admin/cafes/{cafe.id}/suspend",
            json={"reason": "Multiple verified fraud complaints from customers"},
            headers=headers,
        )
        assert resp.status_code == 200
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args
        assert str(cafe.id) in str(call_kwargs)


@pytest.mark.asyncio
async def test_suspend_cafe_does_not_notify_on_not_found(async_client, db_session):
    from tests.test_admin_v2_features import _make_admin
    import uuid
    from tests.conftest import auth_headers

    admin = await _make_admin(db_session)
    headers = auth_headers(admin, is_admin=True)

    with patch("app.services.notification_service.NotificationService.send_cafe_suspended", new_callable=AsyncMock) as mock_send:
        resp = await async_client.patch(
            f"/api/v1/admin/cafes/{uuid.uuid4()}/suspend",
            json={"reason": "Multiple verified fraud complaints from customers"},
            headers=headers,
        )
        assert resp.status_code == 404
        mock_send.assert_not_called()
