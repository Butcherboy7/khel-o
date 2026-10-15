from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

# Room for an ad-driven spike: up to 30 connections per worker (2 workers stay
# well under Postgres's 100), dead connections replaced before use. SQLite
# (tests) has no pool to size.
_pool = (
    {"pool_size": 10, "max_overflow": 20, "pool_pre_ping": True, "pool_recycle": 1800}
    if settings.DATABASE_URL.startswith("postgresql")
    else {}
)

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=(settings.ENVIRONMENT == "development"),
    future=True,
    **_pool,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
