import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Enum, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.database import Base

class PaymentStatus(str, enum.Enum):
    CREATED = "created"
    CAPTURED = "captured"
    FAILED = "failed"
    REFUNDED = "refunded"

class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    razorpay_order_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    razorpay_signature: Mapped[str | None] = mapped_column(String(255), nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.CREATED, nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    refund_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
