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
from app.core.payout_encryption import encrypt_bank_account_number, decrypt_bank_account_number
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
        # Must NOT be 401 — the global axios interceptor treats any 401
        # outside auth endpoints as a session-expiry signal and triggers a
        # token refresh / logout, which would be wrong for a simple wrong
        # payout password.
        assert res.status_code == 403
        assert res.json()["error"]["code"] == "INVALID_PASSWORD"

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


@pytest.mark.asyncio
async def test_patch_destination_blocks_nulling_only_bank_ifsc_with_outstanding_balance(db_session):
    """Nulling out only bank_ifsc (while bank_account_number stays set, and
    no UPI is on file) must trip the same "can't remove your only payout
    destination" guard — a bank destination missing IFSC isn't a usable
    destination even though bank_account_number is still non-null."""
    from tests.test_admin_v2_features import _make_gamer, _make_booking_with_payment
    from app.models.platform_fee import PlatformFee

    owner, cafe = await _make_owner_with_cafe(db_session, password="correctpass123")
    db_session.add(OwnerPayoutAccount(
        id=uuid.uuid4(), owner_id=owner.id,
        bank_account_number_encrypted=encrypt_bank_account_number("9180200192847291"),
        bank_account_number_masked="••••7291",
        bank_ifsc="HDFC0000128",
        account_holder_name="Existing Holder",
    ))
    await db_session.commit()

    gamer = await _make_gamer(db_session, "block_clear_ifsc_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    booking.cafe_id = cafe.id
    db_session.add(PlatformFee(booking_id=booking.id, owner_settlement_amount=100.0))
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(owner, is_admin=False)
        res = await client.patch(
            "/api/v1/owner/payouts/destination",
            json={"currentPassword": "correctpass123", "bankIfsc": None},
            headers=headers,
        )
        assert res.status_code == 400
        assert "outstanding" in res.json()["error"]["message"].lower()

    account = (await db_session.execute(
        select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == owner.id)
    )).scalars().first()
    assert account.bank_ifsc == "HDFC0000128"  # unchanged — the write was aborted


@pytest.mark.asyncio
async def test_patch_destination_partial_update_preserves_omitted_fields(db_session):
    """A PATCH that only touches bankIfsc must not null out every other
    field the owner already had on file — the route must distinguish a
    field the client omitted (leave unchanged) from one explicitly sent as
    null (clear it), per the frontend's omit-means-unchanged contract."""
    owner, _cafe = await _make_owner_with_cafe(db_session, password="correctpass123")
    db_session.add(OwnerPayoutAccount(
        id=uuid.uuid4(), owner_id=owner.id,
        upi_vpa="existing@okaxis",
        bank_account_number_encrypted=encrypt_bank_account_number("9180200192847291"),
        bank_account_number_masked="••••7291",
        bank_ifsc="HDFC0000128",
        account_holder_name="Existing Holder",
        bank_name="HDFC Bank",
        account_type="savings",
        business_pan="ABCDE1234F",
        version=1,
    ))
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(owner, is_admin=False)

        # Only bankIfsc is sent — every other field is omitted, not nulled.
        res = await client.patch(
            "/api/v1/owner/payouts/destination",
            json={"currentPassword": "correctpass123", "bankIfsc": "ICIC0004567"},
            headers=headers,
        )
        assert res.status_code == 200, res.text
        destination = res.json()["data"]["destination"]
        assert destination["bankIfsc"] == "ICIC0004567"
        assert destination["upiVpa"] == "existing@okaxis"
        assert destination["bankAccountNumberMasked"] == "••••7291"
        assert destination["accountHolderName"] == "Existing Holder"
        assert destination["version"] == 2  # IFSC actually changed, so the destination version bumps

        get_res = await client.get("/api/v1/owner/payouts/destination", headers=headers)
        assert get_res.status_code == 200
        get_destination = get_res.json()["data"]["destination"]
        assert get_destination["upiVpa"] == "existing@okaxis"
        assert get_destination["bankIfsc"] == "ICIC0004567"
        assert get_destination["bankAccountNumberMasked"] == "••••7291"
        assert get_destination["accountHolderName"] == "Existing Holder"

    account = (await db_session.execute(
        select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == owner.id)
    )).scalars().first()
    assert account.upi_vpa == "existing@okaxis"
    assert account.bank_ifsc == "ICIC0004567"
    assert account.bank_name == "HDFC Bank"
    assert account.account_type == "savings"
    assert account.business_pan == "ABCDE1234F"
    assert decrypt_bank_account_number(account.bank_account_number_encrypted) == "9180200192847291"


@pytest.mark.asyncio
async def test_patch_destination_aborts_instead_of_wiping_bank_number_on_decrypt_failure(
    db_session, monkeypatch
):
    """If the existing (omitted-field) bank account number can't be
    decrypted — corrupted ciphertext, rotated encryption key, etc. — the
    PATCH must fail loudly rather than silently persisting None for
    bank_account_number, which would permanently wipe the owner's bank
    details on a request that never touched that field."""
    owner, _cafe = await _make_owner_with_cafe(db_session, password="correctpass123")
    original_encrypted = encrypt_bank_account_number("9180200192847291")
    db_session.add(OwnerPayoutAccount(
        id=uuid.uuid4(), owner_id=owner.id,
        upi_vpa="existing@okaxis",
        bank_account_number_encrypted=original_encrypted,
        bank_account_number_masked="••••7291",
        bank_ifsc="HDFC0000128",
        account_holder_name="Existing Holder",
        bank_name="HDFC Bank",
        account_type="savings",
        business_pan="ABCDE1234F",
        version=1,
    ))
    await db_session.commit()

    import app.api.v1.owner_payouts as owner_payouts_module

    def _broken_decrypt(_ciphertext):
        raise ValueError("simulated decrypt failure (e.g. rotated encryption key)")

    monkeypatch.setattr(owner_payouts_module, "decrypt_bank_account_number", _broken_decrypt)

    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(owner, is_admin=False)

        # Only bankIfsc is sent — bankAccountNumber is omitted, so the route
        # must decrypt the existing value to preserve it, which fails here.
        res = await client.patch(
            "/api/v1/owner/payouts/destination",
            json={"currentPassword": "correctpass123", "bankIfsc": "ICIC0004567"},
            headers=headers,
        )
        assert res.status_code == 400, res.text

    account = (await db_session.execute(
        select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == owner.id)
    )).scalars().first()
    # Nothing was wiped: the bank account number is untouched on disk.
    assert account.bank_account_number_encrypted == original_encrypted
    assert account.bank_account_number_masked == "••••7291"
    assert account.bank_ifsc == "HDFC0000128"  # unchanged too — the whole write was aborted
    assert account.version == 1
