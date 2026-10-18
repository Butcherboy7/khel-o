"""Work out the main colour of every café photo that has none yet.

Run on every deploy (scripts/deploy_remote.sh), after migrations:

    docker exec -e PYTHONPATH=/app khel_o_backend python scripts/fill_photo_colors.py

The café endpoints also fill colours in the background as photos are first
handed out; this catches the rest up front so the first visitor already gets
coloured placeholders. Only reads photos (from our own S3 buckets) and writes
the photo_colors table, so it is safe on dev and prod alike.
"""
import asyncio

from app.database import AsyncSessionLocal
from app.services.photo_colors import fill_colors, missing_urls


async def main() -> None:
    async with AsyncSessionLocal() as db:
        urls = await missing_urls(db)
        stored = await fill_colors(db, urls) if urls else 0
    print(f"photo colours: {len(urls)} missing, {stored} stored", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
