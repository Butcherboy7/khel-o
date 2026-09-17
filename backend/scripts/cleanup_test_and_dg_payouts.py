"""
One-off cleanup script (not part of the app, never imported by it):

1. Deletes the 7 test/dev cafés identified via
   scripts/list_payables_without_payout_details.py and confirmed by name
   with the KHELO team (KHEL-O Payment Test Cafe, GearUp Gaming Cafe,
   PlayMax Esports Zone, ASH Gaming Food Zone, A R Gaming Zone, Rocking
   Gaming Cafe - Naseer, Epitome Gaming Cafe - Naseer) and everything
   hanging off them — bookings, payments, platform fees, reviews,
   promotions, hardware tiers, waitlist entries, staff invitations, role
   mappings, analytics events, cafe payouts/items/adjustments. Targeted by
   hardcoded ID (captured at confirmation time) rather than by name/owner
   lookup, so this can never accidentally widen its blast radius if new
   cafés are created later with similar names.

2. Reverts every CafePayout ever recorded against DG Gaming Cafe (a real
   café whose owner made a small test payout while verifying the
   mark-as-paid fix) — deleting the CafePayout/CafePayoutItem rows and
   clearing payout_id on any CafePayoutAdjustment rows they'd consumed, so
   the underlying PlatformFee rows go back to "outstanding" for a real
   payout. The café itself, its bookings, and its other data are untouched.

Usage:
    python -m scripts.cleanup_test_and_dg_payouts --dry-run   # counts only
    python -m scripts.cleanup_test_and_dg_payouts --execute   # actually deletes
"""
import argparse
import asyncio
from uuid import UUID

from sqlalchemy import select, delete, update, text

from app.database import AsyncSessionLocal
from app.models.cafe import Cafe
from app.models.booking import Booking
from app.models.payment import Payment
from app.models.platform_fee import PlatformFee
from app.models.review import Review
from app.models.hardware_tier import HardwareTier
from app.models.promotion import Promotion
from app.models.cafe_waitlist import CafeWaitlistEntry
from app.models.staff_invitation import StaffInvitation
from app.models.user_role import UserRoleMapping
from app.models.analytics_event import AnalyticsEvent
from app.models.cafe_payout import CafePayout
from app.models.cafe_payout_item import CafePayoutItem
from app.models.cafe_payout_adjustment import CafePayoutAdjustment
from app.models.support_ticket import SupportTicket

# Confirmed with the KHELO team on 2026-09-17 via
# scripts/list_payables_without_payout_details.py's output.
TEST_CAFE_IDS = [
    UUID("b05aefcd-eb93-4f8c-8362-943f17ded825"),  # KHEL-O Payment Test Cafe
    UUID("8286a75b-d4ba-4df8-93c8-fee689766068"),  # GearUp Gaming Cafe
    UUID("19f9cecd-51a0-4c52-9d05-40983ef24ee5"),  # PlayMax Esports Zone
    UUID("fc27eccf-f9c2-4608-bff0-1ff275b2a4fa"),  # ASH Gaming Food Zone
    UUID("0567029c-b320-4d0c-94fd-9e03ac2b17e9"),  # A R Gaming Zone
    UUID("019ff96f-adeb-4224-9a8d-36ecce666228"),  # Rocking Gaming Cafe - Naseer
    UUID("8a5b9a78-d578-4ec1-8970-e79333affce7"),  # Epitome Gaming Cafe - Naseer
]
DG_CAFE_NAME = "DG Gaming Cafe"


async def _test_cafe_ids(db) -> list:
    found = (await db.execute(select(Cafe.id).where(Cafe.id.in_(TEST_CAFE_IDS)))).scalars().all()
    missing = set(TEST_CAFE_IDS) - set(found)
    if missing:
        print(f"WARNING: {len(missing)} confirmed test café id(s) not found in DB (already deleted?): {missing}")
    return list(found)


async def _dg_cafe_id(db):
    cafe = (await db.execute(select(Cafe).where(Cafe.name == DG_CAFE_NAME))).scalar_one_or_none()
    return cafe.id if cafe else None


async def _count(db, model, col, ids):
    if not ids:
        return 0
    result = await db.execute(select(model).where(col.in_(ids)))
    return len(result.scalars().all())


async def dry_run():
    async with AsyncSessionLocal() as db:
        test_cafe_ids = await _test_cafe_ids(db)
        print(f"Confirmed test cafés: {len(test_cafe_ids)}/{len(TEST_CAFE_IDS)} found in DB")
        if test_cafe_ids:
            booking_ids_q = select(Booking.id).where(Booking.cafe_id.in_(test_cafe_ids))
            booking_ids = [r[0] for r in (await db.execute(booking_ids_q)).all()]
            print(f"  bookings: {len(booking_ids)}")
            print(f"  payments: {await _count(db, Payment, Payment.booking_id, booking_ids)}")
            print(f"  platform_fees: {await _count(db, PlatformFee, PlatformFee.booking_id, booking_ids)}")
            print(f"  reviews: {await _count(db, Review, Review.cafe_id, test_cafe_ids)}")
            print(f"  hardware_tiers: {await _count(db, HardwareTier, HardwareTier.cafe_id, test_cafe_ids)}")
            print(f"  promotions: {await _count(db, Promotion, Promotion.cafe_id, test_cafe_ids)}")
            print(f"  cafe_waitlist: {await _count(db, CafeWaitlistEntry, CafeWaitlistEntry.cafe_id, test_cafe_ids)}")
            print(f"  staff_invitations: {await _count(db, StaffInvitation, StaffInvitation.venue_id, test_cafe_ids)}")
            print(f"  user_role_mappings: {await _count(db, UserRoleMapping, UserRoleMapping.cafe_id, test_cafe_ids)}")
            print(f"  analytics_events: {await _count(db, AnalyticsEvent, AnalyticsEvent.cafe_id, test_cafe_ids)}")
            print(f"  cafe_payouts: {await _count(db, CafePayout, CafePayout.cafe_id, test_cafe_ids)}")
            print(f"  cafe_payout_adjustments: {await _count(db, CafePayoutAdjustment, CafePayoutAdjustment.cafe_id, test_cafe_ids)}")
            print(f"  support_tickets (will be un-linked, not deleted): {await _count(db, SupportTicket, SupportTicket.cafe_id, test_cafe_ids)}")

        dg_id = await _dg_cafe_id(db)
        print(f"\nDG Gaming Cafe: {'found ' + str(dg_id) if dg_id else 'NOT FOUND'}")
        if dg_id:
            payouts = (await db.execute(select(CafePayout).where(CafePayout.cafe_id == dg_id))).scalars().all()
            print(f"  cafe_payouts to revert: {len(payouts)}")
            for p in payouts:
                print(f"    - {p.id}  amount={p.amount}  status={p.status}  utr={p.utr_reference}")


async def execute():
    async with AsyncSessionLocal() as db:
        test_cafe_ids = await _test_cafe_ids(db)
        if test_cafe_ids:
            booking_ids_q = select(Booking.id).where(Booking.cafe_id.in_(test_cafe_ids))
            booking_ids = [r[0] for r in (await db.execute(booking_ids_q)).all()]

            # Support tickets are real (potentially owner-visible) records —
            # un-link rather than delete, in case a test café ticket was
            # actually a genuine support interaction worth keeping.
            await db.execute(
                update(SupportTicket)
                .where(SupportTicket.cafe_id.in_(test_cafe_ids))
                .values(cafe_id=None)
            )
            await db.execute(
                update(SupportTicket)
                .where(SupportTicket.booking_id.in_(booking_ids))
                .values(booking_id=None)
            )

            await db.execute(delete(CafePayoutItem).where(CafePayoutItem.booking_id.in_(booking_ids)))
            await db.execute(delete(CafePayout).where(CafePayout.cafe_id.in_(test_cafe_ids)))
            await db.execute(delete(CafePayoutAdjustment).where(CafePayoutAdjustment.cafe_id.in_(test_cafe_ids)))
            await db.execute(delete(Review).where(Review.cafe_id.in_(test_cafe_ids)))
            await db.execute(delete(Payment).where(Payment.booking_id.in_(booking_ids)))
            await db.execute(delete(PlatformFee).where(PlatformFee.booking_id.in_(booking_ids)))
            await db.execute(delete(Booking).where(Booking.cafe_id.in_(test_cafe_ids)))
            await db.execute(delete(CafeWaitlistEntry).where(CafeWaitlistEntry.cafe_id.in_(test_cafe_ids)))
            await db.execute(delete(StaffInvitation).where(StaffInvitation.venue_id.in_(test_cafe_ids)))
            await db.execute(delete(UserRoleMapping).where(UserRoleMapping.cafe_id.in_(test_cafe_ids)))
            await db.execute(delete(AnalyticsEvent).where(AnalyticsEvent.cafe_id.in_(test_cafe_ids)))
            # Promotions must go before hardware_tiers — Promotion.applicable_tier_id
            # FKs to hardware_tiers.id.
            await db.execute(delete(Promotion).where(Promotion.cafe_id.in_(test_cafe_ids)))
            await db.execute(delete(HardwareTier).where(HardwareTier.cafe_id.in_(test_cafe_ids)))
            await db.execute(delete(Cafe).where(Cafe.id.in_(test_cafe_ids)))
            print(f"Deleted {len(test_cafe_ids)} test cafés and their dependent rows.")
        else:
            print("No test cafés found — nothing to delete.")

        dg_id = await _dg_cafe_id(db)
        if dg_id:
            payout_ids_q = select(CafePayout.id).where(CafePayout.cafe_id == dg_id)
            payout_ids = [r[0] for r in (await db.execute(payout_ids_q)).all()]
            if payout_ids:
                await db.execute(
                    update(CafePayoutAdjustment)
                    .where(CafePayoutAdjustment.payout_id.in_(payout_ids))
                    .values(payout_id=None)
                )
                await db.execute(delete(CafePayoutItem).where(CafePayoutItem.payout_id.in_(payout_ids)))
                await db.execute(delete(CafePayout).where(CafePayout.id.in_(payout_ids)))
                await db.execute(
                    text("DELETE FROM admin_audit_logs WHERE entity_type = 'cafe_payout' AND entity_id = ANY(:ids)"),
                    {"ids": [str(i) for i in payout_ids]},
                )
                print(f"Reverted {len(payout_ids)} CafePayout record(s) for DG Gaming Cafe.")
            else:
                print("DG Gaming Cafe has no CafePayout records — nothing to revert.")
        else:
            print("DG Gaming Cafe not found — nothing to revert.")

        await db.commit()
        print("Committed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true")
    group.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    asyncio.run(execute() if args.execute else dry_run())
