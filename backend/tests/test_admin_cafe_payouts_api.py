import pytest
from uuid import uuid4
from httpx import AsyncClient, ASGITransport

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

    from app.models.owner_payout_account import OwnerPayoutAccount
    from app.models.cafe import Cafe
    from sqlalchemy import select as _select
    cafe_row = (await db_session.execute(_select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(
        id=uuid4(), owner_id=cafe_row.owner_id,
        upi_vpa="test@okaxis", payout_verification_status="verified",
    ))
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
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
            json={
                "utrReference": "UTR999", "paymentMethod": "neft", "notes": "test payout",
                "destinationType": "upi", "expectedPayoutAccountVersion": 1,
                "confirmedPaymentMade": True,
            },
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
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.post(
            f"/api/v1/admin/cafe-payouts/{uuid4()}",
            json={
                "utrReference": "UTR000", "paymentMethod": "neft",
                "destinationType": "upi", "expectedPayoutAccountVersion": 1,
                "confirmedPaymentMade": True,
            },
            headers=headers,
        )
        assert res.status_code == 400


@pytest.mark.asyncio
async def test_concurrent_payout_creation_returns_clean_400_not_500(db_session, monkeypatch):
    """Two admins racing to pay out the same café: the loser hits the
    platform_fee_id unique constraint (IntegrityError) inside
    CafePayoutRepository.create_payout. The handler must catch this and
    return a clean 400, not let it propagate to the app's catch-all 500
    handler. Simulated deterministically (rather than relying on real
    concurrent-transaction timing, which serializes unpredictably against
    the SQLite test backend) by making create_payout raise IntegrityError
    directly, exactly as it would for the losing request in a real race —
    see test_cafe_payout_repository.py::test_concurrent_payout_creation_does_not_double_pay
    for the repository-level version of the same race, using two real
    concurrent sessions."""
    from sqlalchemy.exc import IntegrityError
    from app.repositories.cafe_payout_repository import CafePayoutRepository as RepoCls

    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "race_api_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
    await db_session.commit()

    async def fake_create_payout(*args, **kwargs):
        raise IntegrityError("INSERT INTO cafe_payout_items", {}, Exception("UNIQUE constraint failed"))

    monkeypatch.setattr(RepoCls, "create_payout", fake_create_payout)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.post(
            f"/api/v1/admin/cafe-payouts/{booking.cafe_id}",
            json={
                "utrReference": "UTR-RACE-API", "paymentMethod": "neft",
                "destinationType": "upi", "expectedPayoutAccountVersion": 1,
                "confirmedPaymentMade": True,
            },
            headers=headers,
        )

        assert res.status_code == 400, res.text
        assert "paid out by another request" in res.json()["error"]["message"]


@pytest.mark.asyncio
async def test_non_admin_cannot_access_cafe_payouts(db_session):
    gamer = await _make_gamer(db_session, "blocked_gamer")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = auth_headers(gamer)
        res = await client.get("/api/v1/admin/cafe-payouts/outstanding", headers=headers)
        assert res.status_code == 403


@pytest.mark.asyncio
async def test_outstanding_list_reports_has_bank_for_bank_only_cafe(db_session):
    """A café with only bank details (no UPI) must not be reported as
    lacking payout info — this was the concrete bug behind Priority 1."""
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "bankonly_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)

    from app.models.owner_payout_account import OwnerPayoutAccount
    from app.models.cafe import Cafe
    from app.core.payout_encryption import encrypt_bank_account_number
    from sqlalchemy import select as _select
    cafe_row = (await db_session.execute(_select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(
        id=uuid4(), owner_id=cafe_row.owner_id, upi_vpa=None,
        bank_account_number_encrypted=encrypt_bank_account_number("9180200192847291"),
        bank_account_number_masked="••••7291", bank_ifsc="HDFC0000128",
        account_holder_name="Bank Only Owner",
    ))
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.get("/api/v1/admin/cafe-payouts/outstanding", headers=headers)
        assert res.status_code == 200
        row = next(c for c in res.json()["data"]["cafes"] if c["cafeId"] == str(booking.cafe_id))
        assert row["upiVpa"] is None
        assert row["hasBank"] is True
        assert row["payoutDestinationSubmitted"] is True


@pytest.mark.asyncio
async def test_breakdown_includes_masked_destination_and_version(db_session):
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "breakdown_dest_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=50.0)
    db_session.add(fee)

    from app.models.owner_payout_account import OwnerPayoutAccount
    from app.models.cafe import Cafe
    from sqlalchemy import select as _select
    cafe_row = (await db_session.execute(_select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(
        id=uuid4(), owner_id=cafe_row.owner_id, upi_vpa="breakdown@okaxis",
        account_holder_name="Breakdown Holder", version=1,
    ))
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.get(f"/api/v1/admin/cafe-payouts/{booking.cafe_id}/breakdown", headers=headers)
        assert res.status_code == 200
        destination = res.json()["data"]["destination"]
        assert destination["upiVpa"] == "breakdown@okaxis"
        assert destination["accountHolderName"] == "Breakdown Holder"
        assert destination["payoutAccountVersion"] == 1


@pytest.mark.asyncio
async def test_reveal_destination_returns_decrypted_bank_number_and_logs_audit(db_session):
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "reveal_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    from app.models.owner_payout_account import OwnerPayoutAccount
    from app.models.cafe import Cafe
    from app.core.payout_encryption import encrypt_bank_account_number
    from sqlalchemy import select as _select
    cafe_row = (await db_session.execute(_select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(
        id=uuid4(), owner_id=cafe_row.owner_id,
        bank_account_number_encrypted=encrypt_bank_account_number("9180200192847291"),
        bank_account_number_masked="••••7291", bank_ifsc="HDFC0000128",
        account_holder_name="Reveal Holder", version=1,
    ))
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.post(
            f"/api/v1/admin/cafe-payouts/{booking.cafe_id}/reveal-destination", headers=headers
        )
        assert res.status_code == 200
        assert res.json()["data"]["bankAccountNumber"] == "9180200192847291"
        assert res.headers["cache-control"] == "no-store"

        audit_res = await client.get(
            "/api/v1/admin/audit-log?entityType=owner_payout_account", headers=headers
        )
        assert audit_res.status_code == 200
        items = audit_res.json()["data"]["items"]
        assert any(a["action"] == "payout_destination.revealed" for a in items)
        # The decrypted number must never appear in the audit log itself.
        assert not any("9180200192847291" in str(a) for a in items)
