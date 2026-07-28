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
    seats_in_tier: int = Field(..., ge=1)
    price_per_hour: float = Field(..., ge=0.0)

class HardwareTierCreate(HardwareTierBase):
    cafe_id: UUID

class HardwareTierUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    specs: Optional[Dict[str, Any]] = None
    seats_in_tier: Optional[int] = Field(None, ge=1)
    price_per_hour: Optional[float] = Field(None, ge=0.0)
    is_active: Optional[bool] = None

class HardwareTierResponse(HardwareTierBase):
    id: UUID
    cafe_id: UUID
    is_active: bool
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
