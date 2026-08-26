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
    reserved_walkin_seats: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active_seats_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    preset_category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    price_per_hour: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
