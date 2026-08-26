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
async def test_create_tier_with_platform_derives_specs_and_name():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(),
            email=f"platform_tier_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"),
            full_name="Platform Tier Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))

        cafe = Cafe(
            id=uuid4(),
            owner_id=owner.id,
            name="Platform Tier Service Cafe",
            address_line1="1 Service St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000010",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post(
                f"/api/v1/cafes/{cafe.id}/tiers",
                json={
                    "name": "placeholder",
                    "specs": {},
                    "totalSeats": 4,
                    "appBookableSeats": 1,
                    "pricePerHour": 150,
                    "platform": "playstation",
                    "model": "PS5",
                },
                headers=headers
            )
            assert res.status_code == 201
            tier = res.json()["data"]["hardwareTier"]
            assert tier["platform"] == "playstation"
            assert tier["model"] == "PS5"
            assert tier["specs"] == {"console": "PlayStation 5"}
            assert tier["name"] == "PlayStation 5"


@pytest.mark.asyncio
async def test_create_tier_without_platform_still_works():
    """Backward compatibility: a tier created the old way (owner-typed name
    and specs, no platform) must keep working exactly as before."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(),
            email=f"legacy_tier_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"),
            full_name="Legacy Tier Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))

        cafe = Cafe(
            id=uuid4(),
            owner_id=owner.id,
            name="Legacy Tier Service Cafe",
            address_line1="1 Legacy St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000011",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post(
                f"/api/v1/cafes/{cafe.id}/tiers",
                json={
                    "name": "My Custom Tier",
                    "specs": {"gpu": "NVIDIA RTX 3060"},
                    "totalSeats": 10,
                    "appBookableSeats": 8,
                    "pricePerHour": 100,
                },
                headers=headers
            )
            assert res.status_code == 201
            tier = res.json()["data"]["hardwareTier"]
            assert tier["platform"] is None
            assert tier["model"] is None
            assert tier["specs"] == {"gpu": "NVIDIA RTX 3060"}
            assert tier["name"] == "My Custom Tier"


@pytest.mark.asyncio
async def test_create_tier_with_invalid_model_for_platform_rejected():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(),
            email=f"invalid_model_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"),
            full_name="Invalid Model Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))

        cafe = Cafe(
            id=uuid4(),
            owner_id=owner.id,
            name="Invalid Model Cafe",
            address_line1="1 Invalid St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000012",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post(
                f"/api/v1/cafes/{cafe.id}/tiers",
                json={
                    "name": "placeholder",
                    "specs": {},
                    "totalSeats": 4,
                    "appBookableSeats": 1,
                    "pricePerHour": 150,
                    "platform": "playstation",
                    "model": "Xbox Series X",
                },
                headers=headers
            )
            assert res.status_code == 422


@pytest.mark.asyncio
async def test_update_tier_with_new_platform_rederives_specs_and_name():
    """PATCH path: switching an existing tier's platform/model must re-derive
    specs and name the same way the create path does."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(),
            email=f"update_platform_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"),
            full_name="Update Platform Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))

        cafe = Cafe(
            id=uuid4(),
            owner_id=owner.id,
            name="Update Platform Cafe",
            address_line1="1 Update St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000013",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            create_res = await client.post(
                f"/api/v1/cafes/{cafe.id}/tiers",
                json={
                    "name": "Old Name",
                    "specs": {"gpu": "NVIDIA RTX 3060"},
                    "totalSeats": 10,
                    "appBookableSeats": 8,
                    "pricePerHour": 100,
                },
                headers=headers
            )
            assert create_res.status_code == 201
            tier_id = create_res.json()["data"]["hardwareTier"]["id"]

            patch_res = await client.patch(
                f"/api/v1/cafes/{cafe.id}/tiers/{tier_id}",
                json={
                    "platform": "xbox",
                    "model": "Series X",
                },
                headers=headers
            )
            assert patch_res.status_code == 200
            tier = patch_res.json()["data"]["hardwareTier"]
            assert tier["platform"] == "xbox"
            assert tier["model"] == "Series X"
            assert tier["specs"] == {"console": "Xbox Series X"}
            assert tier["name"] == "Xbox Series X"


@pytest.mark.asyncio
async def test_update_tier_with_invalid_model_for_platform_rejected():
    """PATCH path: an invalid model for the given platform must be rejected
    with 422, proving the ValueError->ValidationException catch also applies
    to update_hardware_tier, not just add_hardware_tier."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(),
            email=f"update_invalid_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"),
            full_name="Update Invalid Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))

        cafe = Cafe(
            id=uuid4(),
            owner_id=owner.id,
            name="Update Invalid Cafe",
            address_line1="1 Update Invalid St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000014",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            create_res = await client.post(
                f"/api/v1/cafes/{cafe.id}/tiers",
                json={
                    "name": "Legacy Tier",
                    "specs": {"gpu": "NVIDIA RTX 3060"},
                    "totalSeats": 10,
                    "appBookableSeats": 8,
                    "pricePerHour": 100,
                },
                headers=headers
            )
            assert create_res.status_code == 201
            tier_id = create_res.json()["data"]["hardwareTier"]["id"]

            patch_res = await client.patch(
                f"/api/v1/cafes/{cafe.id}/tiers/{tier_id}",
                json={
                    "platform": "playstation",
                    "model": "Xbox Series X",
                },
                headers=headers
            )
            assert patch_res.status_code == 422


@pytest.mark.asyncio
async def test_update_tier_with_platform_overrides_explicit_empty_specs():
    """A PATCH that sends platform/model alongside an explicit empty specs:{}
    must still get the derived specs, not the empty dict the client sent --
    otherwise a future caller could silently lose derived specs (the
    asymmetry with add_hardware_tier's unconditional override)."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(),
            email=f"update_override_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"),
            full_name="Update Override Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))

        cafe = Cafe(
            id=uuid4(),
            owner_id=owner.id,
            name="Update Override Cafe",
            address_line1="1 Update Override St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000015",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            create_res = await client.post(
                f"/api/v1/cafes/{cafe.id}/tiers",
                json={
                    "name": "Old Name",
                    "specs": {"gpu": "NVIDIA RTX 3060"},
                    "totalSeats": 10,
                    "appBookableSeats": 8,
                    "pricePerHour": 100,
                },
                headers=headers
            )
            assert create_res.status_code == 201
            tier_id = create_res.json()["data"]["hardwareTier"]["id"]

            patch_res = await client.patch(
                f"/api/v1/cafes/{cafe.id}/tiers/{tier_id}",
                json={
                    "platform": "playstation",
                    "model": "PS5",
                    "specs": {},
                },
                headers=headers
            )
            assert patch_res.status_code == 200
            tier = patch_res.json()["data"]["hardwareTier"]
            assert tier["specs"] == {"console": "PlayStation 5"}
