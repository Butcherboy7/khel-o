import pytest
from datetime import time
from uuid import uuid4

from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.core.security import get_password_hash
from app.services.seo_service import gpu_slug, game_slug

# A made-up city per test run so rows from other tests never mix in.


def test_gpu_normalization():
    assert gpu_slug("NVIDIA RTX 4090") == ("rtx-4090", "RTX 4090")
    assert gpu_slug("RTX 4090 24GB") == ("rtx-4090", "RTX 4090")
    assert gpu_slug("RTX 4080 Super") == ("rtx-4080-super", "RTX 4080 Super")
    assert gpu_slug("rtx4060 ti") == ("rtx-4060-ti", "RTX 4060 Ti")
    assert gpu_slug("PS5 Custom RDNA2") is None
    assert gpu_slug("Custom") is None


def test_game_normalization():
    assert game_slug("Counter-Strike 2") == "counter-strike-2"
    assert game_slug("  EA FC 24 ") == "ea-fc-24"


async def _cafe(db, city, name, *, gpu=None, platform=None, games=None, price=100.0, activity=None):
    owner = User(
        id=uuid4(), email=f"o_{uuid4().hex[:8]}@test.com", full_name="O",
        password_hash=get_password_hash("x"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    db.add(owner)
    await db.flush()
    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name=name, address_line1="1 St", city=city,
        state="Telangana", pincode="500001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(10, 0), closing_time=time(23, 0), bookable_stations=5,
        supported_games={"pc": games or []}, latitude=17.5, longitude=78.5,
    )
    db.add(cafe)
    await db.flush()
    db.add(HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Tier", specs={"gpu": gpu} if gpu else {},
        price_per_hour=price, total_seats=5, app_bookable_seats=5, active_seats_count=5,
        is_active=True, platform=platform, tier_type="activity" if activity else "gaming",
        activity_kind=activity,
    ))
    await db.commit()
    return cafe


@pytest.mark.asyncio
async def test_eligibility_index_noindex_and_duplicate(async_client, db_session):
    city = f"Seotown{uuid4().hex[:6]}"
    slug = city.lower()
    await _cafe(db_session, city, "A", gpu="RTX 4090", platform="pc", games=["Valorant"], price=80)
    await _cafe(db_session, city, "B", gpu="NVIDIA RTX 4090", platform="pc", games=["Valorant", "CS2"], price=120)
    await _cafe(db_session, city, "C", platform="playstation", price=200)

    # 2 of 3 cafés → a real, distinct subset → indexable
    page = (await async_client.get("/api/v1/seo/page", params={"city": slug, "facet": "rtx-4090"})).json()["data"]
    assert page["index"] is True
    assert page["facet"]["type"] == "gpu"
    assert len(page["cafeIds"]) == 2
    assert page["stats"]["minPrice"] == 80

    # 1 café → rendered for users, kept out of the index
    page = (await async_client.get("/api/v1/seo/page", params={"city": slug, "facet": "cs2"})).json()["data"]
    assert page["index"] is False and len(page["cafeIds"]) == 1

    # Price bucket that matches every café duplicates the city page → noindex, canonical to city
    page = (await async_client.get("/api/v1/seo/page", params={"city": slug, "facet": "under-250"})).json()["data"]
    assert page["index"] is False
    assert page["canonical"] == f"/cafes/{slug}"

    # No matches → 404
    resp = await async_client.get("/api/v1/seo/page", params={"city": slug, "facet": "xbox"})
    assert resp.status_code == 404

    # City page lists only indexable facets as related links
    city_page = (await async_client.get("/api/v1/seo/page", params={"city": slug})).json()["data"]
    related = {r["path"] for r in city_page["related"]}
    assert f"/cafes/{slug}/rtx-4090" in related
    assert f"/cafes/{slug}/valorant" in related
    assert f"/cafes/{slug}/cs2" not in related

    # Sitemap index: only indexable pages, city page included
    pages = (await async_client.get("/api/v1/seo/pages")).json()["data"]
    paths = {p["path"] for p in pages}
    assert f"/cafes/{slug}" in paths and f"/cafes/{slug}/rtx-4090" in paths
    assert f"/cafes/{slug}/cs2" not in paths


@pytest.mark.asyncio
async def test_cafe_links_facets_and_nearby(async_client, db_session):
    city = f"Linkville{uuid4().hex[:6]}"
    a = await _cafe(db_session, city, "A", gpu="RTX 4070", platform="pc", games=["Valorant"])
    await _cafe(db_session, city, "B", gpu="RTX 4070", platform="pc", games=["Valorant"])

    data = (await async_client.get(f"/api/v1/seo/cafe-links/{a.id}")).json()["data"]
    assert data["city"]["path"] == f"/cafes/{city.lower()}"
    assert any(n["name"] == "B" for n in data["nearby"])
    assert all(n["id"] != str(a.id) for n in data["nearby"])
