import asyncio
from app.database import AsyncSessionLocal
from app.models.cafe import Cafe
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(Cafe.id, Cafe.name, Cafe.city))
        rows = res.all()
        print(f"Total cafes: {len(rows)}")
        for r in rows:
            print(f"- {r.name} ({r.city}) [ID: {r.id}]")

if __name__ == "__main__":
    asyncio.run(main())
