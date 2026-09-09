import pytest
import uuid
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.owner_payout_account import OwnerPayoutAccount
from tests.conftest import auth_headers
from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment


@pytest.mark.asyncio
async def test_admin_cafe_detail_includes_upi_and_verification_status(db_session):
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "detail_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    from sqlalchemy import select
    from app.models.cafe import Cafe
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(
        id=uuid.uuid4(), owner_id=cafe_row.owner_id, upi_vpa="detail@okaxis",
        payout_verification_status="verified", verified_name="Detail Test Name",
        bank_account_number_encrypted="gAAAAA_should_never_appear_in_response",
    ))
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.get(f"/api/v1/admin/cafes/{booking.cafe_id}", headers=headers)
        assert res.status_code == 200, res.text
        cafe = res.json()["data"]["cafe"]
        assert cafe["upiVpa"] == "detail@okaxis"
        assert cafe["payoutVerificationStatus"] == "verified"
        assert cafe["verifiedName"] == "Detail Test Name"
        assert "gAAAAA_should_never_appear_in_response" not in res.text
