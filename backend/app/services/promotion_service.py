import logging
from typing import List, Optional
from uuid import UUID, uuid4
from decimal import Decimal
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.repositories.promotion_repository import PromotionRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.schemas.promotion import (
    PromotionCreateRequest,
    PromotionUpdateRequest,
    PromotionResponse,
    ActivePromotionResponse,
    CodeRedemptionResponse
)
from app.models.promotion import Promotion, PromotionType
from app.models.booking import Booking
from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException
from app.core.time import IST
from app.core.duration import allowed_minutes
from app.services.pricing_service import base_price_for_minutes

logger = logging.getLogger(__name__)


def _format_hour_12h(hour: int) -> str:
    """0-24 (Promotion.start_hour/end_hour's storage format) -> "12 AM".."12 AM",
    matching the 24-value shown as midnight-of-next-day for end_hour."""
    h = hour % 24
    suffix = "AM" if h < 12 else "PM"
    display = h % 12
    if display == 0:
        display = 12
    return f"{display} {suffix}"


_DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def offer_label(promo: Promotion) -> str:
    """The one short phrase for an offer, used on cards, the café page and
    checkout so they can never disagree."""
    if promo.promotion_type == PromotionType.FIXED_PRICE:
        hrs = float(promo.min_duration_hours or 0)
        length = f"{round(hrs * 60)} min" if hrs and hrs < 1 else f"{hrs:g} hr"
        return f"\u20b9{float(promo.fixed_price_amount):g} for {length}"
    if promo.promotion_type == PromotionType.FIXED_AMOUNT:
        return f"\u20b9{float(promo.fixed_discount_amount):g} off"
    return f"{promo.discount_percentage}% off"


def schedule_text(promo: Promotion) -> Optional[str]:
    """"Weekdays \u00b7 6 PM\u20139 PM", or None when it runs every day, all day."""
    days = sorted(set(promo.days_of_week or []))
    if len(days) == 7:
        day_part = None
    elif days == [0, 1, 2, 3, 4]:
        day_part = "Weekdays"
    elif days == [5, 6]:
        day_part = "Weekends"
    else:
        day_part = ", ".join(_DAY_ABBR[d] for d in days if 0 <= d <= 6)
    hour_part = None
    if not (promo.start_hour == 0 and promo.end_hour == 24):
        hour_part = f"{_format_hour_12h(promo.start_hour)}\u2013{_format_hour_12h(promo.end_hour)}"
    parts = [x for x in (day_part, hour_part) if x]
    return " \u00b7 ".join(parts) if parts else None


