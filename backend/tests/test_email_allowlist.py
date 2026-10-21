"""Outside production, email only goes to EMAIL_ALLOWLIST (dev runs on a copy of real users)."""
import pytest

from app.config import settings
from app.services import notification_service as ns


@pytest.mark.parametrize(
    "env, allowlist, to, expected",
    [
        ("production", "", "someone@gmail.com", True),
        ("development", "", "someone@gmail.com", False),
        ("development", "qa@khel-o.com", "QA@khel-o.com", True),
        ("development", "qa@khel-o.com", "other@khel-o.com", False),
        ("development", "@khel-o.com, test@example.com", "other@khel-o.com", True),
        ("development", "@khel-o.com", "x@notkhel-o.com", False),
        ("staging", "@example.com", "test@example.com", True),
    ],
)
def test_email_allowed(monkeypatch, env, allowlist, to, expected):
    monkeypatch.setattr(settings, "ENVIRONMENT", env)
    monkeypatch.setattr(settings, "EMAIL_ALLOWLIST", allowlist)
    assert ns.email_allowed(to) is expected


@pytest.mark.asyncio
async def test_held_email_never_reaches_a_provider(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "EMAIL_ALLOWLIST", "")
    calls = []

    async def provider(self, *args):
        calls.append(args)
        return True

    monkeypatch.setattr(ns.NotificationService, "_send_via_ses", provider)
    monkeypatch.setattr(ns.NotificationService, "_send_via_resend", provider)
    assert await ns.NotificationService()._send_resend_email("real.person@gmail.com", "Hi", "<p>x</p>", "REF") is True
    assert calls == []
