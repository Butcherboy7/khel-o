import uuid
import pytest
from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.core.security import get_password_hash
from app.repositories.owner_payout_repository import OwnerPayoutRepository
from app.core.payout_encryption import decrypt_bank_account_number


async def _make_owner(db) -> User:
    owner = User(
        id=uuid.uuid4(),
        email=f"upsert_owner_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=get_password_hash("password123"),
        full_name="Upsert Owner",
        role=UserRole.CAFE_OWNER,
        is_active=True,
    )
    db.add(owner)
    await db.flush()
    return owner


@pytest.mark.asyncio
async def test_upsert_creates_account_with_unverified_status():
    async with AsyncSessionLocal() as db:
        owner = await _make_owner(db)
        repo = OwnerPayoutRepository(db)
        account = await repo.upsert_payout_details(
            owner_id=owner.id,
            upi_vpa="owner@okhdfcbank",
            bank_account_number=None,
            bank_ifsc=None,
            account_holder_name=None,
            bank_name=None,
            account_type=None,
            business_pan=None,
            default_holder_name="Fallback Name",
        )
        await db.commit()
        assert account.upi_vpa == "owner@okhdfcbank"
        assert account.payout_verification_status == "unverified"
        assert account.account_holder_name == "Fallback Name"


@pytest.mark.asyncio
async def test_bank_account_number_is_encrypted_not_plaintext():
    async with AsyncSessionLocal() as db:
        owner = await _make_owner(db)
        repo = OwnerPayoutRepository(db)
        account = await repo.upsert_payout_details(
            owner_id=owner.id,
            upi_vpa="owner2@okhdfcbank",
            bank_account_number="9180200192847291",
            bank_ifsc="HDFC0000128",
            account_holder_name="Owner Two",
            bank_name="HDFC Bank",
            account_type="savings",
            business_pan=None,
            default_holder_name=None,
        )
        await db.commit()
        assert account.bank_account_number_encrypted is not None
        assert "9180200192847291" not in account.bank_account_number_encrypted
        assert decrypt_bank_account_number(account.bank_account_number_encrypted) == "9180200192847291"
        assert account.bank_account_number_masked == "••••7291"


@pytest.mark.asyncio
async def test_verified_status_resets_when_upi_vpa_changes():
    async with AsyncSessionLocal() as db:
        owner = await _make_owner(db)
        repo = OwnerPayoutRepository(db)
        account = await repo.upsert_payout_details(
            owner_id=owner.id, upi_vpa="original@okaxis", bank_account_number=None,
            bank_ifsc=None, account_holder_name=None, bank_name=None,
            account_type=None, business_pan=None, default_holder_name=None,
        )
        await db.commit()
        account.payout_verification_status = "verified"
        account.verified_name = "Original Name"
        await db.commit()

        updated = await repo.upsert_payout_details(
            owner_id=owner.id, upi_vpa="changed@okaxis", bank_account_number=None,
            bank_ifsc=None, account_holder_name=None, bank_name=None,
            account_type=None, business_pan=None, default_holder_name=None,
        )
        await db.commit()
        assert updated.payout_verification_status == "unverified"
        assert updated.verified_name is None


@pytest.mark.asyncio
async def test_verified_status_survives_unchanged_resubmission():
    async with AsyncSessionLocal() as db:
        owner = await _make_owner(db)
        repo = OwnerPayoutRepository(db)
        account = await repo.upsert_payout_details(
            owner_id=owner.id, upi_vpa="stable@okaxis", bank_account_number=None,
            bank_ifsc=None, account_holder_name=None, bank_name=None,
            account_type=None, business_pan=None, default_holder_name=None,
        )
        await db.commit()
        account.payout_verification_status = "verified"
        account.verified_name = "Stable Name"
        await db.commit()

        updated = await repo.upsert_payout_details(
            owner_id=owner.id, upi_vpa="stable@okaxis", bank_account_number=None,
            bank_ifsc=None, account_holder_name=None, bank_name=None,
            account_type=None, business_pan="ABCDE1234F", default_holder_name=None,
        )
        await db.commit()
        assert updated.payout_verification_status == "verified"
        assert updated.verified_name == "Stable Name"
        assert updated.business_pan == "ABCDE1234F"
