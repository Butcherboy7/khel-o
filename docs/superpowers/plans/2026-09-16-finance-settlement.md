# Finance Settlement & Cafe Management Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken Razorpay-Route-flavored payout verification gate with an honest manual-settlement system (one "Owed now" number, one payout history list, shared by admin and owner), add a café-level payout hold and a refund-clawback ledger, fix the two bugs behind the intermittent café-suspension failure, add owner suspension notifications, and sort the admin café list open-cafés-first.

**Architecture:** Backend changes are additive/subtractive on the existing `PlatformFee` / `CafePayout` / `CafePayoutItem` data model — no new payment pipeline. Two new tables (`CafePayoutAdjustment`, plus two new columns on `Cafe`) via one Alembic migration. Frontend collapses three admin pages into one and strips a dead Route-reconciliation code path from the owner payouts page.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async + Alembic (backend), Next.js App Router + TanStack Query + Tailwind (frontend), pytest + httpx (tests).

**Spec:** `docs/superpowers/specs/2026-09-16-finance-settlement-design.md`

## Global Constraints

- Razorpay Route stays disabled (`RAZORPAY_ROUTE_ENABLED = False`) — do not build or re-enable any Route-dependent code path.
- Never hard-delete a financial record. Corrections are additive rows (`CafePayoutAdjustment`) with `reason` + timestamp, never edits/deletes of `CafePayout`/`PlatformFee`/`Payment` rows.
- Partial payouts are explicitly out of scope — `create_payout` stays full-sweep-only.
- The ₹1 UPI test-transfer / `payout_verification_status` gate is removed, not made optional. Do not add a "skip verification" checkbox — remove the gate entirely.
- Every admin action that changes money-owed or suspends a café must produce an `AdminAuditLog` row (existing pattern in `admin_service.write_audit_log`).
- A suspension email must fire only after the suspend DB write + audit log both succeed — never on a failed suspend.
- New shared UI: a `Tooltip` component (none currently exists in `frontend/src/components/ui`) used on "Owed now", "On Hold", the UPI/bank fields, and payout status badges.
- Existing tests that assert the old verification gate (`test_admin_payout_verification.py`, `test_cafe_payout_repository.py::test_create_payout_rejects_unverified_cafe`) and the old Route reconciliation fields (`test_owner_payout_summary_bugfix.py`, `test_owner_payout_summary_enriched.py`) must be deleted or rewritten as part of the task that removes the behavior they test — never left red.

---

### Task 1: `Cafe.payout_on_hold` + `CafePayoutAdjustment` model + migration

**Files:**
- Modify: `backend/app/models/cafe.py`
- Create: `backend/app/models/cafe_payout_adjustment.py`
- Modify: `backend/app/models/__init__.py` (register the new model so Alembic autogen / `Base.metadata` sees it)
- Create: `backend/migrations/versions/033_payout_hold_and_adjustments.py`
- Test: `backend/tests/test_cafe_payout_adjustment_model.py`

**Interfaces:**
- Produces: `Cafe.payout_on_hold: bool`, `Cafe.payout_hold_reason: str | None`; `CafePayoutAdjustment(id, cafe_id, booking_id, amount: Decimal, reason: str, created_by_admin_id: UUID | None, created_at: datetime)`. Task 2+ import `from app.models.cafe_payout_adjustment import CafePayoutAdjustment`.

- [ ] **Step 1: Add the two columns to `Cafe`**

In `backend/app/models/cafe.py`, add after the `bookings_paused` line (line 49):

```python
    payout_on_hold: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    payout_hold_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
```

- [ ] **Step 2: Write the `CafePayoutAdjustment` model**

Create `backend/app/models/cafe_payout_adjustment.py`:

```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CafePayoutAdjustment(Base):
    """A signed correction to a café's outstanding payable balance that does
    NOT touch any existing CafePayout/CafePayoutItem/PlatformFee row — e.g. a
    booking refunded after its settlement was already paid out. amount is
    almost always negative (money clawed back). Never delete these rows;
    they are the only record of why an outstanding balance moved without a
    new payout."""
    __tablename__ = "cafe_payout_adjustments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    cafe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cafes.id"), nullable=False, index=True)
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_admin_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
```

- [ ] **Step 3: Register the model**

Check `backend/app/models/__init__.py` — add `from app.models.cafe_payout_adjustment import CafePayoutAdjustment` alongside the existing `CafePayout`/`CafePayoutItem` imports (follow whatever import style the file already uses for those two).

- [ ] **Step 4: Write the migration**

Create `backend/migrations/versions/033_payout_hold_and_adjustments.py`:

```python
"""add cafe payout hold flag and cafe_payout_adjustments ledger

Revision ID: 033
Revises: 032
Create Date: 2026-09-16
"""
from alembic import op
import sqlalchemy as sa

revision = '033'
down_revision = '032'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cafes', sa.Column('payout_on_hold', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('cafes', sa.Column('payout_hold_reason', sa.String(500), nullable=True))

    op.create_table(
        'cafe_payout_adjustments',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('cafe_id', sa.Uuid(), sa.ForeignKey('cafes.id'), nullable=False),
        sa.Column('booking_id', sa.Uuid(), sa.ForeignKey('bookings.id'), nullable=False),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('created_by_admin_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_cafe_payout_adjustments_cafe_id', 'cafe_payout_adjustments', ['cafe_id'])


def downgrade():
    op.drop_index('ix_cafe_payout_adjustments_cafe_id', table_name='cafe_payout_adjustments')
    op.drop_table('cafe_payout_adjustments')
    op.drop_column('cafes', 'payout_hold_reason')
    op.drop_column('cafes', 'payout_on_hold')
```

- [ ] **Step 5: Write the failing test**

Create `backend/tests/test_cafe_payout_adjustment_model.py`:

```python
import pytest
from decimal import Decimal
from app.models.cafe_payout_adjustment import CafePayoutAdjustment


@pytest.mark.asyncio
async def test_cafe_payout_adjustment_persists_negative_amount(db_session):
    from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "adjtest")
    booking, _payment = await _make_booking_with_payment(db_session, gamer)

    adj = CafePayoutAdjustment(
        cafe_id=booking.cafe_id,
        booking_id=booking.id,
        amount=Decimal("-960.00"),
        reason="Refunded after payout: booking " + booking.booking_reference,
        created_by_admin_id=admin.id,
    )
    db_session.add(adj)
    await db_session.commit()
    await db_session.refresh(adj)

    assert adj.id is not None
    assert float(adj.amount) == -960.00
    assert adj.created_at is not None
```

- [ ] **Step 6: Run migration and test, verify pass**

