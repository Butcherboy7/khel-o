# backend/tests/test_owner_payout_destination_api.py
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.main import app
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.owner_payout_account import OwnerPayoutAccount
from app.models.owner_audit_log import OwnerAuditLog
from app.core.security import get_password_hash
from tests.conftest import auth_headers


async def _make_owner_with_cafe(db_session, password="testpass123"):
    owner = User(
        id=uuid.uuid4(), email=f"payout_dest_owner_{uuid.uuid4().hex[:8]}@test.com",
        full_name="Payout Dest Owner", password_hash=get_password_hash(password),
        role=UserRole.CAFE_OWNER, is_active=True,
    )
    db_session.add(owner)
    await db_session.flush()
    db_session.add(UserRoleMapping(id=uuid.uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
    cafe = Cafe(
        id=uuid.uuid4(), owner_id=owner.id, name="Payout Dest Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=None, closing_time=None, bookable_stations=10,
    )
    db_session.add(cafe)
    await db_session.commit()
    return owner, cafe


@pytest.mark.asyncio
async def test_get_destination_returns_none_when_not_set(db_session):
    owner, _cafe = await _make_owner_with_cafe(db_session)
    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(owner, is_admin=False)
        res = await client.get("/api/v1/owner/payouts/destination", headers=headers)
        assert res.status_code == 200
        assert res.json()["data"]["destination"] is None


@pytest.mark.asyncio
async def test_patch_destination_rejects_wrong_password(db_session):
    owner, _cafe = await _make_owner_with_cafe(db_session, password="correctpass123")
    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(owner, is_admin=False)
        res = await client.patch(
            "/api/v1/owner/payouts/destination",
            json={"currentPassword": "wrongpass", "upiVpa": "new@okaxis"},
            headers=headers,
        )
        assert res.status_code == 401

    account = (await db_session.execute(
        select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == owner.id)
    )).scalars().first()
    assert account is None  # nothing was written

    audit_rows = (await db_session.execute(
        select(OwnerAuditLog).where(OwnerAuditLog.owner_id == owner.id)
    )).scalars().all()
    assert audit_rows == []


@pytest.mark.asyncio
async def test_patch_destination_succeeds_and_writes_masked_audit_log(db_session):
    owner, _cafe = await _make_owner_with_cafe(db_session, password="correctpass123")
    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(owner, is_admin=False)
        res = await client.patch(
            "/api/v1/owner/payouts/destination",
            json={
                "currentPassword": "correctpass123",
                "upiVpa": "newdest@okaxis",
                "accountHolderName": "New Holder",
            },
            headers=headers,
        )
        assert res.status_code == 200, res.text
        assert res.json()["data"]["destination"]["upiVpa"] == "newdest@okaxis"
        assert res.json()["data"]["destination"]["version"] == 1

    audit_rows = (await db_session.execute(
        select(OwnerAuditLog).where(OwnerAuditLog.owner_id == owner.id)
    )).scalars().all()
    assert len(audit_rows) == 1
    assert audit_rows[0].action == "payout_details.updated"
    assert "newdest@okaxis" in audit_rows[0].after_summary
    # Bank account number, if any, must never appear in plaintext.
    assert "password" not in audit_rows[0].after_summary.lower()


@pytest.mark.asyncio
async def test_patch_destination_blocks_clearing_only_destination_with_outstanding_balance(db_session):
    from tests.test_admin_v2_features import _make_gamer, _make_booking_with_payment
    from app.models.platform_fee import PlatformFee

    owner, cafe = await _make_owner_with_cafe(db_session, password="correctpass123")
    db_session.add(OwnerPayoutAccount(id=uuid.uuid4(), owner_id=owner.id, upi_vpa="onlydest@okaxis"))
    await db_session.commit()

    gamer = await _make_gamer(db_session, "block_clear_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    # Reassign the booking to this owner's café so the outstanding balance
    # check has something real to find.
    booking.cafe_id = cafe.id
    db_session.add(PlatformFee(booking_id=booking.id, owner_settlement_amount=100.0))
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(owner, is_admin=False)
        res = await client.patch(
            "/api/v1/owner/payouts/destination",
            json={"currentPassword": "correctpass123", "upiVpa": None, "bankAccountNumber": None},
            headers=headers,
        )
        assert res.status_code == 400
        assert "outstanding" in res.json()["error"]["message"].lower()
