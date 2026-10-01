import uuid
import enum
from datetime import datetime, timezone
from typing import Any
from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, Numeric, Integer, JSON, Enum
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class PlatformType(str, enum.Enum):
    PC = "pc"
    PLAYSTATION = "playstation"
    XBOX = "xbox"
    NINTENDO = "nintendo"
    OTHER = "other"

class TierType(str, enum.Enum):
    GAMING = "gaming"
    ACTIVITY = "activity"

class HardwareTier(Base):
    __tablename__ = "hardware_tiers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    cafe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cafes.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    specs: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    total_seats: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    app_bookable_seats: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Set whenever an owner explicitly edits this tier's seat quota via the
    # per-tier editor (PATCH /cafes/{cafe_id}/tiers/{tier_id}). The global
    # booking-controls seat stepper must not silently overwrite a locked
    # tier's app_bookable_seats via its proportional rescale — that overwrite
    # was the root cause of a seat-quota bypass (a tier pinned to 1 seat was
    # getting reset back toward total_seats by an unrelated global action).
    app_bookable_seats_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    platform: Mapped[PlatformType | None] = mapped_column(
        Enum(PlatformType, values_callable=lambda x: [e.value for e in x]),
        nullable=True
    )
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # 'gaming' = PC/console tier (existing behavior, platform/specs apply).
    # 'activity' = non-gaming bookable inventory (snooker, arcade, etc.) —
    # platform/specs are always unused/null for these; see activity_kind.
    tier_type: Mapped[str] = mapped_column(
        String(20), default=TierType.GAMING.value, server_default=TierType.GAMING.value, nullable=False
    )
    # Free text ("Snooker", "Arcade", "Racing Simulator", or any custom
    # name) — deliberately NOT a fixed enum. A new activity type must never
    # require a backend change; see docs/superpowers/plans/2026-09-07-cafe-activities.md.
    activity_kind: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Taxonomy classification (app/core/taxonomy.json): an activity key
    # ("snooker") or a style key ("pool.american"), plus owner-supplied
    # details. Informational only — pricing/booking never read these. NULL =
    # unclassified (the owner is asked to pick).
    taxonomy_key: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    attributes: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, server_default='{}', nullable=False)
    reserved_walkin_seats: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active_seats_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    preset_category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    price_per_hour: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    # Optional per-length overrides. Null = derive from price_per_hour
    # (hourly/4 for 15 min, hourly/2 for 30 min) — see
    # PricingService.base_price. Only meaningful when min_booking_minutes
    # allows that length.
    price_15m: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    price_30m: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    # Co-op: friends share ONE console. Price = price_per_hour +
    # coop_extra_player_price per extra player, up to coop_max_players.
    # Inventory is unchanged — a co-op booking still holds one unit.
    coop_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false', nullable=False)
    coop_max_players: Mapped[int] = mapped_column(Integer, default=2, server_default='2', nullable=False)
    coop_extra_player_price: Mapped[float] = mapped_column(Numeric(10, 2), default=0, server_default='0', nullable=False)
    # Shortest bookable session for this setup (VR: 15, most consoles: 60)
    # and the length checkout starts on; null = checkout's own default.
    min_booking_minutes: Mapped[int] = mapped_column(Integer, default=60, server_default='60', nullable=False)
    default_booking_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
