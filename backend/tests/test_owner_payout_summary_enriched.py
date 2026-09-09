import pytest
from uuid import uuid4
from httpx import AsyncClient

from app.main import app
from app.models.platform_fee import PlatformFee
from app.models.owner_payout_account import OwnerPayoutAccount
from app.repositories.cafe_payout_repository import CafePayoutRepository
from tests.conftest import auth_headers
from tests.test_admin_v2_features import _make_gamer, _make_booking_with_payment
from app.models.user import User


@pytest.mark.asyncio
async def test_owner_payout_summary_includes_upi_destination_and_paid_out_total(db_session):
    from sqlalchemy import select
    from app.models.cafe import Cafe

    gamer = await _make_gamer(db_session, "summary_enriched_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)

    cafe = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    owner = (await db_session.execute(select(User).where(User.id == cafe.owner_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(
        id=uuid4(), owner_id=owner.id,
        upi_vpa="enriched@okaxis", payout_verification_status="verified", verified_name="Enriched Owner",
    ))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    await repo.create_payout(booking.cafe_id, uuid4(), "UTR-ENRICHED-1", "upi")

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.get("/api/v1/owner/payouts/summary", headers=auth_headers(owner))
        assert res.status_code == 200, res.text
        data = res.json()["data"]

        assert data["summary"]["alreadyPaidOut"] == 95.0
        assert data["summary"]["netEarnings"] == data["summary"]["netSettlement"]

        assert data["account"]["upiVpa"] == "enriched@okaxis"
        assert data["account"]["payoutVerificationStatus"] == "verified"
        assert data["account"]["verifiedName"] == "Enriched Owner"
        assert "kycStatus" not in data["account"]
        assert "razorpayAccountId" not in data["account"]
