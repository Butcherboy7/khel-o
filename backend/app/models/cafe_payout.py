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
    ON_HOLD = "on_hold"
    DISPUTED = "disputed"


class PayoutDestinationType(str, enum.Enum):
    UPI = "upi"
    BANK = "bank"


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
    # --- Payout destination snapshot ---
    # Populated once, from the live OwnerPayoutAccount, at the moment this
    # payout is created (see CafePayoutRepository.create_payout). Never
    # updated afterward — a later change to the owner's OwnerPayoutAccount
    # must never rewrite what this historical payout actually paid to.
    # NULL on every row created before this feature shipped; the UI shows
    # "not recorded (pre-dates this feature)" for those rather than
    # backfilling a guess.
    destination_type: Mapped[str | None] = mapped_column(
        Enum(PayoutDestinationType, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
    )
    destination_upi_vpa: Mapped[str | None] = mapped_column(String(256), nullable=True)
    destination_bank_account_masked: Mapped[str | None] = mapped_column(String(20), nullable=True)
    destination_bank_ifsc: Mapped[str | None] = mapped_column(String(20), nullable=True)
    destination_account_holder_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    destination_payout_account_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("owner_payout_accounts.id"), nullable=True
    )
    destination_payout_account_version: Mapped[int | None] = mapped_column(nullable=True)
