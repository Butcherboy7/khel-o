from datetime import datetime, timezone
from sqlalchemy import String, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Location(Base):
    """Owner-populated city/town picklist, replacing the old hardcoded
    CITIES_BY_STATE. Rows are created on the fly by the location search/create
    flow (see app/api/v1/locations.py) rather than seeded from any external
    dataset. `name_norm` (trim + collapse whitespace + lowercase) plus the
    unique constraint on (name_norm, state) is what makes "Hyderabad" /
    "hyderabad" / "HYDERABAD" resolve to the same row instead of creating
    duplicates. `state` itself is safe to use bare (no state_norm twin column
    needed) because app.constants.validate_state canonicalizes every state
    value to one of a fixed 36 exact strings before it ever reaches this
    table — two concurrent creates for "Telangana" vs "telangana" both
    resolve to the identical stored string "Telangana" before either insert
    runs, so the constraint sees the same value either way."""
    __tablename__ = "locations"
    __table_args__ = (UniqueConstraint("name_norm", "state", name="uq_locations_name_norm_state"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    name_norm: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    district: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


def normalize_location_name(name: str) -> str:
    """Trim + collapse internal whitespace + lowercase, for name_norm and for
    matching search input against it. Shared by the model layer and the
    search/create endpoint so both apply the exact same rule."""
    return " ".join(name.strip().split()).lower()
