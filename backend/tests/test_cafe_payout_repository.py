import pytest
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import select

from app.core.exceptions import BadRequestException
from app.repositories.cafe_payout_repository import CafePayoutRepository
from app.models.cafe_payout import CafePayout, CafePayoutStatus
from app.models.payment import Payment, PaymentStatus
from app.models.platform_fee import PlatformFee
from tests.test_admin_v2_features import _make_gamer, _make_booking_with_payment


@pytest.mark.asyncio
async def test_outstanding_amount_excludes_refunded_booking(db_session):
    gamer = await _make_gamer(db_session, "refund_gamer")
    paid_booking, paid_payment = await _make_booking_with_payment(db_session, gamer)
    refunded_booking, refunded_payment = await _make_booking_with_payment(db_session, gamer)

    fee1 = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=paid_booking.id, owner_settlement_amount=95.0)
    fee2 = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=refunded_booking.id, owner_settlement_amount=95.0)
    db_session.add_all([fee1, fee2])

    refunded_payment.status = PaymentStatus.REFUNDED
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    outstanding = await repo.get_outstanding_amount(paid_booking.cafe_id)

    assert outstanding == Decimal("95.00")


@pytest.mark.asyncio
async def test_outstanding_amount_excludes_already_transferred_via_route(db_session):
    """A booking whose PlatformFee was already auto-settled via Razorpay
    Route (transfer_status == 'transferred') must never also show as an
    outstanding manual-payout balance — otherwise an admin could manually
    pay out a café for money Route already sent it. This is a no-op today
    (Route is disabled, so no row is ever 'transferred'), but keeps this
    view agreeing with owner.py's get_owner_payout_summary once Route comes
    back online."""
    from app.models.cafe import Cafe
    from app.models.hardware_tier import HardwareTier
    from app.models.booking import Booking, BookingStatus
    from sqlalchemy import select
    from datetime import date, time, timedelta

    gamer = await _make_gamer(db_session, "route_settled_gamer")
    transferred_booking, _ = await _make_booking_with_payment(db_session, gamer)

    # Reuse the same café/tier for a second booking so both fee rows land
    # under one café — otherwise the per-cafe_id scoping alone (unrelated to
    # this fix) would already keep them apart and the test wouldn't actually
    # exercise the transfer_status filter.
    cafe = (await db_session.execute(
        select(Cafe).where(Cafe.id == transferred_booking.cafe_id)
    )).scalars().first()
    tier = (await db_session.execute(
        select(HardwareTier).where(HardwareTier.cafe_id == cafe.id)
    )).scalars().first()

    pending_booking = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today() + timedelta(days=3),
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=0.0, gateway_fee=0.0, total_amount=100.0,
        convenience_fee=0.0, status=BookingStatus.CONFIRMED,
    )
    db_session.add(pending_booking)
    pending_payment = Payment(
        id=uuid4(), booking_id=pending_booking.id, razorpay_order_id=f"order_{uuid4().hex}",
        amount=100.0, status=PaymentStatus.CAPTURED,
    )
    db_session.add(pending_payment)

    fee_transferred = PlatformFee(
        settlement_status="settled", id=uuid4(),
        booking_id=transferred_booking.id,
        owner_settlement_amount=95.0,
        transfer_status="transferred",
    )
    fee_pending = PlatformFee(
        settlement_status="settled", id=uuid4(), booking_id=pending_booking.id, owner_settlement_amount=95.0
    )
    db_session.add_all([fee_transferred, fee_pending])
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    outstanding = await repo.get_outstanding_amount(cafe.id)
    rows = await repo.get_outstanding_fee_rows(cafe.id)

    assert outstanding == Decimal("95.00")
    assert [b.id for _fee, b in rows] == [pending_booking.id]


