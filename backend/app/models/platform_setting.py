import uuid
from datetime import date, datetime, timezone
from sqlalchemy import String, Boolean, Date, DateTime, Integer, Numeric, ForeignKey
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
    # GTA 6 launch: while on, a player booking a GTA 6-capable console asks for a slot and the founder
    # checks it with the café before the player can pay. Off (or past the until date) = normal booking.
    gta6_requests_on: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    gta6_requests_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    gta6_whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Referrals + first-booking credits (KHEL-O pays; see services/referrals.py). Whole rupees.
    referrals_on: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    welcome_credit: Mapped[int] = mapped_column(Integer, default=15, nullable=False, server_default="15")
    # Posted only in WhatsApp community announcements; typed in checkout's code box. Null = off.
    community_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    community_credit: Mapped[int] = mapped_column(Integer, default=15, nullable=False, server_default="15")
    referral_reward: Mapped[int] = mapped_column(Integer, default=15, nullable=False, server_default="15")
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
