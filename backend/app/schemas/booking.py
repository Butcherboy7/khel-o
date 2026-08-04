from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List, Any
from uuid import UUID
from datetime import datetime, date, time
from app.models.booking import BookingStatus

def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

class BookingBase(BaseModel):
    cafe_id: UUID
    hardware_tier_id: UUID
    session_date: date
    start_time: time
    duration_hours: float = Field(..., ge=0.5, le=8.0)
    notes: Optional[str] = None
    promotion_id: Optional[UUID] = None

    @field_validator("promotion_id", mode="before")
    @classmethod
    def parse_empty_uuid(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        return v

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class BookingCreate(BookingBase):
    pass

BookingCreateRequest = BookingCreate

class BookingCancelRequest(BaseModel):
    reason: Optional[str] = None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class BookingUpdate(BaseModel):
    status: Optional[BookingStatus] = None
    notes: Optional[str] = None
    cancellation_reason: Optional[str] = None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class BookingResponse(BookingBase):
    id: UUID
    booking_reference: str
    gamer_id: UUID
    end_time: time
    base_amount: float
    discount_amount: float
    gateway_fee: float
    total_amount: float
    convenience_fee: float
    status: BookingStatus
    cafe_name: Optional[str] = None
    tier_name: Optional[str] = None
    cafe_address: Optional[str] = None
    qr_code_url: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancellation_reason: Optional[str] = None
    actual_start_time: Optional[datetime] = None
    actual_end_time: Optional[datetime] = None
    checkin_method: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )

class BookingListResponse(BaseModel):
    items: List[BookingResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )
