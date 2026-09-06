import uuid
from datetime import datetime, timezone
from typing import Any
from sqlalchemy import String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AnalyticsEvent(Base):
    """Top-of-funnel tracking only — search/venue-view/booking-started.

    Everything from 'booking started' onward (confirmed/paid/completed) is
    already fully and authoritatively captured by Booking.status and
    Payment.status transitions; duplicating that here would create a second,
    driftable source of truth for no benefit.
    """
    __tablename__ = "analytics_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    cafe_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("cafes.id"), nullable=True)
    event_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )
