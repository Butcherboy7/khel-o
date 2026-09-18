from datetime import datetime, timezone
from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Campaign(Base):
    """Config registry for offline/QR marketing drops (e.g. /100, /college).

    Attribution itself rides on the existing analytics_events table (event
    metadata carries campaignId) and User.acquisition_* columns — this table
    only holds the small, human-edited facts about a campaign (its name,
    default source/medium, and which landing page it points at) so new drops
    don't require hardcoding a new admin page per campaign.
    """
    __tablename__ = "campaigns"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    medium: Mapped[str] = mapped_column(String(100), nullable=False)
    landing_page: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
