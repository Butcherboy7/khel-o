import uuid
from sqlalchemy import ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CafePayoutItem(Base):
    """Links a CafePayout to the specific PlatformFee rows it covers. The
    unique constraint on platform_fee_id is what permanently excludes a
    booking's settlement from ever being paid out twice."""
    __tablename__ = "cafe_payout_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    payout_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cafe_payouts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    platform_fee_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("platform_fees.id"), nullable=False, unique=True, index=True
    )
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    amount_allocated: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
