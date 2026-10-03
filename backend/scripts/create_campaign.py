"""
Create an offer campaign (one or several cafés) from a JSON spec.

    python -m scripts.create_campaign spec.json [--dry-run] [--apply-tier-prices] [--replace OLDCODE]

Spec:
{
  "name": "KHELO Special Access",
  "code": "KHELOSPECIAL",                  # short link /redeem/<code> + handoff code
  "isPublic": true,                        # true: offers are ordinary public offers at the cafés;
                                           # false: link-only (needs the code)
  "maxUses": null,                         # real cap on paid bookings across all offers (link-only only)
  "endsAt": "2026-10-31T23:59:59+05:30",
  "cafes": [
    {
      "cafeId": "<uuid>",
      "tierPrices": [                      # applied only with --apply-tier-prices
        {"tier": "PlayStation 5 Pro", "pricePerHour": 150, "price15m": 59, "price30m": 89,
         "coopExtraPlayerPrice": 70, "minBookingMinutes": 15}
      ],
      "offers": [
        {"title": "...", "tiers": ["PlayStation 5 Pro", "PlayStation 4"],   # or "tier": "..."
         "type": "percentage", "percent": 20, "playMode": "solo", "minMinutes": 60,
         "days": [0,1,2,3,4]}                                               # optional, default every day
        {"title": "...", "tier": "...", "type": "fixed_amount", "amount": 40, "minMinutes": 60},
        {"title": "...", "tier": "...", "type": "fixed_price", "price": 119, "minutes": 60, "playMode": "solo"}
      ]
    }
  ]
}
The old single-café shape ("cafeId" + "offers" at the top level) still works.

Offers point at the same promotions table customers and owners already use, so
what a customer pays, what the owner sees and what the landing page shows can
never drift. Nothing here invents a claimed count. Refuses an existing code.
`--replace OLDCODE` switches the old campaign and its offers off in the same run.
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


async def main(spec_path: str, dry_run: bool, apply_tier_prices: bool, replace: str | None):
    spec = json.load(open(spec_path, encoding="utf-8"))
    code = spec["code"].strip().upper()
    ends_at = datetime.fromisoformat(spec["endsAt"])
    now = datetime.now(timezone.utc)
    is_public = bool(spec.get("isPublic", False))
    if is_public and spec.get("maxUses"):
        raise SystemExit("A public campaign cannot carry a spot cap (its offers are listed everywhere); use link-only for a cap.")
    cafes_spec = spec.get("cafes") or [{"cafeId": spec["cafeId"], "offers": spec["offers"], "tierPrices": spec.get("tierPrices", [])}]

    async with AsyncSessionLocal() as db:
        existing = (await db.execute(select(OfferCampaign).where(OfferCampaign.access_code == code))).scalars().first()
        if existing:
            raise SystemExit(f"Code {code} already exists (campaign {existing.id}); pick another or deactivate it.")

        if replace:
            old = (await db.execute(select(OfferCampaign).where(OfferCampaign.access_code == replace.strip().upper()))).scalars().first()
            if not old:
                raise SystemExit(f"--replace: no campaign with code {replace}")
            old.is_active = False
            for p in (await db.execute(select(Promotion).where(Promotion.campaign_id == old.id))).scalars().all():
                p.is_active = False
            print(f"Switched off campaign {replace} and its offers.")

        campaign = OfferCampaign(
            id=uuid.uuid4(), cafe_id=None, is_public=is_public, name=spec["name"], access_code=code,
            max_uses=spec.get("maxUses"), starts_at=now, ends_at=ends_at, is_active=True,
        )
        db.add(campaign)
        await db.flush()
        print(f"Campaign {spec['name']!r}  code {code}  public={is_public}  cap {spec.get('maxUses')}  ends {ends_at.isoformat()}")

        for cs in cafes_spec:
            cafe = (await db.execute(select(Cafe).where(Cafe.id == uuid.UUID(cs["cafeId"])))).scalars().first()
            if not cafe:
                raise SystemExit(f"Café {cs['cafeId']} not found")
            tiers = list((await db.execute(select(HardwareTier).where(HardwareTier.cafe_id == cafe.id))).scalars().all())
            print(f"\nCafé: {cafe.name}")

            if apply_tier_prices:
                for tp in cs.get("tierPrices", []):
                    t = _tier(tiers, tp["tier"])
                    for key, attr in (("pricePerHour", "price_per_hour"), ("price15m", "price_15m"),
                                      ("price30m", "price_30m"), ("coopPrice30m", "coop_price_30m"), ("coopExtraPlayerPrice", "coop_extra_player_price"),
                                      ("minBookingMinutes", "min_booking_minutes")):
                        if key in tp:
                            print(f"  tier {t.name}: {attr} {getattr(t, attr)} -> {tp[key]}")
                            setattr(t, attr, tp[key])

            for o in cs["offers"]:
                refs = o.get("tiers") or [o["tier"]]
                for ref in refs:
                    t = _tier(tiers, ref)
                    kind = o["type"]
                    fields = dict(
                        id=uuid.uuid4(), cafe_id=cafe.id, campaign_id=campaign.id,
                        title=o["title"] if len(refs) == 1 else f"{o['title']} · {t.name}",
                        applicable_tier_id=t.id, play_mode=o.get("playMode", "any"),
                        valid_from=now, valid_until=ends_at, days_of_week=o.get("days", [0, 1, 2, 3, 4, 5, 6]),
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
            print("\nDRY RUN: nothing saved.")
        else:
            await db.commit()
            print("\nSaved.")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        raise SystemExit(__doc__)
    rep = None
    if "--replace" in sys.argv:
        rep = sys.argv[sys.argv.index("--replace") + 1]
        args = [a for a in args if a != rep]
    asyncio.run(main(args[0], "--dry-run" in sys.argv, "--apply-tier-prices" in sys.argv, rep))
