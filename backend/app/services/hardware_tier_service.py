from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.repositories.cafe_repository import CafeRepository
from app.repositories.promotion_repository import PromotionRepository
from app.services.promotion_service import PromotionService
from app.services.performance_rating import compute_rating, _score_gpu, _score_ram, _score_hz
from app.services.platform_derivation import derive_tier_display
from app.schemas.hardware_tier import HardwareTierCreateRequest, HardwareTierUpdateRequest, HardwareTierResponse
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException

class HardwareTierService:
    def __init__(
        self,
        tier_repo: HardwareTierRepository,
        cafe_repo: Optional[CafeRepository] = None,
        promo_repo: Optional[PromotionRepository] = None
    ):
        self.tier_repo = tier_repo
        self.cafe_repo = cafe_repo
        self.promo_repo = promo_repo

    def _validate_preset_specs(self, preset: Optional[str], specs: dict) -> Optional[str]:
        if not preset:
            return None
        
        gpu = specs.get("gpu", "")
        ram = specs.get("ram", "")
        monitor = specs.get("monitor", "")
        
        gpu_val = _score_gpu(gpu)
        
        # parse RAM
        import re
        ram_match = re.search(r'(\d+)', ram)
        ram_gb = int(ram_match.group(1)) if ram_match else 0
        
        # parse Hz
        hz_match = re.search(r'(\d+)', monitor)
        hz_val = int(hz_match.group(1)) if hz_match else 0
        
        if preset == "esports_starter":
            if gpu_val < 2.5 or ram_gb < 16 or hz_val < 144:
                return "Your specs are below the minimum for Esports Starter. Consider selecting a different tier or upgrading."
        elif preset == "pro_gaming":
            if gpu_val < 3.5 or ram_gb < 16 or hz_val < 240:
                return "Your specs are below the minimum for Pro Gaming. Consider selecting Esports Starter instead."
        elif preset == "ultra_streamer":
            if gpu_val < 4.5 or ram_gb < 32 or hz_val < 240:
                return "Your specs are below the minimum for Ultra / Streamer. Consider selecting Pro Gaming instead."
        return None

    async def add_hardware_tier(self, cafe_id: UUID, owner_id: UUID, tier_in: HardwareTierCreateRequest) -> HardwareTierResponse:
        if self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(cafe_id)
            if not cafe:
                raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
            if str(cafe.owner_id) != str(owner_id):
                raise ForbiddenException(message="You can only manage hardware tiers for your own café", error_code="FORBIDDEN")
            if cafe.verification_status == VerificationStatus.SUSPENDED:
                raise ForbiddenException(
                    message="Suspended cafés cannot modify hardware tiers. Please contact admin.",
                    error_code="CAFE_SUSPENDED"
                )

        if tier_in.price_per_hour <= 0:
            raise ValidationException(message="Price per hour must be greater than 0", error_code="INVALID_PRICE")
        if tier_in.total_seats <= 0:
            raise ValidationException(message="Seats in tier must be greater than 0", error_code="INVALID_SEATS")
        if tier_in.app_bookable_seats > tier_in.total_seats:
            raise ValidationException(message="App bookable seats cannot exceed total seats", error_code="INVALID_SEATS")

        reserved_walkin = tier_in.reserved_walkin_seats if tier_in.reserved_walkin_seats is not None else (tier_in.total_seats - tier_in.app_bookable_seats)

        try:
            derived_specs, suggested_name = derive_tier_display(tier_in.platform, tier_in.model)
        except ValueError as e:
            raise ValidationException(message=str(e), error_code="INVALID_PLATFORM_MODEL")
        final_specs = derived_specs if tier_in.platform is not None else tier_in.specs
        # When a platform is selected, the derived name always wins (mirrors
        # final_specs above) so a stray/placeholder name typed by the client
        # can never diverge from the platform+model that was actually chosen.
        final_name = suggested_name if tier_in.platform is not None else (tier_in.name or suggested_name)

        tier_dict = {
            "id": uuid4(),
            "cafe_id": cafe_id,
            "name": final_name,
            "description": tier_in.description,
            "specs": final_specs,
            "total_seats": tier_in.total_seats,
            "app_bookable_seats": tier_in.app_bookable_seats,
            "reserved_walkin_seats": reserved_walkin,
            "active_seats_count": tier_in.total_seats,  # starts as equal to total seats
            "preset_category": tier_in.preset_category,
            "price_per_hour": tier_in.price_per_hour,
            "platform": tier_in.platform,
            "model": tier_in.model,
            "is_active": True
        }

        created = await self.tier_repo.create(tier_dict)

        warning = self._validate_preset_specs(tier_in.preset_category, final_specs)
        rating = compute_rating(final_specs)

        res = HardwareTierResponse.model_validate(created)
        res.performance_rating = rating
        res.warning = warning
        res.active_promotion = None
        return res

    create_tier = add_hardware_tier

    async def update_hardware_tier(self, tier_id: UUID, owner_id: UUID, update_data: HardwareTierUpdateRequest) -> HardwareTierResponse:
        tier = await self.tier_repo.get_by_id(tier_id)
        if not tier:
            raise NotFoundException(message="Hardware tier not found", error_code="TIER_NOT_FOUND")

        if self.cafe_repo:
            cafe = await self.cafe_repo.get_by_id(tier.cafe_id)
            if not cafe:
                raise NotFoundException(message="Café not found", error_code="CAFE_NOT_FOUND")
            if str(cafe.owner_id) != str(owner_id):
                raise ForbiddenException(message="You can only manage hardware tiers for your own café", error_code="FORBIDDEN")
            if cafe.verification_status == VerificationStatus.SUSPENDED:
                raise ForbiddenException(
                    message="Suspended cafés cannot modify hardware tiers. Please contact admin.",
                    error_code="CAFE_SUSPENDED"
                )

        total = update_data.total_seats if update_data.total_seats is not None else tier.total_seats
        bookable = update_data.app_bookable_seats if update_data.app_bookable_seats is not None else tier.app_bookable_seats
        active = update_data.active_seats_count if update_data.active_seats_count is not None else tier.active_seats_count

        if update_data.price_per_hour is not None and update_data.price_per_hour <= 0:
            raise ValidationException(message="Price per hour must be greater than 0", error_code="INVALID_PRICE")
        if total <= 0:
            raise ValidationException(message="Total seats must be greater than 0", error_code="INVALID_SEATS")
        if bookable > total:
            raise ValidationException(message="App bookable seats cannot exceed total seats", error_code="INVALID_SEATS")
        if active > total:
            raise ValidationException(message="Active seats cannot exceed total seats", error_code="INVALID_SEATS")

        if update_data.platform is not None or update_data.model is not None:
            effective_platform = update_data.platform if update_data.platform is not None else tier.platform
            effective_model = update_data.model if update_data.model is not None else tier.model
            try:
                derived_specs, suggested_name = derive_tier_display(effective_platform, effective_model)
            except ValueError as e:
                raise ValidationException(message=str(e), error_code="INVALID_PLATFORM_MODEL")
            # Mirrors add_hardware_tier's final_specs rule: once a platform is
            # effective, derived specs always win (even over an explicit
            # specs:{} sent alongside platform/model in the same PATCH), so
            # changing platform can never silently leave stale/empty specs.
            if effective_platform is not None:
                update_data.specs = derived_specs
            if update_data.name is None:
                update_data.name = suggested_name

        update_dict = update_data.model_dump(exclude_unset=True)
        updated = await self.tier_repo.update(tier_id, update_dict)
        
        warning = self._validate_preset_specs(updated.preset_category, updated.specs)
        rating = compute_rating(updated.specs)

        res = HardwareTierResponse.model_validate(updated)
        res.performance_rating = rating
        res.warning = warning
        res.active_promotion = None
        return res

    async def get_tier(self, tier_id: UUID) -> HardwareTierResponse:
        tier = await self.tier_repo.get_by_id(tier_id)
        if not tier:
            raise NotFoundException(message="Hardware tier not found", error_code="TIER_NOT_FOUND")
        
        warning = self._validate_preset_specs(tier.preset_category, tier.specs)
        rating = compute_rating(tier.specs)
        
        res = HardwareTierResponse.model_validate(tier)
        res.performance_rating = rating
        res.warning = warning
        res.active_promotion = None
        return res

    async def get_cafe_tiers(self, cafe_id: UUID) -> List[HardwareTierResponse]:
        tiers = await self.tier_repo.get_by_cafe(cafe_id, active_only=True)

        active_promos = []
        if self.promo_repo:
            promo_service = PromotionService(self.promo_repo, tier_repo=self.tier_repo)
            active_promos = await promo_service.get_active_promotions_for_cafe(cafe_id)

        result: List[HardwareTierResponse] = []
        for t in tiers:
            warning = self._validate_preset_specs(t.preset_category, t.specs)
            rating = compute_rating(t.specs)
            
            r = HardwareTierResponse.model_validate(t)
            r.performance_rating = rating
            r.warning = warning
            
            matching_promo = None
            for p in active_promos:
                if p.applicable_tier_name is None or p.applicable_tier_name == t.name:
                    matching_promo = p.model_dump(by_alias=True)
                    break
            r.active_promotion = matching_promo
            result.append(r)

        return result

    list_cafe_tiers = get_cafe_tiers
