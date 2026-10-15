import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuthAttempt(Base):
    """One sign-up, login or password-reset request, kept for 30 days.

    Rate limits count these rows (so both backend workers agree), and the admin
    "Bots stopped" card reads the blocked ones. Emails are stored only as a
    SHA-256 hash, never in plain text.
    """
    __tablename__ = "auth_attempts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # register | login | forgot
    ip: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    email_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    outcome: Mapped[str] = mapped_column(String(10), nullable=False)  # allowed | blocked
    reason: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True
    )
