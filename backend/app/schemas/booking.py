from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List, Any
from uuid import UUID
from datetime import datetime, date, time
from app.models.booking import BookingStatus

def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

class CancelPolicy(BaseModel):
    allowed: bool
    reason: str
    
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class BookingBase(BaseModel):
    cafe_id: UUID
    hardware_tier_id: UUID
    session_date: date
    start_time: time
    # Floor is the global 15-minute minimum; each setup's own
    # min_booking_minutes is enforced in booking_service.
    duration_hours: float = Field(..., ge=0.25, le=8.0)
    seats_count: int = Field(1, ge=1, le=6, description="Number of seats (consoles/units) this booking holds (1 to 6)")
    # People playing. Greater than seats_count = co-op on one console.
    players_count: Optional[int] = Field(None, ge=1, le=60)
    notes: Optional[str] = None
    promotion_id: Optional[UUID] = None
    # Alternative to promotion_id — the KHELO code the customer typed in or
    # arrived with via a /redeem QR deep link. booking_service resolves this
    # to a promotion_id (validating it belongs to this café) before running
    # it through the same atomic apply_promotion_to_booking path as a
    # directly-selected promotion_id. Mutually exclusive with promotion_id;
    # if both are somehow sent, promotion_id wins (see booking_service).
    promo_code: Optional[str] = Field(None, max_length=20)
    game: Optional[str] = Field(None, max_length=100)

    @field_validator("promotion_id", mode="before")
    @classmethod
    def parse_empty_uuid(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        return v

    @field_validator("promo_code", mode="before")
    @classmethod
    def parse_empty_code(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        return str(v).strip().upper()

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class BookingCreate(BookingBase):
    pass

BookingCreateRequest = BookingCreate

class BookingCancelRequest(BaseModel):
    reason: Optional[str] = None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class BookingUpdate(BaseModel):
    status: Optional[BookingStatus] = None
    notes: Optional[str] = None
    cancellation_reason: Optional[str] = None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class BookingResponse(BookingBase):
    id: UUID
    booking_reference: str
    gamer_id: UUID
    end_time: time
    # Overrides BookingBase's ge=1.0/le=8.0 — that constraint is a creation-time
    # business rule (min 1hr bookings), not something historical rows must satisfy.
    # Legacy bookings created before that rule existed can have duration < 1,
    # and this is a read-only schema — it must reflect stored data, not re-validate it.
    duration_hours: float
    base_amount: float
    discount_amount: float
    gateway_fee: float
    total_amount: float
    convenience_fee: float
    status: BookingStatus
    cafe_name: Optional[str] = None
    tier_name: Optional[str] = None
    cafe_address: Optional[str] = None
    qr_code_url: Optional[str] = None
    actual_start_time: Optional[datetime] = None
    actual_end_time: Optional[datetime] = None
    checked_in_by: Optional[UUID] = None
    checked_in_at: Optional[datetime] = None
    checkin_method: Optional[str] = None
    released_by: Optional[UUID] = None
    released_at: Optional[datetime] = None
    release_reason: Optional[str] = None
    cancel_policy: Optional[CancelPolicy] = None
    created_at: datetime
    updated_at: datetime


    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )

class BookingListResponse(BaseModel):
    items: List[BookingResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True
    )

class QuoteRequest(BaseModel):
    """What checkout sends whenever the slot/length/players/offer changes.
    Mirrors BookingBase but never creates anything — see
    BookingService.get_quote. session_date/start_time are needed (not just
    duration) because an offer's day-of-week/hour window is evaluated
    against the actual booked slot, not "now"."""
    cafe_id: UUID
    hardware_tier_id: UUID
    session_date: date
    start_time: time
    duration_hours: float = Field(..., ge=0.25, le=8.0)
    seats_count: int = Field(1, ge=1, le=6)
    players_count: Optional[int] = Field(None, ge=1, le=60)
    promotion_id: Optional[UUID] = None
    promo_code: Optional[str] = Field(None, max_length=20)

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )

class AppliedOffer(BaseModel):
    id: UUID
    title: str
    label: str  # e.g. "20% off", "deal price", "-₹60"

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

class OfferHint(BaseModel):
    """The best offer that ALMOST applied, and why not — so checkout can
    say "Happy Hour works on bookings of 1 hr or more" instead of just
    hiding the offer."""
    id: UUID
    title: str
    message: str
    # For a length shortfall: the booking length (minutes) that would unlock
    # the offer, so checkout can offer a one-tap "Make it 1 hr".
    suggested_minutes: Optional[int] = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

class OfferOption(BaseModel):
    """An offer that applies to exactly this slot, with what it would save,
    so checkout can list "tap to switch" choices without doing any math."""
    id: UUID
    title: str
    label: str
    discount_amount: float
    slots_remaining: Optional[int] = None
    when: Optional[str] = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

class QuoteResponse(BaseModel):
    base_amount: float
    discount_amount: float
    subtotal: float
    platform_fee: float
    total: float
    applied_offer: Optional[AppliedOffer] = None
    offer_hint: Optional[OfferHint] = None
    # Every offer valid for this slot, biggest saving first (the applied one
    # included), and a plain sentence when the offer/code the customer chose
    # could not be used ("This offer just ended.").
    available_offers: List[OfferOption] = []
    offer_note: Optional[str] = None
    allowed_minutes: List[int]
    # duration (minutes) -> base price at that length, for this tier/players/
    # co-op combo — lets a client show a length picker's prices without a
    # round trip per length.
    prices_by_minutes: dict[int, float]

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )
