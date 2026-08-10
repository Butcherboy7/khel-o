import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, Enum, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.database import Base

class NotificationType(str, enum.Enum):
    BOOKING_CONFIRMED = "booking_confirmed"
    BOOKING_REMINDER = "booking_reminder"
    BOOKING_CANCELLED = "booking_cancelled"
    PAYMENT_SUCCESS = "payment_success"
    PAYMENT_FAILED = "payment_failed"
    PROMOTION = "promotion"
    SYSTEM = "system"

class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    notification_type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, values_callable=lambda x: [e.value for e in x]),
        default=NotificationType.SYSTEM,
        nullable=False
    )
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    extra_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
