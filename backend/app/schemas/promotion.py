import re
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from app.models.promotion import PromotionType

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
    promotion_type: PromotionType = PromotionType.PERCENTAGE
    # Exactly one of these three is populated, matching promotion_type — see
    # the cross-field validator below. All optional at the field level so a
    # fixed_price offer doesn't need a dummy discount_percentage etc.
    discount_percentage: Optional[int] = Field(None, ge=1, le=50)
    fixed_discount_amount: Optional[float] = Field(None, gt=0)
    fixed_price_amount: Optional[float] = Field(None, gt=0)
    # "4" in "4 hours for ₹360". Floor matches the booking system's own
    # 1-hour minimum duration (BookingBase.duration_hours, ge=1.0).
    min_duration_hours: Optional[float] = Field(None, ge=1.0, le=8.0)
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

    @model_validator(mode="after")
    def check_fields_match_type(self):
        if self.promotion_type == PromotionType.PERCENTAGE:
            if self.discount_percentage is None:
                raise ValueError("discount_percentage is required for a percentage offer")
            if self.fixed_discount_amount is not None or self.fixed_price_amount is not None or self.min_duration_hours is not None:
                raise ValueError("A percentage offer cannot also set fixed-amount/fixed-price fields")
        elif self.promotion_type == PromotionType.FIXED_AMOUNT:
            if self.fixed_discount_amount is None:
                raise ValueError("fixed_discount_amount is required for a fixed-amount-off offer")
            if self.discount_percentage is not None or self.fixed_price_amount is not None or self.min_duration_hours is not None:
                raise ValueError("A fixed-amount offer cannot also set percentage/fixed-price fields")
        elif self.promotion_type == PromotionType.FIXED_PRICE:
            if self.fixed_price_amount is None or self.min_duration_hours is None:
                raise ValueError("fixed_price_amount and min_duration_hours are required for a fixed-price deal")
            if self.discount_percentage is not None or self.fixed_discount_amount is not None:
                raise ValueError("A fixed-price offer cannot also set percentage/fixed-amount fields")
        return self

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class PromotionCreate(PromotionBase):
    cafe_id: UUID

PromotionCreateRequest = PromotionCreate

class PromotionUpdate(BaseModel):
    """Partial update. Cross-field type/value consistency (e.g. a fixed-price
    offer must keep fixed_price_amount + min_duration_hours populated) is
    checked in PromotionService.update_promotion against the MERGED
    (existing row + this patch) state, since any subset of fields may arrive
    here — see PromotionBase.check_fields_match_type for the create-time
    equivalent applied to a complete payload."""
    title: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    promotion_type: Optional[PromotionType] = None
    discount_percentage: Optional[int] = Field(None, ge=1, le=50)
    fixed_discount_amount: Optional[float] = Field(None, gt=0)
    fixed_price_amount: Optional[float] = Field(None, gt=0)
    min_duration_hours: Optional[float] = Field(None, ge=1.0, le=8.0)
    applicable_tier_id: Optional[UUID] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    days_of_week: Optional[List[int]] = None
    start_hour: Optional[int] = Field(None, ge=0, le=23)
    end_hour: Optional[int] = Field(None, ge=1, le=24)
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
    promotion_type: PromotionType = PromotionType.PERCENTAGE
    discount_percentage: Optional[int] = None
    fixed_discount_amount: Optional[float] = None
    fixed_price_amount: Optional[float] = None
    min_duration_hours: Optional[float] = None
    # Populated by the service (derived from the tier's hourly rate at read
    # time, never stored) only for FIXED_PRICE offers, so the client can show
    # "₹480 → ₹360, save ₹120" without doing the math itself.
    regular_price: Optional[float] = None
    savings_amount: Optional[float] = None
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
    promotion_type: PromotionType = PromotionType.PERCENTAGE
    discount_percentage: Optional[int] = None
    fixed_discount_amount: Optional[float] = None
    fixed_price_amount: Optional[float] = None
    min_duration_hours: Optional[float] = None
    regular_price: Optional[float] = None
    savings_amount: Optional[float] = None
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
