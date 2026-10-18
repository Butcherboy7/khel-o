from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PhotoColor(Base):
    """The main colour of a café photo, keyed by its URL. Shown behind the
    photo while it loads, so a card is coloured from the first frame instead
    of an empty box.

    Kept apart from Cafe.photos on purpose: photos are rewritten from several
    places (owner editor, onboarding, admin lead listings), and a colour stored
    inside each entry would be dropped by the first one that rebuilds the list.
    A photo's URL never changes its bytes (uploads get a fresh random key), so
    a colour computed once stays right. See app/services/photo_colors.py.
    """
    __tablename__ = "photo_colors"

    url: Mapped[str] = mapped_column(String(1000), primary_key=True)
    # '#rrggbb'
    color: Mapped[str] = mapped_column(String(7), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
