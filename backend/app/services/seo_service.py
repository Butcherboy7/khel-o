"""Programmatic SEO: which /cafes/<city>/<facet> pages exist, and which of
them deserve to be indexed.

Every page is built only from real café data (tiers, specs, games, prices,
hours). The eligibility rules are the guardrail against thin or duplicate
pages:

  * 0 matching cafés   -> the page does not exist (404)
  * 1 matching café    -> rendered for users, `noindex` (too thin to rank on)
  * all cafés in city  -> rendered, `noindex`, canonical to the city page
                          (it would be a duplicate of it)
  * same cafés as another  -> `noindex`, canonical to the one kept: per
    page in the city           identical café set only the most specific
                               page survives (activity > game > gpu >
                               price; lowest price cap first)
  * otherwise (>= 2, a real subset) -> indexable, in the sitemap, linked

Only indexable pages are linked from other pages or listed in sitemaps, so
nothing low-value is ever advertised to crawlers.
"""
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import time
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.slug import slugify
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier

MIN_INDEXABLE_CAFES = 2
PRICE_BUCKETS = (100, 150, 200, 250, 300)
NEARBY_KM = 15
NEARBY_LIMIT = 6

_GPU_RE = re.compile(r"\b(rtx|gtx|rx)\s*-?\s*(\d{3,4})\s*(super|ti|xt|xtx)?\b", re.I)

PLATFORM_FACETS = {
    "pc": ("pc-gaming", "PC gaming", "PC Gaming Cafés"),
    "playstation": ("playstation", "PlayStation", "PlayStation (PS5) Gaming Cafés"),
    "xbox": ("xbox", "Xbox", "Xbox Gaming Cafés"),
    "nintendo": ("nintendo-switch", "Nintendo Switch", "Nintendo Switch Gaming Cafés"),
}


def gpu_slug(raw: str | None) -> Optional[tuple[str, str]]:
    """'NVIDIA RTX 4090 24GB' -> ('rtx-4090', 'RTX 4090'); non-GPU text -> None."""
    m = _GPU_RE.search(raw or "")
    if not m:
        return None
    brand, num, suffix = m.group(1).upper(), m.group(2), (m.group(3) or "")
    suffix_label = {"SUPER": "Super", "TI": "Ti"}.get(suffix.upper(), suffix.upper())
    label = f"{brand} {num}" + (f" {suffix_label}" if suffix else "")
    return slugify(label), label


def game_slug(raw: str) -> str:
    return slugify(raw.strip())


def _haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


@dataclass
class Facet:
    type: str  # activity | gpu | game | price
    slug: str
    label: str
    heading: str


@dataclass
class CafeFacts:
    id: UUID
    name: str
    slug: Optional[str]
    city_slug: str
    city_raw: str
    min_price: Optional[float]
    closing: Optional[time]
    coords: Optional[tuple[float, float]]
    facets: dict[str, Facet] = field(default_factory=dict)
    games: list[str] = field(default_factory=list)
    gpus: list[str] = field(default_factory=list)


def _platforms_of(tier: HardwareTier) -> set[str]:
    if tier.tier_type == "activity":
        return set()
    if tier.platform is not None:
        value = getattr(tier.platform, "value", tier.platform)
        return {value} if value in PLATFORM_FACETS else set()
    # Legacy tiers without a confirmed platform: same name-keyword fallback
    # the frontend's platform chips use (lib/platformTags.ts).
    name = (tier.name or "").lower()
    if any(k in name for k in ("ps5", "ps4", "playstation")):
        return {"playstation"}
    if "xbox" in name:
        return {"xbox"}
    if (tier.specs or {}).get("gpu") or "pc" in name.split():
        return {"pc"}
    return set()


