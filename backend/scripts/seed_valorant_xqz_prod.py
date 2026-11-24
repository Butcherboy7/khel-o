"""PROD: add the Valorant 5v5 challenge row for the EXISTING XQZ café. Creates nothing else.

Unlike seed_valorant_xqz.py (dev only, makes a fake owner and café), this finds the real
XQZ café and refuses if it can't find exactly one. A second run refreshes the challenge settings.
Run it only after the release is live, and only when told to:

    bash scripts/ops/prod_python.sh backend/scripts/seed_valorant_xqz_prod.py --yes

Add --test-price to charge Rs 1 per team and Rs 1 per solo while testing on prod.
Run again WITHOUT --test-price to put the real prices back (Rs 1,250 / Rs 250).
"""
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
for p in (str(BACKEND_DIR), str(Path(__file__).resolve().parent)):
    if p not in sys.path:
        sys.path.insert(0, p)

from sqlalchemy import select  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.cafe import Cafe  # noqa: E402
from app.models.challenge import Challenge  # noqa: E402
from seed_valorant_xqz import RULES_MD, SLUG, TEAM  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
TEST_PRICE = "--test-price" in sys.argv


def _team() -> dict:
    t = dict(TEAM)
    if TEST_PRICE:
        t["priceTeam"], t["priceSolo"] = 1, 1
    return t


async def main() -> None:
    if "--yes" not in sys.argv:
        print("Dry run. Add --yes to write.")
    async with AsyncSessionLocal() as db:
        cafes = (await db.execute(select(Cafe).where(Cafe.name.ilike("XQZ%")))).scalars().all()
        if len(cafes) != 1:
            raise SystemExit(f"Expected exactly one XQZ café, found {len(cafes)}. Nothing written.")
        cafe = cafes[0]
        print("café:", cafe.id, cafe.name, cafe.slug)
        fields = dict(
            title="KHELO Valorant 5v5 Challenge", cafe_id=cafe.id, game="Valorant",
            setup_line="Swift Play 5v5 on XQZ's PCs", format="Swift Play 5v5, knockout",
            best_of=1, final_best_of=3,
            starts_at=datetime(2026, 12, 5, 12, 0, tzinfo=IST), ends_at=datetime(2026, 12, 5, 15, 50, tzinfo=IST),
            checkin_opens_at=datetime(2026, 12, 5, 11, 0, tzinfo=IST),
            checkin_closes_at=datetime(2026, 12, 5, 11, 45, tzinfo=IST),
            capacity=1000, min_age=0, rules_md=RULES_MD,
            prizes_md="- Exciting rewards worth Rs 5,000 for the top teams\n- Semi-finalists get Khelo coupons",
            community_url="https://chat.whatsapp.com/FWVq1Iv7EgaDlyspNkS3ps", instagram_handle="khelo.journey",
        )
        ch = (await db.execute(select(Challenge).where(Challenge.slug == SLUG))).scalar_one_or_none()
        if ch is None:
            ch = Challenge(slug=SLUG, status="open", plan_config={"team": _team()}, **fields)
            db.add(ch)
            print("will create challenge", SLUG)
        else:
            for k, v in fields.items():
                setattr(ch, k, v)
            cfg = dict(ch.plan_config or {})
            cfg["team"] = {**_team(), **{k: v for k, v in (cfg.get("team") or {}).items() if k == "drawSeed"}}
            ch.plan_config = cfg
            print("will refresh challenge", SLUG)
        if "--yes" in sys.argv:
            await db.commit()
            print("written. challenge", ch.id)
        else:
            await db.rollback()


if __name__ == "__main__":
    asyncio.run(main())
