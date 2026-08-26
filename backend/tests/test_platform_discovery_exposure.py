import pytest
from uuid import uuid4
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier, PlatformType
from app.repositories.cafe_repository import CafeRepository
from app.database import AsyncSessionLocal


@pytest.mark.asyncio
async def test_cafe_list_item_exposes_real_platforms():
    async with AsyncSessionLocal() as db:
        cafe = Cafe(
            id=uuid4(),
            owner_id=uuid4(),
            name="Multi Platform Cafe",
            address_line1="1 Multi St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000030",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
        )
        db.add(cafe)
        await db.flush()

        db.add(HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="PlayStation 5", specs={},
            total_seats=4, app_bookable_seats=1, active_seats_count=4,
            price_per_hour=150.0, platform=PlatformType.PLAYSTATION, model="PS5", is_active=True,
        ))
        db.add(HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="RTX 4070 PC", specs={},
            total_seats=10, app_bookable_seats=3, active_seats_count=10,
            price_per_hour=120.0, platform=PlatformType.PC, model="RTX 4070", is_active=True,
        ))
        db.add(HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="Unmigrated Tier", specs={"gpu": "GTX 1660"},
            total_seats=5, app_bookable_seats=5, active_seats_count=5,
            price_per_hour=80.0, is_active=True,
        ))
        await db.commit()

        repo = CafeRepository(db)
        items, total = await repo.search_verified(page=1, limit=20)
        this_cafe = next(i for i in items if i["id"] == cafe.id)

        assert set(this_cafe["platforms"]) == {"pc", "playstation"}
        # One of the three active tiers above has no platform — this café's
        # migration is not complete, so the customer-facing badge logic
        # (lib/platformTags.ts) must union this with the name-based
        # fallback rather than trusting `platforms` exclusively (I1).
        assert this_cafe["platforms_complete"] is False


@pytest.mark.asyncio
async def test_cafe_list_item_platforms_complete_true_when_fully_migrated():
    async with AsyncSessionLocal() as db:
        cafe = Cafe(
            id=uuid4(),
            owner_id=uuid4(),
            name="Fully Migrated Cafe",
            address_line1="1 Fully St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000031",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
        )
        db.add(cafe)
        await db.flush()

        db.add(HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="PlayStation 5", specs={},
            total_seats=4, app_bookable_seats=1, active_seats_count=4,
            price_per_hour=150.0, platform=PlatformType.PLAYSTATION, model="PS5", is_active=True,
        ))
        await db.commit()

        repo = CafeRepository(db)
        items, total = await repo.search_verified(page=1, limit=20)
        this_cafe = next(i for i in items if i["id"] == cafe.id)

        assert this_cafe["platforms"] == ["playstation"]
        assert this_cafe["platforms_complete"] is True
