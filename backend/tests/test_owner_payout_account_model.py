import uuid
import pytest
from app.database import AsyncSessionLocal
from app.models.owner_payout_account import OwnerPayoutAccount
from app.models.user import User, UserRole
from app.core.security import get_password_hash


@pytest.mark.asyncio
async def test_owner_payout_account_has_manual_payout_fields():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid.uuid4(),
            email=f"payout_model_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Payout Model Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True,
        )
        db.add(owner)
        await db.flush()

        account = OwnerPayoutAccount(
            id=uuid.uuid4(),
            owner_id=owner.id,
            upi_vpa="ownername@okhdfcbank",
            bank_account_number_encrypted="gAAAAA_fake_ciphertext",
            bank_name="HDFC Bank",
            account_type="savings",
        )
        db.add(account)
        await db.commit()
        await db.refresh(account)

        assert account.payout_verification_status == "unverified"
        assert account.verified_name is None
        assert account.verified_at is None
        assert account.verified_by_admin_id is None
        assert account.test_transfer_ref is None
        assert account.upi_vpa == "ownername@okhdfcbank"
        assert account.bank_name == "HDFC Bank"
        assert account.account_type == "savings"
