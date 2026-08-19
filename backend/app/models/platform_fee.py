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
    tds_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    owner_settlement_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    # Razorpay Route split-transfer tracking. transfer_status: pending (not yet
    # attempted) | transferred | failed | skipped_no_linked_account | skipped_route_disabled.
    razorpay_transfer_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    transfer_status: Mapped[str] = mapped_column(String(30), default="pending", nullable=False)
    transfer_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
