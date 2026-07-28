from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from uuid import UUID
from datetime import datetime

def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

class PromotionBase(BaseModel):
    title: str = Field(..., max_length=255)
    description: Optional[str] = None
    discount_percentage: int = Field(..., ge=1, le=50)
    applicable_tier_id: Optional[UUID] = None
    valid_from: datetime
    valid_until: datetime
    days_of_week: List[int] = Field(default_factory=list)
    start_hour: int = Field(..., ge=0, le=23)
    end_hour: int = Field(..., ge=1, le=24)
    max_uses: Optional[int] = Field(None, ge=1)

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class PromotionCreate(PromotionBase):
    cafe_id: UUID

PromotionCreateRequest = PromotionCreate

class PromotionUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    discount_percentage: Optional[int] = Field(None, ge=1, le=50)
    valid_until: Optional[datetime] = None
    max_uses: Optional[int] = Field(None, ge=1)
    is_active: Optional[bool] = None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

PromotionUpdateRequest = PromotionUpdate

class PromotionResponse(PromotionBase):
    id: UUID
    cafe_id: UUID
    current_uses: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )

class ActivePromotionResponse(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    discount_percentage: int
    applicable_tier_name: Optional[str] = None
    valid_until: datetime
    start_hour: int
    end_hour: int
    days_of_week: List[int]
    slots_remaining: Optional[int] = None

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )

class PromotionListResponse(BaseModel):
    items: List[PromotionResponse]
    total: int
    page: int
    page_size: int

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )
