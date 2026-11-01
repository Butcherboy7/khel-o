"""HTTP basic auth over the whole dev site, without touching the shared Caddy.

Caddy fronts prod and dev from one file inside the prod checkout, so the gate
lives in the apps instead and is switched on only by DEV_GATE_USER and
DEV_GATE_PASSWORD (set in dev's .env.dev, never in git).

The browser shows its normal sign-in prompt on the first page. The frontend
middleware then sets the cookie below, so the app's own API calls (which use
the Authorization header for the login token) still get through.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
from typing import Optional

from starlette.requests import Request
from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config import settings

COOKIE = "khelo_dev_gate"

# Razorpay must reach the webhook, and the box's own health check must work.
OPEN_PATHS = ("/health", "/api/v1/payments/webhook")


def enabled() -> bool:
    return bool(settings.DEV_GATE_USER and settings.DEV_GATE_PASSWORD)


def cookie_value() -> str:
    """Same maths as frontend/src/middleware.ts: HMAC-SHA256(password, user)."""
    return hmac.new(
        settings.DEV_GATE_PASSWORD.encode(), settings.DEV_GATE_USER.encode(), hashlib.sha256
    ).hexdigest()


def basic_ok(header: Optional[str]) -> bool:
    if not header or not header.lower().startswith("basic "):
        return False
    try:
        user, _, password = base64.b64decode(header[6:].strip()).decode().partition(":")
    except Exception:
        return False
    return hmac.compare_digest(user, settings.DEV_GATE_USER) and hmac.compare_digest(
        password, settings.DEV_GATE_PASSWORD
    )


def allowed(path: str, authorization: Optional[str], cookie: Optional[str]) -> bool:
    if not enabled() or path in OPEN_PATHS:
        return True
    if cookie and hmac.compare_digest(cookie, cookie_value()):
        return True
    return basic_ok(authorization)


class DevGateMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not enabled():
            await self.app(scope, receive, send)
            return
        request = Request(scope)
        if allowed(request.url.path, request.headers.get("authorization"), request.cookies.get(COOKIE)):
            await self.app(scope, receive, send)
            return
        response = PlainTextResponse(
            "This is KHELO's private test site.", status_code=401,
            headers={"WWW-Authenticate": 'Basic realm="KHELO dev", charset="UTF-8"'},
        )
        await response(scope, receive, send)
