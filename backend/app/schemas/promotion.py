import re
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List
from uuid import UUID
from datetime import datetime

def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

# 4-20 uppercase letters/digits — matches what the owner-side "Generate"
# button produces and what the customer-side redeem field/QR deep link
# accepts. Enforced here (not just DB-unique) so a malformed code never
# reaches the uniqueness check with a confusing DB error.
KHELO_CODE_PATTERN = re.compile(r"^[A-Z0-9]{4,20}$")

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
    khelo_code: Optional[str] = Field(None, max_length=20)

    @field_validator("khelo_code", mode="before")
    @classmethod
    def normalize_khelo_code(cls, v):
        if v is None or v == "":
            return None
        v = str(v).strip().upper()
        if not KHELO_CODE_PATTERN.match(v):
            raise ValueError("KHELO code must be 4-20 letters/digits (A-Z, 0-9)")
        return v

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
    khelo_code: Optional[str] = Field(None, max_length=20)

    @field_validator("khelo_code", mode="before")
    @classmethod
    def normalize_khelo_code(cls, v):
        if v is None or v == "":
            return None
        v = str(v).strip().upper()
        if not KHELO_CODE_PATTERN.match(v):
            raise ValueError("KHELO code must be 4-20 letters/digits (A-Z, 0-9)")
        return v

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

class CodeRedemptionResponse(BaseModel):
    """Public preview returned when a customer types/scans a KHELO code —
    enough to show them what they're about to get and let the booking wizard
    prefill+validate the code, without exposing owner-only management fields.
    Includes the same schedule-window fields ActivePromotionResponse does so
    the client can run the identical day/hour eligibility check against
    whatever session slot the customer ends up picking (see
    PromotionService._is_promotion_active — `valid` here only reflects
    is_active/date-range/max_uses, not the schedule window, for the same
    reason apply_promotion_to_booking checks the window against the booked
    session time rather than "now")."""
    promotion_id: UUID
    cafe_id: UUID
    title: str
    description: Optional[str] = None
    discount_percentage: int
    applicable_tier_id: Optional[UUID] = None
    valid_from: datetime
    valid_until: datetime
    days_of_week: List[int]
    start_hour: int
    end_hour: int
    max_uses: Optional[int] = None
    current_uses: int
    valid: bool
    reason: Optional[str] = None

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
