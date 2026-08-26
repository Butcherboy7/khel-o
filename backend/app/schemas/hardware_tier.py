from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime
from app.models.hardware_tier import PlatformType

def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

class HardwareTierBase(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    specs: Dict[str, Any] = Field(default_factory=dict)
    total_seats: int = Field(..., gt=0)
    app_bookable_seats: int = Field(..., ge=0)
    reserved_walkin_seats: Optional[int] = Field(None, ge=0)
    preset_category: Optional[str] = Field(None, max_length=50)
    price_per_hour: float = Field(..., gt=0.0)
    platform: Optional[PlatformType] = None
    model: Optional[str] = Field(None, max_length=100)

    @model_validator(mode='after')
    def validate_seats(self) -> 'HardwareTierBase':
        if self.app_bookable_seats > self.total_seats:
            self.app_bookable_seats = self.total_seats
        if self.reserved_walkin_seats is None or (self.app_bookable_seats + self.reserved_walkin_seats != self.total_seats):
            self.reserved_walkin_seats = max(0, self.total_seats - self.app_bookable_seats)
        return self

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class HardwareTierCreate(HardwareTierBase):
    pass

HardwareTierCreateRequest = HardwareTierCreate

class HardwareTierUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    specs: Optional[Dict[str, Any]] = None
    total_seats: Optional[int] = Field(None, gt=0)
    app_bookable_seats: Optional[int] = Field(None, ge=0)
    reserved_walkin_seats: Optional[int] = Field(None, ge=0)
    active_seats_count: Optional[int] = Field(None, ge=0)
    preset_category: Optional[str] = Field(None, max_length=50)
    price_per_hour: Optional[float] = Field(None, gt=0.0)
    is_active: Optional[bool] = None
    platform: Optional[PlatformType] = None
    model: Optional[str] = Field(None, max_length=100)

    @model_validator(mode='after')
    def validate_seats_update(self) -> 'HardwareTierUpdate':
        total = self.total_seats
        bookable = self.app_bookable_seats
        walkin = self.reserved_walkin_seats
        if total is not None and bookable is not None and walkin is not None:
            if bookable + walkin != total:
                raise ValueError("totalSeats must equal appBookableSeats + reservedWalkinSeats")
        elif total is not None and bookable is not None and bookable > total:
            raise ValueError("appBookableSeats cannot exceed totalSeats")
        return self

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

HardwareTierUpdateRequest = HardwareTierUpdate

class HardwareTierResponse(HardwareTierBase):
    id: UUID
    cafe_id: UUID
    reserved_walkin_seats: int = 0
    active_seats_count: int
    performance_rating: Optional[float] = None
    warning: Optional[str] = None
    is_active: bool
    active_promotion: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )

class HardwareTierListResponse(BaseModel):
    items: List[HardwareTierResponse]
    total: int
    page: int
    page_size: int

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )
