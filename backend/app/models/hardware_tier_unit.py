import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UnitStatus(str, enum.Enum):
    AVAILABLE = "available"
    MAINTENANCE = "maintenance"


class HardwareTierUnit(Base):
    """One physical bookable unit within an activity tier — e.g. "Table 2"
    within a "Snooker" tier with total_seats=4. Never assigned to a specific
    Booking (bookings still claim pooled capacity via HardwareTier the same
    way every tier works today) — a unit's only job is to let an owner mark
    one physical table/machine as unavailable without touching the rest of
    the tier's capacity or deleting the activity. See
    HardwareTierUnitRepository.count_in_maintenance, which is subtracted
    from the tier's effective bookable capacity at booking time."""
    __tablename__ = "hardware_tier_units"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("hardware_tiers.id", ondelete="CASCADE"), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default=UnitStatus.AVAILABLE.value, server_default=UnitStatus.AVAILABLE.value, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
