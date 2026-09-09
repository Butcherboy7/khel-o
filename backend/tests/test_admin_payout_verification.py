import pytest
from uuid import uuid4
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.owner_payout_account import OwnerPayoutAccount
from tests.conftest import auth_headers
from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment


@pytest.mark.asyncio
async def test_admin_can_verify_payout_destination(db_session):
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "verify_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    from sqlalchemy import select
    from app.models.cafe import Cafe
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    account = OwnerPayoutAccount(id=uuid4(), owner_id=cafe_row.owner_id, upi_vpa="cafeowner@okhdfcbank")
    db_session.add(account)
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.post(
            f"/api/v1/admin/cafe-payouts/{booking.cafe_id}/verify-payout",
            json={"utrReference": "UTR-TEST-1", "verifiedName": "Cafe Owner Pvt Ltd"},
            headers=headers,
        )
        assert res.status_code == 200, res.text
        data = res.json()["data"]
        assert data["payoutVerificationStatus"] == "verified"
        assert data["verifiedName"] == "Cafe Owner Pvt Ltd"

        audit_res = await client.get(
            "/api/v1/admin/audit-log?entityType=owner_payout_account", headers=headers
        )
        assert audit_res.status_code == 200
        assert any(a["action"] == "payout_verified" for a in audit_res.json()["data"]["items"])


@pytest.mark.asyncio
async def test_verify_rejects_when_no_payout_details_submitted(db_session):
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "no_details_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.post(
            f"/api/v1/admin/cafe-payouts/{booking.cafe_id}/verify-payout",
            json={"utrReference": "UTR-NONE", "verifiedName": "Nobody"},
            headers=headers,
        )
        assert res.status_code == 400


@pytest.mark.asyncio
async def test_verify_rejects_already_verified(db_session):
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "already_verified_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    from sqlalchemy import select
    from app.models.cafe import Cafe
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    account = OwnerPayoutAccount(
        id=uuid4(), owner_id=cafe_row.owner_id, upi_vpa="already@okaxis",
        payout_verification_status="verified", verified_name="Existing",
    )
    db_session.add(account)
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.post(
            f"/api/v1/admin/cafe-payouts/{booking.cafe_id}/verify-payout",
            json={"utrReference": "UTR-AGAIN", "verifiedName": "Someone Else"},
            headers=headers,
        )
        assert res.status_code == 400


@pytest.mark.asyncio
async def test_non_admin_cannot_verify_payout(db_session):
    gamer = await _make_gamer(db_session, "blocked_verify_gamer")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = auth_headers(gamer)
        res = await client.post(
            f"/api/v1/admin/cafe-payouts/{uuid4()}/verify-payout",
            json={"utrReference": "UTR-X", "verifiedName": "X"},
            headers=headers,
        )
        assert res.status_code == 403
