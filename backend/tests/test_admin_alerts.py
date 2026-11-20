"""Every admin-actionable event pings the admins' phones through one helper."""
import pytest

from app.database import AsyncSessionLocal
from app.models.user import UserRole
from app.services import admin_alerts
from app.services.push_service import PushService

from tests.test_drops import _user


@pytest.mark.asyncio
async def test_alert_admins_pushes_to_every_admin_and_only_admins(monkeypatch):
    admin, gamer = await _user(UserRole.ADMIN), await _user()
    seen = {}

    async def fake(self, db, ids, payload):
        seen["ids"], seen["payload"] = ids, payload
        return len(ids)

    monkeypatch.setattr(PushService, "send_to_users", fake)
    async with AsyncSessionLocal() as db:
        n = await admin_alerts.alert_admins(db, "Hi", "There", "/admin/x")
    assert n >= 1 and str(admin.id) in {str(i) for i in seen["ids"]} and str(gamer.id) not in {str(i) for i in seen["ids"]}
    assert seen["payload"]["url"] == "/admin/x" and seen["payload"]["title"] == "Hi"


@pytest.mark.asyncio
async def test_alert_admins_never_raises(monkeypatch):
    async def boom(self, db, ids, payload):
        raise RuntimeError("push service down")

    monkeypatch.setattr(PushService, "send_to_users", boom)
    async with AsyncSessionLocal() as db:
        assert await admin_alerts.alert_admins(db, "Hi", "There") == 0
