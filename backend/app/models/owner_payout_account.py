import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class OwnerPayoutAccount(Base):
    __tablename__ = "owner_payout_accounts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    razorpay_account_id: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    kyc_status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)
    business_pan: Mapped[str | None] = mapped_column(String(20), nullable=True)
    bank_account_number_masked: Mapped[str | None] = mapped_column(String(20), nullable=True)
    bank_ifsc: Mapped[str | None] = mapped_column(String(20), nullable=True)
    account_holder_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    # --- Manual payout fields (Razorpay Route replacement) ---
    upi_vpa: Mapped[str | None] = mapped_column(String(256), nullable=True)
    bank_account_number_encrypted: Mapped[str | None] = mapped_column(String(500), nullable=True)
    bank_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    account_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # "unverified" -> "test_sent" -> "verified". Plain string like kyc_status
    # above, not a SQLAlchemy Enum type — deliberately matching this model's
    # own convention for status fields rather than a different model's.
    payout_verification_status: Mapped[str] = mapped_column(String(20), default="unverified", nullable=False)
    verified_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_by_admin_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    test_transfer_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Bumped by upsert_payout_details() whenever the payout destination
    # itself changes value — UPI VPA, bank account number, bank IFSC, or
    # account holder name (the name money would be sent to/as) — never on
    # a no-op resubmit, and never for non-destination metadata (bank_name,
    # account_type, business_pan). See Task 3 for the exact comparison.
    # Lets a CafePayout snapshot record exactly which version of this
    # account was live when the payout was recorded (see
    # CafePayout.destination_payout_account_version).
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
