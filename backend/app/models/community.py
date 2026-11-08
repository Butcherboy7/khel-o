"""Community page: the weekly poll, who tapped Join on the WhatsApp group, and
what people contribute ("suggest a café", "share your photos").

Joining is recorded when a logged-in person taps Join. We cannot see inside
WhatsApp, so this means "tapped Join", not "is in the group".
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class CommunityPoll(Base):
    __tablename__ = "community_polls"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    question: Mapped[str] = mapped_column(String(160), nullable=False)
    options: Mapped[list] = mapped_column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)  # list of strings
    closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Shown only to people who tapped Join (members-only early access).
    members_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    members_code_note: Mapped[str | None] = mapped_column(String(160), nullable=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="active")  # active | closed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class CommunityPollVote(Base):
    __tablename__ = "community_poll_votes"
    __table_args__ = (UniqueConstraint("poll_id", "user_id", name="uq_poll_vote_user"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    poll_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("community_polls.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    option_index: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class CommunityMember(Base):
    __tablename__ = "community_members"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class CommunityContribution(Base):
    __tablename__ = "community_contributions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)  # cafe | photos
    title: Mapped[str] = mapped_column(String(120), nullable=False)  # café name, or event the photos are from
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)  # area + why, or a photo link
    show_name: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # credit on the wall
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="new")  # new | approved | declined
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
