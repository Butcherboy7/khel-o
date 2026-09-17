import logging
from typing import List, Optional
from uuid import UUID, uuid4
from decimal import Decimal
from datetime import datetime, timezone

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
from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException

logger = logging.getLogger(__name__)

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

    def _is_promotion_active(self, promo: Promotion, now: Optional[datetime] = None) -> bool:
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

        # Day of week check (0=Monday, 6=Sunday)
        if now.weekday() not in promo.days_of_week:
            return False

        # Hour window check (start_hour <= current_hour < end_hour)
        if not (promo.start_hour <= now.hour < promo.end_hour):
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
            "applicable_tier_id": promo_in.applicable_tier_id,
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
            if self._is_promotion_active(p, now):
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
                    regular_price=regular_price,
                    savings_amount=savings_amount,
                    applicable_tier_name=tier_name,
                    valid_until=p.valid_until,
                    start_hour=p.start_hour,
                    end_hour=p.end_hour,
                    days_of_week=p.days_of_week,
                    slots_remaining=slots_rem
                ))

        return active_promos

    @staticmethod
    def _fixed_price_economics(promo: Promotion, tier) -> tuple[Optional[float], Optional[float]]:
        """Regular price and savings for a FIXED_PRICE promo, derived from
        the tier's current hourly rate — never stored, so it can't drift out
        of sync if the owner changes the tier's price later. None for any
        other promotion type or if the tier can't be resolved."""
        if promo.promotion_type != PromotionType.FIXED_PRICE or not tier or not promo.min_duration_hours:
            return None, None
        regular_price = float(Decimal(str(tier.price_per_hour)) * Decimal(str(promo.min_duration_hours)))
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
        return [PromotionResponse.model_validate(p) for p in promos]

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
            "applicable_tier_id": update_dict.get("applicable_tier_id", promo.applicable_tier_id),
        }
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
        """Permanent delete — only allowed for a promotion that has never
        been redeemed (current_uses == 0). One that has must be paused
        instead: a booking's Booking.promotion_id would otherwise point at a
        row that no longer exists, and a promotion with real redemption
        history is exactly the kind of thing an owner shouldn't be able to
        make disappear."""
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

        await self.promo_repo.delete(promotion_id)

        await self.promo_repo.deactivate(promotion_id)

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
            regular_price=regular_price,
            savings_amount=savings_amount,
            applicable_tier_id=promo.applicable_tier_id,
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

        if promo.max_uses is not None and promo.current_uses >= promo.max_uses:
            raise ValidationException(
                message="This promotion has reached its maximum uses",
                error_code="PROMOTION_EXHAUSTED"
            )

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
        elif promo.promotion_type == PromotionType.FIXED_AMOUNT:
            discount_amount = Decimal(str(promo.fixed_discount_amount)).quantize(Decimal('0.01'))
        else:
            # Rule 5 Math: discount_amount = base_amount * (discount_percentage / 100)
            discount_percentage = Decimal(str(promo.discount_percentage))
            discount_amount = (base_amount * (discount_percentage / Decimal('100'))).quantize(Decimal('0.01'))

        # Never discount more than the booking is worth (or below zero for a
        # fixed-price deal on a tier whose rate has since dropped). Bad data
        # from seeds/migrations/admin scripts bypassing Pydantic bounds is
        # the same defensive reason as before this comment moved here.
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

        # Increment now, while still holding the row lock acquired above —
        # that gap between validation and increment was exactly where the
        # race lived. Deliberately NOT committing here: this UPDATE rides in
        # the same open transaction as the caller's booking insert, so if
        # booking creation fails after this point, the increment rolls back
        # with it instead of being wasted on a booking that never happened.
        from sqlalchemy import update as sa_update
        from app.models.promotion import Promotion
        await self.promo_repo.db.execute(
            sa_update(Promotion).where(Promotion.id == promotion_id).values(current_uses=Promotion.current_uses + 1)
        )

        return discount_amount

    async def increment_promotion_uses(self, promotion_id: UUID) -> None:
        """Deprecated as a separate step for the booking-creation path — apply_promotion_to_booking
        now increments atomically under its own row lock. Left in place only for any other
        caller that still applies a promo outside that flow."""
        await self.promo_repo.increment_uses(promotion_id)