@pytest.mark.asyncio
async def test_outstanding_amount_excludes_already_paid_out(db_session):
    from app.models.owner_payout_account import OwnerPayoutAccount
    from sqlalchemy import select
    from app.models.cafe import Cafe

    gamer = await _make_gamer(db_session, "paid_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(
        id=uuid4(), owner_id=cafe_row.owner_id,
        upi_vpa="test@okaxis", payout_verification_status="verified",
    ))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    assert await repo.get_outstanding_amount(booking.cafe_id) == Decimal("95.00")

    payout = await repo.create_payout(
        cafe_id=booking.cafe_id, admin_id=uuid4(), utr_reference="UTR1", payment_method="neft",
    )
    assert payout.amount == 95.0

    assert await repo.get_outstanding_amount(booking.cafe_id) == Decimal("0")


import asyncio
from tests.conftest import TestAsyncSessionLocal


@pytest.mark.asyncio
async def test_concurrent_payout_creation_does_not_double_pay(db_session):
    from app.models.owner_payout_account import OwnerPayoutAccount
    from sqlalchemy import select
    from app.models.cafe import Cafe

    gamer = await _make_gamer(db_session, "race_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(
        id=uuid4(), owner_id=cafe_row.owner_id,
        upi_vpa="test@okaxis", payout_verification_status="verified",
    ))
    await db_session.commit()
    cafe_id = booking.cafe_id
    admin_id = uuid4()

    async def attempt():
        async with TestAsyncSessionLocal() as session:
            repo = CafePayoutRepository(session)
            try:
                return await repo.create_payout(cafe_id, admin_id, "UTR-RACE", "neft")
            except Exception:
                return None

    results = await asyncio.gather(attempt(), attempt())
    successes = [r for r in results if r is not None]
    assert len(successes) == 1, "exactly one of the two concurrent payouts must succeed"

    repo = CafePayoutRepository(db_session)
    assert await repo.get_outstanding_amount(cafe_id) == Decimal("0")


@pytest.mark.asyncio
async def test_get_outstanding_breakdown_lists_booking_details(db_session):
    gamer = await _make_gamer(db_session, "breakdown_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    breakdown = await repo.get_outstanding_breakdown(booking.cafe_id)

    assert len(breakdown) == 1
    assert breakdown[0]["bookingReference"] == booking.booking_reference
    assert breakdown[0]["ownerSettlementAmount"] == 95.0


@pytest.mark.asyncio
async def test_list_cafes_with_outstanding_only_includes_positive_balances(db_session):
    gamer = await _make_gamer(db_session, "list_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    cafes = await repo.list_cafes_with_outstanding()

    matching = [c for c in cafes if c["cafeId"] == str(booking.cafe_id)]
    assert len(matching) == 1
    assert matching[0]["outstandingAmount"] == 95.0


@pytest.mark.asyncio
async def test_list_payouts_filters_by_cafe(db_session):
    from app.models.owner_payout_account import OwnerPayoutAccount
    from sqlalchemy import select
    from app.models.cafe import Cafe

    gamer = await _make_gamer(db_session, "history_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(
        id=uuid4(), owner_id=cafe_row.owner_id,
        upi_vpa="test@okaxis", payout_verification_status="verified",
    ))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    await repo.create_payout(booking.cafe_id, uuid4(), "UTR-H1", "neft")

    result = await repo.list_payouts(cafe_id=booking.cafe_id)
    assert result["total"] == 1
    assert result["items"][0]["utrReference"] == "UTR-H1"


@pytest.mark.asyncio
async def test_create_payout_succeeds_for_submitted_unverified_account(db_session):
    """The old ₹1-test-transfer verification gate is gone: a submitted UPI ID
    is trusted at face value, not blocked pending verification."""
    from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "payout_submitted")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    from app.models.owner_payout_account import OwnerPayoutAccount
    from app.models.cafe import Cafe
    from app.models.platform_fee import PlatformFee
    cafe = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalar_one()
    db_session.add(OwnerPayoutAccount(
        owner_id=cafe.owner_id, upi_vpa="owner@okhdfc", payout_verification_status="unverified",
    ))
    db_session.add(PlatformFee(settlement_status="settled", booking_id=booking.id, owner_settlement_amount=Decimal("900.00")))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    payout = await repo.create_payout(
        cafe_id=booking.cafe_id, admin_id=admin.id,
        utr_reference="UTR123", payment_method="upi",
    )
    assert float(payout.amount) == 900.00


