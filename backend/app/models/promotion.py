import enum
import uuid
from datetime import datetime, timezone
from typing import Any
from sqlalchemy import String, Text, Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PromotionType(str, enum.Enum):
    PERCENTAGE = "percentage"
    FIXED_AMOUNT = "fixed_amount"
    FIXED_PRICE = "fixed_price"


class Promotion(Base):
    __tablename__ = "promotions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    cafe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cafes.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Which commercial shape this offer takes. Exactly one of
    # discount_percentage / fixed_discount_amount / (fixed_price_amount +
    # min_duration_hours) is populated, matching promotion_type — enforced in
    # PromotionService, not a DB CHECK constraint (this codebase's existing
    # enums are validated at the app layer, e.g. VerificationStatus).
    promotion_type: Mapped[PromotionType] = mapped_column(
        Enum(PromotionType, values_callable=lambda x: [e.value for e in x]),
        default=PromotionType.PERCENTAGE,
        server_default=PromotionType.PERCENTAGE.value,
        nullable=False,
    )
    # Nullable so a fixed_amount/fixed_price promotion doesn't need a dummy
    # percentage. Still required (and 1-50 range enforced) when
    # promotion_type == PERCENTAGE.
    discount_percentage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # "₹100 off" — used only when promotion_type == FIXED_AMOUNT.
    fixed_discount_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    # "4 hours for ₹360" — used only when promotion_type == FIXED_PRICE.
    # The regular price is never stored here: it's derived at read/apply time
    # as hardware_tier.price_per_hour * min_duration_hours, so it can't drift
    # out of sync with the tier's actual rate.
    fixed_price_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    min_duration_hours: Mapped[float | None] = mapped_column(Numeric(4, 2), nullable=True)
    applicable_tier_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hardware_tiers.id"), nullable=True)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    days_of_week: Mapped[dict[str, Any]] = mapped_column(JSON, default=list, nullable=False)
    start_hour: Mapped[int] = mapped_column(Integer, nullable=False)
    end_hour: Mapped[int] = mapped_column(Integer, nullable=False)
    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    current_uses: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # KHELO promo code — optional, unique, alphanumeric code the owner can
    # assign to this offer so gamers can redeem it by typing it in at
    # checkout or by scanning a QR that encodes a /redeem/{code} deep link.
    # Reuses this row's existing valid_from/valid_until/max_uses/current_uses
    # as the code's validity window and usage limit rather than duplicating
    # them — a code is always 1:1 with the promotion it unlocks.
    khelo_code: Mapped[str | None] = mapped_column(String(20), unique=True, index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
