import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CafeSuggestion(Base):
    """A cafe a player wants on KHEL-O (usually for GTA 6) that isn't listed.
    Public, no account. Outreach reaches the cafe with the maps link and phone,
    then tells the suggester when it is listed.
    status: new | contacted | listed | no_answer.
    """
    __tablename__ = "cafe_suggestions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    cafe_name: Mapped[str] = mapped_column(String(120), nullable=False)
    city: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    maps_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cafe_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    suggester_name: Mapped[str] = mapped_column(String(80), nullable=False)
    suggester_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="new", index=True)
    source: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
