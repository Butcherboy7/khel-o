import pytest
from uuid import uuid4
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.owner_payout_account import OwnerPayoutAccount
from app.models.platform_fee import PlatformFee
from tests.conftest import auth_headers
from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment


async def _make_verified_cafe_with_outstanding_balance(db_session, gamer_prefix: str, amount: float = 95.0):
    from sqlalchemy import select
    from app.models.cafe import Cafe

    gamer = await _make_gamer(db_session, gamer_prefix)
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=amount)
    db_session.add(fee)

    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(
        id=uuid4(), owner_id=cafe_row.owner_id,
        upi_vpa="test@okaxis", payout_verification_status="verified",
    ))
    await db_session.commit()
    return booking


@pytest.mark.asyncio
async def test_create_payout_accepts_proof_and_admin_note(db_session):
    admin = await _make_admin(db_session)
    booking = await _make_verified_cafe_with_outstanding_balance(db_session, "proof_gamer")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.post(
            f"/api/v1/admin/cafe-payouts/{booking.cafe_id}",
            json={
                "utrReference": "UTR-PROOF-1",
                "paymentMethod": "upi",
                "proofImageUrl": "https://cdn.example.com/proof.png",
                "adminNote": "Confirmed via screenshot",
                "paidAt": "2026-09-01T10:00:00Z",
            },
            headers=headers,
        )
        assert res.status_code == 201, res.text
        payout = res.json()["data"]["payout"]
        assert payout["proofImageUrl"] == "https://cdn.example.com/proof.png"
        assert payout["adminNote"] == "Confirmed via screenshot"


@pytest.mark.asyncio
async def test_create_payout_without_proof_fields_still_succeeds(db_session):
    """Proof is required by the frontend, not the API — the model fields are
    nullable so existing/manual callers of this endpoint don't break."""
    admin = await _make_admin(db_session)
    booking = await _make_verified_cafe_with_outstanding_balance(db_session, "no_proof_gamer")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.post(
            f"/api/v1/admin/cafe-payouts/{booking.cafe_id}",
            json={"utrReference": "UTR-NOPROOF-1", "paymentMethod": "neft"},
            headers=headers,
        )
        assert res.status_code == 201, res.text
        payout = res.json()["data"]["payout"]
        assert payout["proofImageUrl"] is None
        assert payout["adminNote"] is None


@pytest.mark.asyncio
async def test_non_admin_cannot_presign_payout_proof_upload(db_session):
    gamer = await _make_gamer(db_session, "blocked_proof_gamer")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = auth_headers(gamer)
        res = await client.post(
            f"/api/v1/admin/cafe-payouts/{uuid4()}/proof-upload-url",
            json={"contentType": "image/png"},
            headers=headers,
        )
        assert res.status_code == 403


@pytest.mark.asyncio
async def test_presign_payout_proof_upload_rejects_unknown_cafe(db_session):
    admin = await _make_admin(db_session)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.post(
            f"/api/v1/admin/cafe-payouts/{uuid4()}/proof-upload-url",
            json={"contentType": "image/png"},
            headers=headers,
        )
        assert res.status_code == 404
