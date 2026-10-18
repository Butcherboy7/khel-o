"""Main colour of each café photo, shown behind it while it loads.

Photos go from the browser straight to S3 (presigned upload), so the backend
never holds the bytes: colours are worked out afterwards by downloading the
photo. Two things fill them in:
- the public café list/detail endpoints, which kick off a background fill
  when they hand out a photo that has no colour yet (so every way a photo
  can be added is covered without hooking each one);
- scripts/fill_photo_colors.py, run on every deploy, for anything missed.

A photo without a colour just gets the neutral placeholder in the app.
"""
import asyncio
import io
import re
from typing import Iterable

import httpx
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.models.cafe import Cafe
from app.models.photo_color import PhotoColor

# Same hosts the image optimizer accepts (frontend/next.config.js): we only
# ever download from our own buckets and Unsplash.
_ALLOWED = re.compile(
    r"^https://(khelo-cafe-photos-(prod|dev)\.s3\.ap-south-1\.amazonaws\.com|images\.unsplash\.com)/"
)
_MAX_BYTES = 15 * 1024 * 1024
_fill_running = False


def _url_of(photo) -> str | None:
    if isinstance(photo, str):
        return photo
    if isinstance(photo, dict):
        return photo.get("url")
    return None


def dominant_color(data: bytes) -> str:
    """'#rrggbb' of the colour covering most of the photo. The most common of
    a few quantised colours, not the plain average: an average of a neon-lit
    room comes out grey-brown, which looks like a broken image."""
    with Image.open(io.BytesIO(data)) as img:
        img.draft("RGB", (128, 128))  # JPEG: decode at reduced size, much faster
        small = img.convert("RGB")
        small.thumbnail((64, 64))
        quant = small.quantize(colors=5, method=Image.Quantize.MEDIANCUT)
        palette = quant.getpalette() or []
        count, index = max(quant.getcolors() or [(1, 0)])
        r, g, b = palette[index * 3: index * 3 + 3] or (128, 128, 128)
    return f"#{r:02x}{g:02x}{b:02x}"


async def colors_for(db: AsyncSession, urls: Iterable[str]) -> dict[str, str]:
    wanted = {u for u in urls if u}
    if not wanted:
        return {}
    rows = await db.execute(select(PhotoColor.url, PhotoColor.color).where(PhotoColor.url.in_(wanted)))
    return dict(rows.all())


async def attach_colors(db: AsyncSession, photo_lists: Iterable[list]) -> list[str]:
    """Add 'color' to each photo dict that has one. Returns the URLs that
    don't have a colour yet (for a background fill)."""
    lists = [pl for pl in photo_lists if pl]
    urls = [u for pl in lists for u in (_url_of(p) for p in pl) if u]
    known = await colors_for(db, urls)
    for pl in lists:
        for p in pl:
            if isinstance(p, dict) and p.get("url") in known:
                p["color"] = known[p["url"]]
    return [u for u in dict.fromkeys(urls) if u not in known and _ALLOWED.match(u)]


async def _download(client: httpx.AsyncClient, url: str) -> bytes | None:
    try:
        res = await client.get(url, timeout=15.0)
        if res.status_code != 200 or len(res.content) > _MAX_BYTES:
            return None
        return res.content
    except httpx.HTTPError:
        return None


async def fill_colors(db: AsyncSession, urls: Iterable[str]) -> int:
    """Compute and store colours for these URLs (ones on other hosts are
    skipped). Returns how many were stored."""
    todo = [u for u in dict.fromkeys(urls) if u and _ALLOWED.match(u)]
    if not todo:
        return 0
    stored = 0
    async with httpx.AsyncClient(follow_redirects=True) as client:
        for url in todo:
            data = await _download(client, url)
            if data is None:
                continue
            try:
                color = await asyncio.to_thread(dominant_color, data)
            except Exception:  # not an image Pillow can read
                continue
            # merge: insert, or overwrite if another run got there first.
            await db.merge(PhotoColor(url=url, color=color))
            stored += 1
    await db.commit()
    return stored


async def missing_urls(db: AsyncSession) -> list[str]:
    """Every café photo URL that has no colour yet."""
    rows = await db.execute(select(Cafe.photos))
    urls = [u for (photos,) in rows.all() for u in (_url_of(p) for p in (photos or [])) if u]
    known = await colors_for(db, urls)
    return [u for u in dict.fromkeys(urls) if u not in known and _ALLOWED.match(u)]


async def fill_in_background(urls: list[str]) -> None:
    """For FastAPI BackgroundTasks: own session, one fill at a time (a busy
    page must not start the same downloads twice)."""
    global _fill_running
    if not urls or _fill_running:
        return
    _fill_running = True
    try:
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            stored = await fill_colors(db, urls[:50])
        logger.info("photo_colors_filled", count=stored)
    except Exception as e:
        logger.error("photo_colors_fill_failed", error=str(e))
    finally:
        _fill_running = False
