import uuid
from datetime import datetime, timezone
from typing import Any
from sqlalchemy import String, Boolean, DateTime, Enum, JSON
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.database import Base

class UserRole(str, enum.Enum):
    GAMER = "gamer"
    CAFE_OWNER = "cafe_owner"
    STAFF = "staff"
    ADMIN = "admin"

# Fixed, code-defined taxonomy (not DB-driven) -- new activities are added
# here, no migration needed since `User.preferences.activities` is a JSON
# array of the string values.
GAMING_ACTIVITIES = {"pc_gaming", "ps5", "xbox", "nintendo_switch"}
NON_GAMING_ACTIVITIES = {"snooker", "eight_ball_pool", "bowling", "carrom", "foosball"}
ALL_ACTIVITIES = GAMING_ACTIVITIES | NON_GAMING_ACTIVITIES
PREFERRED_TIERS = {"budget", "mid_range", "high_end", "ultra"}

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=UserRole.GAMER
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    acquisition_source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    acquisition_medium: Mapped[str | None] = mapped_column(String(100), nullable=True)
    acquisition_campaign: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Activity-based preferences: {"activities": [...], "preferredTier":
    # str|None, "favoriteGames": [...]}. Stored as one blob rather than a
    # separate table/columns since it's a single user-owned JSON document
    # with no independent lifecycle or ownership rules.
    preferences: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    # Owner/staff in-app guidance progress ({sessions, pages: {key: {views, dismissed}}}).
    # Kept apart from `preferences`, which the profile page replaces wholesale.
    guide_state: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