Run: `cd backend && alembic upgrade head && python -m pytest tests/test_cafe_payout_adjustment_model.py -v`
Expected: migration applies cleanly, test PASSES.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/cafe.py backend/app/models/cafe_payout_adjustment.py backend/app/models/__init__.py backend/migrations/versions/033_payout_hold_and_adjustments.py backend/tests/test_cafe_payout_adjustment_model.py
git commit -m "feat(finance): add cafe payout hold flag and adjustment ledger"
```

---

### Task 2: Drop the verification gate; net adjustments into outstanding balance

**Files:**
- Modify: `backend/app/repositories/cafe_payout_repository.py`
- Delete: `backend/tests/test_admin_payout_verification.py`
- Modify: `backend/tests/test_cafe_payout_repository.py`

**Interfaces:**
- Consumes: `CafePayoutAdjustment` from Task 1.
- Produces: `CafePayoutRepository.get_outstanding_amount(cafe_id) -> Decimal` now nets adjustments in. `create_payout` no longer requires `payout_verification_status == "verified"`; instead requires an `OwnerPayoutAccount` with `upi_vpa` or a complete bank set. Raises `BadRequestException` if `Cafe.payout_on_hold` is true (message includes the hold reason).

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_cafe_payout_repository.py`, replace the existing `test_create_payout_rejects_unverified_cafe` (lines 220-242) with:

```python
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
    db_session.add(PlatformFee(booking_id=booking.id, owner_settlement_amount=Decimal("900.00")))
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
    db_session.add(PlatformFee(booking_id=booking.id, owner_settlement_amount=Decimal("900.00")))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    with pytest.raises(BadRequestException, match="hasn't added payout details"):
        await repo.create_payout(
            cafe_id=booking.cafe_id, admin_id=admin.id,
            utr_reference="UTR124", payment_method="upi",
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
    db_session.add(PlatformFee(booking_id=booking.id, owner_settlement_amount=Decimal("900.00")))
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
    db_session.add(PlatformFee(booking_id=booking.id, owner_settlement_amount=Decimal("900.00")))
    db_session.add(CafePayoutAdjustment(
        cafe_id=booking.cafe_id, booking_id=booking.id,
        amount=Decimal("-300.00"), reason="test adjustment",
    ))
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    amount = await repo.get_outstanding_amount(booking.cafe_id)
    assert amount == Decimal("600.00")
```

Also update the existing `test_outstanding_list_reports_verification_status` (lines 272-291): rename the asserted field from `payoutVerificationStatus` to `payoutDestinationSubmitted` (bool) per Step 3 below, and change the assertion to `entry["payoutDestinationSubmitted"] is True`.

Delete `backend/tests/test_admin_payout_verification.py` entirely — every test in it exercises the endpoint removed in Task 4.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_cafe_payout_repository.py -v`
Expected: the four new/changed tests FAIL (`create_payout` still requires `verified`, `get_outstanding_amount` doesn't net adjustments, `payoutVerificationStatus` key doesn't match).

- [ ] **Step 3: Rewrite `cafe_payout_repository.py`**

In `backend/app/repositories/cafe_payout_repository.py`:

Add the import at the top:
```python
from app.models.cafe_payout_adjustment import CafePayoutAdjustment
```

Replace `get_outstanding_amount` (lines 48-51):
```python
    async def get_outstanding_amount(self, cafe_id: UUID) -> Decimal:
        rows = await self.get_outstanding_fee_rows(cafe_id)
        total = sum((Decimal(str(fee.owner_settlement_amount)) for fee, _ in rows), Decimal("0"))
        adjustments = (await self.db.execute(
            select(func.coalesce(func.sum(CafePayoutAdjustment.amount), 0)).where(
                CafePayoutAdjustment.cafe_id == cafe_id
            )
        )).scalar()
        return total + Decimal(str(adjustments))
```

Replace the verification check inside `create_payout` (lines 78-92) and add the hold check before it:

```python
        cafe_row = (await self.db.execute(
            select(Cafe.owner_id, Cafe.payout_on_hold, Cafe.payout_hold_reason).where(Cafe.id == cafe_id)
        )).first()
        if not cafe_row:
            raise BadRequestException("Café not found.")
        owner_id, on_hold, hold_reason = cafe_row

        if on_hold:
            raise BadRequestException(
                f"Payouts to this café are on hold: {hold_reason or 'no reason given'}."
            )

        payout_account = (await self.db.execute(
            select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == owner_id)
        )).scalars().first()
        has_upi = bool(payout_account and payout_account.upi_vpa)
        has_bank = bool(
            payout_account
            and payout_account.bank_account_number_encrypted
            and payout_account.bank_ifsc
            and payout_account.account_holder_name
        )
        if not (has_upi or has_bank):
            raise BadRequestException(
                "This café hasn't added payout details yet — ask the owner to add a UPI ID "
                "or bank account in Owner Settings before paying out."
            )
```

(This replaces the old `cafe_owner_row`/`verification_status` block — remove the old lines entirely, including the now-unused `owner_id = cafe_owner_row[0]` line, since `owner_id` now comes from `cafe_row` above.)

Replace `list_cafes_with_outstanding`'s per-cafe verification lookup (lines 154-169) — swap `payoutVerificationStatus` for a plain boolean:

```python
    async def list_cafes_with_outstanding(self) -> list[dict]:
        cafes_result = await self.db.execute(select(Cafe.id, Cafe.name, Cafe.owner_id, Cafe.payout_on_hold, Cafe.payout_hold_reason))
        out = []
        for cafe_id, cafe_name, owner_id, on_hold, hold_reason in cafes_result.all():
            amount = await self.get_outstanding_amount(cafe_id)
            if amount > 0:
                account = (await self.db.execute(
                    select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == owner_id)
                )).scalars().first()
                destination_submitted = bool(account and (account.upi_vpa or account.bank_account_number_encrypted))
                out.append({
                    "cafeId": str(cafe_id),
                    "cafeName": cafe_name,
                    "outstandingAmount": float(amount),
                    "payoutDestinationSubmitted": destination_submitted,
                    "upiVpa": account.upi_vpa if account else None,
                    "payoutOnHold": on_hold,
                    "payoutHoldReason": hold_reason,
                })
        return out
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd backend && python -m pytest tests/test_cafe_payout_repository.py tests/test_admin_cafe_payouts_api.py tests/test_owner_cafe_payouts_api.py tests/test_cafe_payout_models.py tests/test_cafe_payout_proof.py -v`
Expected: all PASS. (The four unaffected test files were confirmed to only set `payout_verification_status="verified"` as harmless fixture setup — no changes needed to them.)

- [ ] **Step 5: Commit**

```bash
git add backend/app/repositories/cafe_payout_repository.py backend/tests/test_cafe_payout_repository.py
git rm backend/tests/test_admin_payout_verification.py
git commit -m "feat(finance): drop verification gate, add payout-hold check, net adjustments into outstanding balance"
```

---

### Task 3: Refund clawback — write a `CafePayoutAdjustment` when refunding an already-paid-out booking

**Files:**
- Modify: `backend/app/services/payment_service.py`
- Test: `backend/tests/test_refund_clawback_adjustment.py`

**Interfaces:**
- Consumes: `CafePayoutAdjustment` from Task 1.
- Produces: nothing new consumed by later tasks — this is a leaf behavior.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_refund_clawback_adjustment.py`:

```python
import pytest
from decimal import Decimal
from sqlalchemy import select
from app.models.platform_fee import PlatformFee
from app.models.cafe_payout import CafePayout, CafePayoutStatus
from app.models.cafe_payout_item import CafePayoutItem
from app.models.cafe_payout_adjustment import CafePayoutAdjustment
from app.models.owner_payout_account import OwnerPayoutAccount
from app.services.payment_service import PaymentService
from app.repositories.payment_repository import PaymentRepository
from app.repositories.booking_repository import BookingRepository


@pytest.mark.asyncio
async def test_refund_after_payout_writes_clawback_adjustment(db_session):
    from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "clawback")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    fee = PlatformFee(booking_id=booking.id, owner_settlement_amount=Decimal("900.00"))
    db_session.add(fee)
    await db_session.flush()

    payout = CafePayout(
        cafe_id=booking.cafe_id, amount=Decimal("900.00"), utr_reference="UTR1",
        payment_method="upi", status=CafePayoutStatus.PAID, created_by_admin_id=admin.id,
    )
    db_session.add(payout)
    await db_session.flush()
    db_session.add(CafePayoutItem(
        payout_id=payout.id, platform_fee_id=fee.id, booking_id=booking.id,
        amount_allocated=Decimal("900.00"),
    ))
    await db_session.commit()

    service = PaymentService(PaymentRepository(db_session), BookingRepository(db_session))
    await service.process_refund(booking.id, admin_id=admin.id)

    adjustments = (await db_session.execute(
        select(CafePayoutAdjustment).where(CafePayoutAdjustment.booking_id == booking.id)
    )).scalars().all()
    assert len(adjustments) == 1
    assert float(adjustments[0].amount) == -900.00
    assert booking.booking_reference in adjustments[0].reason
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_refund_clawback_adjustment.py -v`
Expected: FAIL — no `CafePayoutAdjustment` row is created.

- [ ] **Step 3: Add the clawback write to `process_refund`**

Read `backend/app/services/payment_service.py` around lines 707-749 (the existing warning-only block) before editing — the exact surrounding variable names (`fee_row`, `booking_ref`) must match what's already there. Replace the `logger.warning(...)`-only block with one that also writes the adjustment:

```python
                self.payment_repo.db.add(CafePayoutAdjustment(
                    cafe_id=booking.cafe_id,
                    booking_id=booking_id,
                    amount=-Decimal(str(fee_row.owner_settlement_amount)),
                    reason=f"Refunded after payout: booking {booking_ref}",
                    created_by_admin_id=admin_id,
                ))
```

placed immediately after the existing `logger.warning(...)` call in that block (keep the warning — it's still useful for immediate visibility; the adjustment row is the durable record). Add the import at the top of the file:
```python
from app.models.cafe_payout_adjustment import CafePayoutAdjustment
from decimal import Decimal
```
(check `Decimal` isn't already imported before adding it twice).

- [ ] **Step 4: Run test, verify pass**

Run: `cd backend && python -m pytest tests/test_refund_clawback_adjustment.py -v`
Expected: PASS.

- [ ] **Step 5: Run the full refund test suite for regressions**

Run: `cd backend && python -m pytest tests/ -k refund -v`
Expected: all PASS — no change to any refund path other than the new addition.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/payment_service.py backend/tests/test_refund_clawback_adjustment.py
git commit -m "feat(finance): record a payout adjustment when refunding an already-paid-out booking"
```

---

### Task 4: On-hold toggle endpoint; delete the dead verify-payout endpoint

**Files:**
- Modify: `backend/app/api/v1/admin_cafe_payouts.py`
- Modify: `backend/app/services/admin_service.py` (or wherever the hold toggle belongs — follow the `suspend_cafe`/`reactivate_cafe` pattern already in that file)
- Test: `backend/tests/test_admin_cafe_payout_hold.py`

**Interfaces:**
- Consumes: `Cafe.payout_on_hold`/`payout_hold_reason` from Task 1.
- Produces: `PATCH /admin/cafe-payouts/{cafe_id}/hold` (body `{"onHold": bool, "reason": str | None}`) → `{"cafeId", "payoutOnHold", "payoutHoldReason"}`. Frontend Task 8 calls this.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_admin_cafe_payout_hold.py`:

```python
import pytest


@pytest.mark.asyncio
async def test_admin_can_hold_and_release_cafe_payouts(async_client, db_session):
    from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "holdtest")
    booking, _payment = await _make_booking_with_payment(db_session, gamer)
    headers = auth_headers(admin, is_admin=True)

    resp = await async_client.patch(
        f"/api/v1/admin/cafe-payouts/{booking.cafe_id}/hold",
        json={"onHold": True, "reason": "Fraud review"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["payoutOnHold"] is True
    assert body["payoutHoldReason"] == "Fraud review"

    resp2 = await async_client.patch(
        f"/api/v1/admin/cafe-payouts/{booking.cafe_id}/hold",
        json={"onHold": False, "reason": None},
        headers=headers,
    )
    assert resp2.json()["data"]["payoutOnHold"] is False
```

(Import `auth_headers` the same way other files in `backend/tests/` import it from `conftest.py` — check an existing test file, e.g. `test_admin_cafe_payouts_api.py`, for the exact import line and copy it.)

Also delete every test in `backend/tests/test_admin_payout_verification.py` if it wasn't already deleted in Task 2 (idempotent — skip if already gone).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_cafe_payout_hold.py -v`
Expected: FAIL with 404 (route doesn't exist yet).

- [ ] **Step 3: Remove the verify-payout endpoint**

In `backend/app/api/v1/admin_cafe_payouts.py`, delete the `PayoutVerifyRequest` class (lines 33-36) and the entire `verify_cafe_payout_destination` function (lines 74-124).

- [ ] **Step 4: Add the hold toggle endpoint**

In the same file, add after the imports:
```python
from app.repositories.cafe_repository import CafeRepository
```
(already imported — confirm, don't duplicate.)

Add near the top with the other request models:
```python
class CafePayoutHoldRequest(BaseModel):
    onHold: bool
    reason: Optional[str] = None
```

Add the endpoint (place it logically near the other cafe_id-scoped routes):
```python
@router.patch("/{cafe_id}/hold", status_code=status.HTTP_200_OK)
async def set_cafe_payout_hold(
    cafe_id: UUID,
    payload: CafePayoutHoldRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    cafe = await CafeRepository(db).get_by_id(cafe_id)
    if not cafe:
        raise NotFoundException("Café not found")

    cafe.payout_on_hold = payload.onHold
    cafe.payout_hold_reason = payload.reason if payload.onHold else None

    db.add(AdminAuditLog(
        id=_uuid.uuid4(),
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="cafe_payout.hold" if payload.onHold else "cafe_payout.release_hold",
        entity_type="cafe",
        entity_id=str(cafe_id),
        entity_name=cafe.name,
        reason=payload.reason,
    ))

    await db.commit()
    await db.refresh(cafe)

    return {
        "success": True,
        "data": {
            "cafeId": str(cafe.id),
            "payoutOnHold": cafe.payout_on_hold,
            "payoutHoldReason": cafe.payout_hold_reason,
        },
    }
```

- [ ] **Step 5: Run test, verify pass**

Run: `cd backend && python -m pytest tests/test_admin_cafe_payout_hold.py -v`
Expected: PASS.

- [ ] **Step 6: Run the full admin_cafe_payouts test suite for regressions**

Run: `cd backend && python -m pytest tests/test_admin_cafe_payouts_api.py -v`
Expected: PASS (nothing in this file touched the deleted verify-payout route).

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/admin_cafe_payouts.py backend/tests/test_admin_cafe_payout_hold.py
git commit -m "feat(finance): add payout hold toggle, remove dead verify-payout endpoint"
```

---

### Task 5: Payout history endpoint response gains destination fields; simplify owner payout summary

**Files:**
- Modify: `backend/app/api/v1/owner.py`
- Modify: `backend/tests/test_owner_payout_summary_bugfix.py` (delete)
- Modify: `backend/tests/test_owner_payout_summary_enriched.py` (delete or rewrite)
- Test: `backend/tests/test_owner_payout_summary_simplified.py`

**Interfaces:**
- Produces: `GET /owner/payouts/summary` now returns `{"outstandingAmount": float, "alreadyPaidOut": float, "account": {...}}` — no `pendingSettlements`/`completedSettlements`/`recentTransactions` fields, no Route-derived data.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_owner_payout_summary_simplified.py`:

```python
import pytest
from decimal import Decimal


@pytest.mark.asyncio
async def test_owner_payout_summary_returns_one_outstanding_number(async_client, db_session):
    from tests.test_admin_v2_features import _make_gamer, _make_booking_with_payment
    from app.models.platform_fee import PlatformFee
    from app.models.cafe import Cafe
    gamer = await _make_gamer(db_session, "summarysimple")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    db_session.add(PlatformFee(booking_id=booking.id, owner_settlement_amount=Decimal("900.00")))
    await db_session.commit()

    cafe = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalar_one()
    from tests.conftest import auth_headers  # match whatever import path other owner tests use
    resp = await async_client.get("/api/v1/owner/payouts/summary", headers=auth_headers_for_owner(cafe.owner_id))
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "pendingSettlements" not in data["summary"]
    assert "completedSettlements" not in data["summary"]
    assert data["summary"]["outstandingAmount"] == 900.00
```

(Note to implementer: use whichever helper the existing `test_owner_payout_summary_enriched.py` used to build owner auth headers before it's deleted — read that file first to copy the exact fixture/import pattern, since `conftest.py`'s `auth_headers` takes a `User` object, not a raw id.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_owner_payout_summary_simplified.py -v`
Expected: FAIL — response still contains `pendingSettlements`/`completedSettlements`.

- [ ] **Step 3: Simplify `get_owner_payout_summary`**

In `backend/app/api/v1/owner.py`, replace the entire body of `get_owner_payout_summary` (lines 1321-1469) with:

```python
@router.get("/payouts/summary", status_code=status.HTTP_200_OK)
async def get_owner_payout_summary(
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    cafe_stmt = select(Cafe).where(Cafe.owner_id == current_owner.id)
    cafes = (await db.execute(cafe_stmt)).scalars().all()
    cafe_ids = [c.id for c in cafes]

    cafe_payout_repo = CafePayoutRepository(db)
    outstanding = Decimal("0")
    for c_id in cafe_ids:
        outstanding += await cafe_payout_repo.get_outstanding_amount(c_id)

    from app.models.cafe_payout import CafePayout, CafePayoutStatus
    already_paid_out_total = 0.0
    if cafe_ids:
        total_paid_out_stmt = select(func.sum(CafePayout.amount)).where(
            CafePayout.cafe_id.in_(cafe_ids), CafePayout.status == CafePayoutStatus.PAID
        )
        already_paid_out_total = float((await db.execute(total_paid_out_stmt)).scalar() or 0)

    stmt_payout = select(OwnerPayoutAccount).where(OwnerPayoutAccount.owner_id == current_owner.id)
    payout_account = (await db.execute(stmt_payout)).scalars().first()

    account_info = None
    if payout_account:
        account_info = {
            "accountHolderName": payout_account.account_holder_name,
            "bankAccountNumberMasked": payout_account.bank_account_number_masked,
            "bankIfsc": payout_account.bank_ifsc,
            "upiVpa": payout_account.upi_vpa,
        }

    payout_on_hold = any(c.payout_on_hold for c in cafes)
    hold_reasons = [c.payout_hold_reason for c in cafes if c.payout_on_hold and c.payout_hold_reason]

    return {
        "success": True,
        "data": {
            "summary": {
                "outstandingAmount": round(float(outstanding), 2),
                "alreadyPaidOut": round(already_paid_out_total, 2),
            },
            "account": account_info,
            "payoutOnHold": payout_on_hold,
            "payoutHoldReason": hold_reasons[0] if hold_reasons else None,
        },
    }
```

Check whether `Decimal`, `CafePayoutRepository` are already imported at the top of `owner.py` (they likely are, given the pre-existing reconciliation code used both) — do not duplicate imports; remove any import that becomes unused after this change (e.g. `Payment`, `PaymentStatus`, `HardwareTier` — check if they're still used elsewhere in the file before removing).

- [ ] **Step 4: Delete the two obsolete test files**

```bash
git rm backend/tests/test_owner_payout_summary_bugfix.py backend/tests/test_owner_payout_summary_enriched.py
```
(Confirmed in research: the refund-exclusion behavior these tested is already independently covered by `test_cafe_payout_repository.py::test_outstanding_amount_excludes_refunded_booking` — no coverage gap.)

- [ ] **Step 5: Run test, verify pass**

Run: `cd backend && python -m pytest tests/test_owner_payout_summary_simplified.py -v`
Expected: PASS.

- [ ] **Step 6: Run the full backend suite for regressions**

Run: `cd backend && python -m pytest tests/ -v 2>&1 | tail -30`
Expected: no new failures beyond the pre-existing, unrelated `httpx`/date-flake failures documented before this plan started (13 files with `AsyncClient(app=...)`, 1 date-rollover test — do not attempt to fix these, they are out of scope).

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/owner.py backend/tests/test_owner_payout_summary_simplified.py
git commit -m "feat(finance): simplify owner payout summary to outstanding + paid-out, drop Route reconciliation"
```

---

### Task 6: Shared `Tooltip` component

**Files:**
- Create: `frontend/src/components/ui/Tooltip.tsx`
- Modify: `frontend/src/components/ui/index.ts`
- Test: manual (see Step 4) — no test framework runs frontend component tests in this repo per current conventions; verify via the `run` skill instead.

**Interfaces:**
- Produces: `<Tooltip content={string | ReactNode}><button>...</button></Tooltip>` — wraps a single child, shows `content` on hover/focus. Used by Tasks 7-9.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/ui/Tooltip.tsx`:

```tsx
'use client';

import { useState, useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <span aria-describedby={visible ? id : undefined}>{children}</span>
      {visible && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-xs -translate-x-1/2 rounded-lg',
            'bg-secondary px-2.5 py-1.5 text-xs font-medium text-white shadow-lg',
            className,
          )}
        >
          {content}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-secondary" />
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Export from the barrel file**

In `frontend/src/components/ui/index.ts`, add `export { Tooltip } from './Tooltip';` alongside the other exports (match the file's existing export style — check whether it uses `export * from` or named re-exports before picking one).

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Verify visually**

Use the `run` skill to start the frontend dev server and view any page using `Tooltip` once Task 7 wires it in — defer full visual verification to the end of Task 7's steps rather than doing it standalone here, since there's no page consuming it yet.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/Tooltip.tsx frontend/src/components/ui/index.ts
git commit -m "feat(ui): add shared Tooltip component"
```

---

### Task 7: Frontend API client updates (admin + owner)

**Files:**
- Modify: `frontend/src/lib/api/admin.ts`
- Modify: `frontend/src/lib/api/owner.ts`

**Interfaces:**
- Consumes: backend response shapes from Tasks 2, 4, 5.
- Produces: `setCafePayoutHold(cafeId, onHold, reason)`, updated `AdminOutstandingCafePayout` type, updated `getOwnerPayoutSummary` return type. Consumed by Tasks 8-9.

- [ ] **Step 1: Update `admin.ts`**

In `frontend/src/lib/api/admin.ts`:

Delete `verifyCafePayoutDestination`, `listOwnerPayouts`, and the `AdminOwnerPayout` interface entirely (dead Route-era KYC flow).

Replace the `AdminOutstandingCafePayout` interface:
```ts
export interface AdminOutstandingCafePayout {
  cafeId: string;
  cafeName: string;
  outstandingAmount: number;
  payoutDestinationSubmitted: boolean;
  upiVpa: string | null;
  payoutOnHold: boolean;
  payoutHoldReason: string | null;
}
```

Add the hold-toggle function, placed near the other café-payout functions:
```ts
export async function setCafePayoutHold(
  cafeId: string,
  onHold: boolean,
  reason?: string,
): Promise<{ cafeId: string; payoutOnHold: boolean; payoutHoldReason: string | null }> {
  return call(() => apiClient.patch(`/api/v1/admin/cafe-payouts/${cafeId}/hold`, { onHold, reason }));
}
```

`listCafePayoutHistory` stays as-is (already correct, already unused by any page — Task 8 wires it up).

- [ ] **Step 2: Update `owner.ts`**

Replace the untyped `getOwnerPayoutSummary` with a typed version matching Task 5's new response shape:
```ts
export interface OwnerPayoutSummary {
  summary: { outstandingAmount: number; alreadyPaidOut: number };
  account: { accountHolderName: string | null; bankAccountNumberMasked: string | null; bankIfsc: string | null; upiVpa: string | null } | null;
  payoutOnHold: boolean;
  payoutHoldReason: string | null;
}

export async function getOwnerPayoutSummary(): Promise<OwnerPayoutSummary> {
  return call(() => apiClient.get('/api/v1/owner/payouts/summary'));
}
```

`getOwnerCafePayouts` and `OwnerCafePayoutHistoryItem` stay as-is (already correct per research — `GET /owner/payouts/cafe-payouts` needs no backend change).

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors will surface in `admin/payouts/page.tsx`, `admin/cafe-payouts/page.tsx`, `admin/verification-queue/page.tsx`, and `owner/payouts/page.tsx` — these are expected and fixed in Tasks 8-9. Confirm no *other* files reference the deleted exports (`AdminOwnerPayout`, `listOwnerPayouts`, `verifyCafePayoutDestination`, `KycStatusBadge`) — `grep -rn "AdminOwnerPayout\|listOwnerPayouts\|verifyCafePayoutDestination" frontend/src` should only show the pages fixed in the next tasks.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api/admin.ts frontend/src/lib/api/owner.ts
git commit -m "feat(finance): update admin/owner API clients for hold toggle and simplified summary"
```

(This task will leave the build red until Task 8 lands — that's expected for an API-client-first step; do not skip committing, the next task's diff will be smaller and clearer against this base.)

---

### Task 8: Merge admin Café Payouts page (owed + pay + hold + history), delete the Owner Payouts (KYC) page

**Files:**
- Modify: `frontend/src/app/(admin)/admin/cafe-payouts/page.tsx`
- Delete: `frontend/src/app/(admin)/admin/payouts/page.tsx`
- Modify: `frontend/src/app/(admin)/admin/verification-queue/page.tsx` (remove the ₹1 test-transfer UI block)
- Modify: `frontend/src/components/ui/Badge.tsx` (remove `KycStatusBadge` — dead code after the KYC page is deleted)
- Modify: any admin nav/sidebar file linking to `/admin/payouts` (find via grep)

**Interfaces:**
- Consumes: `AdminOutstandingCafePayout`, `setCafePayoutHold`, `listCafePayoutHistory` from Task 7.

- [ ] **Step 1: Remove the verify-payout UI from the verification queue**

In `frontend/src/app/(admin)/admin/verification-queue/page.tsx`, remove the `verifyPayoutMutation` (lines 119-127ish) and the entire "Send a ₹1 test transfer..." block (lines ~446-478, bounded by `{selectedCafe?.upiVpa && selectedCafe?.payoutVerificationStatus !== 'verified' && (...)}`). Keep the plain UPI ID / bank IFSC display above it (lines 429-444) — that's still useful, just drop the verify action and the "Verified/Unverified" badge language in favor of nothing (the payout page, not this page, is now where destination status is surfaced).

- [ ] **Step 2: Delete the Owner Payouts (KYC) page**

```bash
git rm frontend/src/app/(admin)/admin/payouts/page.tsx
```

- [ ] **Step 3: Find and fix nav links**

Run: `grep -rn "admin/payouts" frontend/src --include=*.tsx -l`
For each match (excluding `cafe-payouts` paths), remove or repoint the link to `/admin/cafe-payouts`.

- [ ] **Step 4: Remove `KycStatusBadge`**

In `frontend/src/components/ui/Badge.tsx`, delete the `KYC_CONFIG` const, `KycStatusBadgeProps` interface, `KycStatusBadge` function, and its named export. Remove `KycStatus` from the `import type` line at the top if nothing else in the file uses it. Grep for any other importer: `grep -rn "KycStatusBadge" frontend/src` — fix/remove those too (expected: only the deleted payouts page used it).

- [ ] **Step 5: Rewrite `cafe-payouts/page.tsx`**

Read the current full file (already read once above — 273 lines) before editing, then rewrite it to add: (a) the "Owed now" language stays, (b) a tooltip on the UPI/bank display, (c) an On Hold toggle per café, (d) a Payout History section below the outstanding list, (e) drop the `payoutVerificationStatus !== 'verified'` disable condition on the Pay button.

Key diffs against the current file:

Replace the disabled-condition and warning block (lines 248-266):
```tsx
              {selectedCafe.payoutOnHold && (
                <p className="text-xs text-error">
                  Payouts to this café are on hold: {selectedCafe.payoutHoldReason || 'no reason given'}.
                </p>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-secondary">
                  Paying to: <span className="font-mono text-text-primary">{selectedCafe.upiVpa || 'no UPI ID on file'}</span>
                </span>
                <Tooltip content="Submitted by the owner — KHEL-O cannot independently verify a UPI ID. Double-check this looks right before sending money.">
                  <Info className="h-3.5 w-3.5 text-text-tertiary cursor-help" />
                </Tooltip>
              </div>
              <Button
                variant="primary"
                disabled={
                  !utrReference.trim() ||
                  !proofImageUrl ||
                  isUploadingProof ||
                  createMutation.isPending ||
                  !selectedCafe.payoutDestinationSubmitted ||
                  selectedCafe.payoutOnHold
                }
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Recording…' : `Mark ₹${selectedCafe.outstandingAmount.toFixed(2)} as Paid`}
              </Button>
```

Add `Info` to the lucide-react import line, and `Tooltip` to the `@/components/ui` import line.

Replace the `Unverified` badge in the list row (lines 135-137):
```tsx
                  {!c.payoutDestinationSubmitted && (
                    <Badge variant="warning" size="sm">No payout details yet</Badge>
                  )}
                  {c.payoutOnHold && (
                    <Badge variant="error" size="sm">On hold</Badge>
                  )}
```

Add an On Hold toggle button in the modal header area (near the café title, inside the `selectedCafeId && selectedCafe` block, before the "Outstanding" div):
```tsx
            <HoldToggle cafe={selectedCafe} onChanged={() => refetch()} />
```

Add a small local component in the same file, above the default export:
```tsx
function HoldToggle({ cafe, onChanged }: { cafe: AdminOutstandingCafePayout; onChanged: () => void }) {
  const [reason, setReason] = useState('');
  const [showReasonInput, setShowReasonInput] = useState(false);
  const holdMutation = useMutation({
    mutationFn: (vars: { onHold: boolean; reason?: string }) =>
      setCafePayoutHold(cafe.cafeId, vars.onHold, vars.reason),
    onSuccess: () => { onChanged(); setShowReasonInput(false); setReason(''); },
  });

  if (cafe.payoutOnHold) {
    return (
      <Button variant="secondary" size="sm" isLoading={holdMutation.isPending} onClick={() => holdMutation.mutate({ onHold: false })}>
        Release hold
      </Button>
    );
  }
  if (showReasonInput) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for hold"
          className="h-8 px-2 rounded-lg border border-border bg-surface text-xs"
        />
        <Button variant="destructive" size="sm" disabled={!reason.trim()} isLoading={holdMutation.isPending} onClick={() => holdMutation.mutate({ onHold: true, reason })}>
          Confirm hold
        </Button>
      </div>
    );
  }
  return (
    <Button variant="ghost" size="sm" onClick={() => setShowReasonInput(true)}>
      Put on hold
    </Button>
  );
}
```

Add `import { setCafePayoutHold } from '@/lib/api/admin';` and `import { useState } from 'react';` (likely already imported — check before duplicating).

Add a Payout History section as a new `Card` after the outstanding-list section, fetching via `listCafePayoutHistory`:
```tsx
      <Card elevation="raised" className="bg-surface border border-border">
        <CardContent className="p-6 flex flex-col gap-4">
          <h2 className="font-heading text-h2 text-text-primary">Payout history</h2>
          <PayoutHistoryTable />
        </CardContent>
      </Card>
```

And the supporting component + import (`listCafePayoutHistory`, `CafePayout` type):
```tsx
function PayoutHistoryTable() {
  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.admin.all, 'cafe-payouts', 'history'],
    queryFn: () => listCafePayoutHistory({ limit: 50 }),
  });
  if (isLoading) return <SkeletonCard />;
  const items = data?.items ?? [];
  if (items.length === 0) return <EmptyState title="No payouts recorded yet" description="Every payout you record will show up here with its proof." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border text-caption text-text-secondary">
            <th className="py-2 px-3 font-semibold">Date</th>
            <th className="py-2 px-3 font-semibold">Amount</th>
            <th className="py-2 px-3 font-semibold">Method</th>
            <th className="py-2 px-3 font-semibold">UTR</th>
            <th className="py-2 px-3 font-semibold">Status</th>
            <th className="py-2 px-3 font-semibold">Proof</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-caption">
          {items.map((p) => (
            <tr key={p.id}>
              <td className="py-2.5 px-3 text-text-secondary">{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : '—'}</td>
              <td className="py-2.5 px-3 font-bold text-text-primary">₹{p.amount.toFixed(2)}</td>
              <td className="py-2.5 px-3 uppercase text-text-secondary">{p.paymentMethod}</td>
              <td className="py-2.5 px-3 font-mono text-xs">{p.utrReference}</td>
              <td className="py-2.5 px-3">{p.status}</td>
              <td className="py-2.5 px-3">
                {p.proofImageUrl ? <a href={p.proofImageUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">View</a> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```
Add `import { listCafePayoutHistory } from '@/lib/api/admin';`.

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify in the browser**

Use the `run` skill: start the frontend dev server, log in as an admin, navigate to `/admin/cafe-payouts`. Confirm: outstanding list renders with UPI ID + tooltip, "Put on hold" flow works end-to-end (toggle, confirm reason, badge appears, Pay button now shows the hold message and stays disabled), "Release hold" clears it, Payout History section renders (may be empty on fresh data — that's fine, confirm the empty state renders correctly). Screenshot the outstanding list and the history section.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(admin\)/admin/cafe-payouts/page.tsx frontend/src/app/\(admin\)/admin/verification-queue/page.tsx frontend/src/components/ui/Badge.tsx
git rm frontend/src/app/\(admin\)/admin/payouts/page.tsx
git add -u
git commit -m "feat(finance): merge admin payout pages into one, add hold toggle and payout history"
```

---

### Task 9: Simplify owner Payouts page

**Files:**
- Modify: `frontend/src/app/(owner)/owner/payouts/page.tsx`

**Interfaces:**
- Consumes: `OwnerPayoutSummary`, `getOwnerCafePayouts` from Task 7.

- [ ] **Step 1: Rewrite the page**

Read the current full file (already read above — 421 lines) before editing. Remove: the entire "Booking payments" Route-driven table (lines 249-306), `statusBadge` function (lines 55-60), the `PayoutTransaction`/`transactions`/`selectedTx` state and the Fee Breakdown modal (lines 375-418), the `isVerified`/`ShieldCheck`/`ShieldAlert` verification badge in the header (lines 141-152), and the "Earnings vs payouts" `OwnerStatRow` block's "Pending" row (line 212, since "pending" now IS the "owed now" figure already shown above it — keep "Already paid" and "Revenue generated"/"KHELO fee"/"Net earnings", drop the duplicate "Pending").

Replace the header action badge (lines 141-152) with a hold banner shown only when relevant:
```tsx
      <OwnerPageHeader
        title="Payouts"
        description="What customers paid, what KHEL-O kept, and what has reached your bank."
      />
      {payoutOnHold && (
        <Card elevation="resting" className="border border-error/30 bg-error/5">
          <CardContent className="p-4 text-caption text-error">
            Payouts to your café are currently on hold: {payoutHoldReason || 'contact KHEL-O support for details.'}
          </CardContent>
        </Card>
      )}
```

Replace the five-question summary card's "Currently owed"/"When it arrives" rows — drop "When it arrives" (no fixed schedule exists in a manual system; don't claim one) and add a tooltip on "Currently owed":
```tsx
            <div className="flex justify-between sm:block">
              <span className="text-text-secondary">Currently owed:</span>{' '}
              <Tooltip content="Every captured booking KHEL-O hasn't paid out to you yet, minus any refund adjustments.">
                <span className="font-bold text-amber-700 cursor-help underline decoration-dotted">₹{outstandingAmount.toFixed(0)}</span>
              </Tooltip>
            </div>
```
Remove the "When it arrives" row entirely (was line 172-175).

Update the data loading: replace the two `useEffect`s (lines 96-123) and their backing state with two `useQuery` calls using `getOwnerPayoutSummary()` and `getOwnerCafePayouts()`, matching the pattern already used elsewhere in this codebase (`useQuery` + `queryKeys.admin.all`-style key — for the owner side, check `queryKeys` for an owner-scoped key or add `queryKeys.owner.payouts` if none exists; grep `frontend/src/hooks/queries/keys.ts` first for the existing convention rather than inventing a new naming scheme).

Update `account`/`outstandingAmount`/`payoutOnHold`/`payoutHoldReason`/`payoutHistory` to come from those two queries' `data` instead of local state.

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify in the browser**

Use the `run` skill: log in as a café owner, navigate to `/owner/payouts`. Confirm: single "Currently owed" figure with tooltip, "Already paid" figure, bank account details card, Bank transfers history table — no Route/"Booking payments" table, no verification badge. If the test data has a café on hold, confirm the hold banner renders (otherwise confirm it doesn't render when not on hold).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(owner\)/owner/payouts/page.tsx
git commit -m "feat(finance): simplify owner payouts page to one owed figure and one payout history list"
```

---

### Task 10: Suspension bug fixes — matching validation + visible errors

**Files:**
- Modify: `frontend/src/app/(admin)/admin/cafes/page.tsx`
- Test: manual verification via `run` skill (no existing frontend test harness for this page)

**Interfaces:** none new — bug fix only.

- [ ] **Step 1: Reproduce the bug**

Use the `run` skill: log in as admin, go to `/admin/cafes`, open Suspend on a verified café, type a 5-character reason, click Confirm. Confirm: button briefly shows "Suspending…" then reverts, modal stays open, nothing visible happens (reproducing the reported bug from a 422).

- [ ] **Step 2: Fix client-side validation to match the backend's 10-char minimum**

In `frontend/src/app/(admin)/admin/cafes/page.tsx`, replace the `disabled={!suspendReason.trim()}` check on the Confirm button (line 404) with `disabled={suspendReason.trim().length < 10}`.

Add a live character-count hint below the `Textarea` (after line 423, inside the Suspend Modal):
```tsx
        <p className={`text-xs mt-1 ${suspendReason.trim().length < 10 ? 'text-text-tertiary' : 'text-emerald-600'}`}>
          Minimum 10 characters — {suspendReason.trim().length}/10
        </p>
```

- [ ] **Step 3: Surface mutation errors**

Add an `onError` handler to `suspendMutation` (lines 104-113):
```tsx
  const [suspendError, setSuspendError] = useState<string | null>(null);

  const suspendMutation = useMutation({
    mutationFn: ({ cafeId, reason }: { cafeId: string; reason: string }) =>
      suspendCafe(cafeId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      setIsSuspendModalOpen(false);
      setSelectedCafe(null);
      setSuspendReason('');
      setSuspendError(null);
    },
    onError: (err) => {
      setSuspendError((err as Error)?.message ?? 'Failed to suspend café. Please try again.');
    },
  });
```

Reset `suspendError` to `null` when the modal closes/cancels (in the `onClose`/Cancel handlers, lines 392 and 397) and display it in the modal body, above the `Textarea`:
```tsx
        {suspendError && (
          <p className="text-xs text-error mb-2">{suspendError}</p>
        )}
```

- [ ] **Step 4: Verify the fix**

Use the `run` skill: repeat Step 1's reproduction. Confirm: with a <10-char reason, the Confirm button is disabled and the counter shows red/pending state; typing 10+ characters enables it; submitting a reason the backend still rejects for some other reason now shows a visible error message instead of silently reverting.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(admin\)/admin/cafes/page.tsx
git commit -m "fix(admin): match suspension reason min-length client-side, surface mutation errors"
```

---

### Task 11: Suspension email notification

**Files:**
- Modify: `backend/app/services/notification_service.py`
- Modify: `backend/app/api/v1/admin.py`
- Test: `backend/tests/test_suspension_notification.py`

**Interfaces:**
- Produces: `NotificationService.send_cafe_suspended(db, cafe_id, reason) -> bool`. Called from the `suspend_cafe` endpoint only after `AdminService.suspend_cafe` and `write_audit_log` both succeed.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_suspension_notification.py`:

```python
import pytest
from unittest.mock import patch, AsyncMock


@pytest.mark.asyncio
async def test_suspend_cafe_sends_owner_notification_only_on_success(async_client, db_session):
    from tests.test_admin_v2_features import _make_admin
    admin = await _make_admin(db_session)
    from app.models.user import User
    from app.models.cafe import Cafe, VerificationStatus
    owner = User(email="owner_suspend@test.com", full_name="Owner Test", hashed_password="x", is_active=True)
    db_session.add(owner)
    await db_session.flush()
    cafe = Cafe(
        owner_id=owner.id, name="Test Cafe", address_line1="1 Main St", city="City",
        state="State", pincode="123456", phone_number="9999999999",
        verification_status=VerificationStatus.VERIFIED,
    )
    db_session.add(cafe)
    await db_session.commit()

    from tests.conftest import auth_headers
    headers = auth_headers(admin, is_admin=True)

    with patch("app.services.notification_service.NotificationService.send_cafe_suspended", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = True
        resp = await async_client.patch(
            f"/api/v1/admin/cafes/{cafe.id}/suspend",
            json={"reason": "Multiple verified fraud complaints from customers"},
            headers=headers,
        )
        assert resp.status_code == 200
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args
        assert str(cafe.id) in str(call_kwargs)


@pytest.mark.asyncio
async def test_suspend_cafe_does_not_notify_on_not_found(async_client, db_session):
    from tests.test_admin_v2_features import _make_admin
    import uuid
    admin = await _make_admin(db_session)
    from tests.conftest import auth_headers
    headers = auth_headers(admin, is_admin=True)

    with patch("app.services.notification_service.NotificationService.send_cafe_suspended", new_callable=AsyncMock) as mock_send:
        resp = await async_client.patch(
            f"/api/v1/admin/cafes/{uuid.uuid4()}/suspend",
            json={"reason": "Multiple verified fraud complaints from customers"},
            headers=headers,
        )
        assert resp.status_code == 404
        mock_send.assert_not_called()
```

(Confirm the exact import path for `auth_headers` and the `Cafe`/`User` required-field list by reading `test_admin_v2_features.py::_make_admin` and any existing café-creation helper before finalizing — the fields above are copied from the `Cafe` model at `backend/app/models/cafe.py:18-69`, but a helper may already exist and should be reused instead of hand-rolling café creation here if one does.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_suspension_notification.py -v`
Expected: FAIL — `send_cafe_suspended` doesn't exist yet.

- [ ] **Step 3: Add `send_cafe_suspended` to `NotificationService`**

In `backend/app/services/notification_service.py`, add a new method following the exact pattern of `send_refund_confirmation` (lines 202-218):

```python
    async def send_cafe_suspended(self, db: AsyncSession, cafe_id: UUID, reason: str) -> bool:
        try:
            stmt = select(Cafe, User).join(User, Cafe.owner_id == User.id).where(Cafe.id == cafe_id)
            res = await db.execute(stmt)
            row = res.first()
            if not row:
                return False
            cafe, owner = row[0], row[1]
            subject = f"Your café has been suspended on KHEL-O — {cafe.name}"
            html_body = _email_wrapper(f"""
                <h2 style="margin-top: 0; color: {_BRAND_TEXT_PRIMARY};">Your café has been suspended</h2>
                <p><strong>{cafe.name}</strong> has been suspended from KHEL-O and is no longer visible to gamers.</p>
                <p><strong>Reason:</strong> {reason}</p>
                <p style="color: {_BRAND_TEXT_SECONDARY};">If you believe this was done in error, please contact KHEL-O support.</p>
            """)
            return await self._send_resend_email(owner.email, subject, html_body, f"SUSPEND-{cafe.name}")
        except Exception as e:
            logger.error("send_cafe_suspended_error", error=str(e), cafe_id=str(cafe_id))
            return False
```

- [ ] **Step 4: Call it from the suspend endpoint, after the audit log succeeds**

In `backend/app/api/v1/admin.py`, in `suspend_cafe` (lines 642-666), add the notification call after `write_audit_log`:

```python
    await service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="cafe.suspend",
        entity_type="cafe",
        entity_id=str(cafe_id),
        reason=payload.reason,
    )
    from app.services.notification_service import NotificationService
    await NotificationService().send_cafe_suspended(db, cafe_id, payload.reason)
    return {"success": True, "data": result}
```

(This ordering means a suspension that succeeds but whose audit-log write fails will not send an email — matches the constraint "only after suspend AND audit log both succeed." If `write_audit_log` can raise, this is already correct since the email call is unreachable on that path. Confirm `write_audit_log` doesn't swallow its own exceptions silently before relying on this — read it once if uncertain.)

- [ ] **Step 5: Run tests, verify pass**

Run: `cd backend && python -m pytest tests/test_suspension_notification.py -v`
Expected: PASS.

- [ ] **Step 6: Run the full suspension-related test suite for regressions**

Run: `cd backend && python -m pytest tests/ -k "suspend" -v`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/notification_service.py backend/app/api/v1/admin.py backend/tests/test_suspension_notification.py
git commit -m "feat(admin): notify cafe owner by email after a successful suspension"
```

---

### Task 12: Cafe list — open cafés first

**Files:**
- Modify: `backend/app/repositories/cafe_repository.py`
- Test: `backend/tests/test_cafe_list_open_first_sort.py`

**Interfaces:** none new — internal sort change only.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_cafe_list_open_first_sort.py`:

```python
import pytest
from datetime import time
from app.repositories.cafe_repository import CafeRepository


@pytest.mark.asyncio
async def test_admin_cafe_list_sorts_open_cafes_first(db_session):
    from app.models.cafe import Cafe, VerificationStatus
    from app.models.user import User
    import uuid

    owner = User(email=f"sortowner{uuid.uuid4().hex[:6]}@test.com", full_name="Owner", hashed_password="x", is_active=True)
    db_session.add(owner)
    await db_session.flush()

    # Closed café created most recently — would sort first under created_at-only ordering
    closed_cafe = Cafe(
        owner_id=owner.id, name="Closed Cafe", address_line1="1 St", city="C", state="S",
        pincode="123456", phone_number="9999999999", verification_status=VerificationStatus.VERIFIED,
        opening_time=time(9, 0), closing_time=time(11, 0),  # closed at most times of day
    )
    # Open café created earlier
    open_cafe = Cafe(
        owner_id=owner.id, name="Open Cafe", address_line1="2 St", city="C", state="S",
        pincode="123456", phone_number="9999999999", verification_status=VerificationStatus.VERIFIED,
        opening_time=time(0, 0), closing_time=time(23, 59),  # always open
    )
    db_session.add(closed_cafe)
    await db_session.flush()
    db_session.add(open_cafe)
    await db_session.commit()

    repo = CafeRepository(db_session)
    result = await repo.list_for_admin(limit=50)
    names = [c.name for c in result["items"]] if isinstance(result, dict) else [c.name for c in result]
    assert names.index("Open Cafe") < names.index("Closed Cafe")
```

(Note to implementer: read `cafe_repository.py` in full before writing this test to confirm the exact method name and return shape at lines 40-50/125-135 — the research digest confirmed two `order_by(Cafe.created_at.desc())` call sites in this file but did not name the enclosing methods; use whichever method the admin café list endpoint actually calls, found via `grep -n "def " backend/app/repositories/cafe_repository.py` and cross-referencing `admin.py`'s café-list route.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_cafe_list_open_first_sort.py -v`
Expected: FAIL — closed café sorts first (more recently created).

- [ ] **Step 3: Add the open-first sort**

In `backend/app/repositories/cafe_repository.py`, at both call sites currently reading `stmt = stmt.order_by(Cafe.created_at.desc())` (confirmed at lines 47 and 131), replace with a computed "is open now" case expression sorted first. SQLAlchemy/Postgres approach using current time comparison:

```python
from sqlalchemy import case, func

...

        now_time = func.current_time()
        is_open_now = case(
            (
                (Cafe.opening_time.is_not(None)) & (Cafe.closing_time.is_not(None)) &
                (Cafe.opening_time <= now_time) & (now_time < Cafe.closing_time),
                0,
            ),
            else_=1,
        )
        stmt = stmt.order_by(is_open_now, Cafe.created_at.desc())
```

Apply this replacement at both of the two existing `order_by(Cafe.created_at.desc())` call sites (confirm both are on the admin-facing query paths, not the public customer search — the design intentionally scopes this to Super Admin's café list per the original request; if either call site turns out to serve the public search instead, leave that one untouched and only change the admin-facing one).

Note: `func.current_time()` returns the DB server's UTC time as a `TIME` value; this compares correctly against `Cafe.opening_time`/`closing_time` (stored as plain `Time`, no timezone) only if the café's hours are intended as UTC — confirm this matches existing usage elsewhere in the codebase (e.g. `is_emergency_mode` or any other "is currently open" check) before assuming; if the codebase has an existing café-local-time helper, use that instead of `func.current_time()` directly.

- [ ] **Step 4: Run test, verify pass**

Run: `cd backend && python -m pytest tests/test_cafe_list_open_first_sort.py -v`
Expected: PASS. (If it's flaky depending on wall-clock time due to the fixture's fixed hours, adjust the fixture's `opening_time`/`closing_time` to be relative to `datetime.now(timezone.utc).time()` rather than fixed values, so the test is deterministic regardless of when it runs.)

- [ ] **Step 5: Run the full cafe_repository test suite for regressions**

Run: `cd backend && python -m pytest tests/ -k cafe_repository -v`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/repositories/cafe_repository.py backend/tests/test_cafe_list_open_first_sort.py
git commit -m "feat(admin): sort cafe list with currently-open cafes first"
```

---

## Final Verification

- [ ] Run the full backend suite once more: `cd backend && python -m pytest tests/ -v 2>&1 | tail -40` — confirm pass count only decreased by the number of deleted obsolete tests (verify-payout: 4, summary bugfix/enriched: expect ~3) and increased by new tests added across all 12 tasks; no unexplained new failures.
- [ ] Run `cd frontend && npx tsc --noEmit` — zero errors.
- [ ] Use the `run` skill for one final end-to-end walkthrough: as admin, view `/admin/cafe-payouts`, pay a café, put another on hold; as owner, view `/owner/payouts` and confirm the paid café's outstanding dropped and the on-hold café shows the reason; as admin, suspend a café with a 15-character reason and confirm a success toast/close (email send will no-op without `RESEND_API_KEY` configured locally — confirm no exception is raised, not that an email actually arrives).
