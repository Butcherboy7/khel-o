import pytest
from uuid import uuid4
from app.models.hardware_tier import HardwareTier, PlatformType
from app.models.cafe import Cafe, VerificationStatus
from app.database import AsyncSessionLocal


@pytest.mark.asyncio
async def test_hardware_tier_platform_and_model_columns_persist():
    async with AsyncSessionLocal() as db:
        owner_id = uuid4()
        cafe = Cafe(
            id=uuid4(),
            owner_id=owner_id,
            name="Platform Column Test Cafe",
            address_line1="1 Test St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000001",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
        )
        db.add(cafe)
        await db.flush()

        tier = HardwareTier(
            id=uuid4(),
            cafe_id=cafe.id,
            name="PS5",
            specs={},
            total_seats=4,
            app_bookable_seats=1,
            active_seats_count=4,
            price_per_hour=150.0,
            platform=PlatformType.PLAYSTATION,
            model="PS5",
        )
        db.add(tier)
        await db.commit()
        await db.refresh(tier)

        assert tier.platform == PlatformType.PLAYSTATION
        assert tier.model == "PS5"


@pytest.mark.asyncio
async def test_existing_tier_without_platform_stays_valid():
    """A tier created the old way (no platform/model) must remain valid —
    this is the backward-compatibility guarantee the whole migration
    strategy depends on."""
    async with AsyncSessionLocal() as db:
        owner_id = uuid4()
        cafe = Cafe(
            id=uuid4(),
            owner_id=owner_id,
            name="Legacy Tier Test Cafe",
            address_line1="1 Legacy St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000002",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
        )
        db.add(cafe)
        await db.flush()

        tier = HardwareTier(
            id=uuid4(),
            cafe_id=cafe.id,
            name="Standard RTX 3060 Pods",
            specs={"gpu": "NVIDIA RTX 3060"},
            total_seats=10,
            app_bookable_seats=8,
            active_seats_count=10,
            price_per_hour=100.0,
        )
        db.add(tier)
        await db.commit()
        await db.refresh(tier)

        assert tier.platform is None
        assert tier.model is None


@pytest.mark.asyncio
async def test_cafe_menu_photos_column_persists():
    async with AsyncSessionLocal() as db:
        cafe = Cafe(
            id=uuid4(),
            owner_id=uuid4(),
            name="Menu Photos Test Cafe",
            address_line1="1 Menu St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000003",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
            menu_photos=["https://example.com/menu1.jpg"],
        )
        db.add(cafe)
        await db.commit()
        await db.refresh(cafe)

        assert cafe.menu_photos == ["https://example.com/menu1.jpg"]
