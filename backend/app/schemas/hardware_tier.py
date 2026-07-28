from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime

def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

class HardwareTierBase(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = None
    specs: Dict[str, Any] = Field(default_factory=dict)
    seats_in_tier: int = Field(..., gt=0)
    price_per_hour: float = Field(..., gt=0.0)

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
    seats_in_tier: Optional[int] = Field(None, gt=0)
    price_per_hour: Optional[float] = Field(None, gt=0.0)
    is_active: Optional[bool] = None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

HardwareTierUpdateRequest = HardwareTierUpdate

class HardwareTierResponse(HardwareTierBase):
    id: UUID
    cafe_id: UUID
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
