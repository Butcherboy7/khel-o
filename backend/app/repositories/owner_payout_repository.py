from typing import Optional
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.owner_payout_account import OwnerPayoutAccount
from app.repositories.base import BaseRepository
from app.core.payout_encryption import encrypt_bank_account_number, decrypt_bank_account_number

class OwnerPayoutRepository(BaseRepository[OwnerPayoutAccount]):
    def __init__(self, db: AsyncSession):
        super().__init__(OwnerPayoutAccount, db)

    async def get_by_id(self, payout_id: UUID) -> Optional[OwnerPayoutAccount]:
        result = await self.db.execute(select(OwnerPayoutAccount).where(OwnerPayoutAccount.id == payout_id))
        return result.scalars().first()

    async def get_by_owner_id(self, owner_id: UUID) -> Optional[OwnerPayoutAccount]:
        result = await self.db.execute(select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == owner_id))
        return result.scalars().first()

    async def get_by_razorpay_account_id(self, razorpay_account_id: str) -> Optional[OwnerPayoutAccount]:
        result = await self.db.execute(select(OwnerPayoutAccount).where(OwnerPayoutAccount.razorpay_account_id == razorpay_account_id))
        return result.scalars().first()

    async def create(self, payout_data: dict) -> OwnerPayoutAccount:
        payout_obj = OwnerPayoutAccount(**payout_data)
        self.db.add(payout_obj)
        await self.db.commit()
        await self.db.refresh(payout_obj)
        return payout_obj

    async def update(self, owner_id: UUID, update_data: dict) -> Optional[OwnerPayoutAccount]:
        payout = await self.get_by_owner_id(owner_id)
        if not payout:
            return None
        for field, value in update_data.items():
            if hasattr(payout, field) and value is not None:
                setattr(payout, field, value)
        await self.db.commit()
        await self.db.refresh(payout)
        return payout

    async def upsert_payout_details(
        self,
        owner_id: UUID,
        upi_vpa: str,
        bank_account_number: Optional[str],
        bank_ifsc: Optional[str],
        account_holder_name: Optional[str],
        bank_name: Optional[str],
        account_type: Optional[str],
        business_pan: Optional[str],
        default_holder_name: Optional[str],
    ) -> OwnerPayoutAccount:
        """Create or update the owner's payout destination from an onboarding
        submission. Resets payout_verification_status to "unverified"
        (clearing the prior verification record) whenever the UPI ID or the
        bank account/IFSC pair actually changes value — verification is tied
        to the specific destination, never carried over to a new one. Does
        not commit: the caller (submit_onboarding_application) commits once,
        atomically with the café and hardware tier rows."""
        existing = await self.get_by_owner_id(owner_id)

        existing_bank_plain = None
        if existing and existing.bank_account_number_encrypted:
            try:
                existing_bank_plain = decrypt_bank_account_number(existing.bank_account_number_encrypted)
            except Exception:
                existing_bank_plain = None

        destination_changed = (
            existing is None
            or (existing.upi_vpa or None) != upi_vpa
            or existing_bank_plain != bank_account_number
            or (existing.bank_ifsc or None) != bank_ifsc
        )

        bank_encrypted = encrypt_bank_account_number(bank_account_number) if bank_account_number else None
        masked_acc = f"••••{bank_account_number[-4:]}" if bank_account_number and len(bank_account_number) >= 4 else bank_account_number

        if existing is None:
            from datetime import datetime, timezone
            account = OwnerPayoutAccount(
                owner_id=owner_id,
                upi_vpa=upi_vpa,
                bank_account_number_encrypted=bank_encrypted,
                bank_account_number_masked=masked_acc,
                bank_ifsc=bank_ifsc,
                bank_name=bank_name,
                account_type=account_type,
                account_holder_name=account_holder_name or default_holder_name,
                business_pan=business_pan,
                payout_verification_status="unverified",
                submitted_at=datetime.now(timezone.utc),
            )
            self.db.add(account)
        else:
            account = existing
            account.upi_vpa = upi_vpa
            account.bank_account_number_encrypted = bank_encrypted
            account.bank_account_number_masked = masked_acc
            account.bank_ifsc = bank_ifsc
            account.bank_name = bank_name
            account.account_type = account_type
            account.account_holder_name = account_holder_name or default_holder_name
            account.business_pan = business_pan
            if destination_changed:
                account.payout_verification_status = "unverified"
                account.verified_name = None
                account.verified_at = None
                account.verified_by_admin_id = None
                account.test_transfer_ref = None

        await self.db.flush()
        return account
