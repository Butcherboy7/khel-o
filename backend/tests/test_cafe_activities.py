import pytest
from uuid import uuid4
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.hardware_tier import HardwareTier, TierType, PlatformType
from app.models.hardware_tier_unit import HardwareTierUnit, UnitStatus
from app.models.cafe import Cafe, VerificationStatus
from app.models.user import User, UserRole
from app.core.security import get_password_hash
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.security import create_access_token
from app.models.user_role import UserRoleMapping


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


@pytest.mark.asyncio
async def test_create_activity_tier_via_api_generates_units():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"activity_api_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Activity API Owner",
            role=UserRole.CAFE_OWNER, is_active=True,
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Activity API Cafe",
            address_line1="4 Cue St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000096",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
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
                    "name": "Snooker",
                    "description": "4 full-size tables with professional cues.",
                    "specs": {},
                    "totalSeats": 4,
                    "appBookableSeats": 4,
                    "pricePerHour": 400,
                    "tierType": "activity",
                    "activityKind": "Snooker",
                    # Deviation from brief's literal Step-1 test: the brief's
                    # payload omits individualUnits here yet asserts 4 named
                    # units get created — that directly contradicts Step 6's
                    # requirement-2 test (same omission, asserts NO units) and
                    # the individual_units default of False documented on
                    # HardwareTierCreate. Adding it explicitly here is the
                    # smallest fix consistent with the stated default-pooled
                    # behavior; see task-3-report.md.
                    "individualUnits": True,
                },
                headers=headers,
            )
            assert res.status_code == 201
            tier = res.json()["data"]["hardwareTier"]
            assert tier["tierType"] == "activity"
            assert tier["activityKind"] == "Snooker"
            assert tier["platform"] is None
            assert tier["performanceRating"] is None  # bugfix: no gaming rating on an activity

            units_res = await client.get(
                f"/api/v1/cafes/{cafe.id}/tiers/{tier['id']}/units", headers=headers
            )
            assert units_res.status_code == 200
            units = units_res.json()["data"]["units"]
            assert [u["label"] for u in units] == ["Snooker 1", "Snooker 2", "Snooker 3", "Snooker 4"]


@pytest.mark.asyncio
async def test_create_pooled_activity_tier_has_no_units():
    """Requirement 2: pooled-capacity mode (e.g. Arcade Zone) never gets
    hardware_tier_units rows — capacity is just total_seats/app_bookable_seats,
    exactly like every existing PC/console tier. individualUnits omitted
    (defaults to pooled) is the same as sending it false."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"pooled_owner_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Pooled Owner",
            role=UserRole.CAFE_OWNER, is_active=True,
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Pooled Activity Cafe",
            address_line1="6 Cue St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000094",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
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
                    "name": "Arcade Zone",
                    "specs": {},
                    "totalSeats": 20,
                    "appBookableSeats": 20,
                    "pricePerHour": 150,
                    "tierType": "activity",
                    "activityKind": "Arcade",
                    # individualUnits omitted — pooled by default
                },
                headers=headers,
            )
            assert res.status_code == 201
            tier = res.json()["data"]["hardwareTier"]

            units_res = await client.get(
                f"/api/v1/cafes/{cafe.id}/tiers/{tier['id']}/units", headers=headers
            )
            assert units_res.json()["data"]["units"] == []


@pytest.mark.asyncio
async def test_platforms_complete_ignores_activity_tiers():
    """Bugfix (requirement 6): a café with one fully-migrated PC tier and one
    Snooker activity must still report platforms_complete=True in the
    Explore-page search results — activities have no platform by design and
    must not count against it. flex_search_verified is the one method in
    cafe_repository.py that computes platforms_complete (confirmed by
    grepping the file — it appears nowhere else)."""
    from app.repositories.cafe_repository import CafeRepository

    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"platforms_owner_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Platforms Owner",
            role=UserRole.CAFE_OWNER, is_active=True,
        )
        db.add(owner)
        await db.flush()
        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Platforms Complete Cafe",
            address_line1="7 Cue St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000093",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.flush()

        db.add(HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="RTX 4090 PC",
            platform=PlatformType.PC, model="RTX 4090",
            total_seats=4, app_bookable_seats=4, price_per_hour=100,
        ))
        db.add(HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="Snooker",
            tier_type=TierType.ACTIVITY, activity_kind="Snooker",
            total_seats=3, app_bookable_seats=3, price_per_hour=400,
        ))
        await db.commit()

        cafe_repo = CafeRepository(db)
        items, total = await cafe_repo.flex_search_verified(city="Hyderabad", query="Platforms Complete Cafe")
        assert total == 1
        assert items[0]["platforms_complete"] is True
        assert items[0]["platforms"] == ["pc"]  # Snooker never contributes a platform


@pytest.mark.asyncio
async def test_maintenance_blocked_when_it_would_oversell_a_booking():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"maint_block_owner_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Maint Block Owner",
            role=UserRole.CAFE_OWNER, is_active=True,
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Maint Block Cafe",
            address_line1="8 Cue St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000092",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
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
                    "name": "Snooker", "specs": {}, "totalSeats": 2, "appBookableSeats": 2,
                    "pricePerHour": 400, "tierType": "activity", "activityKind": "Snooker",
                    "individualUnits": True,
                },
                headers=headers,
            )
            tier_id = create_res.json()["data"]["hardwareTier"]["id"]

        async with AsyncSessionLocal() as db2:
            from app.models.booking import Booking, BookingStatus
            from datetime import date, time
            from uuid import UUID as PyUUID
            db2.add(Booking(
                id=uuid4(), booking_reference=f"MBLK{uuid4().hex[:8].upper()}",
                gamer_id=owner.id, cafe_id=cafe.id, hardware_tier_id=PyUUID(tier_id),
                seats_count=2, session_date=date(2026, 12, 5),
                start_time=time(18, 0), end_time=time(19, 0), duration_hours=1,
                base_amount=800, total_amount=800, status=BookingStatus.CONFIRMED,
            ))
            await db2.commit()

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            units_res = await client.get(f"/api/v1/cafes/{cafe.id}/tiers/{tier_id}/units", headers=headers)
            first_unit_id = units_res.json()["data"]["units"][0]["id"]

            # Both units are needed for the CONFIRMED 2-seat booking above —
            # putting either one into maintenance must be rejected.
            maint_res = await client.patch(
                f"/api/v1/cafes/{cafe.id}/tiers/{tier_id}/units/{first_unit_id}",
                json={"status": "maintenance"}, headers=headers,
            )
            assert maint_res.status_code == 422
            body = maint_res.json()
            assert body["error"]["code"] == "MAINTENANCE_CAPACITY_CONFLICT"
            assert "MBLK" in body["error"]["message"]
