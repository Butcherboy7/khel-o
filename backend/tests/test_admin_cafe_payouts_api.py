import pytest
from uuid import uuid4
from httpx import AsyncClient

from app.main import app
from app.models.platform_fee import PlatformFee
from app.models.payment import PaymentStatus
from tests.conftest import auth_headers
from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment


@pytest.mark.asyncio
async def test_admin_can_list_outstanding_and_create_payout(db_session):
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "api_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(admin, is_admin=True)

        outstanding_res = await client.get("/api/v1/admin/cafe-payouts/outstanding", headers=headers)
        assert outstanding_res.status_code == 200, outstanding_res.text
        cafes = outstanding_res.json()["data"]["cafes"]
        assert any(c["cafeId"] == str(booking.cafe_id) and c["outstandingAmount"] == 95.0 for c in cafes)

        breakdown_res = await client.get(
            f"/api/v1/admin/cafe-payouts/{booking.cafe_id}/breakdown", headers=headers
        )
        assert breakdown_res.status_code == 200
        assert len(breakdown_res.json()["data"]["bookings"]) == 1

        create_res = await client.post(
            f"/api/v1/admin/cafe-payouts/{booking.cafe_id}",
            json={"utrReference": "UTR999", "paymentMethod": "neft", "notes": "test payout"},
            headers=headers,
        )
        assert create_res.status_code == 201, create_res.text
        payout = create_res.json()["data"]["payout"]
        assert payout["amount"] == 95.0
        assert payout["utrReference"] == "UTR999"

        history_res = await client.get("/api/v1/admin/cafe-payouts", headers=headers)
        assert history_res.status_code == 200
        assert any(p["id"] == payout["id"] for p in history_res.json()["data"]["items"])

        audit_res = await client.get(
            "/api/v1/admin/audit-log?entityType=cafe_payout", headers=headers
        )
        assert audit_res.status_code == 200
        assert any(a["entityId"] == payout["id"] for a in audit_res.json()["data"]["items"])


@pytest.mark.asyncio
async def test_create_payout_rejects_when_no_outstanding_balance(db_session):
    admin = await _make_admin(db_session)
    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.post(
            f"/api/v1/admin/cafe-payouts/{uuid4()}",
            json={"utrReference": "UTR000", "paymentMethod": "neft"},
            headers=headers,
        )
        assert res.status_code == 400


@pytest.mark.asyncio
async def test_non_admin_cannot_access_cafe_payouts(db_session):
    gamer = await _make_gamer(db_session, "blocked_gamer")
    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(gamer)
        res = await client.get("/api/v1/admin/cafe-payouts/outstanding", headers=headers)
        assert res.status_code == 403
