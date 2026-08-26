import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal
from app.models.hardware_tier import HardwareTier
from sqlalchemy import select


@pytest.mark.asyncio
async def test_onboarding_submit_with_platform_tier_derives_specs():
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_platform_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Platform Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Onboard Platform Cafe",
            "addressLine1": "1 Onboard St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000020",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "hardwareTiers": [
                {"platform": "playstation", "model": "PS5", "totalSeats": 4, "appBookableSeats": 1, "hourlyRate": 150},
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 10, "appBookableSeats": 3, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
            assert res.status_code == 200
            cafe_id = res.json()["data"]["cafeId"]

        stmt = select(HardwareTier).where(HardwareTier.cafe_id == uuid.UUID(cafe_id))
        result = await db.execute(stmt)
        tiers = {t.platform.value: t for t in result.scalars().all()}

        assert tiers["playstation"].model == "PS5"
        assert tiers["playstation"].specs == {"console": "PlayStation 5"}
        assert tiers["playstation"].name == "PlayStation 5"
        assert tiers["pc"].specs == {"gpu": "NVIDIA RTX 4070"}


@pytest.mark.asyncio
async def test_onboarding_submit_preserves_explicit_tier_name():
    """I7: an explicit, non-blank tier name supplied at onboarding must
    survive even though platform/model are also set — the derived name may
    only fill in when no real name was supplied."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_name_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Name Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Onboard Name Cafe",
            "addressLine1": "1 Onboard Name St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000021",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "hardwareTiers": [
                {"platform": "playstation", "model": "PS5", "name": "VIP Zone", "totalSeats": 4, "appBookableSeats": 1, "hourlyRate": 150},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
            assert res.status_code == 200
            cafe_id = res.json()["data"]["cafeId"]

        stmt = select(HardwareTier).where(HardwareTier.cafe_id == uuid.UUID(cafe_id))
        result = await db.execute(stmt)
        tier = result.scalars().first()
        assert tier.name == "VIP Zone"
        assert tier.specs == {"console": "PlayStation 5"}


@pytest.mark.asyncio
async def test_onboarding_submit_rejects_oversized_tier_model():
    """I5: a Dict[str, Any] tier soup let a non-string or oversized `model`
    reach derive_tier_display, crashing with AttributeError (model.strip() on
    a non-str) or a Postgres DataError (String(100) column overflow) as an
    unhandled 500. A real Pydantic model on hardware_tiers structurally closes
    this: FastAPI rejects the oversized value with a 422 before it ever
    reaches tier-creation code."""
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_oversized_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Oversized Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Onboard Oversized Cafe",
            "addressLine1": "1 Onboard Oversized St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000022",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "hardwareTiers": [
                {"platform": "other", "model": "X" * 101, "totalSeats": 4, "appBookableSeats": 1, "hourlyRate": 150},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
            assert res.status_code == 422
