"""Drops: a limited, pre-booked launch event at a café (e.g. "GTA 6 Launch Drop").

A drop is a few fixed session blocks (date + start/end, all ending before
midnight), each with a fixed number of seats. People reserve a seat by paying
a small deposit online; the rest of the block price is paid at the café.
Drops are separate from normal bookings on purpose: no offers or coupons ever
apply, and the seat count is its own atomic counter (drop_blocks.seats_taken).
"""
import uuid
from datetime import date, datetime, time, timezone

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, Time, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Drop(Base):
    __tablename__ = "drops"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(60), unique=True, index=True, nullable=False)
    cafe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cafes.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    game: Mapped[str] = mapped_column(String(80), nullable=False)
    cover_image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # Short plain-English line under the title ("PS5, big screen, 5 hours").
    tagline: Mapped[str | None] = mapped_column(String(160), nullable=True)
    price_per_hour: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    # Paid online per seat to hold it. The rest of the block price is paid at the café.
    deposit_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=99)
    # Flexible hours: when set, people pick 1..max_hours inside a session. The
    # fee is deposit_amount up to 3 hours and deposit_amount_long for 4+ hours;
    # it is counted toward the bill but never refunded (unless the café cancels).
    max_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    deposit_amount_long: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    # Rolling schedule: one block a day, made on demand for the next 7 days, until ends_on
    # (starts_on + 13 at most). After ends_on the drop is over and café booking is normal.
    daily_start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    daily_end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    daily_seats: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # The cafe's rig (PS5, Xbox, PC...) this drop runs on. daily_seats of it are kept for the drop.
    hardware_tier_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hardware_tiers.id", ondelete="SET NULL"), nullable=True)
    starts_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    ends_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    max_seats_per_user: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    # Before public_starts_at, reserving needs this code (shared in the community).
    early_access_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    early_access_starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    public_starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # draft (only the café sees it) | live | cancelled
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="draft")
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class DropBlock(Base):
    """One fixed session (e.g. Thu 19 Nov, 6 PM to 11 PM) with N seats."""
    __tablename__ = "drop_blocks"
    __table_args__ = (
        CheckConstraint("end_time > start_time", name="ck_drop_blocks_same_day"),
        UniqueConstraint("drop_id", "session_date", "start_time", name="uq_drop_blocks_day"),
        CheckConstraint("seats_taken >= 0 AND seats_taken <= seats_total", name="ck_drop_blocks_seats"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    drop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("drops.id", ondelete="CASCADE"), nullable=False, index=True)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    seats_total: Mapped[int] = mapped_column(Integer, nullable=False)
    # Seats held by paid or still-paying reservations. Only ever changed with a
    # single conditional UPDATE (see services/drop_service.py), never read-then-write.
    seats_taken: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class DropReservation(Base):
    __tablename__ = "drop_reservations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    reference: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    drop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("drops.id", ondelete="CASCADE"), nullable=False, index=True)
    block_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("drop_blocks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    seats: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # Flexible-hours reservations only (null = the whole session, the old way).
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    given_away_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # pending_payment | confirmed | checked_in | expired | cancelled | refunded | given_away
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending_payment", index=True)
    # Money, all for the whole reservation (every seat):
    block_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    deposit_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    balance_due: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    razorpay_order_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    refund_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    refund_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The QR pass: /drops/<slug>/pass/<checkin_token>
    checkin_token: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checked_in_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    used_early_access: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # 'online' = paid in the app. 'offline' = the café sold the seat and took the
    # cash itself; user_id is then the staff member who wrote it down.
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="online", server_default="online")
    guest_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    guest_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class DropWaitlist(Base):
    """'Tell me when it opens', before the public start."""
    __tablename__ = "drop_waitlist"
    __table_args__ = (UniqueConstraint("drop_id", "phone", name="uq_drop_waitlist_phone"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    drop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("drops.id", ondelete="CASCADE"), nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
