import pytest
from uuid import uuid4
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal


@pytest.mark.asyncio
async def test_delete_menu_photo_removes_url():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"menu_photo_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Menu Photo Owner",
            role=UserRole.CAFE_OWNER, is_active=True
        )
        db.add(owner)
        await db.flush()
        # require_cafe_ownership resolves roles from user_roles, not User.role.
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        await db.flush()

        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Menu Photo Cafe",
            address_line1="1 Menu St", city="Bengaluru", state="Karnataka",
            pincode="560001", phone_number="+919000000050",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
            menu_photos=["https://example.com/menu-a.jpg", "https://example.com/menu-b.jpg"],
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.request(
                "DELETE",
                f"/api/v1/owner/cafes/{cafe.id}/menu-photos",
                json={"url": "https://example.com/menu-a.jpg"},
                headers=headers
            )
            assert res.status_code == 200
            assert res.json()["data"]["menuPhotos"] == ["https://example.com/menu-b.jpg"]

        await db.refresh(cafe)
        assert cafe.menu_photos == ["https://example.com/menu-b.jpg"]


@pytest.mark.asyncio
async def test_update_cafe_details_persists_menu_photos():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"menu_add_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Menu Add Owner",
            role=UserRole.CAFE_OWNER, is_active=True
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        await db.flush()

        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Menu Add Cafe",
            address_line1="1 Menu Add St", city="Bengaluru", state="Karnataka",
            pincode="560001", phone_number="+919000000051",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.patch(
                f"/api/v1/owner/cafes/{cafe.id}/details",
                json={"menuPhotos": ["https://example.com/menu-new.jpg"]},
                headers=headers
            )
            assert res.status_code == 200

        await db.refresh(cafe)
        assert cafe.menu_photos == ["https://example.com/menu-new.jpg"]


@pytest.mark.asyncio
async def test_owner_settings_includes_menu_photos():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"menu_settings_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Menu Settings Owner",
            role=UserRole.CAFE_OWNER, is_active=True
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        await db.flush()

        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Menu Settings Cafe",
            address_line1="1 Menu Settings St", city="Bengaluru", state="Karnataka",
            pincode="560001", phone_number="+919000000052",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
            menu_photos=["https://example.com/menu-existing.jpg"],
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.get("/api/v1/owner/settings", headers=headers)
            assert res.status_code == 200
            assert res.json()["data"]["cafe"]["menuPhotos"] == ["https://example.com/menu-existing.jpg"]
