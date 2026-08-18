from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from uuid import UUID
from datetime import datetime


def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


class SupportTicketCreateRequest(BaseModel):
    subject: str = Field(..., min_length=3, max_length=255)
    description: str = Field(..., min_length=10, max_length=4000)
    category: str = Field(default="general", description="booking | payment | cafe | account | general")
    booking_id: Optional[UUID] = None
    cafe_id: Optional[UUID] = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SupportTicketUpdateRequest(BaseModel):
    status: Optional[str] = Field(None, description="open | in_progress | resolved | closed")
    priority: Optional[str] = Field(None, description="low | normal | high")
    admin_notes: Optional[str] = Field(None, max_length=4000)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SupportTicketResponse(BaseModel):
    id: UUID
    user_id: UUID
    subject: str
    description: str
    category: str
    status: str
    priority: str
    booking_id: Optional[UUID] = None
    cafe_id: Optional[UUID] = None
    admin_notes: Optional[str] = None
    resolved_by: Optional[UUID] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, alias_generator=to_camel, populate_by_name=True)


class PlatformSettingsResponse(BaseModel):
    commission_percentage: float
    support_email: str
    maintenance_mode: bool
    maintenance_message: Optional[str] = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, alias_generator=to_camel, populate_by_name=True)


class PlatformSettingsUpdateRequest(BaseModel):
    commission_percentage: Optional[float] = Field(None, ge=0, le=100)
    support_email: Optional[str] = None
    maintenance_mode: Optional[bool] = None
    maintenance_message: Optional[str] = Field(None, max_length=500)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
