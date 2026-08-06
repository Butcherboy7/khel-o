import pytest
import pytest_asyncio
from app.database import engine, Base
import app.models

@pytest_asyncio.fixture(scope="session", autouse=True)
async def init_test_database():
    from sqlalchemy import text
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        try:
            await conn.execute(text("ALTER TABLE cafes ADD COLUMN is_emergency_mode BOOLEAN DEFAULT 0 NOT NULL;"))
        except Exception:
            pass
    yield
