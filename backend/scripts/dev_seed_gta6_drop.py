"""DEV ONLY: a GTA 6 Launch Drop at AdamsDen to click through.

Blocks: Thu 19, Sat 21 and Sun 22 Nov 2026, 6 PM to 11 PM, 4 seats each,
Rs 250/hr, Rs 99 deposit per seat. Early access is open now with code
EARLY_CODE (default KHELOGTA6); everyone can reserve from PUBLIC_AT
(default 12 Nov 2026, 12 PM IST). Running it again changes nothing.

    CONFIRM=anonymize-dev python scripts/dev_seed_gta6_drop.py
"""
import asyncio
import importlib.util
import os
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from sqlalchemy import select, text

SLUG = "gta6-adamsden"
IST = timezone(timedelta(hours=5, minutes=30))


def _guard():
    path = Path(__file__).resolve().parent / "anonymize_dev_db.py"
    if not path.exists():
        path = Path("/app/scripts/anonymize_dev_db.py")
    spec = importlib.util.spec_from_file_location("anonymize_dev_db", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


async def main() -> None:
    from app.config import settings
    from app.database import AsyncSessionLocal
    from app.models.cafe import Cafe
    from app.models.drop import Drop, DropBlock

    _guard().guard_settings(settings.ENVIRONMENT, settings.DATABASE_URL, settings.FRONTEND_URL)
    async with AsyncSessionLocal() as db:
        if "dev" not in (await db.execute(text("SELECT current_database()"))).scalar_one():
            raise SystemExit("REFUSED: not the dev database")
        if (await db.execute(select(Drop).where(Drop.slug == SLUG))).scalars().first():
            print(f"{SLUG} already exists")
            return
        cafe = (await db.execute(select(Cafe).where(Cafe.name.ilike("adamsden%")))).scalars().first()
        if cafe is None:
            raise SystemExit("AdamsDen not found")
        public_at = datetime.fromisoformat(os.environ.get("PUBLIC_AT", "2026-11-12T12:00:00+05:30"))
        drop = Drop(
            slug=SLUG, cafe_id=cafe.id, title="GTA 6 Launch Drop", game="GTA 6",
            tagline="Play GTA 6 on a PS5 and a big screen, launch week. Only 4 seats a night.",
            price_per_hour=250, deposit_amount=99, max_seats_per_user=2,
            early_access_code=os.environ.get("EARLY_CODE", "KHELOGTA6"),
            early_access_starts_at=datetime.now(timezone.utc) - timedelta(minutes=5),
            public_starts_at=public_at, status="live",
        )
        db.add(drop)
        await db.flush()
        for day in (date(2026, 11, 19), date(2026, 11, 21), date(2026, 11, 22)):
            db.add(DropBlock(drop_id=drop.id, session_date=day, start_time=time(18, 0), end_time=time(23, 0), seats_total=4))
        await db.commit()
        print(f"made {SLUG} at {cafe.name} ({cafe.id})")


if __name__ == "__main__":
    asyncio.run(main())
