"""
Sentry initialization for FastAPI backend.
Captures unhandled exceptions and API errors.
"""
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from app.config import settings


def init_sentry():
    """Initialize Sentry SDK for error monitoring."""
    if not settings.SENTRY_DSN:
        return
    
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=1.0 if settings.ENVIRONMENT == "development" else 0.1,
        send_default_pii=True,
        integrations=[
            FastApiIntegration(),
            StarletteIntegration(),
        ],
        attach_stacktrace=True,
    )
