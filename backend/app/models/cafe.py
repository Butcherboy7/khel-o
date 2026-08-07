import uuid
from datetime import datetime, timezone, time
from typing import Any
from sqlalchemy import String, Text, Boolean, DateTime, Enum, ForeignKey, Numeric, Integer, Time, JSON
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.database import Base

class VerificationStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"
    SUSPENDED = "suspended"

class Cafe(Base):
    __tablename__ = "cafes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    address_line1: Mapped[str] = mapped_column(String(255), nullable=False)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    pincode: Mapped[str] = mapped_column(String(10), nullable=False)
    latitude: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    opening_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    closing_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    verification_status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus, values_callable=lambda x: [e.value for e in x]),
        default=VerificationStatus.PENDING,
        nullable=False
    )
    rejection_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_emergency_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    total_seats: Mapped[int | None] = mapped_column(Integer, nullable=True)
    app_bookable_seats: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reserved_walkin_seats: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bookable_stations: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bookings_paused: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    amenities: Mapped[dict[str, Any]] = mapped_column(JSON, default=list, nullable=False)
    photos: Mapped[dict[str, Any]] = mapped_column(JSON, default=list, nullable=False)
    supported_games: Mapped[dict[str, Any]] = mapped_column(JSON, default=list, nullable=False)
    business_pan: Mapped[str | None] = mapped_column(String(20), nullable=True)
    gstin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    legal_document_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cancellation_policy: Mapped[str | None] = mapped_column(Text, nullable=True)
    house_rules: Mapped[dict[str, Any]] = mapped_column(JSON, default=list, nullable=False)
    social_links: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    draft_data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    booking_cap_total: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    booking_cap_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
