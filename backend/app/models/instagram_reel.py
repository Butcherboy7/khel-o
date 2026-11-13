"""Reels we post on Instagram, shown on Explore and Community ("KHEL-O on Instagram").

Admin pastes the reel link and uploads a cover (Instagram does not give us the
thumbnail without a Meta app token). Tapping a card opens the reel on Instagram.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class InstagramReel(Base):
    __tablename__ = "instagram_reels"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    cover_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    title: Mapped[str] = mapped_column(String(80), nullable=False)
    tag: Mapped[str | None] = mapped_column(String(24), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
