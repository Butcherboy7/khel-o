from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime, time
from app.models.cafe import VerificationStatus
from app.schemas.hardware_tier import HardwareTierResponse
from app.constants import validate_city

def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

def _parse_time_flexibly(v: Any) -> Any:
    if v == "" or v is None:
        return None
    if isinstance(v, str):
        v_clean = v.strip().upper()
        if "AM" in v_clean or "PM" in v_clean:
            try:
                return datetime.strptime(v_clean, "%I:%M %p").time()
            except ValueError:
                try:
                    return datetime.strptime(v_clean, "%I %p").time()
                except ValueError:
                    pass
    return v

class CafeBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None
    address_line1: str = Field(..., max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    city: str = Field(..., max_length=100)
    state: str = Field(..., max_length=100)
    pincode: str = Field(..., max_length=10)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    phone_number: str = Field(..., max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    opening_time: Optional[time] = None
    closing_time: Optional[time] = None
    total_seats: Optional[int] = Field(None, ge=1)
    amenities: List[str] = Field(default_factory=list)
    supported_games: List[str] = Field(default_factory=list)
    photos: List[str] = Field(default_factory=list)

    @field_validator("opening_time", "closing_time", mode="before")
    @classmethod
    def parse_time_flexibly(cls, v: Any) -> Any:
        return _parse_time_flexibly(v)

    @field_validator("city")
    @classmethod
    def _validate_city(cls, v: str) -> str:
        return validate_city(v)

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class CafeCreate(CafeBase):
    pass

CafeCreateRequest = CafeCreate

class CafeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    description: Optional[str] = None
    address_line1: Optional[str] = Field(None, max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    pincode: Optional[str] = Field(None, max_length=10)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    phone_number: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    opening_time: Optional[time] = None
    closing_time: Optional[time] = None
    total_seats: Optional[int] = Field(None, ge=1)
    amenities: Optional[List[str]] = None
    photos: Optional[List[str]] = None
    is_active: Optional[bool] = None

    @field_validator("city")
    @classmethod
    def _validate_city(cls, v: Optional[str]) -> Optional[str]:
        return validate_city(v) if v is not None else v

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

CafeUpdateRequest = CafeUpdate

class CafeVerifyRequest(BaseModel):
    status: VerificationStatus

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class CafeListItem(BaseModel):
    id: UUID
    name: str
    city: str
    state: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    average_rating: float = 0.0
    total_reviews: int = 0
    starting_price: Optional[float] = None
    tier_names: List[str] = Field(default_factory=list)
    platforms: List[str] = Field(default_factory=list)
    # True only when every active tier has a confirmed real platform. See
    # cafe_repository.py's computation and lib/platformTags.ts's consumer.
    platforms_complete: bool = False
    photos: List[str] = Field(default_factory=list)
    amenities: List[str] = Field(default_factory=list)
    has_active_promotion: bool = False
    verification_status: VerificationStatus
    is_active: bool
    opening_time: Optional[time] = None
    closing_time: Optional[time] = None

    @field_validator("opening_time", "closing_time", mode="before")
    @classmethod
    def parse_time_flexibly(cls, v: Any) -> Any:
        return _parse_time_flexibly(v)

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )

class CafeResponse(CafeBase):
    id: UUID
    owner_id: UUID
    verification_status: VerificationStatus
    is_active: bool
    is_emergency_mode: bool = False
    bookings_paused: bool = False
    average_rating: float = 0.0
    total_reviews: int = 0
    booking_cap_total: float = 0.0
    booking_cap_count: int = 0
    tiers: List[HardwareTierResponse] = Field(default_factory=list)
    active_promotions: List[Dict[str, Any]] = Field(default_factory=list)
    recent_reviews: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )

class CafeListResponse(BaseModel):
    items: List[CafeListItem]
    total: int
    page: int
    page_size: int
    total_pages: int

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )
