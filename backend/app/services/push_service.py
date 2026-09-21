import asyncio
import json
from uuid import UUID

from pywebpush import webpush, WebPushException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.logging import logger
from app.models.push_subscription import PushSubscription

# Endpoints that answer with these are permanently gone, not temporarily
# unhappy. Anything else (429, 5xx, timeouts) is transient and must not cost
# the owner their subscription.
_DEAD_SUBSCRIPTION_STATUSES = {404, 410}

# A push service that hangs must not hold a payment request open.
_SEND_TIMEOUT_SECONDS = 5.0


class PushService:
    async def send_to_users(self, db: AsyncSession, user_ids: list[UUID], payload: dict) -> int:
        """Deliver `payload` to every registered device of every given user.

        Returns the number of successful sends. Never raises: callers sit in
        payment paths where a failed notification must not fail the booking.
        """
        if not user_ids:
            return 0

        if not settings.VAPID_PRIVATE_KEY:
            logger.warning(
                "push_disabled_no_vapid_key",
                message="VAPID_PRIVATE_KEY missing; skipping push. In-app notifications still written.",
            )
            return 0

        result = await db.execute(
            select(PushSubscription).where(PushSubscription.user_id.in_(user_ids))
        )
        subscriptions = result.scalars().all()
        if not subscriptions:
            return 0

        body = json.dumps(payload)
        try:
            outcomes = await asyncio.wait_for(
                asyncio.gather(
                    *(self._send_one(sub, body) for sub in subscriptions),
                    return_exceptions=True,
                ),
                timeout=_SEND_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.error("push_send_timeout", subscription_count=len(subscriptions))
            return 0

        sent = 0
        dead_endpoints: list[str] = []
        for sub, outcome in zip(subscriptions, outcomes):
            if outcome is True:
                sent += 1
            elif outcome == "dead":
                dead_endpoints.append(sub.endpoint)

        if dead_endpoints:
            await db.execute(
                delete(PushSubscription).where(PushSubscription.endpoint.in_(dead_endpoints))
            )
            await db.commit()
            logger.info("push_pruned_dead_subscriptions", count=len(dead_endpoints))

        return sent

    async def _send_one(self, sub: PushSubscription, body: str):
        """Returns True on success, the string "dead" if the subscription should
        be pruned, or False on a transient failure."""
        try:
            # pywebpush is requests-based and blocking. Called directly it would
            # stall the event loop inside whatever request triggered the booking.
            await asyncio.to_thread(
                webpush,
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh_key, "auth": sub.auth_key},
                },
                data=body,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_SUBJECT},
            )
            return True
        except WebPushException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in _DEAD_SUBSCRIPTION_STATUSES:
                return "dead"
            logger.warning("push_send_failed", status_code=status, error=str(e))
            return False
        except Exception as e:
            logger.error("push_send_unexpected_error", error=str(e))
            return False
