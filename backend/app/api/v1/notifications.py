import uuid
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, func, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Notification
from app.schemas.notification import (
    NotificationResponse,
    NotificationListResponse,
    MarkReadRequest,
    UnreadCountResponse,
    PushSubscribeRequest,
    PushUnsubscribeRequest,
    VapidKeyResponse,
)
from app.api.deps import get_current_user
from app.models import User
from app.config import settings
from app.models.push_subscription import PushSubscription

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    notifications = result.scalars().all()
    
    total_result = await db.execute(
        select(func.count(Notification.id)).where(Notification.user_id == current_user.id)
    )
    total = total_result.scalar()
    
    unread_result = await db.execute(
        select(func.count(Notification.id)).where(
            and_(Notification.user_id == current_user.id, Notification.is_read == False)
        )
    )
    unread_count = unread_result.scalar()
    
    return NotificationListResponse(
        items=[NotificationResponse.from_orm(n) for n in notifications],
        total=total,
        unread_count=unread_count,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(func.count(Notification.id)).where(
            and_(Notification.user_id == current_user.id, Notification.is_read == False)
        )
    )
    count = result.scalar() or 0
    return UnreadCountResponse(unread_count=count)


@router.post("/{notification_id}/read")
async def mark_as_read(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.id == notification_id,
                Notification.user_id == current_user.id
            )
        )
    )
    notification = result.scalar_one_or_none()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.is_read = True
    await db.commit()
    return {"status": "ok"}


@router.post("/mark-all-read")
async def mark_all_as_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.user_id == current_user.id,
                Notification.is_read == False
            )
        )
    )
    notifications = result.scalars().all()
    
    for notification in notifications:
        notification.is_read = True
    
    await db.commit()
    
    return {
        "status": "ok",
        "marked_count": len(notifications)
    }


@router.delete("/clear-all")
async def clear_all_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(Notification.user_id == current_user.id)
    )
    notifications = result.scalars().all()

    for notification in notifications:
        await db.delete(notification)

    await db.commit()

    return {
        "status": "ok",
        "deleted_count": len(notifications)
    }


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.id == notification_id,
                Notification.user_id == current_user.id
            )
        )
    )
    notification = result.scalar_one_or_none()

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    await db.delete(notification)
    await db.commit()

    return {"status": "ok"}


@router.get("/push/vapid-key", response_model=VapidKeyResponse)
async def get_vapid_public_key(current_user: User = Depends(get_current_user)):
    """Served rather than baked into the frontend build as NEXT_PUBLIC_*, so the
    key is not welded into a container image."""
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Push notifications are not configured on this server.",
        )
    return VapidKeyResponse(publicKey=settings.VAPID_PUBLIC_KEY)


@router.post("/push/subscribe")
async def subscribe_to_push(
    payload: PushSubscribeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint)
    )).scalars().first()

    now = datetime.now(timezone.utc)
    user_agent = (request.headers.get("user-agent") or "")[:255]

    if existing:
        # Same browser re-subscribing, typically after a key rotation. Re-point
        # it at the current user in case the device changed hands.
        existing.user_id = current_user.id
        existing.p256dh_key = payload.keys.p256dh
        existing.auth_key = payload.keys.auth
        existing.user_agent = user_agent
        existing.last_seen_at = now
    else:
        db.add(PushSubscription(
            id=uuid.uuid4(),
            user_id=current_user.id,
            endpoint=payload.endpoint,
            p256dh_key=payload.keys.p256dh,
            auth_key=payload.keys.auth,
            user_agent=user_agent,
            created_at=now,
            last_seen_at=now,
        ))

    await db.commit()
    return {"status": "subscribed"}


@router.delete("/push/unsubscribe")
async def unsubscribe_from_push(
    payload: PushUnsubscribeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (await db.execute(
        select(PushSubscription).where(
            PushSubscription.endpoint == payload.endpoint,
            PushSubscription.user_id == current_user.id,
        )
    )).scalars().first()

    if not existing:
        raise HTTPException(status_code=404, detail="Subscription not found.")

    await db.execute(delete(PushSubscription).where(PushSubscription.id == existing.id))
    await db.commit()
    return {"status": "unsubscribed"}
