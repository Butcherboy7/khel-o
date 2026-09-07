import uuid
from datetime import datetime, timezone, date, time
from sqlalchemy import String, Enum as SQLEnum, Float, Text, Boolean, Date, Time, DateTime, Integer, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.database import Base

class BookingStatus(str, enum.Enum):
    PENDING_PAYMENT = "pending_payment"
    CONFIRMED = "confirmed"
    CHECKED_IN = "checked_in"
    ACTIVE = "active"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    NO_SHOW = "no_show"
    FAILED = "failed"
    # Owner/admin manually freed a still-PENDING_PAYMENT slot before the
    # natural 15-minute TTL — never used to delete/replace a booking, only
    # as a terminal transition from PENDING_PAYMENT. See
    # booking_repository.get_overlapping_bookings_count: this status isn't
    # in the CONFIRMED/fresh-PENDING_PAYMENT OR-clause, so a released
    # booking stops counting toward capacity the instant this is set.
    RELEASED_BY_OWNER = "released_by_owner"

class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_reference: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    gamer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    cafe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cafes.id"), nullable=False)
    hardware_tier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("hardware_tiers.id"), nullable=False)
    seats_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    duration_hours: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False)
    base_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    discount_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    gateway_fee: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[BookingStatus] = mapped_column(
        SQLEnum(BookingStatus, values_callable=lambda x: [e.value for e in x]),
        default=BookingStatus.PENDING_PAYMENT,
        nullable=False
    )
    promotion_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("promotions.id"), nullable=True)
    qr_code_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    game: Mapped[str | None] = mapped_column(String(100), nullable=True)
    reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actual_start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checked_in_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checkin_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    convenience_fee: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    released_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    release_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

