from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from uuid import UUID
from datetime import datetime, time
from app.models.cafe import VerificationStatus

def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

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
    photos: List[str] = Field(default_factory=list)

class CafeCreate(CafeBase):
    pass

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

class CafeResponse(CafeBase):
    id: UUID
    owner_id: UUID
    verification_status: VerificationStatus
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )

class CafeListResponse(BaseModel):
    items: List[CafeResponse]
    total: int
    page: int
    page_size: int

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )
