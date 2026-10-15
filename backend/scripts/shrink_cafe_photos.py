"""Shrink café photos already in S3, in place, and give them a long cache life.

Why: most stored photos are straight off a phone (4000px wide, 2-4 MB) with no
Cache-Control. PageSpeed measured 11 MB of them on the homepage, and resizing
them on the fly made the shared server so busy that robots.txt timed out.
Shrinking the stored files once makes every later request cheap, whether it
goes through the Next image optimizer or not.

What it does, per object under cafes/:
  - longest side above MAX_SIDE, or file above MAX_BYTES: resize to MAX_SIDE,
    fix EXIF rotation, re-encode in the same format (JPEG q82 progressive /
    PNG optimized / WebP q80), keep the same key so every stored URL still
    works;
  - every object: Content-Type set from the real format and
    Cache-Control "public, max-age=31536000, immutable" (keys are unique per
    upload, so a URL's photo never changes);
  - before overwriting, the original is copied to originals/<key> once.

Dry run by default: it prints the plan and the total saving and changes
nothing. Run with --apply to do it.

    python -m scripts.shrink_cafe_photos            # dry run
    python -m scripts.shrink_cafe_photos --apply    # do it
    python -m scripts.shrink_cafe_photos --apply --limit 5   # try 5 first

Run inside the backend container (it reads AWS_* from the app settings).
"""
import argparse
import io
import sys
from pathlib import Path

from PIL import Image, ImageOps

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import settings  # noqa: E402
from app.services.storage_service import _get_client  # noqa: E402

PREFIX = "cafes/"
BACKUP_PREFIX = "originals/"
MAX_SIDE = 1600
MAX_BYTES = 450_000
CACHE_CONTROL = "public, max-age=31536000, immutable"
FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


def _shrink(data: bytes) -> tuple[bytes, str, tuple[int, int], tuple[int, int]] | None:
    """(new bytes, content type, old size, new size), or None to leave it."""
    with Image.open(io.BytesIO(data)) as im:
        fmt = im.format
        if fmt not in FORMATS:
            return None
        old_dims = im.size
        if max(old_dims) <= MAX_SIDE and len(data) <= MAX_BYTES:
            return None
        im = ImageOps.exif_transpose(im)
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
        out = io.BytesIO()
        if fmt == "JPEG":
            im.convert("RGB").save(out, "JPEG", quality=82, optimize=True, progressive=True)
        elif fmt == "PNG":
            im.save(out, "PNG", optimize=True)
        else:
            im.save(out, "WEBP", quality=80, method=6)
        new = out.getvalue()
        if len(new) >= len(data):
            return None
        return new, FORMATS[fmt], old_dims, im.size


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--apply", action="store_true", help="actually write to S3 (default: dry run)")
    ap.add_argument("--limit", type=int, default=0, help="stop after this many shrunk photos")
    args = ap.parse_args()

    bucket = settings.AWS_S3_BUCKET
    s3 = _get_client()
    before = after = shrunk = cache_only = skipped = 0

    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=PREFIX):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            head = s3.head_object(Bucket=bucket, Key=key)
            data = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
            try:
                result = _shrink(data)
            except Exception as e:  # not an image Pillow can read: leave it alone
                print(f"skip   {key}: {e}")
                skipped += 1
                continue

            if result is None:
                if head.get("CacheControl") != CACHE_CONTROL:
                    cache_only += 1
                    print(f"cache  {key}")
                    if args.apply:
                        s3.copy_object(
                            Bucket=bucket, Key=key, CopySource={"Bucket": bucket, "Key": key},
                            MetadataDirective="REPLACE", CacheControl=CACHE_CONTROL,
                            ContentType=head.get("ContentType") or "image/jpeg",
                        )
                continue

            new, content_type, old_dims, new_dims = result
            before += len(data)
            after += len(new)
            shrunk += 1
            print(f"shrink {key}: {old_dims[0]}x{old_dims[1]} {len(data)//1024} KB -> "
                  f"{new_dims[0]}x{new_dims[1]} {len(new)//1024} KB")
            if args.apply:
                backup = BACKUP_PREFIX + key
                try:
                    s3.head_object(Bucket=bucket, Key=backup)
                except Exception:
                    s3.copy_object(Bucket=bucket, Key=backup, CopySource={"Bucket": bucket, "Key": key})
                s3.put_object(Bucket=bucket, Key=key, Body=new, ContentType=content_type, CacheControl=CACHE_CONTROL)
            if args.limit and shrunk >= args.limit:
                break
        if args.limit and shrunk >= args.limit:
            break

    print()
    print(f"{'APPLIED' if args.apply else 'DRY RUN'}: {shrunk} photos shrunk "
          f"({before / 1e6:.1f} MB -> {after / 1e6:.1f} MB), {cache_only} given cache headers only, {skipped} skipped")
    if not args.apply:
        print("Nothing was changed. Re-run with --apply to do it.")


if __name__ == "__main__":
    main()
