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
    from app.models.owner_payout_account import OwnerPayoutAccount
    from sqlalchemy import select
    cafe = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    owner = (await db_session.execute(select(User).where(User.id == cafe.owner_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(
        id=uuid4(), owner_id=cafe.owner_id,
        upi_vpa="test@okaxis", payout_verification_status="verified",
    ))
    await db_session.commit()

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
async def test_owner_with_two_cafes_sees_combined_outstanding_and_history(db_session):
    """An owner with two cafés must see the combined outstanding balance and
    combined payout history across both — not just the most-recently-created
    café (the bug: get_owner_cafe_payouts picked a single café via
    .order_by(...).first())."""
    from app.models.cafe import Cafe
    from sqlalchemy import select

    gamer = await _make_gamer(db_session, "two_cafe_owner_gamer")
    booking1, _ = await _make_booking_with_payment(db_session, gamer)

    cafe1 = (await db_session.execute(
        select(Cafe).where(Cafe.id == booking1.cafe_id)
    )).scalars().first()
    owner = (await db_session.execute(
        select(User).where(User.id == cafe1.owner_id)
    )).scalars().first()

    # Second café for the SAME owner, with its own booking/fee.
    from app.models.hardware_tier import HardwareTier
    from app.models.booking import Booking, BookingStatus
    from app.models.payment import Payment, PaymentStatus
    from datetime import date, time, timedelta

    cafe2 = Cafe(
        id=uuid4(), owner_id=owner.id, name="Second Café", address_line1="2 Test St",
        city="Bengaluru", state="Karnataka", pincode="560002", phone_number="+919876543211",
        verification_status=cafe1.verification_status, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db_session.add(cafe2)
    await db_session.flush()

    tier2 = HardwareTier(
        id=uuid4(), cafe_id=cafe2.id, name="Standard", specs={"gpu": "RTX 3060"},
        price_per_hour=100.0, total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db_session.add(tier2)

    booking2 = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe2.id, hardware_tier_id=tier2.id, session_date=date.today() + timedelta(days=2),
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=0.0, gateway_fee=0.0, total_amount=100.0,
        convenience_fee=0.0, status=BookingStatus.CONFIRMED,
    )
    db_session.add(booking2)
    payment2 = Payment(
        id=uuid4(), booking_id=booking2.id, razorpay_order_id=f"order_{uuid4().hex}",
        amount=100.0, status=PaymentStatus.CAPTURED,
    )
    db_session.add(payment2)

    fee1 = PlatformFee(id=uuid4(), booking_id=booking1.id, owner_settlement_amount=95.0)
    fee2 = PlatformFee(id=uuid4(), booking_id=booking2.id, owner_settlement_amount=60.0)
    db_session.add_all([fee1, fee2])

    from app.models.owner_payout_account import OwnerPayoutAccount
    db_session.add(OwnerPayoutAccount(
        id=uuid4(), owner_id=owner.id,
        upi_vpa="test@okaxis", payout_verification_status="verified",
    ))
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        owner_headers = auth_headers(owner)

        res = await client.get("/api/v1/owner/payouts/cafe-payouts", headers=owner_headers)
        assert res.status_code == 200, res.text
        data = res.json()["data"]
        assert data["outstandingAmount"] == 155.0, "must be the SUM across both cafés, not just one"

        # Pay out café 2 only; café 1's balance must remain and both payouts
        # (once both are paid out) must appear in the merged history.
        repo = CafePayoutRepository(db_session)
        await repo.create_payout(cafe2.id, uuid4(), "UTR-TWO-CAFE-1", "neft")

        res2 = await client.get("/api/v1/owner/payouts/cafe-payouts", headers=owner_headers)
        data2 = res2.json()["data"]
        assert data2["outstandingAmount"] == 95.0
        assert len(data2["history"]) == 1
        assert data2["history"][0]["utrReference"] == "UTR-TWO-CAFE-1"

        await repo.create_payout(cafe1.id, uuid4(), "UTR-TWO-CAFE-2", "neft")

        res3 = await client.get("/api/v1/owner/payouts/cafe-payouts", headers=owner_headers)
        data3 = res3.json()["data"]
        assert data3["outstandingAmount"] == 0.0
        assert len(data3["history"]) == 2
        assert {h["utrReference"] for h in data3["history"]} == {"UTR-TWO-CAFE-1", "UTR-TWO-CAFE-2"}


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
