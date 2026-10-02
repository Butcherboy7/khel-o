import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserBadge(Base):
    """A collectible badge a gamer has earned (e.g. 'special_access' from a
    campaign). Kept as a row, not recomputed, because it is granted by an event
    (entering a campaign) rather than derived from bookings like rewards XP."""
    __tablename__ = "user_badges"
    __table_args__ = (UniqueConstraint("user_id", "badge_key", name="uq_user_badges_user_key"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    badge_key: Mapped[str] = mapped_column(String(50), nullable=False)
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("offer_campaigns.id"), nullable=True)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
