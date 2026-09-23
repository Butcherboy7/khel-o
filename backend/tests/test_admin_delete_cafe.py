"""Admin hard-delete for cafés with no real history -- test/duplicate cleanup.

Gate is booking count, not "is this a test café": any café with zero
bookings is safe to wipe (no revenue/customer history exists for it), and a
café with even one booking is refused outright, full stop. That's the actual
safety boundary; everything else the café touches is dependent data cleaned
up alongside it.
"""
import uuid
from datetime import date, time

import pytest

from app.models.booking import Booking, BookingStatus
from app.models.cafe import Cafe, VerificationStatus
from app.models.cafe_waitlist import CafeWaitlistEntry
from app.models.hardware_tier import HardwareTier, PlatformType
from app.models.user import UserRole
from tests.conftest import auth_headers, create_test_user


async def _cafe(db_session, owner, name="Delete Me Cafe") -> Cafe:
    cafe = Cafe(
        id=uuid.uuid4(), owner_id=owner.id, name=name,
        address_line1="1 Test Rd", city="Hyderabad", state="Telangana",
        pincode="500001", phone_number="7777777777", email=owner.email,
        verification_status=VerificationStatus.PENDING, is_active=False,
        amenities=[], photos=[], supported_games={}, menu_photos=[],
        house_rules=[], social_links={},
    )
    db_session.add(cafe)
    await db_session.commit()
    return cafe


@pytest.mark.asyncio
async def test_delete_wipes_a_bookingless_cafe_and_its_dependents(db_session, async_client):
    owner = await create_test_user(db_session, email="deleteowner@test.com", role=UserRole.GAMER)
    admin = await create_test_user(db_session, email="admin_del1@test.com", role=UserRole.ADMIN)
    cafe = await _cafe(db_session, owner)

    tier = HardwareTier(
        id=uuid.uuid4(), cafe_id=cafe.id, name="PC", price_per_hour=150,
        total_seats=10, app_bookable_seats=5, platform=PlatformType.PC, specs={},
    )
    db_session.add(tier)
    db_session.add(CafeWaitlistEntry(
        id=uuid.uuid4(), cafe_id=cafe.id, session_id="sess-1", contact="9999999999",
    ))
    await db_session.commit()
    cafe_id = cafe.id

    resp = await async_client.request(
        "DELETE", f"/api/v1/admin/cafes/{cafe_id}",
        json={"confirm_name": cafe.name},
        headers=auth_headers(admin, is_admin=True),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["deleted"] is True

    from sqlalchemy import select
    assert (await db_session.execute(select(Cafe).where(Cafe.id == cafe_id))).scalars().first() is None
    assert (await db_session.execute(select(HardwareTier).where(HardwareTier.cafe_id == cafe_id))).scalars().first() is None
    assert (await db_session.execute(select(CafeWaitlistEntry).where(CafeWaitlistEntry.cafe_id == cafe_id))).scalars().first() is None


@pytest.mark.asyncio
async def test_delete_refused_with_wrong_confirmation_name(db_session, async_client):
    owner = await create_test_user(db_session, email="deleteowner2@test.com", role=UserRole.GAMER)
    admin = await create_test_user(db_session, email="admin_del2@test.com", role=UserRole.ADMIN)
    cafe = await _cafe(db_session, owner)

    resp = await async_client.request(
        "DELETE", f"/api/v1/admin/cafes/{cafe.id}",
        json={"confirm_name": "Wrong Name"},
        headers=auth_headers(admin, is_admin=True),
    )
    assert resp.status_code >= 400
    assert resp.json()["error"]["code"] == "DELETE_CONFIRMATION_MISMATCH"

    from sqlalchemy import select
    assert (await db_session.execute(select(Cafe).where(Cafe.id == cafe.id))).scalars().first() is not None


@pytest.mark.asyncio
async def test_delete_refused_when_cafe_has_any_booking(db_session, async_client):
    owner = await create_test_user(db_session, email="deleteowner3@test.com", role=UserRole.GAMER)
    gamer = await create_test_user(db_session, email="gamer_del@test.com", role=UserRole.GAMER)
    admin = await create_test_user(db_session, email="admin_del3@test.com", role=UserRole.ADMIN)
    cafe = await _cafe(db_session, owner)
    tier = HardwareTier(
        id=uuid.uuid4(), cafe_id=cafe.id, name="PC", price_per_hour=150,
        total_seats=10, app_bookable_seats=5, platform=PlatformType.PC, specs={},
    )
    db_session.add(tier)
    await db_session.flush()
    db_session.add(Booking(
        id=uuid.uuid4(), booking_reference="GC-2026-DEL001", gamer_id=gamer.id, cafe_id=cafe.id,
        hardware_tier_id=tier.id, session_date=date(2026, 10, 1),
        start_time=time(10, 0), end_time=time(11, 0), duration_hours=1.0,
        seats_count=1, base_amount=150, total_amount=150,
        status=BookingStatus.CANCELLED,
    ))
    await db_session.commit()

    resp = await async_client.request(
        "DELETE", f"/api/v1/admin/cafes/{cafe.id}",
        json={"confirm_name": cafe.name},
        headers=auth_headers(admin, is_admin=True),
    )
    assert resp.status_code >= 400
    assert resp.json()["error"]["code"] == "CAFE_HAS_BOOKINGS"

    from sqlalchemy import select
    assert (await db_session.execute(select(Cafe).where(Cafe.id == cafe.id))).scalars().first() is not None


@pytest.mark.asyncio
async def test_delete_requires_admin_role(db_session, async_client):
    owner = await create_test_user(db_session, email="deleteowner4@test.com", role=UserRole.GAMER)
    cafe = await _cafe(db_session, owner)

    resp = await async_client.request(
        "DELETE", f"/api/v1/admin/cafes/{cafe.id}",
        json={"confirm_name": cafe.name},
        headers=auth_headers(owner),
    )
    assert resp.status_code in (401, 403)
