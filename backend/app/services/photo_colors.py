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


def orientation_of(data: bytes) -> str:
    """'h' for a wide photo, 'v' for a tall one (width less than 90% of height), 'h' when square-ish."""
    with Image.open(io.BytesIO(data)) as img:
        w, h = img.size
    return "v" if w < h * 0.9 else "h"


def order_photos(photos) -> None:
    """Customer view: horizontal photos first (they fill the card and the wide gallery), vertical ones after,
    each keeping the owner's order. The owner can override by marking a photo as cover ("cover": "1"):
    then their order is kept exactly. Sorts the list in place."""
    if not photos or not isinstance(photos, list):
        return
    if any(isinstance(p, dict) and p.get("cover") == "1" for p in photos):
        photos.sort(key=lambda p: 0 if isinstance(p, dict) and p.get("cover") == "1" else 1)
        return
    photos.sort(key=lambda p: 1 if isinstance(p, dict) and p.get("orient") == "v" else 0)


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
    no_orient = set()
    for pl in lists:
        for p in pl:
            if isinstance(p, dict) and p.get("url") in known:
                p["color"] = known[p["url"]]
            if isinstance(p, dict) and not p.get("orient") and p.get("url"):
                no_orient.add(p["url"])
        order_photos(pl)
    return [u for u in dict.fromkeys(urls) if (u not in known or u in no_orient) and _ALLOWED.match(u)]


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
    orient: dict[str, str] = {}
    async with httpx.AsyncClient(follow_redirects=True) as client:
        for url in todo:
            data = await _download(client, url)
            if data is None:
                continue
            try:
                color = await asyncio.to_thread(dominant_color, data)
                orient[url] = await asyncio.to_thread(orientation_of, data)
            except Exception:  # not an image Pillow can read
                continue
            # merge: insert, or overwrite if another run got there first.
            await db.merge(PhotoColor(url=url, color=color))
            stored += 1
    await db.commit()
    await _write_orientation(db, orient)
    return stored


async def _write_orientation(db: AsyncSession, orient: dict[str, str]) -> None:
    """Remember each photo's orientation inside the café's own photo list (a plain text field on the photo)."""
    if not orient:
        return
    for cafe in (await db.execute(select(Cafe))).scalars().all():
        photos = cafe.photos or []
        if not any(isinstance(p, dict) and p.get("url") in orient for p in photos):
            continue
        cafe.photos = [({**p, "orient": orient[p["url"]]} if isinstance(p, dict) and p.get("url") in orient else p)
                       for p in photos]
    await db.commit()


async def missing_urls(db: AsyncSession) -> list[str]:
    """Every café photo URL that has no colour yet."""
    rows = await db.execute(select(Cafe.photos))
    all_photos = [p for (photos,) in rows.all() for p in (photos or [])]
    urls = [u for u in (_url_of(p) for p in all_photos) if u]
    known = await colors_for(db, urls)
    no_orient = {p["url"] for p in all_photos if isinstance(p, dict) and p.get("url") and not p.get("orient")}
    return [u for u in dict.fromkeys(urls) if (u not in known or u in no_orient) and _ALLOWED.match(u)]


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