class SeoService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _load(self) -> list[CafeFacts]:
        # Same visibility rule as the public café list.
        cafes = (await self.db.execute(
            select(Cafe).where(
                Cafe.verification_status == VerificationStatus.VERIFIED,
                Cafe.is_active == True,  # noqa: E712
                Cafe.is_emergency_mode == False,  # noqa: E712
                Cafe.bookings_paused == False,  # noqa: E712
            )
        )).scalars().all()
        tiers = (await self.db.execute(
            select(HardwareTier).where(
                HardwareTier.is_active == True,  # noqa: E712
                HardwareTier.cafe_id.in_([c.id for c in cafes] or [None]),
            )
        )).scalars().all()
        by_cafe: dict[UUID, list[HardwareTier]] = defaultdict(list)
        for t in tiers:
            by_cafe[t.cafe_id].append(t)

        facts = []
        for c in cafes:
            ts = by_cafe.get(c.id, [])
            f = CafeFacts(
                id=c.id, name=c.name, slug=c.slug, city_slug=slugify(c.city), city_raw=c.city.strip(),
                min_price=min((float(t.price_per_hour) for t in ts), default=None),
                closing=c.closing_time,
                coords=(float(c.latitude), float(c.longitude)) if c.latitude is not None and c.longitude is not None else None,
            )

            def add(facet: Facet) -> None:
                f.facets.setdefault(facet.slug, facet)  # first type wins on a slug clash

            for p in sorted({p for t in ts for p in _platforms_of(t)}):
                s, label, heading = PLATFORM_FACETS[p]
                add(Facet("activity", s, label, heading))
            for t in ts:
                if t.tier_type == "activity" and t.activity_kind and t.activity_kind.strip():
                    kind = t.activity_kind.strip()
                    add(Facet("activity", slugify(kind), kind, f"{kind} Venues"))
            for t in ts:
                g = gpu_slug((t.specs or {}).get("gpu"))
                if g:
                    add(Facet("gpu", g[0], g[1], f"Gaming Cafés with {g[1]} PCs"))
                    if g[1] not in f.gpus:
                        f.gpus.append(g[1])
            if f.min_price is not None:
                for cap in PRICE_BUCKETS:
                    if f.min_price <= cap:
                        add(Facet("price", f"under-{cap}", f"Under ₹{cap}/hr", f"Gaming Cafés Under ₹{cap}/hr"))
            for games in (c.supported_games or {}).values():
                for g in games if isinstance(games, list) else []:
                    if isinstance(g, str) and g.strip():
                        add(Facet("game", game_slug(g), g.strip(), f"Gaming Cafés to Play {g.strip()}"))
                        if g.strip() not in f.games:
                            f.games.append(g.strip())
            facts.append(f)
        return facts

    @staticmethod
    def _city_label(cafes: list[CafeFacts]) -> str:
        raw = Counter(c.city_raw for c in cafes).most_common(1)[0][0]
        return raw if raw != raw.lower() else raw.title()

    @staticmethod
    def _eligibility(matched: int, city_total: int) -> bool:
        return matched >= MIN_INDEXABLE_CAFES and matched < city_total

    def _facet_pages(self, city_cafes: list[CafeFacts]) -> list[tuple[Facet, list[CafeFacts]]]:
        facets: dict[str, Facet] = {}
        members: dict[str, list[CafeFacts]] = defaultdict(list)
        for c in city_cafes:
            for s, facet in c.facets.items():
                facets.setdefault(s, facet)
                members[s].append(c)
        return [(facets[s], members[s]) for s in facets]

    @staticmethod
    def _specificity(facet: Facet) -> tuple:
        cap = int(facet.slug.split("-")[1]) if facet.type == "price" else 0
        return (["activity", "game", "gpu", "price"].index(facet.type), cap, facet.slug)

    def _indexable(self, city_cafes: list[CafeFacts]) -> dict[str, str]:
        """slug -> canonical slug for every facet page in the city that passes
        eligibility. A page whose café set duplicates a more specific page's
        maps to that page instead of itself."""
        kept_by_set: dict[frozenset, str] = {}
        result: dict[str, str] = {}
        eligible = [
            (f, m) for f, m in self._facet_pages(city_cafes) if self._eligibility(len(m), len(city_cafes))
        ]
        for facet, matched in sorted(eligible, key=lambda fm: self._specificity(fm[0])):
            key = frozenset(c.id for c in matched)
            result[facet.slug] = kept_by_set.setdefault(key, facet.slug)
        return result

    async def list_indexable_pages(self) -> list[dict]:
        facts = await self._load()
        by_city: dict[str, list[CafeFacts]] = defaultdict(list)
        for f in facts:
            by_city[f.city_slug].append(f)
        pages = []
        for city_slug, cafes in by_city.items():
            city = self._city_label(cafes)
            pages.append({"path": f"/cafes/{city_slug}", "title": f"Gaming Cafés in {city}", "type": "city",
                          "city": city, "cafe_count": len(cafes)})
            canon = self._indexable(cafes)
            for facet, matched in self._facet_pages(cafes):
                if canon.get(facet.slug) == facet.slug:
                    pages.append({"path": f"/cafes/{city_slug}/{facet.slug}", "title": f"{facet.heading} in {city}",
                                  "type": facet.type, "city": city, "cafe_count": len(matched)})
        return pages

    async def get_page(self, city_slug: str, facet_slug: Optional[str] = None) -> Optional[dict]:
        facts = await self._load()
        city_cafes = [f for f in facts if f.city_slug == city_slug]
        if not city_cafes:
            return None
        city = self._city_label(city_cafes)
        city_path = f"/cafes/{city_slug}"

        facet_pages = self._facet_pages(city_cafes)
        canon = self._indexable(city_cafes)
        related = [
            {"path": f"{city_path}/{facet.slug}", "label": facet.label, "type": facet.type, "count": len(m)}
            for facet, m in facet_pages
            if canon.get(facet.slug) == facet.slug and facet.slug != facet_slug
        ]
        related.sort(key=lambda r: (["activity", "game", "gpu", "price"].index(r["type"]), -r["count"], r["label"]))

        if facet_slug is None:
            facet, matched, index, canonical = None, city_cafes, True, city_path
        else:
            hit = next(((f, m) for f, m in facet_pages if f.slug == facet_slug), None)
            if hit is None:
                return None
            facet, matched = hit
            target = canon.get(facet_slug)
            index = target == facet_slug
            if len(matched) == len(city_cafes):
                canonical = city_path  # same as the city page
            elif target:
                canonical = f"{city_path}/{target}"  # itself, or the page it duplicates
            else:
                canonical = f"{city_path}/{facet_slug}"  # thin: noindex, self-canonical

        prices = [c.min_price for c in matched if c.min_price is not None]
        games = Counter(g for c in matched for g in c.games)
        gpus = Counter(g for c in matched for g in c.gpus)
        return {
            "city": {"slug": city_slug, "name": city, "path": city_path, "cafe_count": len(city_cafes)},
            "facet": facet.__dict__ if facet else None,
            "cafe_ids": [str(c.id) for c in matched],
            "index": index,
            "canonical": canonical,
            "stats": {
                "cafe_count": len(matched),
                "min_price": min(prices) if prices else None,
                "max_price": max(prices) if prices else None,
                "games": [g for g, _ in games.most_common(12)],
                "gpus": [g for g, _ in gpus.most_common(8)],
                "open_late": sum(1 for c in matched if c.closing and (c.closing >= time(23, 0) or c.closing < time(5, 0))),
            },
            "related": related,
        }

    async def get_cafe_links(self, cafe_id: UUID) -> Optional[dict]:
        facts = await self._load()
        me = next((f for f in facts if f.id == cafe_id), None)
        if me is None:
            return None
        city_cafes = [f for f in facts if f.city_slug == me.city_slug]
        city_path = f"/cafes/{me.city_slug}"
        canon = self._indexable(city_cafes)
        facets = [
            {"path": f"{city_path}/{s}", "label": facet.label, "type": facet.type}
            for s, facet in me.facets.items()
            if canon.get(s) == s
        ]
        nearby = []
        if me.coords:
            for f in facts:
                if f.id != me.id and f.coords:
                    d = _haversine_km(me.coords, f.coords)
                    if d <= NEARBY_KM:
                        nearby.append((d, f))
        nearby.sort(key=lambda x: x[0])
        return {
            "city": {"name": self._city_label(city_cafes), "path": city_path},
            "facets": facets,
            "nearby": [
                {"id": str(f.id), "name": f.name, "path": f"/cafe/{f.slug or f.id}", "km": round(d, 1),
                 "min_price": f.min_price}
                for d, f in nearby[:NEARBY_LIMIT]
            ],
        }
