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
    __table_args__ = (
        UniqueConstraint("poll_id", "user_id", name="uq_poll_vote_user"),
        UniqueConstraint("poll_id", "device_id", name="uq_poll_vote_device"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    poll_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("community_polls.id", ondelete="CASCADE"), nullable=False, index=True)
    # A vote comes from a signed-in person or, with no login, from one phone (device_id).
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
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
    # Sent without an account: who to thank and reach.
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    submitter_name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    contact: Mapped[str | None] = mapped_column(String(160), nullable=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="new")  # new | approved | declined
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class CommunityJoin(Base):
    """One phone that tapped Join (which opens the WhatsApp group). We cannot see
    inside WhatsApp, so this is "tapped Join", counted once per phone."""
    __tablename__ = "community_joins"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    device_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    source: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)  # ad / campaign slug
    in_app: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class CommunityLead(Base):
    """An email and/or phone someone chose to leave, and whether we may send promotions."""
    __tablename__ = "community_leads"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String(254), nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    source: Mapped[str | None] = mapped_column(String(60), nullable=True)
    marketing_ok: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    unsubscribed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class CommunityPost(Base):
    """The one thing the team types each week."""
    __tablename__ = "community_posts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    headline: Mapped[str] = mapped_column(String(120), nullable=False)
    line: Mapped[str | None] = mapped_column(String(200), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    button_label: Mapped[str | None] = mapped_column(String(40), nullable=True)
    button_url: Mapped[str | None] = mapped_column(String(300), nullable=True)
    # The pinned post sits on top; hidden ones stay in admin only; show_from/until schedule a post.
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    show_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    show_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False, index=True)


class CommunityGroupSize(Base):
    """The WhatsApp group size, typed in by an admin (websites cannot read it)."""
    __tablename__ = "community_group_sizes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class CommunityPhoto(Base):
    """The photo wall on the community page. Admin uploads, orders, captions, hides, and picks the top photo."""
    __tablename__ = "community_photos"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    caption: Mapped[str | None] = mapped_column(String(120), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_hero: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class CommunitySettings(Base):
    """One row (id=1): the page's top text, Join button text, tab order, which sections show."""
    __tablename__ = "community_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    data: Mapped[dict] = mapped_column(JSON().with_variant(JSONB(), "postgresql"), nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)
