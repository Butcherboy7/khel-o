"""Anonymous waitlist rows predate sign-in-only voting and still exist in
production, so downstream behaviour (outreach contacts, launch emails,
unsubscribe, CSV) must keep working for them. The API no longer creates them,
so tests seed them straight through the repository."""
import uuid
from typing import Optional

from tests.conftest import TestAsyncSessionLocal
from app.repositories.waitlist_repository import WaitlistRepository


async def seed_anon(cafe_id: uuid.UUID, session_id: str, contact: Optional[str] = None) -> None:
    async with TestAsyncSessionLocal() as session:
        await WaitlistRepository(session).join(cafe_id, None, session_id, contact)
