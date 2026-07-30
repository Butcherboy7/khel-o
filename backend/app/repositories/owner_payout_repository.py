from typing import Optional
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.owner_payout_account import OwnerPayoutAccount
from app.repositories.base import BaseRepository

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
