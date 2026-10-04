"""Tournaments: organisers, events, entries and bracket matches.

An organiser is whoever runs the event: KHEL-O, a café, or a company. Its
members manage its tournaments from /host. See
docs/superpowers/specs/2026-10-05-tournaments-mvp-design.md.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Organiser(Base):
    __tablename__ = "organisers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)  # khelo | cafe | company
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cafe_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("cafes.id", ondelete="CASCADE"), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)


class OrganiserMember(Base):
    __tablename__ = "organiser_members"
    __table_args__ = (UniqueConstraint("organiser_id", "user_id", name="uq_organiser_member"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organiser_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organisers.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(10), nullable=False, default="staff")  # owner | staff
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)


class Tournament(Base):
    __tablename__ = "tournaments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organiser_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organisers.id", ondelete="CASCADE"), nullable=False, index=True)
    cafe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cafes.id"), nullable=False, index=True)
    hardware_tier_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hardware_tiers.id", ondelete="SET NULL"), nullable=True, index=True)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    game_key: Mapped[str] = mapped_column(String(30), nullable=False)
    game_name: Mapped[str] = mapped_column(String(60), nullable=False)
    team_size: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    format: Mapped[str] = mapped_column(String(20), nullable=False, default="single_elim")
    third_place: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    max_teams: Mapped[int] = mapped_column(Integer, nullable=False)
    entry_fee: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    # Estimated end (start + bracket estimate + buffer); also the station reservation window.
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    check_in_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    registration_closes_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    match_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    stations: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    prizes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # [{"place": "1st", "prize": "₹3,000"}]
    sponsor_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    sponsor_logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    about: Mapped[str | None] = mapped_column(Text, nullable=True)
    rules: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="draft", index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)


class TournamentEntry(Base):
    """One team (a solo player is a team of one)."""
    __tablename__ = "tournament_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tournament_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    gamer_tag: Mapped[str] = mapped_column(String(40), nullable=False)
    team_name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    teammates: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # held (paying, 10 min) | confirmed | waitlist | cancelled | removed
    status: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="online")  # online | walk_in
    check_in_code: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    seed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    razorpay_order_id: Mapped[str | None] = mapped_column(String(80), nullable=True, unique=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    refund_due: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    final_place: Mapped[int | None] = mapped_column(Integer, nullable=True)
    points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)


class TournamentMatch(Base):
    __tablename__ = "tournament_matches"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tournament_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False, index=True)
    round: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    is_third_place: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    entry_a_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tournament_entries.id", ondelete="SET NULL"), nullable=True)
    entry_b_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tournament_entries.id", ondelete="SET NULL"), nullable=True)
    score_a: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score_b: Mapped[int | None] = mapped_column(Integer, nullable=True)
    winner_entry_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tournament_entries.id", ondelete="SET NULL"), nullable=True)
    # waiting (players not known yet) | ready | called | done
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="waiting")
    walkover: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    station: Mapped[int | None] = mapped_column(Integer, nullable=True)
    called_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
