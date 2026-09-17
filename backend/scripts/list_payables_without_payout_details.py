"""Read-only: lists every café with an outstanding payable amount and no
usable payout details on file, to identify which ones are stale test data
before any deletion. Mirrors CafePayoutRepository.list_cafes_with_outstanding
and its payout-details-submitted check."""
import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.cafe import Cafe
from app.models.owner_payout_account import OwnerPayoutAccount
from app.repositories.cafe_payout_repository import CafePayoutRepository


async def main():
    async with AsyncSessionLocal() as db:
        repo = CafePayoutRepository(db)
        cafes = (await db.execute(select(Cafe))).scalars().all()
        for cafe in cafes:
            outstanding = await repo.get_outstanding_amount(cafe.id)
            if outstanding <= 0:
                continue
            account = (
                await db.execute(select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == cafe.owner_id))
            ).scalar_one_or_none()
            has_details = bool(
                account and (account.upi_vpa or (account.bank_account_number_encrypted and account.bank_ifsc and account.account_holder_name))
            )
            print(f"{cafe.name!r:40} id={cafe.id}  owner_id={cafe.owner_id}  outstanding=₹{outstanding}  has_payout_details={has_details}  verification={cafe.verification_status}")


if __name__ == "__main__":
    asyncio.run(main())
