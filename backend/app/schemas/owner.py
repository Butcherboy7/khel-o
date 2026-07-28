from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime, date, time
from app.models.booking import BookingStatus

def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

class OwnerDashboardResponse(BaseModel):
    total_cafes: int
    total_bookings_this_month: int
    revenue_this_month: float
    upcoming_bookings_today: int
    occupancy_rate_this_week: float
    most_popular_tier: Optional[str] = None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class OwnerBookingItemResponse(BaseModel):
    id: UUID
    booking_reference: str
    gamer_id: UUID
    cafe_id: UUID
    hardware_tier_id: UUID
    session_date: date
    start_time: time
    end_time: time
    duration_hours: float
    base_amount: float
    discount_amount: float
    gateway_fee: float
    total_amount: float
    status: BookingStatus
    promotion_id: Optional[UUID] = None
    qr_code_url: Optional[str] = None
    notes: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancellation_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    gamer_name: str
    tier_name: str
    cafe_name: str

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )

class OwnerBookingListResponse(BaseModel):
    items: List[OwnerBookingItemResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )

class OwnerStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="Target status: 'completed' or 'no_show'")

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )
