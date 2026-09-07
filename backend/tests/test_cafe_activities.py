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


from app.repositories.hardware_tier_unit_repository import HardwareTierUnitRepository
from app.repositories.booking_repository import BookingRepository


@pytest.mark.asyncio
async def test_maintenance_unit_reduces_booking_capacity():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"activity_owner3_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Activity Owner 3",
            role=UserRole.CAFE_OWNER, is_active=True,
        )
        db.add(owner)
        await db.flush()
        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Maintenance Test Cafe",
            address_line1="3 Cue St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000097",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.flush()

        tier = HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="Snooker",
            tier_type=TierType.ACTIVITY, activity_kind="Snooker",
            total_seats=3, app_bookable_seats=3, price_per_hour=400,
        )
        db.add(tier)
        await db.flush()

        unit_repo = HardwareTierUnitRepository(db)
        units = await unit_repo.sync_units_to_quantity(tier.id, 3, "Table")
        await unit_repo.set_status(units[0].id, UnitStatus.MAINTENANCE)

        assert await unit_repo.count_in_maintenance(tier.id) == 1

        booking_repo = BookingRepository(db)
        from datetime import date, time
        count, capacity = await booking_repo.get_overlapping_bookings_count_with_lock(
            tier_id=tier.id, session_date=date(2026, 9, 10),
            start_time=time(18, 0), end_time=time(19, 0),
        )
        assert capacity == 2  # 3 total - 1 in maintenance


from datetime import date, time


@pytest.mark.asyncio
async def test_capacity_conflict_detected_for_fully_booked_future_slot():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"activity_owner4_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Activity Owner 4",
            role=UserRole.CAFE_OWNER, is_active=True,
        )
        db.add(owner)
        await db.flush()
        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Conflict Test Cafe",
            address_line1="5 Cue St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000095",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.flush()

        tier = HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="Snooker",
            tier_type=TierType.ACTIVITY, activity_kind="Snooker",
            total_seats=3, app_bookable_seats=3, price_per_hour=400,
        )
        db.add(tier)
        await db.flush()

        from app.models.booking import Booking, BookingStatus
        future_booking = Booking(
            id=uuid4(), booking_reference=f"CONF{uuid4().hex[:8].upper()}",
            gamer_id=owner.id, cafe_id=cafe.id, hardware_tier_id=tier.id,
            seats_count=3, session_date=date(2026, 12, 1),
            start_time=time(18, 0), end_time=time(19, 0), duration_hours=1,
            base_amount=1200, total_amount=1200, status=BookingStatus.CONFIRMED,
        )
        db.add(future_booking)
        await db.commit()

        booking_repo = BookingRepository(db)
        # All 3 seats are booked for that slot — shrinking to 2 must conflict.
        conflict = await booking_repo.find_first_capacity_conflict(tier.id, new_capacity=2)
        assert conflict is not None
        assert conflict.id == future_booking.id

        # Shrinking to 3 (no real reduction) or leaving capacity alone is safe.
        no_conflict = await booking_repo.find_first_capacity_conflict(tier.id, new_capacity=3)
        assert no_conflict is None
