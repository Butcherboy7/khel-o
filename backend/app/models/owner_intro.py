import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OwnerIntro(Base):
    """A player introducing us to a café owner they know ("Know the owner?
    drop their contact"). Goes straight to the outreach team on the admin
    Leads page — a warm intro converts far better than a cold walk-in.

    cafe_id is set when it came from a lead café's page; the general form
    (any café, not yet on KHEL-O) only has the typed cafe_name / area.
    """
    __tablename__ = "owner_intros"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    cafe_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("cafes.id", ondelete="SET NULL"), nullable=True, index=True)
    cafe_name: Mapped[str] = mapped_column(String(160), nullable=False)
    area: Mapped[str | None] = mapped_column(String(160), nullable=True)
    owner_name: Mapped[str] = mapped_column(String(120), nullable=False)
    owner_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    # 'regular' | 'friend_family' | 'work_there' | 'other'
    relation: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The submitter confirmed the owner is fine with KHEL-O calling them.
    owner_consent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    submitted_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # 'new' | 'contacted' | 'onboarded' | 'dead'
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="new")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
