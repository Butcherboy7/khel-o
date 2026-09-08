"""Delete S3 objects that no café row references any more.

Three things leave orphans in the bucket:

1. **Abandoned uploads — the big one.** `create_presigned_upload` mints a key
   and the browser PUTs straight to S3. If the owner never saves (closes the
   tab, hits an error, navigates away) the object exists but was never written
   into `cafe.photos`, so no DB row will ever point at it and no delete path
   can ever find it. Only a bucket-vs-database sweep can.
2. **Failed deletes.** `delete_object` cannot raise — the DB change is already
   committed — so a ClientError leaves the object behind. It logs now, but the
   object still needs collecting.
3. **Anything written by an older code path** that has since changed shape.

Safety, in order of how much they matter:

* **Dry run by default.** Deletes only with an explicit `--apply`.
* **Age floor.** An object younger than `--min-age-hours` (default 24) is never
  touched, because a presigned upload that is in flight right now is genuinely
  unreferenced — deleting it would race the owner's own save and destroy the
  photo they just picked.
* **Fails closed.** If the café query returns nothing at all, it aborts rather
  than concluding the whole bucket is garbage.

Usage (from backend/):
    python -m scripts.reconcile_s3_orphans                 # report only
    python -m scripts.reconcile_s3_orphans --apply         # actually delete
    python -m scripts.reconcile_s3_orphans --min-age-hours 72 --apply
"""
import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, ".")

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.cafe import Cafe
from app.config import settings
from app.services.storage_service import (
    key_from_url,
    iter_object_keys,
    delete_objects,
)


async def referenced_keys() -> set[str]:
    """Every S3 key any café currently points at, across both photo fields."""
    keys: set[str] = set()
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(Cafe))).scalars().all()
        if not rows:
            raise RuntimeError(
                "No café rows returned — refusing to treat the whole bucket as "
                "orphaned. Check the database connection before rerunning."
            )
        for cafe in rows:
            for field in (cafe.photos, cafe.menu_photos):
                if not isinstance(field, list):
                    continue
                for url in field:
                    if not isinstance(url, str):
                        continue
                    key = key_from_url(url)
                    if key:
                        keys.add(key)
    return keys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true",
                        help="actually delete (default is a dry run)")
    parser.add_argument("--min-age-hours", type=int, default=24,
                        help="never touch objects newer than this (default 24)")
    parser.add_argument("--prefix", default="cafes/",
                        help="bucket prefix to sweep (default cafes/)")
    args = parser.parse_args()

    if not settings.AWS_S3_BUCKET:
        print("AWS_S3_BUCKET is not configured; nothing to do.")
        return 1

    keep = asyncio.run(referenced_keys())
    cutoff = datetime.now(timezone.utc) - timedelta(hours=args.min_age_hours)

    orphans: list[str] = []
    too_new = 0
    total = 0
    reclaimed = 0

    for key, last_modified in iter_object_keys(args.prefix):
        total += 1
        if key in keep:
            continue
        if last_modified > cutoff:
            too_new += 1
            continue
        orphans.append(key)

    print(f"bucket:      {settings.AWS_S3_BUCKET}/{args.prefix}")
    print(f"objects:     {total}")
    print(f"referenced:  {len(keep)}")
    print(f"orphaned:    {len(orphans)}")
    print(f"skipped (younger than {args.min_age_hours}h): {too_new}")

    if not orphans:
        print("\nNothing to reclaim.")
        return 0

    for key in orphans[:20]:
        print(f"  orphan: {key}")
    if len(orphans) > 20:
        print(f"  ... and {len(orphans) - 20} more")

    if not args.apply:
        print("\nDRY RUN — nothing deleted. Re-run with --apply to delete these.")
        return 0

    reclaimed = delete_objects(orphans)
    print(f"\nDeleted {reclaimed} of {len(orphans)} orphaned objects.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
