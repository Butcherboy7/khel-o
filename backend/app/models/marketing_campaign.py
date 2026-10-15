import uuid
from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MarketingCampaign(Base):
    """A link the team posts somewhere (a boosted reel, a bio, a QR poster).

    Only campaigns created here show on the admin Campaigns page; stray UTM
    tags seen in visits stay in Traffic as "other sources". The short link
    /c/<slug> forwards to `landing_path` stamped with utm_source/medium from
    the channel and utm_campaign=<slug>, which is what the report matches on.
    """
    __tablename__ = "marketing_campaigns"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # instagram_reel | instagram_story | instagram_bio | whatsapp | qr_poster | other
    channel: Mapped[str] = mapped_column(String(30), nullable=False)
    paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    landing_path: Mapped[str] = mapped_column(String(300), nullable=False, default="/")
    utm_source: Mapped[str] = mapped_column(String(40), nullable=False)
    utm_medium: Mapped[str] = mapped_column(String(40), nullable=False)
    spend_inr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # live | ended | archived
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="live")
    started_on: Mapped[date] = mapped_column(Date, nullable=False)
    # Other UTM tags that also count as this campaign, e.g. Meta's own
    # [{"source": "ig", "campaign": "23860597373710791"}] on a boosted reel.
    extra_tags: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default="[]")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
