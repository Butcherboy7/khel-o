"""Dev site gate (basic auth) and the dev-database anonymizer's prod guards."""
import base64
import importlib.util
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.core import dev_gate
from app.main import app


def _basic(user: str, password: str) -> str:
    return "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()


@pytest.fixture
def gate_on(monkeypatch):
    monkeypatch.setattr(settings, "DEV_GATE_USER", "khelo")
    monkeypatch.setattr(settings, "DEV_GATE_PASSWORD", "long-random-test-value")


def test_gate_is_off_without_settings(monkeypatch):
    monkeypatch.setattr(settings, "DEV_GATE_USER", "")
    monkeypatch.setattr(settings, "DEV_GATE_PASSWORD", "")
    assert dev_gate.allowed("/api/v1/cafes", None, None)


def test_gate_rules(gate_on):
    assert not dev_gate.allowed("/api/v1/cafes", None, None)
    assert not dev_gate.allowed("/docs", _basic("khelo", "wrong"), None)
    assert dev_gate.allowed("/docs", _basic("khelo", "long-random-test-value"), None)
    assert dev_gate.allowed("/api/v1/cafes", "Bearer abc", dev_gate.cookie_value())
    assert not dev_gate.allowed("/api/v1/cafes", "Bearer abc", "forged")
    # Razorpay and the health check must always get through.
    assert dev_gate.allowed("/health", None, None)
    assert dev_gate.allowed("/api/v1/payments/webhook", None, None)


@pytest.mark.asyncio
async def test_gate_middleware_blocks_and_opens(gate_on):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/v1/auth/form-ticket")
        assert r.status_code == 401
        assert r.headers["www-authenticate"].startswith("Basic")
        r = await c.get("/api/v1/auth/form-ticket", headers={"Authorization": _basic("khelo", "long-random-test-value")})
        assert r.status_code == 200
        c.cookies.set(dev_gate.COOKIE, dev_gate.cookie_value())
        r = await c.get("/api/v1/auth/form-ticket")
        assert r.status_code == 200
        assert (await c.get("/health")).status_code == 200


def test_cookie_matches_frontend_maths(gate_on):
    import hashlib
    import hmac
    assert dev_gate.cookie_value() == hmac.new(b"long-random-test-value", b"khelo", hashlib.sha256).hexdigest()


def _anonymizer():
    path = Path(__file__).resolve().parent.parent / "scripts" / "anonymize_dev_db.py"
    spec = importlib.util.spec_from_file_location("anonymize_dev_db", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


DEV_URL = "postgresql+asyncpg://khelo_dev:x@postgres:5432/khel_o_dev_db"


@pytest.mark.parametrize("env,url,site", [
    ("production", DEV_URL, "https://dev.khel-o.com"),
    ("development", "postgresql+asyncpg://khelo:x@postgres:5432/khel_o_db", "https://dev.khel-o.com"),
    ("development", "postgresql+asyncpg://khelo:x@khel_o_postgres:5432/khel_o_dev_db", "https://dev.khel-o.com"),
    ("development", "postgresql+asyncpg://khelo:x@postgres:5432/khelo", "https://dev.khel-o.com"),
    ("development", DEV_URL, "https://khel-o.com"),
])
def test_anonymizer_refuses_anything_like_prod(monkeypatch, env, url, site):
    monkeypatch.setenv("CONFIRM", "anonymize-dev")
    with pytest.raises(SystemExit):
        _anonymizer().guard_settings(env, url, site)


def test_anonymizer_needs_confirm_and_allows_dev(monkeypatch):
    mod = _anonymizer()
    monkeypatch.delenv("CONFIRM", raising=False)
    with pytest.raises(SystemExit):
        mod.guard_settings("development", DEV_URL, "https://dev.khel-o.com")
    monkeypatch.setenv("CONFIRM", "anonymize-dev")
    mod.guard_settings("development", DEV_URL, "https://dev.khel-o.com")  # no exit