@pytest.mark.asyncio
async def test_create_payout_rejects_cafe_with_no_payout_destination(db_session):
    from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "payout_nodest")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    from app.models.platform_fee import PlatformFee
    db_session.add(PlatformFee(settlement_status="settled", booking_id=booking.id, owner_settlement_amount=Decimal("900.00")))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    with pytest.raises(BadRequestException, match="hasn't added payout details"):
        await repo.create_payout(
            cafe_id=booking.cafe_id, admin_id=admin.id,
            utr_reference="UTR124", payment_method="upi",
        )


@pytest.mark.asyncio
async def test_create_payout_rejects_bank_when_only_upi_exists(db_session):
    from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "payout_bankonly_reject")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    from app.models.owner_payout_account import OwnerPayoutAccount
    from app.models.cafe import Cafe
    from app.models.platform_fee import PlatformFee
    cafe = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalar_one()
    db_session.add(OwnerPayoutAccount(owner_id=cafe.owner_id, upi_vpa="owner@okhdfc"))
    db_session.add(PlatformFee(settlement_status="settled", booking_id=booking.id, owner_settlement_amount=Decimal("900.00")))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    with pytest.raises(BadRequestException, match="bank account details"):
        await repo.create_payout(
            cafe_id=booking.cafe_id, admin_id=admin.id,
            utr_reference="UTR-BANKREJ", payment_method="neft",
            destination_type="bank",
        )


@pytest.mark.asyncio
async def test_create_payout_rejects_upi_when_only_bank_exists(db_session):
    from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "payout_upionly_reject")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    from app.models.owner_payout_account import OwnerPayoutAccount
    from app.models.cafe import Cafe
    from app.models.platform_fee import PlatformFee
    cafe = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalar_one()
    db_session.add(OwnerPayoutAccount(
        owner_id=cafe.owner_id,
        bank_account_number_encrypted="enc-123",
        bank_ifsc="HDFC0000123",
        account_holder_name="Test Owner",
    ))
    db_session.add(PlatformFee(settlement_status="settled", booking_id=booking.id, owner_settlement_amount=Decimal("900.00")))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    with pytest.raises(BadRequestException, match="UPI ID"):
        await repo.create_payout(
            cafe_id=booking.cafe_id, admin_id=admin.id,
            utr_reference="UTR-UPIREJ", payment_method="upi",
            destination_type="upi",
        )


@pytest.mark.asyncio
async def test_create_payout_rejects_cafe_on_hold(db_session):
    from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "payout_onhold")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    from app.models.owner_payout_account import OwnerPayoutAccount
    from app.models.cafe import Cafe
    from app.models.platform_fee import PlatformFee
    cafe = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalar_one()
    cafe.payout_on_hold = True
    cafe.payout_hold_reason = "Fraud investigation"
    db_session.add(OwnerPayoutAccount(owner_id=cafe.owner_id, upi_vpa="owner@okhdfc"))
    db_session.add(PlatformFee(settlement_status="settled", booking_id=booking.id, owner_settlement_amount=Decimal("900.00")))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    with pytest.raises(BadRequestException, match="Fraud investigation"):
        await repo.create_payout(
            cafe_id=booking.cafe_id, admin_id=admin.id,
            utr_reference="UTR125", payment_method="upi",
        )


@pytest.mark.asyncio
async def test_outstanding_amount_nets_adjustments(db_session):
    from tests.test_admin_v2_features import _make_gamer, _make_booking_with_payment
    gamer = await _make_gamer(db_session, "payout_adj")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    from app.models.platform_fee import PlatformFee
    from app.models.cafe_payout_adjustment import CafePayoutAdjustment
    db_session.add(PlatformFee(settlement_status="settled", booking_id=booking.id, owner_settlement_amount=Decimal("900.00")))
    db_session.add(CafePayoutAdjustment(
        cafe_id=booking.cafe_id, booking_id=booking.id,
        amount=Decimal("-300.00"), reason="test adjustment",
    ))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    amount = await repo.get_outstanding_amount(booking.cafe_id)
    assert amount == Decimal("600.00")


