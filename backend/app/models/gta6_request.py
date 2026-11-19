"""GTA 6 slot requests: during the launch a player asks for a GTA 6 slot, the founder checks it with the café,
and Allow creates a held (pending-payment) booking the player then pays.
status: requested | approved | declined | expired | cancelled (a paid approved request shows as booked)."""
import uuid
from datetime import date, datetime, time, timezone

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Gta6SlotRequest(Base):
    __tablename__ = "gta6_slot_requests"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    reference: Mapped[str] = mapped_column(String(12), unique=True, index=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    cafe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cafes.id"), nullable=False, index=True)
    tier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("hardware_tiers.id"), nullable=False)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    hours: Mapped[float] = mapped_column(Float, nullable=False)
    seats: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # "gta6": priced by the café's GTA 6 listing. "other": any other game on the same console, tier price.
    game: Mapped[str] = mapped_column(String(8), nullable=False, default="gta6", server_default="gta6")
    console_label: Mapped[str | None] = mapped_column(String(60), nullable=True)   # "PS5 Pro 2", as the player picked it
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="requested", index=True)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    suggestion: Mapped[str | None] = mapped_column(Text, nullable=True)
    booking_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bookings.id"), nullable=True)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
