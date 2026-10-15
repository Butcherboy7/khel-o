"""Admin "Booking soon" page: list lead listings, add photos, get the owner login,
and photo listings ranking above photo-less ones in the public list."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.cafe import Cafe, VerificationStatus
from app.models.user import UserRole
from app.services.storage_service import build_public_url
from tests.conftest import auth_headers, create_test_user


async def _lead(db, name, *, email=None, photos=None, city="Hyderabad", created=None):
    owner = await create_test_user(db, email=email or f"lead.{uuid.uuid4().hex[:8]}@khel-o.com", role=UserRole.CAFE_OWNER)
    await db.flush()
    cafe = Cafe(
        id=uuid.uuid4(), owner_id=owner.id, name=name, address_line1="1 Test Rd", address_line2="Kompally",
        city=city, state="Telangana", pincode="500001", phone_number="+919999999999",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        is_lead_listing=True, bookable_stations=0, app_bookable_seats=0,
        amenities=[], photos=photos or [], supported_games={}, menu_photos=[], house_rules=[], social_links={},
    )
    if created:
        cafe.created_at = created
    db.add(cafe)
    await db.commit()
    return owner, cafe


async def _admin(db):
    admin = await create_test_user(db, email=f"adm_{uuid.uuid4().hex[:6]}@test.com", role=UserRole.ADMIN)
    await db.commit()
    return auth_headers(admin, is_admin=True)


@pytest.mark.asyncio
async def test_lists_lead_listings_with_owner_and_photos(async_client, db_session):
    h = await _admin(db_session)
    _, cafe = await _lead(db_session, f"Bsoon {uuid.uuid4().hex[:6]}", photos=[{"url": "https://x/a.jpg", "category": "exterior"}])
    _, handed = await _lead(db_session, f"Bsoon {uuid.uuid4().hex[:6]}", email=f"real{uuid.uuid4().hex[:6]}@gmail.com")

    rows = (await async_client.get("/api/v1/admin/booking-soon", params={"q": "bsoon"}, headers=h)).json()["data"]
    by_id = {r["id"]: r for r in rows}
    assert len(by_id[str(cafe.id)]["photos"]) == 1
    assert by_id[str(cafe.id)]["ownerHandedOver"] is False
    assert by_id[str(handed.id)]["ownerHandedOver"] is True


@pytest.mark.asyncio
async def test_non_admin_cannot_use_it(async_client, db_session):
    owner, cafe = await _lead(db_session, "Locked")
    h = auth_headers(owner)
    assert (await async_client.get("/api/v1/admin/booking-soon", headers=h)).status_code == 403
    assert (await async_client.post(f"/api/v1/admin/booking-soon/{cafe.id}/owner-login", json={}, headers=h)).status_code == 403


@pytest.mark.asyncio
async def test_photo_must_be_our_upload_for_this_cafe(async_client, db_session):
    h = await _admin(db_session)
    _, cafe = await _lead(db_session, "Photo Cafe")
    url = f"/api/v1/admin/booking-soon/{cafe.id}/photos"

    bad = await async_client.post(url, json={"url": "https://instagram.com/p/x.jpg", "category": "exterior"}, headers=h)
    assert bad.status_code == 400
    other = build_public_url(f"cafes/{uuid.uuid4()}/a.jpg")
    assert (await async_client.post(url, json={"url": other, "category": "exterior"}, headers=h)).status_code == 400

    ok_url = build_public_url(f"cafes/{cafe.id}/a.jpg")
    res = await async_client.post(url, json={"url": ok_url, "category": "play_area"}, headers=h)
    assert res.status_code == 200
    assert res.json()["data"]["photos"] == [{"url": ok_url, "category": "play_area"}]

    gone = await async_client.request("DELETE", url, json={"url": ok_url}, headers=h)
    assert gone.status_code == 200 and gone.json()["data"]["photos"] == [], gone.text


@pytest.mark.asyncio
async def test_owner_login_works_once_issued_and_refuses_handed_over_accounts(async_client, db_session):
    h = await _admin(db_session)
    owner, cafe = await _lead(db_session, "Login Cafe")
    res = await async_client.post(f"/api/v1/admin/booking-soon/{cafe.id}/owner-login", json={}, headers=h)
    assert res.status_code == 200
    creds = res.json()["data"]
    assert creds["email"] == owner.email

    login = await async_client.post("/api/v1/auth/login", json={"email": creds["email"], "password": creds["temporaryPassword"]})
    assert login.status_code == 200

    _, handed = await _lead(db_session, "Handed Cafe", email=f"owner{uuid.uuid4().hex[:6]}@gmail.com")
    refused = await async_client.post(f"/api/v1/admin/booking-soon/{handed.id}/owner-login", json={}, headers=h)
    assert refused.status_code == 409


@pytest.mark.asyncio
async def test_public_list_puts_lead_listings_with_photos_first(async_client, db_session):
    city = f"Phototown{uuid.uuid4().hex[:6]}"
    old = datetime.now(timezone.utc) - timedelta(days=30)
    _, with_photos = await _lead(db_session, "Old With Photos", city=city, created=old,
                                 photos=[{"url": "https://x/a.jpg", "category": "exterior"}])
    _, without = await _lead(db_session, "New Without Photos", city=city)

    items = (await async_client.get("/api/v1/cafes", params={"city": city, "limit": 50})).json()["data"]["items"]
    names = [i["name"] for i in items]
    assert names.index("Old With Photos") < names.index("New Without Photos")