@pytest.mark.asyncio
async def test_create_payout_succeeds_for_verified_cafe(db_session):
    from app.models.owner_payout_account import OwnerPayoutAccount

    gamer = await _make_gamer(db_session, "verified_gate_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=booking.id, owner_settlement_amount=50.0)
    db_session.add(fee)

    from sqlalchemy import select
    from app.models.cafe import Cafe
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    account = OwnerPayoutAccount(
        id=uuid4(), owner_id=cafe_row.owner_id, upi_vpa="verified@okaxis",
        payout_verification_status="verified",
    )
    db_session.add(account)
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    payout = await repo.create_payout(
        cafe_id=booking.cafe_id, admin_id=uuid4(),
        utr_reference="UTR-VERIFIED", payment_method="upi",
    )
    assert payout.amount == 50.0


@pytest.mark.asyncio
async def test_outstanding_list_reports_verification_status(db_session):
    from app.models.owner_payout_account import OwnerPayoutAccount

    gamer = await _make_gamer(db_session, "list_status_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=booking.id, owner_settlement_amount=25.0)
    db_session.add(fee)

    from sqlalchemy import select
    from app.models.cafe import Cafe
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    account = OwnerPayoutAccount(id=uuid4(), owner_id=cafe_row.owner_id, upi_vpa="listed@okaxis")
    db_session.add(account)
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    cafes = await repo.list_cafes_with_outstanding()
    entry = next(c for c in cafes if c["cafeId"] == str(booking.cafe_id))
    assert entry["payoutDestinationSubmitted"] is True


@pytest.mark.asyncio
async def test_create_payout_nets_adjustments_and_consumes_them(db_session):
    """create_payout must actually pay the net (fees minus unconsumed
    adjustments), and once paid the adjustment must be marked consumed
    (payout_id set) so it is never netted against the balance again."""
    from app.models.owner_payout_account import OwnerPayoutAccount
    from app.models.cafe import Cafe
    from app.models.cafe_payout_adjustment import CafePayoutAdjustment

    gamer = await _make_gamer(db_session, "payout_net_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=booking.id, owner_settlement_amount=Decimal("900.00"))
    db_session.add(fee)
    adjustment = CafePayoutAdjustment(
        id=uuid4(), cafe_id=booking.cafe_id, booking_id=booking.id,
        amount=Decimal("-300.00"), reason="clawback",
    )
    db_session.add(adjustment)
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(
        id=uuid4(), owner_id=cafe_row.owner_id,
        upi_vpa="test@okaxis", payout_verification_status="verified",
    ))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    payout = await repo.create_payout(
        cafe_id=booking.cafe_id, admin_id=uuid4(), utr_reference="UTR-NET", payment_method="neft",
    )
    # Paid amount must be net of the adjustment, not the raw fee sum.
    assert float(payout.amount) == 600.00

    await db_session.refresh(adjustment)
    assert adjustment.payout_id == payout.id

    # The adjustment is now consumed — a second call must not net it again.
    assert await repo.get_outstanding_amount(booking.cafe_id) == Decimal("0")


@pytest.mark.asyncio
async def test_create_payout_raises_when_adjustments_exceed_fees(db_session):
    from app.models.owner_payout_account import OwnerPayoutAccount
    from app.models.cafe import Cafe
    from app.models.cafe_payout_adjustment import CafePayoutAdjustment

    gamer = await _make_gamer(db_session, "payout_over_adj_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=booking.id, owner_settlement_amount=Decimal("100.00"))
    db_session.add(fee)
    db_session.add(CafePayoutAdjustment(
        id=uuid4(), cafe_id=booking.cafe_id, booking_id=booking.id,
        amount=Decimal("-300.00"), reason="big clawback",
    ))
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(
        id=uuid4(), owner_id=cafe_row.owner_id,
        upi_vpa="test@okaxis", payout_verification_status="verified",
    ))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    with pytest.raises(BadRequestException, match="no outstanding balance"):
        await repo.create_payout(
            cafe_id=booking.cafe_id, admin_id=uuid4(), utr_reference="UTR-OVER", payment_method="neft",
        )


@pytest.mark.asyncio
async def test_get_outstanding_breakdown_includes_adjustment_line(db_session):
    from app.models.cafe_payout_adjustment import CafePayoutAdjustment

    gamer = await _make_gamer(db_session, "breakdown_adj_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=booking.id, owner_settlement_amount=Decimal("900.00"))
    db_session.add(fee)
    db_session.add(CafePayoutAdjustment(
        id=uuid4(), cafe_id=booking.cafe_id, booking_id=booking.id,
        amount=Decimal("-300.00"), reason="refund clawback",
    ))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    breakdown = await repo.get_outstanding_breakdown(booking.cafe_id)

    booking_lines = [b for b in breakdown if b["type"] == "booking"]
    adjustment_lines = [b for b in breakdown if b["type"] == "adjustment"]
    assert len(booking_lines) == 1
    assert len(adjustment_lines) == 1
    assert adjustment_lines[0]["amount"] == -300.00
    assert adjustment_lines[0]["reason"] == "refund clawback"


@pytest.mark.asyncio
async def test_on_hold_and_disputed_statuses_round_trip_through_list_payouts(db_session):
    from app.models.owner_payout_account import OwnerPayoutAccount

    gamer = await _make_gamer(db_session, "status_vocab_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=booking.id, owner_settlement_amount=30.0)
    db_session.add(fee)

    from sqlalchemy import select
    from app.models.cafe import Cafe
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(
        id=uuid4(), owner_id=cafe_row.owner_id,
        upi_vpa="status@okaxis", payout_verification_status="verified",
    ))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    payout = await repo.create_payout(
        cafe_id=booking.cafe_id, admin_id=uuid4(),
        utr_reference="UTR-STATUS-VOCAB", payment_method="upi",
    )
    payout.status = CafePayoutStatus.ON_HOLD
    await db_session.commit()

    result = await repo.list_payouts(cafe_id=booking.cafe_id)
    assert result["items"][0]["status"] == "on_hold"

    payout.status = CafePayoutStatus.DISPUTED
    await db_session.commit()

    result2 = await repo.list_payouts(cafe_id=booking.cafe_id)
    assert result2["items"][0]["status"] == "disputed"


@pytest.mark.asyncio
async def test_create_payout_snapshots_destination_from_live_account(db_session):
    from app.models.owner_payout_account import OwnerPayoutAccount
    from app.models.cafe import Cafe

    gamer = await _make_gamer(db_session, "snapshot_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=booking.id, owner_settlement_amount=Decimal("500.00"))
    db_session.add(fee)
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    account = OwnerPayoutAccount(
        id=uuid4(), owner_id=cafe_row.owner_id, upi_vpa="snap@okaxis",
        account_holder_name="Snap Holder", version=3,
    )
    db_session.add(account)
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    payout = await repo.create_payout(
        cafe_id=booking.cafe_id, admin_id=uuid4(),
        utr_reference="UTR-SNAP", payment_method="upi",
        destination_type="upi",
    )

    assert payout.destination_type.value == "upi"
    assert payout.destination_upi_vpa == "snap@okaxis"
    assert payout.destination_account_holder_name == "Snap Holder"
    assert payout.destination_payout_account_id == account.id
    assert payout.destination_payout_account_version == 3


@pytest.mark.asyncio
async def test_create_payout_infers_destination_type_when_not_given(db_session):
    """Existing/internal callers that don't pass destination_type explicitly
    (e.g. direct repository tests) still get a sensibly-populated snapshot."""
    from app.models.owner_payout_account import OwnerPayoutAccount
    from app.models.cafe import Cafe

    gamer = await _make_gamer(db_session, "infer_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=booking.id, owner_settlement_amount=Decimal("100.00"))
    db_session.add(fee)
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(id=uuid4(), owner_id=cafe_row.owner_id, upi_vpa="infer@okaxis"))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    payout = await repo.create_payout(
        cafe_id=booking.cafe_id, admin_id=uuid4(),
        utr_reference="UTR-INFER", payment_method="upi",
    )
    assert payout.destination_type.value == "upi"


@pytest.mark.asyncio
async def test_create_payout_rejects_stale_expected_version(db_session):
    from app.models.owner_payout_account import OwnerPayoutAccount
    from app.models.cafe import Cafe
    from app.core.exceptions import ConflictException

    gamer = await _make_gamer(db_session, "stale_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=booking.id, owner_settlement_amount=Decimal("250.00"))
    db_session.add(fee)
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(id=uuid4(), owner_id=cafe_row.owner_id, upi_vpa="stale@okaxis", version=2))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    with pytest.raises(ConflictException, match="changed since you opened"):
        await repo.create_payout(
            cafe_id=booking.cafe_id, admin_id=uuid4(),
            utr_reference="UTR-STALE", payment_method="upi",
            destination_type="upi", expected_payout_account_version=1,
        )

    # Nothing must have been written.
    remaining = await repo.get_outstanding_amount(booking.cafe_id)
    assert remaining == Decimal("250.00")


@pytest.mark.asyncio
async def test_create_payout_accepts_matching_expected_version(db_session):
    from app.models.owner_payout_account import OwnerPayoutAccount
    from app.models.cafe import Cafe

    gamer = await _make_gamer(db_session, "fresh_version_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=booking.id, owner_settlement_amount=Decimal("250.00"))
    db_session.add(fee)
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(id=uuid4(), owner_id=cafe_row.owner_id, upi_vpa="fresh@okaxis", version=2))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    payout = await repo.create_payout(
        cafe_id=booking.cafe_id, admin_id=uuid4(),
        utr_reference="UTR-FRESH", payment_method="upi",
        destination_type="upi", expected_payout_account_version=2,
    )
    assert payout.destination_payout_account_version == 2


@pytest.mark.asyncio
async def test_create_payout_rolls_back_completely_on_partial_failure(db_session):
    """If anything fails after the CafePayout row is staged but before the
    transaction commits, nothing may be left half-written — no orphaned
    CafePayout row, no reduced outstanding balance."""
    from unittest.mock import patch
    from app.models.owner_payout_account import OwnerPayoutAccount
    from app.models.cafe import Cafe
    from app.models.cafe_payout_item import CafePayoutItem

    gamer = await _make_gamer(db_session, "atomicity_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    cafe_id = booking.cafe_id
    fee = PlatformFee(settlement_status="settled", id=uuid4(), booking_id=booking.id, owner_settlement_amount=Decimal("500.00"))
    db_session.add(fee)
    cafe_row = (await db_session.execute(select(Cafe).where(Cafe.id == cafe_id))).scalars().first()
    db_session.add(OwnerPayoutAccount(id=uuid4(), owner_id=cafe_row.owner_id, upi_vpa="atomic@okaxis"))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    original_add = db_session.add

    def _failing_add(instance):
        if isinstance(instance, CafePayoutItem):
            raise RuntimeError("simulated failure while adding payout items")
        return original_add(instance)

    with patch.object(db_session, "add", side_effect=_failing_add):
        with pytest.raises(RuntimeError, match="simulated failure"):
            await repo.create_payout(
                cafe_id=cafe_id, admin_id=uuid4(),
                utr_reference="UTR-ATOMIC", payment_method="upi",
            )

    # Note: booking/fee/cafe_row are captured into plain values (cafe_id)
    # before this point — rollback() expires every ORM instance the session
    # was tracking, and re-touching an expired attribute (e.g. booking.cafe_id)
    # outside an awaited/greenlet context raises sqlalchemy.exc.MissingGreenlet.
    await db_session.rollback()

    remaining = await repo.get_outstanding_amount(cafe_id)
    assert remaining == Decimal("500.00")

    leftover = (await db_session.execute(
        select(CafePayout).where(CafePayout.cafe_id == cafe_id)
    )).scalars().all()
    assert leftover == []
