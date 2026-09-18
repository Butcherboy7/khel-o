import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class PlatformFee(Base):
    __tablename__ = "platform_fees"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    convenience_fee: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    gateway_fee: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    # The platform fee % rate actually applied to this booking at creation
    # time (from PlatformSetting.platform_fee_percentage). Stored per booking
    # so a later Super Admin rate change never changes what a past booking
    # is shown to have paid — this column, not the live setting, is
    # authoritative for historical bookings.
    fee_percentage_applied: Mapped[float] = mapped_column(Numeric(5, 2), default=4.0, nullable=False)
    tds_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    owner_settlement_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    # Razorpay Route split-transfer tracking. transfer_status: pending (not yet
    # attempted) | transferred | failed | skipped_no_linked_account | skipped_route_disabled.
    razorpay_transfer_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    transfer_status: Mapped[str] = mapped_column(String(30), default="pending", nullable=False)
    transfer_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Whether Razorpay has actually settled this payment's funds to KHELO's
    # bank account, per the settlement recon API — NOT a predicted T+2 date.
    # pending_settlement -> settled. Only "settled" rows are eligible for
    # weekly café payout allocation (see CafePayoutRepository._outstanding_base_query).
    settlement_status: Mapped[str] = mapped_column(String(20), default="pending_settlement", nullable=False)
    razorpay_settlement_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Set when this fee must never become payable (e.g. refunded before
    # settlement was confirmed) even if it later appears settled in recon.
    excluded_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
