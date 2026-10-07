"""A table / lane / room is priced per unit, never per person. The player count
only has to fit the owner's "max players per table"; snooker and pool require
the owner to set it."""
from datetime import date, time, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient, ASGITransport

from app.core import taxonomy
from app.core.security import get_password_hash, create_access_token
from app.database import AsyncSessionLocal
from app.main import app
from app.models.cafe import Cafe, VerificationStatus
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping


def test_players_cap_reads_the_owners_number_and_never_guesses():
    assert taxonomy.players_cap({"players_max": 4}) == 4
    assert taxonomy.players_cap({"players_per_lane": 6}) == 6
    assert taxonomy.players_cap({"room_capacity": 10}) == 10
    assert taxonomy.players_cap({}) is None
    assert taxonomy.players_cap(None) is None


def test_snooker_and_pool_require_max_players_other_tables_do_not():
    assert taxonomy.missing_required("snooker", {}) == ["Max players per table"]
    assert taxonomy.missing_required("pool.american", {"players_max": 4}) == []
    assert taxonomy.missing_required("darts", {}) == []
    assert taxonomy.missing_required("bowling", {}) == []


@pytest.mark.asyncio
async def test_pool_price_is_per_table_and_group_size_is_capped():
    async with AsyncSessionLocal() as db:
        owner = User(id=uuid4(), email=f"grp_{uuid4().hex[:8]}@test.com",
                     password_hash=get_password_hash("testpass123"), full_name="Grp Owner",
                     role=UserRole.CAFE_OWNER, is_active=True)
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        cafe = Cafe(id=uuid4(), owner_id=owner.id, name=f"Grp Cafe {uuid4().hex[:5]}",
                    address_line1="1 Cue St", city="Hyderabad", state="Telangana", pincode="500001",
                    phone_number="+919000000073", verification_status=VerificationStatus.VERIFIED,
                    is_active=True, opening_time=time(0, 0), closing_time=time(23, 59))
        db.add(cafe)
        await db.commit()
        h = {"Authorization": f"Bearer {create_access_token(subject=str(owner.id), role=owner.role.value)}"}
        cafe_id = cafe.id

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        base = {"name": "Pool", "specs": {}, "totalSeats": 3, "appBookableSeats": 3, "pricePerHour": 160,
                "tierType": "activity", "activityKind": "Pool", "taxonomyKey": "pool.american"}
        # required on create
        res = await c.post(f"/api/v1/cafes/{cafe_id}/tiers", headers=h, json=base)
        assert res.status_code == 422 or res.status_code == 400, res.text
        res = await c.post(f"/api/v1/cafes/{cafe_id}/tiers", headers=h, json={**base, "attributes": {"players_max": 4}})
        assert res.status_code == 201, res.text
        tier_id = res.json()["data"]["hardwareTier"]["id"]

        def quote(units, players):
            return c.post("/api/v1/bookings/quote", json={
                "cafeId": str(cafe_id), "hardwareTierId": tier_id,
                "sessionDate": str(date.today() + timedelta(days=2)), "startTime": "18:00:00",
                "durationHours": 1, "seatsCount": units, "playersCount": players})

        one = (await quote(1, 1)).json()["data"]["baseAmount"]
        four = await quote(1, 4)
        assert four.status_code == 200, four.text
        assert four.json()["data"]["baseAmount"] == one == 160   # players never change the price
        assert (await quote(1, 5)).status_code == 422            # beyond the owner's max for 1 table
        two_tables = await quote(2, 8)
        assert two_tables.json()["data"]["baseAmount"] == 320    # only tables multiply
