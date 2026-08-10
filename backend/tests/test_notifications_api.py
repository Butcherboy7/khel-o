import pytest
from httpx import AsyncClient
from sqlalchemy import select
from app.main import app
from app.database import AsyncSessionLocal
from app.models import User, Notification, NotificationType
from app.core.security import create_access_token


@pytest.mark.asyncio
async def test_list_notifications_returns_200_for_authenticated_user():
    async with AsyncClient(app=app, base_url="http://test") as client:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).limit(1))
            user = result.scalar_one()
            token = create_access_token(subject=str(user.id), role=user.role)
            
            response = await client.get(
                "/api/v1/notifications",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            assert response.status_code == 200
            data = response.json()
            assert "items" in data
            assert "total" in data
            assert "unreadCount" in data


@pytest.mark.asyncio
async def test_unauthenticated_request_returns_401():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/v1/notifications")
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_mark_all_read_updates_unread_count():
    async with AsyncClient(app=app, base_url="http://test") as client:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).limit(1))
            user = result.scalar_one()
            token = create_access_token(subject=str(user.id), role=user.role)
            
            result = await client.post(
                "/api/v1/notifications/mark-all-read",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            assert result.status_code == 200
            
            response = await client.get(
                "/api/v1/notifications",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            data = response.json()
            assert data["unreadCount"] == 0


@pytest.mark.asyncio
async def test_get_unread_count_endpoint():
    async with AsyncClient(app=app, base_url="http://test") as client:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).limit(1))
            user = result.scalar_one()
            token = create_access_token(subject=str(user.id), role=user.role)
            
            response = await client.get(
                "/api/v1/notifications/unread-count",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            assert response.status_code == 200
            data = response.json()
            assert "unreadCount" in data
            assert isinstance(data["unreadCount"], int)
