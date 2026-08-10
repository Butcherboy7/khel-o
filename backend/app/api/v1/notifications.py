import uuid
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Notification
from app.schemas.notification import (
    NotificationResponse,
    NotificationListResponse,
    MarkReadRequest,
    UnreadCountResponse
)
from app.api.deps import get_current_user
from app.models import User

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
