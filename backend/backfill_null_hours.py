"""
Backfill script for cafes with NULL operating hours.
Sets them to reasonable defaults (09:00:00 - 21:00:00) and marks them inactive until owner updates.
"""
import asyncio
from sqlalchemy import text, update
from app.database import AsyncSessionLocal
from app.models.cafe import Cafe
from datetime import time

async def backfill_null_hours():
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT id, name, opening_time, closing_time FROM cafes WHERE opening_time IS NULL OR closing_time IS NULL")
        )
        cafes = result.fetchall()
        
        print(f"Found {len(cafes)} cafes with NULL hours")
        
        for cafe in cafes:
            print(f"\nCafe: {cafe[1]}")
            print(f"  Opening: {cafe[2]}")
            print(f"  Closing: {cafe[3]}")
        
        if cafes:
            confirm = input("\n\nSet these cafes to 09:00-21:00 and mark inactive? (yes/no): ")
            
            if confirm.lower() == 'yes':
                await session.execute(
                    update(Cafe)
                    .where((Cafe.opening_time == None) | (Cafe.closing_time == None))
                    .values(
                        opening_time=time(9, 0),
                        closing_time=time(21, 0),
                        is_active=False
                    )
                )
                await session.commit()
                print(f"\n✅ Updated {len(cafes)} cafes. They are now inactive with hours 09:00-21:00.")
                print("Owners must set real operating hours via their dashboard to reactivate.")
            else:
                print("\nCancelled.")
        else:
            print("No cafes with NULL hours found.")

if __name__ == "__main__":
    asyncio.run(backfill_null_hours())
