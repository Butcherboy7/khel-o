import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CafePayoutStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    PAID = "paid"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CafePayout(Base):
    """One manual bank-transfer payout to a café, covering every currently
    outstanding PlatformFee row at creation time. See CafePayoutItem for the
    per-booking breakdown this payout covers."""
    __tablename__ = "cafe_payouts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    cafe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cafes.id"), nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    utr_reference: Mapped[str] = mapped_column(String(100), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[CafePayoutStatus] = mapped_column(
        Enum(CafePayoutStatus, values_callable=lambda x: [e.value for e in x]),
        default=CafePayoutStatus.PAID,
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    proof_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_admin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
