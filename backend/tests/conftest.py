import os
from pathlib import Path
import uuid
from uuid import uuid4
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text

# Disable Sentry reporting for test runs so intentional test-exception paths
# don't get reported to the real project as noise.
os.environ["SENTRY_DSN"] = ""

from app.config import BASE_DIR
from app.core.security import create_access_token
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
import app.models

# Configure dedicated isolated SQLite database for pytest executions
TEST_DB_PATH = BASE_DIR / "test_khel_o.db"
TEST_DATABASE_URL = f"sqlite+aiosqlite:///{TEST_DB_PATH.as_posix()}"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    echo=False,
    future=True
)

TestAsyncSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

# Patch app.database globally so all imports of engine / AsyncSessionLocal route to test database
import app.database
app.database.engine = test_engine
app.database.AsyncSessionLocal = TestAsyncSessionLocal

# Override FastAPI get_db dependency globally for tests
async def override_get_db():
    async with TestAsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

from app.main import app
from app.database import get_db
app.dependency_overrides[get_db] = override_get_db

# Monkey-patch db.commit to auto-create role mappings for User objects before commit
_original_commit = AsyncSession.commit
_original_add = AsyncSession.add

def _patched_commit(self, *args, **kwargs):
    """Auto-create role mappings for User objects before commit."""
    for instance in list(self.new):
        if isinstance(instance, User) and instance.id is not None:
            has_gamer = False
            has_primary = False
            role = instance.role
            
            for role_mapping in self.new:
                if isinstance(role_mapping, UserRoleMapping) and role_mapping.user_id == instance.id:
                    if role_mapping.role == UserRole.GAMER:
                        has_gamer = True
                    if role_mapping.role == role:
                        has_primary = True
            
            # Add missing gamer role
            if not has_gamer:
                _original_add(self, UserRoleMapping(
                    id=uuid.uuid4(),
                    user_id=instance.id,
                    role=UserRole.GAMER,
                    cafe_id=None
                ))
            
            # Add missing primary role
            if not has_primary and role != UserRole.GAMER:
                _original_add(self, UserRoleMapping(
                    id=uuid.uuid4(),
                    user_id=instance.id,
                    role=role,
                    cafe_id=None
                ))
    
    return _original_commit(self, *args, **kwargs)

AsyncSession.commit = _patched_commit

@pytest_asyncio.fixture(scope="session", autouse=True)
async def init_test_database():
    from app.database import Base
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
        try:
            await conn.execute(text("ALTER TABLE cafes ADD COLUMN is_emergency_mode BOOLEAN DEFAULT 0 NOT NULL;"))
        except Exception:
            pass
    yield
    await test_engine.dispose()
    if TEST_DB_PATH.exists():
        try:
            os.remove(TEST_DB_PATH)
        except Exception:
            pass

def auth_headers(user, is_admin: bool = False):
    """Generate auth headers for a user in tests."""
    role = "admin" if is_admin else (user.role.value if hasattr(user.role, "value") else str(user.role))
    token = create_access_token(subject=str(user.id), role=role)
    return {"Authorization": f"Bearer {token}"}

async def create_test_user(
    db: AsyncSession,
    email: str = None,
    role: UserRole = UserRole.GAMER,
    full_name: str = "Test User",
    password: str = "password123",
    cafe_id = None
) -> User:
    """
    Create a test user with proper role mappings.
    ALWAYS use this instead of manually creating User objects.
    """
    if email is None:
        email = f"test_{uuid4().hex[:8]}@test.com"
    
    from app.core.security import get_password_hash
    
    user = User(
        id=uuid4(),
        email=email.strip().lower(),
        password_hash=get_password_hash(password),
        full_name=full_name,
        role=role,
        is_active=True
    )
    db.add(user)
    
    # Always add gamer role for all users
    gamer_role = UserRoleMapping(
        id=uuid4(),
        user_id=user.id,
        role=UserRole.GAMER,
        cafe_id=None
    )
    db.add(gamer_role)
    
    # Add the primary role if it's not gamer
    if role != UserRole.GAMER:
        primary_role = UserRoleMapping(
            id=uuid4(),
            user_id=user.id,
            role=role,
            cafe_id=cafe_id
        )
        db.add(primary_role)
    
    return user

@pytest_asyncio.fixture
async def db_session():
    """Create a fresh database session for each test against test database."""
    async with TestAsyncSessionLocal() as session:
        yield session

@pytest_asyncio.fixture
async def async_client():
    """Create an async HTTP client for testing."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        yield client

