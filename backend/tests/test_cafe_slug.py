import pytest
from datetime import time
from uuid import uuid4

from app.core.slug import slugify
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.core.security import get_password_hash


def test_slugify():
    assert slugify("DG Gaming Café!") == "dg-gaming-cafe"
    assert slugify("  8-Ball  &  Snooker ") == "8-ball-snooker"
    assert slugify("") == "cafe"


async def _cafe(db_session, name, city="Hyderabad"):
    owner = User(
        id=uuid4(), email=f"o_{uuid4().hex[:8]}@test.com", full_name="O",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    db_session.add(owner)
    await db_session.flush()
    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name=name, address_line1="1 St", city=city,
        state="Telangana", pincode="500001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(10, 0), closing_time=time(23, 0), bookable_stations=5,
    )
    db_session.add(cafe)
    await db_session.commit()
    await db_session.refresh(cafe)
    return cafe


@pytest.mark.asyncio
async def test_slug_assigned_on_create_and_deduplicated(db_session):
    tag = uuid4().hex[:6]
    a = await _cafe(db_session, f"Slug Arena {tag}")
    b = await _cafe(db_session, f"Slug Arena {tag}")
    assert a.slug == f"slug-arena-{tag}-hyderabad"
    assert b.slug == f"slug-arena-{tag}-hyderabad-2"


@pytest.mark.asyncio
async def test_city_not_repeated_when_name_contains_it(db_session):
    tag = uuid4().hex[:6]
    c = await _cafe(db_session, f"Hyderabad Hub {tag}")
    assert c.slug == f"hyderabad-hub-{tag}"


@pytest.mark.asyncio
async def test_get_cafe_by_slug_and_list_exposes_slug(async_client, db_session):
    cafe = await _cafe(db_session, f"Slug Lookup {uuid4().hex[:6]}")
    resp = await async_client.get(f"/api/v1/cafes/slug/{cafe.slug}")
    assert resp.status_code == 200
    body = resp.json()["data"]["cafe"]
    assert body["id"] == str(cafe.id)
    assert body["slug"] == cafe.slug

    assert (await async_client.get("/api/v1/cafes/slug/does-not-exist")).status_code == 404

    items = (await async_client.get("/api/v1/cafes", params={"city": "Hyderabad", "limit": 50})).json()["data"]["items"]
    assert any(i.get("slug") == cafe.slug for i in items)
