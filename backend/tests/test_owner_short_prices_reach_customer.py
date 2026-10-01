"""An owner's custom 15/30-minute prices must reach the customer: stored on
create AND edit, exposed on the public café API (checkout needs them), and
used by the server's quote."""
from datetime import date, time, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient, ASGITransport

from app.core.security import get_password_hash, create_access_token
from app.database import AsyncSessionLocal
from app.main import app
from app.models.cafe import Cafe, VerificationStatus
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping


@pytest.mark.asyncio
async def test_edited_15m_price_reaches_public_api_and_quote():
    async with AsyncSessionLocal() as db:
        owner = User(id=uuid4(), email=f"p15_{uuid4().hex[:8]}@test.com",
                     password_hash=get_password_hash("testpass123"), full_name="P15 Owner",
                     role=UserRole.CAFE_OWNER, is_active=True)
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        cafe = Cafe(id=uuid4(), owner_id=owner.id, name=f"P15 Cafe {uuid4().hex[:5]}",
                    address_line1="1 Cue St", city="Hyderabad", state="Telangana", pincode="500001",
                    phone_number="+919000000072", verification_status=VerificationStatus.VERIFIED,
                    is_active=True, opening_time=time(0, 0), closing_time=time(23, 59))
        db.add(cafe)
        await db.commit()
        h = {"Authorization": f"Bearer {create_access_token(subject=str(owner.id), role=owner.role.value)}"}
        cafe_id = cafe.id

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        res = await c.post(f"/api/v1/cafes/{cafe_id}/tiers", headers=h, json={
            "name": "VR Pod", "specs": {}, "totalSeats": 2, "appBookableSeats": 2, "pricePerHour": 100,
            "tierType": "activity", "activityKind": "VR", "minBookingMinutes": 15,
        })
        assert res.status_code == 201, res.text
        tier_id = res.json()["data"]["hardwareTier"]["id"]

        quote = lambda mins: c.post("/api/v1/bookings/quote", json={
            "cafeId": str(cafe_id), "hardwareTierId": tier_id,
            "sessionDate": str(date.today() + timedelta(days=2)), "startTime": "18:00:00",
            "durationHours": mins / 60, "seatsCount": 1})

        # default: derived from hourly
        assert (await quote(15)).json()["data"]["baseAmount"] == 25

        # owner EDITS the 15-minute price
        upd = await c.patch(f"/api/v1/cafes/{cafe_id}/tiers/{tier_id}", headers=h, json={"price15m": 40})
        assert upd.status_code == 200, upd.text
        assert upd.json()["data"]["hardwareTier"]["price15m"] == 40

        # the public café API (what checkout reads) now carries it...
        detail = await c.get(f"/api/v1/cafes/{cafe_id}")
        tier = next(t for t in detail.json()["data"]["cafe"]["tiers"] if t["id"] == tier_id)
        assert tier["price15m"] == 40
        # ...and the server quote uses it, but only for exactly 15 minutes
        q = (await quote(15)).json()["data"]
        assert q["baseAmount"] == 40
        assert (await quote(60)).json()["data"]["baseAmount"] == 100


@pytest.mark.asyncio
async def test_price15m_accepted_on_create_in_either_spelling_and_serialised_as_price15m():
    async with AsyncSessionLocal() as db:
        owner = User(id=uuid4(), email=f"p15b_{uuid4().hex[:8]}@test.com",
                     password_hash=get_password_hash("testpass123"), full_name="P15b Owner",
                     role=UserRole.CAFE_OWNER, is_active=True)
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        cafe = Cafe(id=uuid4(), owner_id=owner.id, name=f"P15b Cafe {uuid4().hex[:5]}",
                    address_line1="1 Cue St", city="Hyderabad", state="Telangana", pincode="500001",
                    phone_number="+919000000073", verification_status=VerificationStatus.VERIFIED,
                    is_active=True, opening_time=time(0, 0), closing_time=time(23, 59))
        db.add(cafe)
        await db.commit()
        h = {"Authorization": f"Bearer {create_access_token(subject=str(owner.id), role=owner.role.value)}"}
        cafe_id = cafe.id

    base = {"specs": {}, "totalSeats": 1, "appBookableSeats": 1, "pricePerHour": 100,
            "tierType": "activity", "minBookingMinutes": 15}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        for key, kind in (("price15m", "VR"), ("price15M", "Arcade")):  # new + legacy spelling
            r = await c.post(f"/api/v1/cafes/{cafe_id}/tiers", headers=h,
                             json={**base, "name": kind, "activityKind": kind, key: 35, "price30m": 60})
            assert r.status_code == 201, r.text
            t = r.json()["data"]["hardwareTier"]
            assert t["price15m"] == 35 and t["price30m"] == 60
            assert "price15M" not in t
        # still validated: 15-min price can't exceed the 30-min price
        bad = await c.post(f"/api/v1/cafes/{cafe_id}/tiers", headers=h,
                           json={**base, "name": "X", "activityKind": "X", "price15m": 80, "price30m": 60})
        assert bad.status_code == 422
