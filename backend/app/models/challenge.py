import uuid
from datetime import datetime, timezone

from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Challenge(Base):
    """A free, in-person gaming challenge at a partner café (KHELO Tekken
    Challenge #01 first). Everything about it lives in this row, so the next
    challenge at another café is a new row, never new code.

    Public pages say "challenge", "free sign-up", "spots" and "waitlist".

    status: draft (invisible to the public) | open (sign-ups on) |
    closed (sign-ups off, page still up) | live (the day itself) | finished |
    cancelled (page still up with a notice; final). Which moves are allowed,
    and through which action, is challenge_service.check_status_change.
    """
    __tablename__ = "challenges"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(60), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    cafe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cafes.id"), nullable=False, index=True)
    game: Mapped[str] = mapped_column(String(80), nullable=False)
    # One short line under the title: "One PS5 on a big projector".
    setup_line: Mapped[str | None] = mapped_column(String(160), nullable=True)
    # "Single elimination + 3rd-place match": shown as written.
    format: Mapped[str] = mapped_column(String(120), nullable=False)
    best_of: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    final_best_of: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    checkin_opens_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    checkin_closes_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Confirmed spots; everyone after joins the waitlist (no limit).
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    min_age: Mapped[int] = mapped_column(Integer, default=18, nullable=False)
    status: Mapped[str] = mapped_column(String(12), default="draft", nullable=False)
    rules_md: Mapped[str] = mapped_column(Text, default="", nullable=False)
    prizes_md: Mapped[str] = mapped_column(Text, default="", nullable=False)
    cover_image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # The WhatsApp community link shown after sign-up (optional to join).
    community_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    instagram_handle: Mapped[str | None] = mapped_column(String(60), nullable=True)
    # Goes up by one every time who-has-a-spot changes. A change only saves if
    # nobody else changed it first (see challenge_service.claim), so the last
    # spot can never go to two people, even without a row lock.
    spot_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # The day itself (wave 2): when check-in was closed and the draw made.
    checkin_closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    drawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    champion_photo_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # Reward settings (prize hours, % off, how long they last). Missing keys
    # fall back to challenge_rewards.DEFAULTS.
    rewards_config: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    # Set by Finish; cleared again by Reopen.
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # How results are scored: 'games' (games won, Tekken) | 'goals' (EA SPORTS
    # FC, one game, level goals settled on penalties). None = 'games'.
    result_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Time estimate settings: minutes per match, for the final, between matches.
    plan_config: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class ChallengeEntry(Base):
    """One person signed up for a challenge: confirmed (has a spot) or on the
    waitlist, in join order. A confirmed person who drops out frees their spot
    and the first waitlist person moves up.

    status: confirmed | waitlist | withdrawn | no_show
    coming: their answer to "Coming on the day?" — 'yes' | 'no' | None (not answered)
    """
    __tablename__ = "challenge_entries"
    __table_args__ = (
        UniqueConstraint("challenge_id", "user_id", name="uq_challenge_entries_user"),
        UniqueConstraint("challenge_id", "phone", name="uq_challenge_entries_phone"),
        # Join order is unique, so two simultaneous sign-ups can never share a
        # place in line even if the row lock were ever skipped.
        UniqueConstraint("challenge_id", "position", name="uq_challenge_entries_position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    challenge_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("challenges.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    # Gamer tag. Public pages show this, or first name + last initial.
    display_name: Mapped[str | None] = mapped_column(String(40), nullable=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    main_character: Mapped[str | None] = mapped_column(String(60), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False)
    coming: Mapped[str | None] = mapped_column(String(3), nullable=True)
    coming_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Moved up from the waitlist: the team still has to tell them.
    promoted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    told_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # How they were told they moved up: 'app' (in-app notification) |
    # 'in_person' (at the door) | 'whatsapp'. None on older rows.
    told_via: Mapped[str | None] = mapped_column(String(10), nullable=True)
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 'player' (Can't make it / said no) | 'admin' | 'silent' (didn't answer in time)
    withdrawn_by: Mapped[str | None] = mapped_column(String(10), nullable=True)
    present: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consent_rules: Mapped[bool] = mapped_column(Boolean, nullable=False)
    consent_age: Mapped[bool] = mapped_column(Boolean, nullable=False)
    consent_filming: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    consent_updates: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Which wording they agreed to. None = signed up before versioning.
    consent_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    utm_source: Mapped[str | None] = mapped_column(String(80), nullable=True)
    utm_campaign: Mapped[str | None] = mapped_column(String(80), nullable=True)
    utm_content: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # Our own test sign-ups: left out of every count and report.
    is_test: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class ChallengeMatch(Base):
    """One match in the bracket. Round 1 is the first round; the final is the
    last round, and the 3rd-place match shares the final's round number with
    is_third_place set. A bye has one player and is won automatically."""
    __tablename__ = "challenge_matches"
    __table_args__ = (
        UniqueConstraint("challenge_id", "round", "position", "is_third_place", name="uq_challenge_matches_slot"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    challenge_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("challenges.id", ondelete="CASCADE"), nullable=False, index=True)
    round: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    is_third_place: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    entry_a_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("challenge_entries.id", ondelete="SET NULL"), nullable=True)
    entry_b_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("challenge_entries.id", ondelete="SET NULL"), nullable=True)
    winner_entry_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("challenge_entries.id", ondelete="SET NULL"), nullable=True)
    score_a: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score_b: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # A level 'goals' result settled another way: 'penalties', with its score.
    tiebreak: Mapped[str | None] = mapped_column(String(12), nullable=True)
    tiebreak_a: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tiebreak_b: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bye: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Put off (a player is late): goes to the back of the ready queue until it is brought back.
    postponed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
