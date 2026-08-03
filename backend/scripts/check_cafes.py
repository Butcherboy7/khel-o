import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import select
from app.models.cafe import Cafe

async def main():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Cafe))
        cafes = result.scalars().all()
        print(f"TOTAL_CAFES_IN_DB: {len(cafes)}")
        for c in cafes:
            print(f"  - {c.name} ({c.city}) - Status: {c.verification_status}")

if __name__ == "__main__":
    asyncio.run(main())
