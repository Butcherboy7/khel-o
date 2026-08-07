import asyncio
import sys
sys.path.append('.')
from app.database import engine, Base
import app.models.user
import app.models.cafe
import app.models.hardware_tier
import app.models.booking
import app.models.user_role
import scripts.seed_test_accounts as seed_script
import scripts.seed_extra as seed_extra_script

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables created cleanly!")
    await seed_script.seed_all()
    await seed_extra_script.seed_extra()
    print("Seeding completed!")

if __name__ == "__main__":
    asyncio.run(init_db())
