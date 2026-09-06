import pytest
from uuid import uuid4
from httpx import AsyncClient

from app.main import app
from app.models.platform_fee import PlatformFee
from app.repositories.cafe_payout_repository import CafePayoutRepository
from tests.conftest import auth_headers, db_session
from tests.test_admin_v2_features import _make_gamer, _make_booking_with_payment
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.core.security import get_password_hash


@pytest.mark.asyncio
async def test_owner_sees_own_cafe_outstanding_and_history(db_session):
    gamer = await _make_gamer(db_session, "owner_api_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
    await db_session.commit()

    from app.models.cafe import Cafe
    from sqlalchemy import select
    cafe = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    owner = (await db_session.execute(select(User).where(User.id == cafe.owner_id))).scalars().first()

    async with AsyncClient(app=app, base_url="http://test") as client:
        owner_headers = auth_headers(owner)

        res = await client.get("/api/v1/owner/payouts/cafe-payouts", headers=owner_headers)
        assert res.status_code == 200, res.text
        data = res.json()["data"]
        assert data["outstandingAmount"] == 95.0
        assert data["history"] == []

        repo = CafePayoutRepository(db_session)
        await repo.create_payout(booking.cafe_id, uuid4(), "UTR-OWNER-1", "neft")

        res2 = await client.get("/api/v1/owner/payouts/cafe-payouts", headers=owner_headers)
        data2 = res2.json()["data"]
        assert data2["outstandingAmount"] == 0.0
        assert len(data2["history"]) == 1
        assert data2["history"][0]["utrReference"] == "UTR-OWNER-1"


@pytest.mark.asyncio
async def test_owner_cannot_see_another_cafes_payouts(db_session):
    gamer_a = await _make_gamer(db_session, "iso_gamer_a")
    booking_a, _ = await _make_booking_with_payment(db_session, gamer_a)
    gamer_b = await _make_gamer(db_session, "iso_gamer_b")
    booking_b, _ = await _make_booking_with_payment(db_session, gamer_b)

    fee_a = PlatformFee(id=uuid4(), booking_id=booking_a.id, owner_settlement_amount=50.0)
    fee_b = PlatformFee(id=uuid4(), booking_id=booking_b.id, owner_settlement_amount=200.0)
    db_session.add_all([fee_a, fee_b])
    await db_session.commit()

    from app.models.cafe import Cafe
    from sqlalchemy import select
    cafe_a = (await db_session.execute(select(Cafe).where(Cafe.id == booking_a.cafe_id))).scalars().first()
    owner_a = (await db_session.execute(select(User).where(User.id == cafe_a.owner_id))).scalars().first()

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/owner/payouts/cafe-payouts", headers=auth_headers(owner_a)
        )
        assert res.status_code == 200
        assert res.json()["data"]["outstandingAmount"] == 50.0
