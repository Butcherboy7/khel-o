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
async def test_create_tier_with_explicit_name_survives_platform_derivation():
    """I7: the spec says the tier name is 'editable by the owner for a custom
    corner name (VIP Zone)'. A non-blank, explicitly-supplied name must
    survive even when platform/model are also set — the derived name may
    only fill in when no real name was supplied."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(),
            email=f"explicit_name_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"),
            full_name="Explicit Name Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))

        cafe = Cafe(
            id=uuid4(),
            owner_id=owner.id,
            name="Explicit Name Cafe",
            address_line1="1 Explicit St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000016",
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
                    "name": "VIP Zone",
                    "specs": {},
                    "totalSeats": 4,
                    "appBookableSeats": 1,
                    "pricePerHour": 150,
                    "platform": "playstation",
                    "model": "PS5",
                },
                headers=headers
            )
            assert create_res.status_code == 201
            tier = create_res.json()["data"]["hardwareTier"]
            assert tier["name"] == "VIP Zone"
            assert tier["specs"] == {"console": "PlayStation 5"}
            tier_id = tier["id"]

            # Saving again (e.g. a price change) without touching the name
            # must keep "VIP Zone" — not silently rename it back to the
            # derived "PlayStation 5" the moment platform/model round-trip
            # through another PATCH.
            patch_res = await client.patch(
                f"/api/v1/cafes/{cafe.id}/tiers/{tier_id}",
                json={"platform": "playstation", "model": "PS5 Pro", "name": "VIP Zone"},
                headers=headers
            )
            assert patch_res.status_code == 200
            patched = patch_res.json()["data"]["hardwareTier"]
            assert patched["name"] == "VIP Zone"
            assert patched["specs"] == {"console": "PlayStation 5 Pro"}


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
async def test_update_tier_resending_same_platform_model_preserves_owner_name():
    """PATCH path: the tiers-page edit flow resends the tier's unchanged
    platform+model on every save, even a plain price edit. That must not
    silently rename an owner-authored tier name (final-review.md I7,
    re-review finding Important 1) — the derived name should only replace it
    when platform or model actually changes from what the tier already had."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(),
            email=f"preserve_name_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"),
            full_name="Preserve Name Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))

        cafe = Cafe(
            id=uuid4(),
            owner_id=owner.id,
            name="Preserve Name Cafe",
            address_line1="1 Preserve St",
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
                    "name": "VIP Zone",
                    "platform": "playstation",
                    "model": "PS5",
                    "totalSeats": 4,
                    "appBookableSeats": 2,
                    "pricePerHour": 150,
                },
                headers=headers
            )
            assert create_res.status_code == 201
            tier_id = create_res.json()["data"]["hardwareTier"]["id"]
            assert create_res.json()["data"]["hardwareTier"]["name"] == "VIP Zone"

            # Mirrors the tiers page's real edit payload: unchanged platform
            # and model resent alongside a plain price change, no name field.
            patch_res = await client.patch(
                f"/api/v1/cafes/{cafe.id}/tiers/{tier_id}",
                json={
                    "platform": "playstation",
                    "model": "PS5",
                    "pricePerHour": 180,
                },
                headers=headers
            )
            assert patch_res.status_code == 200
            tier = patch_res.json()["data"]["hardwareTier"]
            assert tier["pricePerHour"] == 180
            assert tier["name"] == "VIP Zone"


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


@pytest.mark.asyncio
async def test_update_tier_single_field_platform_only_does_not_wipe_specs():
    """I4: PATCH {"platform": "pc"} with no model must not wipe the tier's
    real specs/name. derive_tier_display(platform, None) silently returns a
    placeholder ({}, "Gaming Station") — applying that placeholder from a
    single-field PATCH (not reachable from the current UI, but these are
    owner-authenticated public routes) would destroy real data."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(),
            email=f"single_field_platform_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"),
            full_name="Single Field Platform Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))

        cafe = Cafe(
            id=uuid4(),
            owner_id=owner.id,
            name="Single Field Platform Cafe",
            address_line1="1 Single Field St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000017",
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
                json={"platform": "pc"},
                headers=headers
            )
            assert patch_res.status_code == 200
            tier = patch_res.json()["data"]["hardwareTier"]
            # platform is recorded, but specs/name are untouched — no real
            # model was ever given for derive_tier_display to act on.
            assert tier["platform"] == "pc"
            assert tier["model"] is None
            assert tier["specs"] == {"gpu": "NVIDIA RTX 3060"}
            assert tier["name"] == "Legacy Tier"


@pytest.mark.asyncio
async def test_update_tier_single_field_model_only_does_not_rename_unmigrated_tier():
    """I4: PATCH {"model": "PS5"} on a tier whose platform is still NULL must
    not rename the tier to the derive_tier_display placeholder while leaving
    platform NULL — that would leave it permanently un-migrated under a
    meaningless name."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(),
            email=f"single_field_model_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"),
            full_name="Single Field Model Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))

        cafe = Cafe(
            id=uuid4(),
            owner_id=owner.id,
            name="Single Field Model Cafe",
            address_line1="1 Single Field Model St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000018",
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
                json={"model": "PS5"},
                headers=headers
            )
            assert patch_res.status_code == 200
            tier = patch_res.json()["data"]["hardwareTier"]
            assert tier["platform"] is None
            assert tier["model"] == "PS5"
            assert tier["specs"] == {"gpu": "NVIDIA RTX 3060"}
            assert tier["name"] == "Legacy Tier"
