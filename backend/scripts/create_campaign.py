"""
Create a link-only offer campaign ("Founders' price") from a JSON spec.

    python -m scripts.create_campaign spec.json [--dry-run] [--apply-tier-prices]

Spec:
{
  "cafeId": "<uuid>",
  "name": "Founders' price",
  "code": "DGFOUNDER",            # the access code people can type
  "maxUses": 100,                 # real cap on paid bookings, shared by all offers
  "endsAt": "2026-10-20T23:59:59+05:30",
  "offers": [
    {"title": "Founders: PlayStation 1P", "tier": "PlayStation 5 Pro", "type": "percentage", "percent": 20, "playMode": "solo", "minMinutes": 60},
    {"title": "Founders: PlayStation 2P", "tier": "PlayStation 5 Pro", "type": "fixed_amount", "amount": 40, "playMode": "coop", "minMinutes": 60},
    {"title": "Founders: PS5 1 hr",       "tier": "PlayStation 5 Pro", "type": "fixed_price", "price": 119, "minutes": 60, "playMode": "solo"}
  ],
  "tierPrices": [                 # optional, only applied with --apply-tier-prices
    {"tier": "PlayStation 5 Pro", "pricePerHour": 150, "coopExtraPlayerPrice": 70}
  ]
}

The campaign's offers are hidden from every public listing and apply only with
the access code. Nothing here invents a claimed count: the number people see is
computed from real paid bookings. Idempotent: refuses to reuse an existing code.
"""
import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.cafe import Cafe
from app.models.hardware_tier import HardwareTier
from app.models.promotion import Promotion, OfferCampaign, PromotionType


def _tier(tiers, ref):
    for t in tiers:
        if str(t.id) == ref or t.name.strip().lower() == ref.strip().lower():
            return t
    raise SystemExit(f"No tier matching {ref!r}. Tiers here: {[t.name for t in tiers]}")


async def main(spec_path: str, dry_run: bool, apply_tier_prices: bool):
    spec = json.load(open(spec_path, encoding="utf-8"))
    code = spec["code"].strip().upper()
    ends_at = datetime.fromisoformat(spec["endsAt"])
    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        cafe = (await db.execute(select(Cafe).where(Cafe.id == uuid.UUID(spec["cafeId"])))).scalars().first()
        if not cafe:
            raise SystemExit("Café not found")
        tiers = list((await db.execute(select(HardwareTier).where(HardwareTier.cafe_id == cafe.id))).scalars().all())

        existing = (await db.execute(select(OfferCampaign).where(OfferCampaign.access_code == code))).scalars().first()
        if existing:
            raise SystemExit(f"Code {code} already exists (campaign {existing.id}); pick another or deactivate it.")

        print(f"Café: {cafe.name}  |  code {code}  |  cap {spec.get('maxUses')}  |  ends {ends_at.isoformat()}")

        if apply_tier_prices:
            for tp in spec.get("tierPrices", []):
                t = _tier(tiers, tp["tier"])
                for key, attr in (("pricePerHour", "price_per_hour"), ("price15m", "price_15m"),
                                  ("price30m", "price_30m"), ("coopExtraPlayerPrice", "coop_extra_player_price"),
                                  ("minBookingMinutes", "min_booking_minutes")):
                    if key in tp:
                        print(f"  tier {t.name}: {attr} {getattr(t, attr)} -> {tp[key]}")
                        setattr(t, attr, tp[key])

        campaign = OfferCampaign(
            id=uuid.uuid4(), cafe_id=cafe.id, name=spec["name"], access_code=code,
            max_uses=spec.get("maxUses"), starts_at=now, ends_at=ends_at, is_active=True,
        )
        db.add(campaign)
        await db.flush()

        for o in spec["offers"]:
            t = _tier(tiers, o["tier"])
            kind = o["type"]
            fields = dict(
                id=uuid.uuid4(), cafe_id=cafe.id, campaign_id=campaign.id, title=o["title"],
                applicable_tier_id=t.id, play_mode=o.get("playMode", "any"),
                valid_from=now, valid_until=ends_at, days_of_week=[0, 1, 2, 3, 4, 5, 6],
                start_hour=0, end_hour=24, max_uses=None, current_uses=0, is_active=True,
            )
            if kind == "percentage":
                fields.update(promotion_type=PromotionType.PERCENTAGE, discount_percentage=o["percent"],
                              min_booking_minutes=o.get("minMinutes", 60))
            elif kind == "fixed_amount":
                fields.update(promotion_type=PromotionType.FIXED_AMOUNT, fixed_discount_amount=o["amount"],
                              min_booking_minutes=o.get("minMinutes", 60))
            elif kind == "fixed_price":
                fields.update(promotion_type=PromotionType.FIXED_PRICE, fixed_price_amount=o["price"],
                              min_duration_hours=o["minutes"] / 60)
            else:
                raise SystemExit(f"Unknown offer type {kind!r}")
            db.add(Promotion(**fields))
            print(f"  offer: {o['title']}  ->  {t.name} ({kind})")

        if dry_run:
            await db.rollback()
            print("DRY RUN: nothing saved.")
        else:
            await db.commit()
            print("Saved.")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        raise SystemExit(__doc__)
    asyncio.run(main(args[0], "--dry-run" in sys.argv, "--apply-tier-prices" in sys.argv))
