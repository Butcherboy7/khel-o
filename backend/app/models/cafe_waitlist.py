import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CafeWaitlistEntry(Base):
    """One person asking to be told when a café starts taking bookings.

    One row per person per café. The count is shown to players and used as the
    demand pitch to café owners ("37 people asked us to switch on booking for
    you"), so a duplicate silently inflates a number both audiences are told is
    real — hence the partial unique indexes in migration 020 rather than
    dedup-on-read.

    Signed-in visitors are keyed on user_id; signed-out ones on session_id (the
    same id the analytics client already sends, see lib/api/analyticsEvents.ts).
    """
    __tablename__ = "cafe_waitlist"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    cafe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cafes.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # Only set for signed-out visitors who supplied a phone/email to be reached on.
    contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Stamped by the phase-2 launch blast; unused in phase 1 but present so the
    # table does not need re-migrating for it.
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
