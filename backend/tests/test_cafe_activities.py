import pytest
from uuid import uuid4
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.hardware_tier import HardwareTier, TierType, PlatformType
from app.models.hardware_tier_unit import HardwareTierUnit, UnitStatus
from app.models.cafe import Cafe, VerificationStatus
from app.models.user import User, UserRole
from app.core.security import get_password_hash


@pytest.mark.asyncio
async def test_hardware_tier_defaults_to_gaming_type():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"activity_owner_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Activity Owner",
            role=UserRole.CAFE_OWNER, is_active=True,
        )
        db.add(owner)
        await db.flush()
        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Activity Test Cafe",
            address_line1="1 Cue St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000099",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.flush()

        tier = HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="RTX 4090 PC",
            total_seats=4, app_bookable_seats=4, price_per_hour=100,
        )
        db.add(tier)
        await db.commit()
        await db.refresh(tier)

        assert tier.tier_type == TierType.GAMING
        assert tier.activity_kind is None


@pytest.mark.asyncio
async def test_activity_tier_and_units_roundtrip():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"activity_owner2_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Activity Owner 2",
            role=UserRole.CAFE_OWNER, is_active=True,
        )
        db.add(owner)
        await db.flush()
        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Snooker Test Cafe",
            address_line1="2 Cue St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000098",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.flush()

        tier = HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="Snooker",
            tier_type=TierType.ACTIVITY, activity_kind="Snooker",
            total_seats=3, app_bookable_seats=3, price_per_hour=400,
            platform=None,
        )
        db.add(tier)
        await db.flush()

        for i in range(1, 4):
            db.add(HardwareTierUnit(id=uuid4(), tier_id=tier.id, label=f"Table {i}", status=UnitStatus.AVAILABLE))
        await db.commit()

        result = await db.execute(select(HardwareTierUnit).where(HardwareTierUnit.tier_id == tier.id))
        units = result.scalars().all()
        assert len(units) == 3
        assert all(u.status == UnitStatus.AVAILABLE for u in units)
