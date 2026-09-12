"""Cover-photo selection and S3 ingest for real café listings.

Separate from the seed script on purpose: the seed can be re-run without
re-uploading, and the selection heuristic below is the part worth testing.

The heuristic exists because 43 of the 99 source photos are portrait, with
ratios down to 0.53. The explore grid crops to 16:9, so a naive "first photo"
cover ships a horizontal sliver of a real venue's room as the image that
identifies it.

Usage as a library:
    from scripts.photo_ingest import upload_cafe_photos
    urls = upload_cafe_photos(cafe_id, "/path/to/cafe/folder")
"""
import mimetypes
import os
import sys
import uuid
from pathlib import Path
from typing import List, Optional

from PIL import Image

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# A photo this wide or wider survives a 16:9 crop with its subject intact.
MIN_COVER_RATIO = 1.4
COVER_ASPECT = 16 / 9
COVER_WIDTH = 1280
JPEG_QUALITY = 82


def _dimensions(path: str) -> tuple[int, int]:
    with Image.open(path) as im:
        return im.size


def select_cover(paths: List[str]) -> Optional[str]:
    """Pick the photo that best identifies the café in a 16:9 card.

    Prefers the widest photo that already reads as landscape; falls back to the
    highest-resolution photo when a café only has portrait shots, since more
    pixels survive the crop.
    """
    if not paths:
        return None

    measured = []
    for path in paths:
        try:
            width, height = _dimensions(path)
        except Exception:
            continue
        if height == 0:
            continue
        measured.append((path, width, height, width / height))

    if not measured:
        return None

    landscape = [m for m in measured if m[3] >= MIN_COVER_RATIO]
    if landscape:
        return max(landscape, key=lambda m: m[3])[0]

    return max(measured, key=lambda m: m[1] * m[2])[0]


def make_cover_derivative(source_path: str, out_path: str) -> str:
    """Centre-crop to 16:9 and write a JPEG.

    Normalising here rather than in CSS means the grid gets one predictable
    shape regardless of what the source looked like, and the crop is decided
    once instead of by object-fit at every viewport.
    """
    with Image.open(source_path) as im:
        im = im.convert("RGB")
        width, height = im.size
        target_height = int(width / COVER_ASPECT)

        if target_height <= height:
            top = (height - target_height) // 2
            im = im.crop((0, top, width, top + target_height))
        else:
            target_width = int(height * COVER_ASPECT)
            left = (width - target_width) // 2
            im = im.crop((left, 0, left + target_width, height))

        if im.width > COVER_WIDTH:
            im = im.resize((COVER_WIDTH, int(COVER_WIDTH / COVER_ASPECT)), Image.LANCZOS)

        im.save(out_path, "JPEG", quality=JPEG_QUALITY, optimize=True)

    return out_path


def _photo_paths(photo_dir: str) -> List[str]:
    exts = {".png", ".jpg", ".jpeg", ".webp"}
    return sorted(
        str(p) for p in Path(photo_dir).iterdir()
        if p.is_file() and p.suffix.lower() in exts
    )


def upload_cafe_photos(cafe_id: uuid.UUID, photo_dir: str) -> List[str]:
    """Upload a café's photos, cover first, and return their public URLs.

    Uses the storage client directly rather than round-tripping through
    presigned URLs, which exist for browser uploads.
    """
    from app.services.storage_service import _get_client, build_public_url
    from app.config import settings

    paths = _photo_paths(photo_dir)
    if not paths:
        return []

    cover_source = select_cover(paths)
    ordered = [cover_source] + [p for p in paths if p != cover_source]

    client = _get_client()
    bucket = getattr(settings, "S3_BUCKET_NAME", None) or getattr(settings, "AWS_S3_BUCKET", None)
    urls: List[str] = []

    for index, path in enumerate(ordered):
        if index == 0:
            local = str(Path(photo_dir) / f"_cover_{uuid.uuid4().hex[:8]}.jpg")
            make_cover_derivative(path, local)
            upload_path, content_type = local, "image/jpeg"
        else:
            upload_path = path
            content_type = mimetypes.guess_type(path)[0] or "image/jpeg"

        key = f"cafes/{cafe_id}/{uuid.uuid4().hex}{Path(upload_path).suffix}"
        with open(upload_path, "rb") as fh:
            client.put_object(Bucket=bucket, Key=key, Body=fh, ContentType=content_type)
        urls.append(build_public_url(key))

        if index == 0:
            os.remove(upload_path)

    return urls
