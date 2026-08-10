from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from app.models.notification import NotificationType


def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


class NotificationBase(BaseModel):
    title: str
    message: str
    notification_type: NotificationType
    link: Optional[str] = None


class NotificationCreate(NotificationBase):
    user_id: UUID


class NotificationResponse(NotificationBase):
    id: UUID
    is_read: bool
    created_at: datetime
    
    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )


class NotificationListResponse(BaseModel):
    items: List[NotificationResponse]
    total: int
    unread_count: int
    
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )


class MarkReadRequest(BaseModel):
    notification_ids: List[UUID]


class UnreadCountResponse(BaseModel):
    unread_count: int
    
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )
