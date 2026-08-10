"""
Cleanup script to remove test/dummy cafes from the database.
Run with: python -m scripts.cleanup_test_cafes
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, select
from app.database import AsyncSessionLocal
from app.models.cafe import Cafe


TEST_CAFE_PATTERNS = [
    "%Test%",
    "%test%",
    "%Ticket%",
    "%ticket%",
    "Owner%",
    "%Dummy%",
    "%dummy%",
    "%Placeholder%",
    "%placeholder%",
]


async def cleanup_test_cafes():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Cafe))
        all_cafes = result.scalars().all()
        
        cafes_to_delete = []
        for cafe in all_cafes:
            for pattern in TEST_CAFE_PATTERNS:
                if pattern.startswith("%") and pattern.endswith("%"):
                    substr = pattern[1:-1].lower()
                    if substr in cafe.name.lower():
                        cafes_to_delete.append(cafe)
                        break
                elif pattern.endswith("%"):
                    prefix = pattern[:-1]
                    if cafe.name.startswith(prefix):
                        cafes_to_delete.append(cafe)
                        break
                elif pattern.startswith("%"):
                    suffix = pattern[1:]
                    if cafe.name.endswith(suffix):
                        cafes_to_delete.append(cafe)
                        break
                else:
                    if cafe.name == pattern:
                        cafes_to_delete.append(cafe)
                        break
        
        if not cafes_to_delete:
            print("No test cafes found to delete.")
            return
        
        print(f"Found {len(cafes_to_delete)} test cafes to delete:")
        for cafe in cafes_to_delete:
            print(f"  - {cafe.name} (ID: {cafe.id})")
        
        for cafe in cafes_to_delete:
            await session.delete(cafe)
        
        await session.commit()
        print(f"\nDeleted {len(cafes_to_delete)} test cafes.")


if __name__ == "__main__":
    print("Cleaning up test cafes from database...")
    asyncio.run(cleanup_test_cafes())
