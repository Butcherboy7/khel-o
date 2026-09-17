import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PlatformSetting(Base):
    """Singleton row of platform-wide configuration the KHELO team controls.

    There is always exactly one row — created lazily on first read via
    PlatformSettingsRepository.get_or_create().
    """
    __tablename__ = "platform_settings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    commission_percentage: Mapped[float] = mapped_column(Numeric(5, 2), default=10.0, nullable=False)
    # Customer-facing "Platform Fee" charged on top of the booking subtotal —
    # the Super Admin-controlled rate booking_service.py reads at booking
    # creation. Distinct from commission_percentage above, which is an
    # unrelated, not-yet-wired reference value.
    platform_fee_percentage: Mapped[float] = mapped_column(Numeric(5, 2), default=4.0, nullable=False)
    support_email: Mapped[str] = mapped_column(String(255), default="support@khelo.app", nullable=False)
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    maintenance_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Temporary, admin-toggleable escape hatch: when False, the frontend lets
    # anyone post a café review without an eligible completed booking (e.g.
    # for a real visit that didn't go through KHELO). Defaults True so
    # nothing changes until an admin explicitly flips it, and it's meant to
    # be turned back on once the backlog of no-booking reviews is in.
    reviews_require_booking: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