class PromotionService:
    def __init__(
        self,
        promo_repo: PromotionRepository,
        cafe_repo: Optional[CafeRepository] = None,
        tier_repo: Optional[HardwareTierRepository] = None
    ):
        self.promo_repo = promo_repo
        self.cafe_repo = cafe_repo
        self.tier_repo = tier_repo

    def _is_promotion_active(self, promo: Promotion, now: Optional[datetime] = None, check_window: bool = True) -> bool:
        if not now:
            now = datetime.now(timezone.utc)
        elif now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        if not promo.is_active:
            return False

        # Datetime range check
        valid_from = promo.valid_from.replace(tzinfo=timezone.utc) if promo.valid_from.tzinfo is None else promo.valid_from
        valid_until = promo.valid_until.replace(tzinfo=timezone.utc) if promo.valid_until.tzinfo is None else promo.valid_until

        if not (valid_from <= now <= valid_until):
            return False

        # Day-of-week/hour windows are café-local (IST), not UTC — a
        # "6pm-11pm" offer must show/apply around 6-11pm in India, not
        # 6-11pm UTC (12:30am-4:30am IST). Convert whatever tz `now` carries
        # (UTC for the café-listing/"now" path, IST already for a booked
        # session's start_datetime) to IST before reading weekday()/hour.
        now_ist = now.astimezone(IST)

        if not check_window:
            # Listing path: only "is it on, in its dates, and not sold out".
            return not (promo.max_uses is not None and promo.current_uses >= promo.max_uses)

        # Day of week check (0=Monday, 6=Sunday)
        if now_ist.weekday() not in promo.days_of_week:
            return False

        # Hour window check (start_hour <= current_hour < end_hour)
        if not (promo.start_hour <= now_ist.hour < promo.end_hour):
            return False

        # Max uses check
        if promo.max_uses is not None and promo.current_uses >= promo.max_uses:
            return False

        return True

    async def create_promotion(
        self,
        cafe_id: UUID,
        owner_id: UUID,
        promo_in: PromotionCreateRequest
    ) -> PromotionResponse:
        # Rule 1 — Discount cap (percentage type only; PromotionBase's
        # cross-field validator already guarantees the right fields are
        # populated for the chosen promotion_type).
        if promo_in.promotion_type == PromotionType.PERCENTAGE:
            if promo_in.discount_percentage < 1 or promo_in.discount_percentage > 50:
                raise ValidationException(
                    message="Discount percentage must be between 1 and 50",
                    error_code="INVALID_DISCOUNT"
                )

        # Rule 2 — Time window validation
        if promo_in.valid_until <= promo_in.valid_from:
            raise ValidationException(
                message="valid_until must be after valid_from",
                error_code="INVALID_DATE_RANGE"
            )

        if promo_in.end_hour <= promo_in.start_hour:
            raise ValidationException(
                message="end_hour must be greater than start_hour",
                error_code="INVALID_HOUR_RANGE"
            )

        if promo_in.start_hour < 0 or promo_in.start_hour > 23 or promo_in.end_hour < 1 or promo_in.end_hour > 24:
            raise ValidationException(
                message="start_hour must be 0-23 and end_hour must be 1-24",
                error_code="INVALID_HOUR_RANGE"
            )

        # Validate Cafe ownership
        if self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(cafe_id)
            if not cafe:
                raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
            if str(cafe.owner_id) != str(owner_id):
                raise ForbiddenException(message="You can only create promotions for your own café", error_code="FORBIDDEN")

        # Validate Tier ownership if specified
        if promo_in.applicable_tier_id and self.tier_repo:
            tier = await self.tier_repo.get_by_id(promo_in.applicable_tier_id)
            if not tier or str(tier.cafe_id) != str(cafe_id):
                raise ValidationException(message="Selected tier does not belong to this café", error_code="INVALID_TIER")

        # A fixed-price deal's "regular price" is derived from a tier's
        # hourly rate, not stored — so it needs exactly one tier to derive
        # it from. "All tiers" doesn't make sense for this offer type.
        if promo_in.promotion_type == PromotionType.FIXED_PRICE and not promo_in.applicable_tier_id:
            raise ValidationException(
                message="A fixed-price deal must apply to a specific setup/tier",
                error_code="FIXED_PRICE_REQUIRES_TIER"
            )

        # Rule 4 — KHELO code uniqueness (pre-check for a friendly error;
        # the DB unique index on khelo_code is still the actual guard against
        # a concurrent create racing this check, see the IntegrityError catch
        # below).
        if promo_in.khelo_code:
            existing = await self.promo_repo.get_by_code(promo_in.khelo_code)
            if existing:
                raise ValidationException(message="This KHELO code is already in use", error_code="CODE_TAKEN")

        # Rule 3 — Go live immediately (is_active = True)
        promo_dict = {
            "id": uuid4(),
            "cafe_id": cafe_id,
            "title": promo_in.title,
            "description": promo_in.description,
            "promotion_type": promo_in.promotion_type,
            "discount_percentage": promo_in.discount_percentage,
            "fixed_discount_amount": promo_in.fixed_discount_amount,
            "fixed_price_amount": promo_in.fixed_price_amount,
            "min_duration_hours": promo_in.min_duration_hours,
            "min_booking_minutes": promo_in.min_booking_minutes,
            "applicable_tier_id": promo_in.applicable_tier_id,
            "play_mode": promo_in.play_mode,
            "valid_from": promo_in.valid_from,
            "valid_until": promo_in.valid_until,
            "days_of_week": promo_in.days_of_week,
            "start_hour": promo_in.start_hour,
            "end_hour": promo_in.end_hour,
            "max_uses": promo_in.max_uses,
            "current_uses": 0,
            "is_active": True,
            "khelo_code": promo_in.khelo_code,
        }

        try:
            created = await self.promo_repo.create(promo_dict)
        except IntegrityError:
            # Closes the race the pre-check above can't: two owners submitting
            # the same code in the same instant both pass get_by_code() before
            # either commits. Roll back so the session is usable again — the
            # failed INSERT otherwise leaves it unable to run further queries.
            await self.promo_repo.db.rollback()
            raise ValidationException(message="This KHELO code is already in use", error_code="CODE_TAKEN")
        return PromotionResponse.model_validate(created)

    async def get_active_promotions_for_cafe(self, cafe_id: UUID) -> List[ActivePromotionResponse]:
        now = datetime.now(timezone.utc)
        candidate_promos = await self.promo_repo.get_active_for_cafe(cafe_id, now)

        active_promos: List[ActivePromotionResponse] = []
        for p in candidate_promos:
            # Shown whenever the offer is switched on, inside its dates and not
            # sold out, even if today's day/hour window is closed, so people can
            # see "Weeknights 6 PM-9 PM" before they pick a slot. `is_live_now`
            # says whether the window is open this minute.
            if self._is_promotion_active(p, now, check_window=False):
                tier_name: Optional[str] = None
                tier = None
                if p.applicable_tier_id and self.tier_repo:
                    tier = await self.tier_repo.get_by_id(p.applicable_tier_id)
                    if tier:
                        tier_name = tier.name

                regular_price, savings_amount = self._fixed_price_economics(p, tier)

                slots_rem = (p.max_uses - p.current_uses) if p.max_uses is not None else None

                active_promos.append(ActivePromotionResponse(
                    id=p.id,
                    title=p.title,
                    description=p.description,
                    promotion_type=p.promotion_type,
                    discount_percentage=p.discount_percentage,
                    fixed_discount_amount=p.fixed_discount_amount,
                    fixed_price_amount=p.fixed_price_amount,
                    min_duration_hours=p.min_duration_hours,
                    min_booking_minutes=p.min_booking_minutes,
                    regular_price=regular_price,
                    savings_amount=savings_amount,
                    applicable_tier_name=tier_name,
                    applicable_tier_id=p.applicable_tier_id,
                    play_mode=getattr(p, 'play_mode', None) or 'any',
                    valid_until=p.valid_until,
                    start_hour=p.start_hour,
                    end_hour=p.end_hour,
                    days_of_week=p.days_of_week,
                    slots_remaining=slots_rem,
                    label=offer_label(p),
                    when=schedule_text(p),
                    is_live_now=self._is_promotion_active(p, now),
                ))

        return active_promos

    async def best_offers_for_cafes(self, cafe_ids: List[UUID]) -> dict:
        """cafe_id -> the single deal worth putting on its explore card:
        {label, when, slotsRemaining, isLiveNow, endsAt}. Same wording as the
        café page and checkout because it comes from offer_label()."""
        now = datetime.now(timezone.utc)
        promos = await self.promo_repo.get_active_for_cafes(cafe_ids, now)

        def size(p: Promotion) -> float:
            if p.promotion_type == PromotionType.PERCENTAGE:
                return float(p.discount_percentage or 0)
            if p.promotion_type == PromotionType.FIXED_AMOUNT:
                return float(p.fixed_discount_amount or 0)
            return 0.0

        best: dict = {}
        for p in promos:
            if not self._is_promotion_active(p, now, check_window=False):
                continue
            live = self._is_promotion_active(p, now)
            key = (live, size(p))
            cur = best.get(p.cafe_id)
            if cur is None or key > cur[0]:
                best[p.cafe_id] = (key, p, live)

        out = {}
        for cafe_id, (_key, p, live) in best.items():
            out[cafe_id] = {
                "label": offer_label(p),
                "when": schedule_text(p),
                "slotsRemaining": (p.max_uses - p.current_uses) if p.max_uses is not None else None,
                "isLiveNow": live,
                "endsAt": p.valid_until.isoformat(),
            }
        return out

    @staticmethod
    def pick_for_tier(promos: List[ActivePromotionResponse], tier_id: UUID, tier_name: Optional[str] = None) -> Optional[dict]:
        """The one offer to advertise on a setup: only offers that really cover
        it (matched by id, not first-come order), preferring one that is live
        now, then one made for this exact setup, then the bigger saving.
        Returned as the camelCase dict the tier response carries."""
        def covers(p: ActivePromotionResponse) -> bool:
            if p.applicable_tier_id is not None:
                return str(p.applicable_tier_id) == str(tier_id)
            return p.applicable_tier_name is None or p.applicable_tier_name == tier_name

        def size(p: ActivePromotionResponse) -> float:
            return float(p.discount_percentage or p.fixed_discount_amount or p.savings_amount or 0)

        matching = [p for p in promos if covers(p)]
        if not matching:
            return None
        best = max(matching, key=lambda p: (p.is_live_now, p.applicable_tier_id is not None, size(p)))
        return best.model_dump(by_alias=True)

    @staticmethod
    def _fixed_price_economics(promo: Promotion, tier) -> tuple[Optional[float], Optional[float]]:
        """Regular price and savings for a FIXED_PRICE promo, derived from
        the tier's current hourly rate — never stored, so it can't drift out
        of sync if the owner changes the tier's price later. None for any
        other promotion type or if the tier can't be resolved."""
        if promo.promotion_type != PromotionType.FIXED_PRICE or not tier or not promo.min_duration_hours:
            return None, None
        minutes = round(float(promo.min_duration_hours) * 60)
        regular_price = float(base_price_for_minutes(tier, minutes))
        savings = round(regular_price - float(promo.fixed_price_amount), 2)
        return round(regular_price, 2), max(savings, 0.0)

    async def get_promotions_for_owner(self, cafe_id: UUID, owner_id: UUID) -> List[PromotionResponse]:
        """Full promotion list for the owner's management view — every status, not just currently-active."""
        if self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(cafe_id)
            if not cafe:
                raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
            if str(cafe.owner_id) != str(owner_id):
                raise ForbiddenException(message="You can only view promotions for your own café", error_code="FORBIDDEN")

        promos = await self.promo_repo.get_by_cafe_id(cafe_id)
        out = []
        for p in promos:
            resp = PromotionResponse.model_validate(p)
            if p.max_uses is not None:
                resp.held_uses = await self.promo_repo.pending_holds(p.id)
            out.append(resp)
        return out

    async def get_promotion(self, promotion_id: UUID) -> PromotionResponse:
        promo = await self.promo_repo.get_by_id(promotion_id)
        if not promo:
            raise NotFoundException(message="Promotion not found", error_code="PROMOTION_NOT_FOUND")
        return PromotionResponse.model_validate(promo)

    async def update_promotion(
        self,
        promotion_id: UUID,
        owner_id: UUID,
        update_in: PromotionUpdateRequest
    ) -> PromotionResponse:
        promo = await self.promo_repo.get_by_id(promotion_id)
        if not promo:
            raise NotFoundException(message="Promotion not found", error_code="PROMOTION_NOT_FOUND")

        if self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(promo.cafe_id)
            if not cafe or str(cafe.owner_id) != str(owner_id):
                raise ForbiddenException(message="You do not have permission to update this promotion", error_code="FORBIDDEN")

        update_dict = update_in.model_dump(exclude_unset=True)

        # promotion_type is locked once the offer has been redeemed at least
        # once — a mid-life switch between "20% off" and "4 hours for ₹360"
        # is where genuine ambiguity would live for a promo customers have
        # already used. Every other field (price, dates, duration, schedule,
        # tier, limits) stays editable regardless of redemption count, since
        # none of them retroactively touch a booking's stored
        # discount_amount/total_amount snapshot (see booking_service.py).
        new_type = update_dict.get("promotion_type", promo.promotion_type)
        if "promotion_type" in update_dict and new_type != promo.promotion_type and promo.current_uses > 0:
            raise ValidationException(
                message="This offer has already been redeemed, so its type (percentage/fixed-amount/fixed-price) can no longer be changed. All other fields — price, dates, duration, schedule — can still be edited.",
                error_code="PROMOTION_TYPE_LOCKED"
            )

        # Merge onto the existing row to validate the field set the promotion
        # will actually end up with — a PATCH may touch only one or two
        # fields, so it isn't enough to just re-check what's present in
        # update_dict, since it might not be complete for the target type.
        merged = {
            "promotion_type": new_type,
            "discount_percentage": update_dict.get("discount_percentage", promo.discount_percentage),
            "fixed_discount_amount": update_dict.get("fixed_discount_amount", promo.fixed_discount_amount),
            "fixed_price_amount": update_dict.get("fixed_price_amount", promo.fixed_price_amount),
            "min_duration_hours": update_dict.get("min_duration_hours", promo.min_duration_hours),
            "min_booking_minutes": update_dict.get("min_booking_minutes", promo.min_booking_minutes),
            "applicable_tier_id": update_dict.get("applicable_tier_id", promo.applicable_tier_id),
        }
        if merged["promotion_type"] in (PromotionType.PERCENTAGE, PromotionType.FIXED_AMOUNT):
            if merged["min_booking_minutes"] not in allowed_minutes(15):
                raise ValidationException(
                    message="Minimum booking length must be a bookable length: 15/30 min, then 30-minute steps after 1 hour",
                    error_code="INVALID_MIN_BOOKING_MINUTES"
                )
        if merged["promotion_type"] == PromotionType.PERCENTAGE:
            if merged["discount_percentage"] is None or not (1 <= merged["discount_percentage"] <= 50):
                raise ValidationException(message="Discount percentage must be between 1 and 50", error_code="INVALID_DISCOUNT")
        elif merged["promotion_type"] == PromotionType.FIXED_AMOUNT:
            if not merged["fixed_discount_amount"] or merged["fixed_discount_amount"] <= 0:
                raise ValidationException(message="Fixed discount amount must be greater than 0", error_code="INVALID_DISCOUNT")
        elif merged["promotion_type"] == PromotionType.FIXED_PRICE:
            if not merged["fixed_price_amount"] or merged["fixed_price_amount"] <= 0 or not merged["min_duration_hours"]:
                raise ValidationException(message="A fixed-price deal needs both a deal price and a minimum duration", error_code="INVALID_DISCOUNT")
            if not merged["applicable_tier_id"]:
                raise ValidationException(message="A fixed-price deal must apply to a specific setup/tier", error_code="FIXED_PRICE_REQUIRES_TIER")

        # Date-range check against whichever of valid_from/valid_until is
        # actually changing — create_promotion checks this on a complete
        # payload, but a PATCH touching only one side of the range needs the
        # same guard against the OTHER side's existing value (item 8's
        # "end date cannot be before start date" requirement).
        merged_valid_from = update_dict.get("valid_from", promo.valid_from)
        merged_valid_until = update_dict.get("valid_until", promo.valid_until)
        if merged_valid_from.tzinfo is None:
            merged_valid_from = merged_valid_from.replace(tzinfo=timezone.utc)
        if merged_valid_until.tzinfo is None:
            merged_valid_until = merged_valid_until.replace(tzinfo=timezone.utc)
        if merged_valid_until <= merged_valid_from:
            raise ValidationException(message="valid_until must be after valid_from", error_code="INVALID_DATE_RANGE")

        merged_start_hour = update_dict.get("start_hour", promo.start_hour)
        merged_end_hour = update_dict.get("end_hour", promo.end_hour)
        if merged_end_hour <= merged_start_hour:
            raise ValidationException(message="end_hour must be greater than start_hour", error_code="INVALID_HOUR_RANGE")

        if "applicable_tier_id" in update_dict and update_dict["applicable_tier_id"] and self.tier_repo:
            tier = await self.tier_repo.get_by_id(update_dict["applicable_tier_id"])
            if not tier or str(tier.cafe_id) != str(promo.cafe_id):
                raise ValidationException(message="Selected tier does not belong to this café", error_code="INVALID_TIER")

        if update_in.khelo_code is not None and update_in.khelo_code != promo.khelo_code:
            existing = await self.promo_repo.get_by_code(update_in.khelo_code)
            if existing and str(existing.id) != str(promotion_id):
                raise ValidationException(message="This KHELO code is already in use", error_code="CODE_TAKEN")
        try:
            updated = await self.promo_repo.update(promotion_id, update_dict)
        except IntegrityError:
            await self.promo_repo.db.rollback()
            raise ValidationException(message="This KHELO code is already in use", error_code="CODE_TAKEN")
        return PromotionResponse.model_validate(updated)

    async def deactivate_promotion(self, promotion_id: UUID, owner_id: UUID) -> None:
        promo = await self.promo_repo.get_by_id(promotion_id)
        if not promo:
            raise NotFoundException(message="Promotion not found", error_code="PROMOTION_NOT_FOUND")

        if self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(promo.cafe_id)
            if not cafe or str(cafe.owner_id) != str(owner_id):
                raise ForbiddenException(message="You do not have permission to deactivate this promotion", error_code="FORBIDDEN")

        await self.promo_repo.deactivate(promotion_id)

    async def delete_promotion(self, promotion_id: UUID, owner_id: UUID) -> None:
        """Permanent delete — only allowed for a promotion no Booking row
        references at all. current_uses alone isn't enough to check: it
        only increments once a booking is CONFIRMED, but a booking that's
        still PENDING_PAYMENT, FAILED, or CANCELLED also holds
        Booking.promotion_id (set at creation, before payment), and
        Booking.promotion_id has no ON DELETE behavior — hard-deleting a
        promotion referenced by one of those raises an IntegrityError that
        surfaced to owners as a bare 500 ("An unexpected error occurred on
        the server"). Any referencing booking, confirmed or not, must route
        through pause instead."""
        promo = await self.promo_repo.get_by_id(promotion_id)
        if not promo:
            raise NotFoundException(message="Promotion not found", error_code="PROMOTION_NOT_FOUND")

        if self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(promo.cafe_id)
            if not cafe or str(cafe.owner_id) != str(owner_id):
                raise ForbiddenException(message="You do not have permission to delete this promotion", error_code="FORBIDDEN")

        if promo.current_uses > 0:
            raise ValidationException(
                message="This offer has already been redeemed and can't be deleted — pause it instead to keep booking history intact.",
                error_code="PROMOTION_HAS_HISTORY"
            )

        has_any_booking = (await self.promo_repo.db.execute(
            select(Booking.id).where(Booking.promotion_id == promotion_id).limit(1)
        )).first()
        if has_any_booking:
            raise ValidationException(
                message="This offer has bookings attached to it and can't be deleted — pause it instead to keep booking history intact.",
                error_code="PROMOTION_HAS_HISTORY"
            )

        try:
            await self.promo_repo.delete(promotion_id)
        except IntegrityError:
            await self.promo_repo.db.rollback()
            raise ValidationException(
                message="This offer has bookings attached to it and can't be deleted — pause it instead to keep booking history intact.",
                error_code="PROMOTION_HAS_HISTORY"
            )

    async def preview_code(self, code: str, cafe_id: Optional[UUID] = None) -> CodeRedemptionResponse:
        """Public, unauthenticated lookup used by the customer-side code-entry
        field and the /redeem QR deep link to show what a code unlocks before
        the gamer commits to a booking. Read-only — never increments
        current_uses; that only happens inside apply_promotion_to_booking,
        atomically, when an actual booking is created. `valid` reflects the
        full eligibility check EXCEPT the schedule window (day/hour), which
        depends on the session the customer eventually picks, not "now" —
        booking_service revalidates that against the chosen slot."""
        normalized = code.strip().upper()
        promo = await self.promo_repo.get_by_code(normalized)
        if not promo:
            raise NotFoundException(message="Invalid KHELO code", error_code="CODE_NOT_FOUND")

        if cafe_id is not None and str(promo.cafe_id) != str(cafe_id):
            raise ValidationException(message="This code isn't valid for this café", error_code="CODE_CAFE_MISMATCH")

        now = datetime.now(timezone.utc)
        valid = True
        reason: Optional[str] = None
        if not promo.is_active:
            valid, reason = False, "This offer is no longer active."
        else:
            valid_from = promo.valid_from.replace(tzinfo=timezone.utc) if promo.valid_from.tzinfo is None else promo.valid_from
            valid_until = promo.valid_until.replace(tzinfo=timezone.utc) if promo.valid_until.tzinfo is None else promo.valid_until
            if now < valid_from or now > valid_until:
                valid, reason = False, "This offer is outside its valid dates."
            elif promo.max_uses is not None and promo.current_uses >= promo.max_uses:
                valid, reason = False, "This offer has reached its redemption limit."

        tier = None
        if promo.applicable_tier_id and self.tier_repo:
            tier = await self.tier_repo.get_by_id(promo.applicable_tier_id)
        regular_price, savings_amount = self._fixed_price_economics(promo, tier)

        return CodeRedemptionResponse(
            promotion_id=promo.id,
            cafe_id=promo.cafe_id,
            title=promo.title,
            description=promo.description,
            promotion_type=promo.promotion_type,
            discount_percentage=promo.discount_percentage,
            fixed_discount_amount=promo.fixed_discount_amount,
            fixed_price_amount=promo.fixed_price_amount,
            min_duration_hours=promo.min_duration_hours,
            min_booking_minutes=promo.min_booking_minutes,
            regular_price=regular_price,
            savings_amount=savings_amount,
            applicable_tier_id=promo.applicable_tier_id,
            play_mode=getattr(promo, 'play_mode', None) or 'any',
            valid_from=promo.valid_from,
            valid_until=promo.valid_until,
            days_of_week=promo.days_of_week,
            start_hour=promo.start_hour,
            end_hour=promo.end_hour,
            max_uses=promo.max_uses,
            current_uses=promo.current_uses,
            valid=valid,
            reason=reason,
        )

    async def resolve_code_to_promotion_id(self, code: str, cafe_id: UUID) -> UUID:
        """Used by booking creation to turn a submitted promoCode into a
        promotion_id before handing off to apply_promotion_to_booking, which
        does the actual authoritative, row-locked re-validation — this is
        just the lookup, not a second source of truth for eligibility."""
        normalized = code.strip().upper()
        promo = await self.promo_repo.get_by_code(normalized)
        if not promo:
            raise ValidationException(message="Invalid KHELO code", error_code="CODE_NOT_FOUND")
        if str(promo.cafe_id) != str(cafe_id):
            raise ValidationException(message="This code isn't valid for this café", error_code="CODE_CAFE_MISMATCH")
        return promo.id

    async def apply_promotion_to_booking(
        self,
        promotion_id: UUID,
        cafe_id: UUID,
        tier_id: UUID,
        base_amount: Decimal,
        session_datetime: Optional[datetime] = None,
        duration_hours: Optional[Decimal] = None,
        seats_count: int = 1,
        is_coop: bool = False,
    ) -> Decimal:
        # Row-locked so a concurrent booking applying the same promo can't read
        # current_uses until this one commits — closes the race where N
        # concurrent requests near max_uses could all pass validation before
        # any of them incremented. Held for the rest of this DB transaction
        # (i.e. until the caller's booking insert commits), same lifetime as
        # the seat-capacity lock in booking_repository.
        promo = await self.promo_repo.get_by_id_with_lock(promotion_id)
        if not promo:
            raise ValidationException(message="Promotion not found", error_code="PROMOTION_NOT_FOUND")

        if str(promo.cafe_id) != str(cafe_id):
            raise ValidationException(message="Promotion does not belong to this café", error_code="PROMOTION_CAFE_MISMATCH")

        # Paid redemptions plus unpaid bookings still inside their payment
        # window: the last slot can't be taken twice, and an abandoned
        # checkout frees its slot after 15 minutes.
        if promo.max_uses is not None:
            held = await self.promo_repo.pending_holds(promotion_id)
            if promo.current_uses + held >= promo.max_uses:
                raise ValidationException(
                    message="This promotion has reached its maximum uses",
                    error_code="PROMOTION_EXHAUSTED"
                )

        discount_amount = self._evaluate_and_price(
            promo, tier_id, base_amount, session_datetime, duration_hours, seats_count, is_coop
        )

        # Not counted as redeemed here: the booking is only pending payment.
        # current_uses is recounted from paid bookings whenever a booking's
        # status changes (BookingRepository.update), so it only moves on a
        # successful payment and moves back on a cancellation or refund.
        return discount_amount

    def _evaluate_and_price(
        self,
        promo: Promotion,
        tier_id: UUID,
        base_amount: Decimal,
        session_datetime: Optional[datetime],
        duration_hours: Optional[Decimal],
        seats_count: int,
        is_coop: bool,
    ) -> Decimal:
        """The eligibility + discount math shared by apply_promotion_to_booking
        (row-locked, authoritative) and get_best_quote_offer (unlocked,
        preview-only for the /bookings/quote endpoint). Raises
        ValidationException with an error_code on any ineligibility — callers
        that want a "why not" message for a UI hint should catch it."""
        # Eligibility (day-of-week, hour window, valid_from/until) must be
        # checked against the booked SESSION's date/time, not the moment the
        # customer happens to click "Pay Now" — a "weeknights after 6pm" promo
        # browsed at 3pm for an 8pm slot must apply, and one browsed at 8pm
        # for a booking next Tuesday afternoon must not. current_uses/max_uses
        # is still checked against wall-clock reality (that's a real inventory
        # count), only the schedule-window check uses the session's time.
        check_time = session_datetime if session_datetime is not None else datetime.now(timezone.utc)
        if not self._is_promotion_active(promo, check_time):
            raise ValidationException(message="Promotion is not valid for the selected date/time", error_code="PROMOTION_INACTIVE")

        if promo.applicable_tier_id and str(promo.applicable_tier_id) != str(tier_id):
            raise ValidationException(message="Promotion does not apply to the selected hardware tier", error_code="PROMOTION_TIER_MISMATCH")

        mode = getattr(promo, 'play_mode', None) or 'any'
        if (mode == 'coop' and not is_coop) or (mode == 'solo' and is_coop):
            raise ValidationException(
                message="This offer is only for co-op (sharing a console)" if mode == 'coop' else "This offer is only for playing on your own console",
                error_code="PROMOTION_PLAY_MODE_MISMATCH"
            )

        if promo.promotion_type == PromotionType.FIXED_PRICE:
            # The deal price is defined for exactly min_duration_hours — a
            # customer booking a different duration isn't buying "the deal",
            # so this only applies on an exact match (the booking UI is
            # responsible for offering the switch, not for partial credit on
            # a longer/shorter session).
            if duration_hours is None or Decimal(str(duration_hours)) != Decimal(str(promo.min_duration_hours)):
                raise ValidationException(
                    message=f"This deal applies to exactly {promo.min_duration_hours} hour(s)",
                    error_code="PROMOTION_DURATION_MISMATCH"
                )
            deal_total = Decimal(str(promo.fixed_price_amount)) * seats_count
            discount_amount = (base_amount - deal_total).quantize(Decimal('0.01'))
        else:
            # PERCENTAGE/FIXED_AMOUNT: only applies to bookings at or above
            # this offer's minimum length — a flat ₹/% discount otherwise
            # bites hardest on the shortest, cheapest bookings (this is what
            # let a ₹60-off offer make a ₹90 15-min booking nearly free).
            duration_minutes = round(float(duration_hours) * 60) if duration_hours is not None else None
            required_minutes = promo.min_booking_minutes or 60
            if duration_minutes is None or duration_minutes < required_minutes:
                raise ValidationException(
                    message=f"This offer applies to bookings of {required_minutes} minutes or more",
                    error_code="PROMOTION_DURATION_TOO_SHORT"
                )
            if promo.promotion_type == PromotionType.FIXED_AMOUNT:
                discount_amount = Decimal(str(promo.fixed_discount_amount)).quantize(Decimal('0.01'))
            else:
                # Rule 5 Math: discount_amount = base_amount * (discount_percentage / 100)
                discount_percentage = Decimal(str(promo.discount_percentage))
                discount_amount = (base_amount * (discount_percentage / Decimal('100'))).quantize(Decimal('0.01'))

        # An offer can never make a booking free (or negative). Rather than
        # clamping to base_amount (which would silently turn a "₹60 off"
        # deal into "100% off" for anything priced ≤ ₹60), the offer simply
        # doesn't apply at all when it would zero out or exceed the price.
        # FIXED_PRICE is exempt: its "discount" is base_amount minus a fixed
        # deal price, and a ₹0 deal price is a valid (if unusual) deal an
        # owner explicitly configured — the never-free guard exists for
        # flat/percentage discounts computed off a variable base_amount, not
        # for a price the owner typed in directly.
        if promo.promotion_type != PromotionType.FIXED_PRICE and discount_amount >= base_amount:
            raise ValidationException(
                message="This offer can't be applied to this booking — it would make it free",
                error_code="PROMOTION_WOULD_ZERO"
            )
        if discount_amount > base_amount:
            logger.warning(
                f"Promotion {promo.id} ({promo.promotion_type}) computed a "
                f"discount of {discount_amount} against a base amount of "
                f"{base_amount}. Clamping to base amount to keep the booking "
                f"non-negative."
            )
            discount_amount = base_amount
        if discount_amount < 0:
            discount_amount = Decimal('0.00')

        return discount_amount

    async def get_best_quote_offer(
        self,
        cafe_id: UUID,
        tier_id: UUID,
        base_amount: Decimal,
        session_datetime: datetime,
        duration_hours: Decimal,
        seats_count: int,
        is_coop: bool,
    ):
        """Preview-only (no row lock, no side effects) equivalent of
        apply_promotion_to_booking, used by the /bookings/quote endpoint so
        checkout can show the auto-applied offer before the customer pays.
        Returns (applied: Promotion|None, discount: Decimal, hint: Promotion|None,
        hint_message: str|None) — `hint` is the best offer that almost
        applied, for an "works on bookings of 1hr+" message."""
        eligible, best_hint, best_hint_message, _suggested = await self.list_eligible_offers(
            cafe_id, tier_id, base_amount, session_datetime, duration_hours, seats_count, is_coop
        )
        if eligible:
            promo, discount = eligible[0]
            return promo, discount, None, None
        return None, Decimal('0.00'), best_hint, best_hint_message

    async def list_eligible_offers(
        self,
        cafe_id: UUID,
        tier_id: UUID,
        base_amount: Decimal,
        session_datetime: datetime,
        duration_hours: Decimal,
        seats_count: int,
        is_coop: bool,
    ):
        """Every offer that applies to this exact slot, biggest saving first,
        plus the best near-miss for a nudge. One source of truth for the
        quote's "available offers" and the auto-pick at booking time."""
        candidates = await self.promo_repo.get_active_for_cafe(cafe_id, datetime.now(timezone.utc))
        # Only offers for this tier (or "all tiers") are even candidates;
        # matches apply_promotion_to_booking's PROMOTION_TIER_MISMATCH check.
        candidates = [p for p in candidates if not p.applicable_tier_id or str(p.applicable_tier_id) == str(tier_id)]

        eligible = []
        best_hint, best_hint_message, suggested_minutes = None, None, None
        for promo in candidates:
            try:
                discount = self._evaluate_and_price(
                    promo, tier_id, base_amount, session_datetime, duration_hours, seats_count, is_coop
                )
            except ValidationException as e:
                # Only offer a "you're close" hint for the failure modes a
                # customer can act on by changing the slot/length, not for
                # ones outside their control (exhausted, wrong tier).
                if e.error_code in ("PROMOTION_INACTIVE", "PROMOTION_DURATION_MISMATCH", "PROMOTION_DURATION_TOO_SHORT"):
                    if best_hint is None:
                        best_hint = promo
                        if e.error_code == "PROMOTION_DURATION_MISMATCH":
                            best_hint_message = f"Works on bookings of exactly {promo.min_duration_hours} hour(s)."
                            suggested_minutes = round(float(promo.min_duration_hours) * 60)
                        elif e.error_code == "PROMOTION_DURATION_TOO_SHORT":
                            required = promo.min_booking_minutes or 60
                            suggested_minutes = required
                            length_label = f"{required} min" if required < 60 else f"{required // 60} hr" + (f" {required % 60} min" if required % 60 else "")
                            best_hint_message = f"Works on bookings of {length_label} or more."
                        else:
                            start_label = _format_hour_12h(promo.start_hour)
                            end_label = _format_hour_12h(promo.end_hour)
                            best_hint_message = f"Valid {start_label}\u2013{end_label} on select days."
                continue
            eligible.append((promo, discount))

        eligible.sort(key=lambda pd: pd[1], reverse=True)
        return eligible, best_hint, best_hint_message, suggested_minutes

    async def increment_promotion_uses(self, promotion_id: UUID) -> None:
        """Deprecated as a separate step for the booking-creation path — apply_promotion_to_booking
        now increments atomically under its own row lock. Left in place only for any other
        caller that still applies a promo outside that flow."""
        await self.promo_repo.increment_uses(promotion_id)
