from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime, date, time
from app.models.cafe import VerificationStatus
from app.models.user import UserRole
from app.models.booking import BookingStatus
from app.schemas.cafe import CafeResponse
from app.schemas.user import UserResponse

def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

class AdminAnalyticsResponse(BaseModel):
    total_cafes: int
    cafes_by_status: Dict[str, int]
    total_users: int
    users_by_role: Dict[str, int]
    total_bookings_this_month: int
    total_revenue_this_month: float
    total_bookings_all_time: int
    total_revenue_all_time: float
    top_cafes_this_month: List[Dict[str, Any]]

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class AdminCafeListItem(CafeResponse):
    owner_email: str

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )

class AdminCafeDetailResponse(CafeResponse):
    business_pan: Optional[str] = None
    gstin: Optional[str] = None
    legal_document_url: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_ifsc: Optional[str] = None
    account_holder_name: Optional[str] = None
    cancellation_policy: Optional[str] = None
    house_rules: List[str] = Field(default_factory=list)
    social_links: Dict[str, Any] = Field(default_factory=dict)
    draft_data: Dict[str, Any] = Field(default_factory=dict)
    owner: Optional[UserResponse] = None

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )

class UserRoleUpdateRequest(BaseModel):
    role: str = Field(..., description="Target role: 'gamer', 'cafe_owner', or 'admin'")

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class CafeVerifyAdminRequest(BaseModel):
    status: VerificationStatus
    reason: Optional[str] = None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class AdminBookingListItem(BaseModel):
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
    created_at: datetime
    updated_at: datetime

    gamer_email: str
    gamer_name: str
    cafe_name: str
    tier_name: str

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )
