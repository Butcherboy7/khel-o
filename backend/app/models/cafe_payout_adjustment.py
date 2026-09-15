import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CafePayoutAdjustment(Base):
    """A signed correction to a café's outstanding payable balance that does
    NOT touch any existing CafePayout/CafePayoutItem/PlatformFee row — e.g. a
    booking refunded after its settlement was already paid out. amount is
    almost always negative (money clawed back). Never delete these rows;
    they are the only record of why an outstanding balance moved without a
    new payout."""
    __tablename__ = "cafe_payout_adjustments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    cafe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cafes.id"), nullable=False, index=True)
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_admin_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
