import pytest
from uuid import uuid4
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal


@pytest.mark.asyncio
async def test_needs_confirmation_lists_unmigrated_tiers_with_guess():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"reconfirm_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Reconfirm Owner",
            role=UserRole.CAFE_OWNER, is_active=True
        )
        db.add(owner)
        await db.flush()
        # require_cafe_owner resolves roles from user_roles, not User.role —
        # without this row every request 403s regardless of the role set above.
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        await db.flush()

        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Reconfirm Cafe",
            address_line1="1 Reconfirm St", city="Bengaluru", state="Karnataka",
            pincode="560001", phone_number="+919000000040",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.flush()

        tier = HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="PS4 Pro Console Corner",
            specs={"gpu": "PS4 Pro Custom AMD Jaguar CPU"},
            total_seats=4, app_bookable_seats=1, active_seats_count=4,
            price_per_hour=100.0, is_active=True,
        )
        db.add(tier)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.get("/api/v1/owner/tiers/needs-confirmation", headers=headers)
            assert res.status_code == 200
            data = res.json()["data"]
            assert data["needsConfirmation"] is True
            assert len(data["tiers"]) == 1
            assert data["tiers"][0]["guessedPlatform"] == "playstation"

            confirm_res = await client.patch(
                f"/api/v1/owner/tiers/{tier.id}/confirm-platform",
                json={"platform": "playstation", "model": "PS4 Pro"},
                headers=headers
            )
            assert confirm_res.status_code == 200

        await db.refresh(tier)
        assert tier.platform.value == "playstation"
        assert tier.model == "PS4 Pro"


@pytest.mark.asyncio
async def test_needs_confirmation_false_once_all_tiers_migrated():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"reconfirm_done_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Reconfirm Done Owner",
            role=UserRole.CAFE_OWNER, is_active=True
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        await db.flush()

        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Already Migrated Cafe",
            address_line1="1 Migrated St", city="Bengaluru", state="Karnataka",
            pincode="560001", phone_number="+919000000041",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.get("/api/v1/owner/tiers/needs-confirmation", headers=headers)
            assert res.status_code == 200
            assert res.json()["data"]["needsConfirmation"] is False
