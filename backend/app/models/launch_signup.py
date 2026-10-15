import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LaunchSignup(Base):
    """A player on a game-launch list (GTA 6 first): "message me when launch
    slots open". Public, no account needed. Outreach contacts them the way
    they picked, so the consent tick is stored with the row.

    One row per phone per launch: joining again updates the row.
    """
    __tablename__ = "launch_signups"
    __table_args__ = (UniqueConstraint("launch", "phone", name="uq_launch_signups_launch_phone"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # Key from app.api.v1.launch_list.LAUNCHES, e.g. 'gta6'.
    launch: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    # 'whatsapp' | 'text' | 'call'
    contact_method: Mapped[str] = mapped_column(String(10), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    consent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Where they came from (the /c/<slug> link forwards utm tags).
    utm_source: Mapped[str | None] = mapped_column(String(80), nullable=True)
    utm_campaign: Mapped[str | None] = mapped_column(String(80), nullable=True)
    utm_content: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
