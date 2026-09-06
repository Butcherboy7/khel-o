# Manual Café Payouts (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins see each café's outstanding payable balance and mark it paid via manual bank transfer (with UTR reference), and let café owners see that balance and their payout history — without touching the existing booking/payment/Route code path.

**Architecture:** Two new tables (`CafePayout`, `CafePayoutItem`) sit on top of the existing `PlatformFee` table. A single repository (`CafePayoutRepository`) owns the "what's outstanding" query so it's computed identically everywhere — new endpoints, and two existing endpoints that already show a settlement number but currently have a bug (they don't exclude refunded bookings). A payout is created as one atomic transaction: compute outstanding fee rows, insert the payout + one item per fee row, write an audit log entry.

**Tech Stack:** FastAPI, SQLAlchemy (async), Alembic, pytest + httpx (backend); Next.js App Router, TanStack Query, Tailwind (frontend).

**Spec:** `docs/superpowers/specs/2026-09-07-manual-cafe-payouts-design.md`

## Global Constraints

- Money arithmetic in new code uses `Decimal`, never raw `float` comparison, even though underlying columns remain `Numeric`/float-mapped (spec section "Edge cases").
- `CafePayout.amount` is always server-computed from the outstanding query — never accepted from the client request body (spec: overpay prevention "by construction").
- No changes to `Booking`, `Payment`, or `PlatformFee` schemas, and no changes to the existing Razorpay webhook/Route transfer code path.
- All admin payout endpoints require the existing `require_admin` dependency; all owner endpoints require the existing `require_cafe_owner` (or ownership-scoped) dependency — no new authorization concept.
- Response envelope for every new/modified endpoint: `{"success": true, "data": {...}}`, camelCase keys — matches every existing endpoint in `owner.py`/`admin.py`/`owner_payouts.py`.
- Every admin payout-creation action writes one `AdminAuditLog` row via the existing `AdminService.write_audit_log` pattern (`app/services/admin_service.py:616`).

---

### Task 1: `CafePayout` / `CafePayoutItem` models + migration

**Files:**
- Create: `backend/app/models/cafe_payout.py`
- Create: `backend/app/models/cafe_payout_item.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/migrations/versions/020_add_cafe_payouts.py`
- Test: `backend/tests/test_cafe_payout_models.py`

**Interfaces:**
- Produces: `CafePayout` (id, cafe_id, amount, utr_reference, payment_method, status, notes, created_by_admin_id, paid_at, created_at), `CafePayoutStatus` enum (`PENDING`, `PROCESSING`, `PAID`, `FAILED`, `CANCELLED`), `CafePayoutItem` (id, payout_id, platform_fee_id [unique], booking_id, amount_allocated). Both importable from `app.models.cafe_payout` / `app.models.cafe_payout_item`.

- [ ] **Step 1: Write the model files**

`backend/app/models/cafe_payout.py`:
```python
import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CafePayoutStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    PAID = "paid"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CafePayout(Base):
    """One manual bank-transfer payout to a café, covering every currently
    outstanding PlatformFee row at creation time. See CafePayoutItem for the
    per-booking breakdown this payout covers."""
    __tablename__ = "cafe_payouts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    cafe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cafes.id"), nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    utr_reference: Mapped[str] = mapped_column(String(100), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[CafePayoutStatus] = mapped_column(
        Enum(CafePayoutStatus, values_callable=lambda x: [e.value for e in x]),
        default=CafePayoutStatus.PAID,
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_admin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
```

`backend/app/models/cafe_payout_item.py`:
```python
import uuid
from sqlalchemy import ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CafePayoutItem(Base):
    """Links a CafePayout to the specific PlatformFee rows it covers. The
    unique constraint on platform_fee_id is what permanently excludes a
    booking's settlement from ever being paid out twice."""
    __tablename__ = "cafe_payout_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    payout_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cafe_payouts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    platform_fee_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("platform_fees.id"), nullable=False, unique=True, index=True
    )
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    amount_allocated: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
```

- [ ] **Step 2: Register models in `app/models/__init__.py`**

Add alongside the existing `PlatformFee` import (follow the file's existing alphabetized-by-domain grouping):
```python
from app.models.cafe_payout import CafePayout, CafePayoutStatus
from app.models.cafe_payout_item import CafePayoutItem
```
And add `"CafePayout"`, `"CafePayoutStatus"`, `"CafePayoutItem"` to the `__all__` list in that file.

- [ ] **Step 3: Write the migration**

`backend/migrations/versions/020_add_cafe_payouts.py` — check `backend/migrations/versions/019_add_analytics_foundation.py` for the exact `down_revision` value to use as this migration's `down_revision` (should be `'019'` or that file's `revision` string), then:
```python
"""add cafe_payouts and cafe_payout_items

Revision ID: 020
Revises: 019
Create Date: 2026-09-07
"""
from alembic import op
import sqlalchemy as sa

revision = '020'
down_revision = '019'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'cafe_payouts',
        sa.Column('id', sa.CHAR(32), primary_key=True),
        sa.Column('cafe_id', sa.CHAR(32), sa.ForeignKey('cafes.id'), nullable=False),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('utr_reference', sa.String(100), nullable=False),
        sa.Column('payment_method', sa.String(50), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='paid'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by_admin_id', sa.CHAR(32), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_cafe_payouts_cafe_id', 'cafe_payouts', ['cafe_id'])

    op.create_table(
        'cafe_payout_items',
        sa.Column('id', sa.CHAR(32), primary_key=True),
        sa.Column('payout_id', sa.CHAR(32), sa.ForeignKey('cafe_payouts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('platform_fee_id', sa.CHAR(32), sa.ForeignKey('platform_fees.id'), nullable=False, unique=True),
        sa.Column('booking_id', sa.CHAR(32), sa.ForeignKey('bookings.id'), nullable=False),
        sa.Column('amount_allocated', sa.Numeric(10, 2), nullable=False),
    )
    op.create_index('ix_cafe_payout_items_payout_id', 'cafe_payout_items', ['payout_id'])
    op.create_index('ix_cafe_payout_items_platform_fee_id', 'cafe_payout_items', ['platform_fee_id'], unique=True)


def downgrade():
    op.drop_table('cafe_payout_items')
    op.drop_table('cafe_payouts')
```
Open `019_add_analytics_foundation.py` first and confirm its `revision` value matches `'019'` — use the actual string found there for `down_revision` if it differs.

- [ ] **Step 4: Run the migration against the local dev DB**

Run: `cd backend && python -m alembic upgrade head`
Expected: `Running upgrade 019 -> 020, add cafe_payouts and cafe_payout_items` with no errors.

- [ ] **Step 5: Write and run a model smoke test**

```python
# backend/tests/test_cafe_payout_models.py
import pytest
from uuid import uuid4
from datetime import date, time, timedelta

from app.models.cafe_payout import CafePayout, CafePayoutStatus
from app.models.cafe_payout_item import CafePayoutItem
from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment


@pytest.mark.asyncio
async def test_cafe_payout_and_item_roundtrip(db_session):
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "payout_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)

    from app.models.platform_fee import PlatformFee
    fee = PlatformFee(
        id=uuid4(), booking_id=booking.id, convenience_fee=5.0, gateway_fee=5.0,
        tds_amount=0.0, owner_settlement_amount=95.0,
    )
    db_session.add(fee)
    await db_session.commit()

    payout = CafePayout(
        id=uuid4(), cafe_id=booking.cafe_id, amount=95.0, utr_reference="UTR123",
        payment_method="neft", status=CafePayoutStatus.PAID, created_by_admin_id=admin.id,
    )
    db_session.add(payout)
    await db_session.flush()

    item = CafePayoutItem(
        id=uuid4(), payout_id=payout.id, platform_fee_id=fee.id,
        booking_id=booking.id, amount_allocated=95.0,
    )
    db_session.add(item)
    await db_session.commit()

    assert payout.status == CafePayoutStatus.PAID
    assert item.amount_allocated == 95.0
```

Run: `cd backend && pytest tests/test_cafe_payout_models.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/cafe_payout.py backend/app/models/cafe_payout_item.py backend/app/models/__init__.py backend/migrations/versions/020_add_cafe_payouts.py backend/tests/test_cafe_payout_models.py
git commit -m "feat(payouts): add CafePayout/CafePayoutItem models and migration"
```

---

### Task 2: `CafePayoutRepository` — outstanding balance calculation

**Files:**
- Create: `backend/app/repositories/cafe_payout_repository.py`
- Test: `backend/tests/test_cafe_payout_repository.py`

**Interfaces:**
- Consumes: `CafePayout`, `CafePayoutItem` (Task 1); `PlatformFee` (`app.models.platform_fee`); `Payment`, `PaymentStatus` (`app.models.payment`); `Booking` (`app.models.booking`); `Cafe` (`app.models.cafe`).
- Produces: `CafePayoutRepository(db)` with `async def get_outstanding_fee_rows(self, cafe_id: UUID) -> list[tuple[PlatformFee, Booking]]` and `async def get_outstanding_amount(self, cafe_id: UUID) -> Decimal`. Later tasks (3, 6, 7) call these two methods.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_cafe_payout_repository.py
import pytest
from decimal import Decimal
from uuid import uuid4

from app.repositories.cafe_payout_repository import CafePayoutRepository
from app.models.payment import Payment, PaymentStatus
from app.models.platform_fee import PlatformFee
from tests.test_admin_v2_features import _make_gamer, _make_booking_with_payment


@pytest.mark.asyncio
async def test_outstanding_amount_excludes_refunded_booking(db_session):
    gamer = await _make_gamer(db_session, "refund_gamer")
    paid_booking, paid_payment = await _make_booking_with_payment(db_session, gamer)
    refunded_booking, refunded_payment = await _make_booking_with_payment(db_session, gamer)

    fee1 = PlatformFee(id=uuid4(), booking_id=paid_booking.id, owner_settlement_amount=95.0)
    fee2 = PlatformFee(id=uuid4(), booking_id=refunded_booking.id, owner_settlement_amount=95.0)
    db_session.add_all([fee1, fee2])

    refunded_payment.status = PaymentStatus.REFUNDED
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    outstanding = await repo.get_outstanding_amount(paid_booking.cafe_id)

    assert outstanding == Decimal("95.00")


@pytest.mark.asyncio
async def test_outstanding_amount_excludes_already_paid_out(db_session):
    gamer = await _make_gamer(db_session, "paid_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    assert await repo.get_outstanding_amount(booking.cafe_id) == Decimal("95.00")

    payout = await repo.create_payout(
        cafe_id=booking.cafe_id, admin_id=uuid4(), utr_reference="UTR1", payment_method="neft",
    )
    assert payout.amount == 95.0

    assert await repo.get_outstanding_amount(booking.cafe_id) == Decimal("0")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_cafe_payout_repository.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.repositories.cafe_payout_repository'`

- [ ] **Step 3: Write the repository**

```python
# backend/app/repositories/cafe_payout_repository.py
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import select, func, not_, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestException
from app.models.booking import Booking
from app.models.cafe_payout import CafePayout, CafePayoutStatus
from app.models.cafe_payout_item import CafePayoutItem
from app.models.payment import Payment, PaymentStatus
from app.models.platform_fee import PlatformFee
from app.repositories.base import BaseRepository


class CafePayoutRepository(BaseRepository[CafePayout]):
    def __init__(self, db: AsyncSession):
        super().__init__(CafePayout, db)

    def _outstanding_base_query(self, cafe_id: UUID):
        already_paid = exists().where(CafePayoutItem.platform_fee_id == PlatformFee.id)
        return (
            select(PlatformFee, Booking)
            .join(Booking, Booking.id == PlatformFee.booking_id)
            .join(Payment, Payment.booking_id == Booking.id)
            .where(
                Booking.cafe_id == cafe_id,
                Payment.status == PaymentStatus.CAPTURED,
                not_(already_paid),
            )
        )

    async def get_outstanding_fee_rows(self, cafe_id: UUID) -> list[tuple[PlatformFee, Booking]]:
        result = await self.db.execute(self._outstanding_base_query(cafe_id))
        return list(result.all())

    async def get_outstanding_amount(self, cafe_id: UUID) -> Decimal:
        rows = await self.get_outstanding_fee_rows(cafe_id)
        total = sum((Decimal(str(fee.owner_settlement_amount)) for fee, _ in rows), Decimal("0"))
        return total

    async def create_payout(
        self,
        cafe_id: UUID,
        admin_id: UUID,
        utr_reference: str,
        payment_method: str,
        notes: Optional[str] = None,
    ) -> CafePayout:
        from datetime import datetime, timezone
        import uuid as _uuid

        rows = await self.get_outstanding_fee_rows(cafe_id)
        if not rows:
            raise BadRequestException("This café has no outstanding balance to pay out.")

        total = sum((Decimal(str(fee.owner_settlement_amount)) for fee, _ in rows), Decimal("0"))

        payout = CafePayout(
            id=_uuid.uuid4(),
            cafe_id=cafe_id,
            amount=float(total),
            utr_reference=utr_reference,
            payment_method=payment_method,
            status=CafePayoutStatus.PAID,
            notes=notes,
            created_by_admin_id=admin_id,
            paid_at=datetime.now(timezone.utc),
        )
        self.db.add(payout)
        await self.db.flush()

        for fee, booking in rows:
            self.db.add(CafePayoutItem(
                id=_uuid.uuid4(),
                payout_id=payout.id,
                platform_fee_id=fee.id,
                booking_id=booking.id,
                amount_allocated=fee.owner_settlement_amount,
            ))

        await self.db.commit()
        await self.db.refresh(payout)
        return payout
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_cafe_payout_repository.py -v`
Expected: PASS

- [ ] **Step 5: Add and run the concurrent-creation race test**

```python
# append to backend/tests/test_cafe_payout_repository.py
import asyncio
from tests.conftest import TestAsyncSessionLocal


@pytest.mark.asyncio
async def test_concurrent_payout_creation_does_not_double_pay(db_session):
    gamer = await _make_gamer(db_session, "race_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
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
```

Run: `cd backend && pytest tests/test_cafe_payout_repository.py -v`
Expected: PASS. (The `platform_fee_id` unique constraint from Task 1 is what makes the second concurrent transaction fail at commit — verify the test actually exercises that by confirming it fails without the unique constraint if you're unsure; do not skip this verification.)

- [ ] **Step 6: Commit**

```bash
git add backend/app/repositories/cafe_payout_repository.py backend/tests/test_cafe_payout_repository.py
git commit -m "feat(payouts): add CafePayoutRepository with outstanding-balance calc"
```

---

### Task 3: `CafePayoutRepository` — breakdown + history listing

**Files:**
- Modify: `backend/app/repositories/cafe_payout_repository.py`
- Test: `backend/tests/test_cafe_payout_repository.py`

**Interfaces:**
- Consumes: everything from Task 2.
- Produces: `async def get_outstanding_breakdown(self, cafe_id: UUID) -> list[dict]`, `async def list_cafes_with_outstanding(self) -> list[dict]`, `async def list_payouts(self, cafe_id: Optional[UUID] = None, status: Optional[str] = None, page: int = 1, limit: int = 20) -> dict`. Task 4 (admin API) and Task 5 (owner API) call these.

- [ ] **Step 1: Write the failing tests**

```python
# append to backend/tests/test_cafe_payout_repository.py
@pytest.mark.asyncio
async def test_get_outstanding_breakdown_lists_booking_details(db_session):
    gamer = await _make_gamer(db_session, "breakdown_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
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
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    cafes = await repo.list_cafes_with_outstanding()

    matching = [c for c in cafes if c["cafeId"] == str(booking.cafe_id)]
    assert len(matching) == 1
    assert matching[0]["outstandingAmount"] == 95.0


@pytest.mark.asyncio
async def test_list_payouts_filters_by_cafe(db_session):
    gamer = await _make_gamer(db_session, "history_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
    await db_session.commit()

    repo = CafePayoutRepository(db_session)
    await repo.create_payout(booking.cafe_id, uuid4(), "UTR-H1", "neft")

    result = await repo.list_payouts(cafe_id=booking.cafe_id)
    assert result["total"] == 1
    assert result["items"][0]["utrReference"] == "UTR-H1"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_cafe_payout_repository.py -k "breakdown or list_cafes or list_payouts" -v`
Expected: FAIL with `AttributeError: 'CafePayoutRepository' object has no attribute 'get_outstanding_breakdown'`

- [ ] **Step 3: Add the methods**

```python
# add to backend/app/repositories/cafe_payout_repository.py, inside CafePayoutRepository
from app.models.cafe import Cafe


async def get_outstanding_breakdown(self, cafe_id: UUID) -> list[dict]:
    rows = await self.get_outstanding_fee_rows(cafe_id)
    return [
        {
            "bookingId": str(booking.id),
            "bookingReference": booking.booking_reference,
            "sessionDate": str(booking.session_date),
            "grossAmount": float(booking.total_amount),
            "ownerSettlementAmount": float(fee.owner_settlement_amount),
        }
        for fee, booking in rows
    ]


async def list_cafes_with_outstanding(self) -> list[dict]:
    cafes_result = await self.db.execute(select(Cafe.id, Cafe.name))
    out = []
    for cafe_id, cafe_name in cafes_result.all():
        amount = await self.get_outstanding_amount(cafe_id)
        if amount > 0:
            out.append({
                "cafeId": str(cafe_id),
                "cafeName": cafe_name,
                "outstandingAmount": float(amount),
            })
    return out


async def list_payouts(
    self,
    cafe_id: Optional[UUID] = None,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> dict:
    limit = min(limit, 50)
    stmt = select(CafePayout)
    if cafe_id:
        stmt = stmt.where(CafePayout.cafe_id == cafe_id)
    if status:
        stmt = stmt.where(CafePayout.status == status)
    stmt = stmt.order_by(CafePayout.created_at.desc())

    total = (await self.db.execute(
        select(func.count()).select_from(stmt.subquery())
    )).scalar() or 0

    offset = (page - 1) * limit
    rows = (await self.db.execute(stmt.offset(offset).limit(limit))).scalars().all()

    items = [
        {
            "id": str(p.id),
            "cafeId": str(p.cafe_id),
            "amount": float(p.amount),
            "utrReference": p.utr_reference,
            "paymentMethod": p.payment_method,
            "status": p.status.value if hasattr(p.status, "value") else str(p.status),
            "notes": p.notes,
            "paidAt": p.paid_at.isoformat() if p.paid_at else None,
            "createdAt": p.created_at.isoformat(),
        }
        for p in rows
    ]
    return {"items": items, "total": total, "page": page, "pageSize": limit}
```
Note: `list_cafes_with_outstanding` runs one query per café — acceptable for Phase 1 given the current café count (a handful of leads/early venues); flag as a future optimization if the café count grows into the hundreds, but do not optimize it now (YAGNI).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_cafe_payout_repository.py -v`
Expected: PASS (all tests in the file, including Task 2's)

- [ ] **Step 5: Commit**

```bash
git add backend/app/repositories/cafe_payout_repository.py backend/tests/test_cafe_payout_repository.py
git commit -m "feat(payouts): add breakdown and history listing to CafePayoutRepository"
```

---

### Task 4: Admin API — outstanding, breakdown, create payout, history

**Files:**
- Create: `backend/app/api/v1/admin_cafe_payouts.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_admin_cafe_payouts_api.py`

**Interfaces:**
- Consumes: `CafePayoutRepository` (Task 2/3); `require_admin` (`app.api.deps`); `AdminService.write_audit_log` (`app.services.admin_service`).
- Produces: `GET /api/v1/admin/cafe-payouts/outstanding`, `GET /api/v1/admin/cafe-payouts/{cafe_id}/breakdown`, `POST /api/v1/admin/cafe-payouts/{cafe_id}`, `GET /api/v1/admin/cafe-payouts`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_admin_cafe_payouts_api.py
import pytest
from uuid import uuid4
from httpx import AsyncClient

from app.main import app
from app.models.platform_fee import PlatformFee
from app.models.payment import PaymentStatus
from tests.conftest import auth_headers
from tests.test_admin_v2_features import _make_admin, _make_gamer, _make_booking_with_payment


@pytest.mark.asyncio
async def test_admin_can_list_outstanding_and_create_payout(db_session):
    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "api_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(admin, is_admin=True)

        outstanding_res = await client.get("/api/v1/admin/cafe-payouts/outstanding", headers=headers)
        assert outstanding_res.status_code == 200, outstanding_res.text
        cafes = outstanding_res.json()["data"]["cafes"]
        assert any(c["cafeId"] == str(booking.cafe_id) and c["outstandingAmount"] == 95.0 for c in cafes)

        breakdown_res = await client.get(
            f"/api/v1/admin/cafe-payouts/{booking.cafe_id}/breakdown", headers=headers
        )
        assert breakdown_res.status_code == 200
        assert len(breakdown_res.json()["data"]["bookings"]) == 1

        create_res = await client.post(
            f"/api/v1/admin/cafe-payouts/{booking.cafe_id}",
            json={"utrReference": "UTR999", "paymentMethod": "neft", "notes": "test payout"},
            headers=headers,
        )
        assert create_res.status_code == 201, create_res.text
        payout = create_res.json()["data"]["payout"]
        assert payout["amount"] == 95.0
        assert payout["utrReference"] == "UTR999"

        history_res = await client.get("/api/v1/admin/cafe-payouts", headers=headers)
        assert history_res.status_code == 200
        assert any(p["id"] == payout["id"] for p in history_res.json()["data"]["items"])

        audit_res = await client.get(
            "/api/v1/admin/audit-log?entityType=cafe_payout", headers=headers
        )
        assert audit_res.status_code == 200
        assert any(a["entityId"] == payout["id"] for a in audit_res.json()["data"]["items"])


@pytest.mark.asyncio
async def test_create_payout_rejects_when_no_outstanding_balance(db_session):
    admin = await _make_admin(db_session)
    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(admin, is_admin=True)
        res = await client.post(
            f"/api/v1/admin/cafe-payouts/{uuid4()}",
            json={"utrReference": "UTR000", "paymentMethod": "neft"},
            headers=headers,
        )
        assert res.status_code == 400


@pytest.mark.asyncio
async def test_non_admin_cannot_access_cafe_payouts(db_session):
    gamer = await _make_gamer(db_session, "blocked_gamer")
    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = auth_headers(gamer)
        res = await client.get("/api/v1/admin/cafe-payouts/outstanding", headers=headers)
        assert res.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_admin_cafe_payouts_api.py -v`
Expected: FAIL with 404 (route doesn't exist yet)

- [ ] **Step 3: Write the router**

```python
# backend/app/api/v1/admin_cafe_payouts.py
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.database import get_db
from app.models.user import User
from app.repositories.cafe_payout_repository import CafePayoutRepository
from app.repositories.cafe_repository import CafeRepository
from app.services.admin_service import AdminService

router = APIRouter()


class CafePayoutCreateRequest(BaseModel):
    utrReference: str
    paymentMethod: str
    notes: Optional[str] = None


@router.get("/outstanding", status_code=status.HTTP_200_OK)
async def list_outstanding_cafe_payouts(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = CafePayoutRepository(db)
    cafes = await repo.list_cafes_with_outstanding()
    return {"success": True, "data": {"cafes": cafes}}


@router.get("/{cafe_id}/breakdown", status_code=status.HTTP_200_OK)
async def get_cafe_payout_breakdown(
    cafe_id: UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = CafePayoutRepository(db)
    bookings = await repo.get_outstanding_breakdown(cafe_id)
    return {"success": True, "data": {"bookings": bookings}}


@router.post("/{cafe_id}", status_code=status.HTTP_201_CREATED)
async def create_cafe_payout(
    cafe_id: UUID,
    payload: CafePayoutCreateRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = CafePayoutRepository(db)
    payout = await repo.create_payout(
        cafe_id=cafe_id,
        admin_id=current_admin.id,
        utr_reference=payload.utrReference,
        payment_method=payload.paymentMethod,
        notes=payload.notes,
    )

    cafe = await CafeRepository(db).get_by_id(cafe_id)
    admin_service = AdminService(db=db)
    await admin_service.write_audit_log(
        admin_id=current_admin.id,
        admin_email=current_admin.email,
        action="cafe_payout.create",
        entity_type="cafe_payout",
        entity_id=str(payout.id),
        entity_name=cafe.name if cafe else None,
        reason=payload.notes,
    )

    return {
        "success": True,
        "data": {
            "payout": {
                "id": str(payout.id),
                "cafeId": str(payout.cafe_id),
                "amount": float(payout.amount),
                "utrReference": payout.utr_reference,
                "paymentMethod": payout.payment_method,
                "status": payout.status.value,
                "paidAt": payout.paid_at.isoformat() if payout.paid_at else None,
            }
        },
    }


@router.get("", status_code=status.HTTP_200_OK)
async def list_cafe_payouts(
    cafeId: Optional[UUID] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    repo = CafePayoutRepository(db)
    result = await repo.list_payouts(cafe_id=cafeId, status=status_filter, page=page, limit=limit)
    return {"success": True, "data": result}
```

Check `AdminService.__init__` signature in `backend/app/services/admin_service.py` before this step — if it requires more constructor args than `db=db`, pass them (grep `class AdminService` and its `__init__` to confirm; the `write_audit_log` method itself only needs `self.db`, so a minimal-args construction may not be possible if `__init__` mandates repos it doesn't otherwise use — in that case construct `AdminService` the same way `admin.py`'s existing endpoints do, or call `AdminAuditLog` directly as `admin_service.py:629` does, bypassing `AdminService` entirely if construction is inconvenient here).

- [ ] **Step 4: Register the router**

In `backend/app/api/v1/router.py`, add:
```python
from app.api.v1.admin_cafe_payouts import router as admin_cafe_payouts_router
```
and
```python
api_router.include_router(admin_cafe_payouts_router, prefix="/admin/cafe-payouts", tags=["Admin Café Payouts"])
```
(add both lines near the existing `admin_router`/`admin_analytics_router` registrations, keeping the file's existing grouping/ordering).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_admin_cafe_payouts_api.py -v`
Expected: PASS

- [ ] **Step 6: Run the full backend test suite to check for regressions**

Run: `cd backend && pytest -x -q`
Expected: PASS (no pre-existing test broken by the new router/models)

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/admin_cafe_payouts.py backend/app/api/v1/router.py backend/tests/test_admin_cafe_payouts_api.py
git commit -m "feat(payouts): add admin café-payouts API (outstanding, breakdown, create, history)"
```

---

### Task 5: Owner API — outstanding + payout history

**Files:**
- Modify: `backend/app/api/v1/owner_payouts.py`
- Test: `backend/tests/test_owner_cafe_payouts_api.py`

**Interfaces:**
- Consumes: `CafePayoutRepository` (Task 2/3); `require_cafe_owner` (`app.api.deps`); `Cafe` (`app.models.cafe`).
- Produces: `GET /api/v1/owner/payouts/cafe-payouts` (owner's own café's outstanding + history).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_owner_cafe_payouts_api.py
import pytest
from uuid import uuid4
from httpx import AsyncClient

from app.main import app
from app.models.platform_fee import PlatformFee
from app.repositories.cafe_payout_repository import CafePayoutRepository
from tests.conftest import auth_headers, db_session
from tests.test_admin_v2_features import _make_gamer, _make_booking_with_payment
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.core.security import get_password_hash


@pytest.mark.asyncio
async def test_owner_sees_own_cafe_outstanding_and_history(db_session):
    gamer = await _make_gamer(db_session, "owner_api_gamer")
    booking, payment = await _make_booking_with_payment(db_session, gamer)
    fee = PlatformFee(id=uuid4(), booking_id=booking.id, owner_settlement_amount=95.0)
    db_session.add(fee)
    await db_session.commit()

    from app.models.cafe import Cafe
    from sqlalchemy import select
    cafe = (await db_session.execute(select(Cafe).where(Cafe.id == booking.cafe_id))).scalars().first()
    owner = (await db_session.execute(select(User).where(User.id == cafe.owner_id))).scalars().first()

    async with AsyncClient(app=app, base_url="http://test") as client:
        owner_headers = auth_headers(owner)

        res = await client.get("/api/v1/owner/payouts/cafe-payouts", headers=owner_headers)
        assert res.status_code == 200, res.text
        data = res.json()["data"]
        assert data["outstandingAmount"] == 95.0
        assert data["history"] == []

        repo = CafePayoutRepository(db_session)
        await repo.create_payout(booking.cafe_id, uuid4(), "UTR-OWNER-1", "neft")

        res2 = await client.get("/api/v1/owner/payouts/cafe-payouts", headers=owner_headers)
        data2 = res2.json()["data"]
        assert data2["outstandingAmount"] == 0.0
        assert len(data2["history"]) == 1
        assert data2["history"][0]["utrReference"] == "UTR-OWNER-1"


@pytest.mark.asyncio
async def test_owner_cannot_see_another_cafes_payouts(db_session):
    gamer_a = await _make_gamer(db_session, "iso_gamer_a")
    booking_a, _ = await _make_booking_with_payment(db_session, gamer_a)
    gamer_b = await _make_gamer(db_session, "iso_gamer_b")
    booking_b, _ = await _make_booking_with_payment(db_session, gamer_b)

    fee_a = PlatformFee(id=uuid4(), booking_id=booking_a.id, owner_settlement_amount=50.0)
    fee_b = PlatformFee(id=uuid4(), booking_id=booking_b.id, owner_settlement_amount=200.0)
    db_session.add_all([fee_a, fee_b])
    await db_session.commit()

    from app.models.cafe import Cafe
    from sqlalchemy import select
    cafe_a = (await db_session.execute(select(Cafe).where(Cafe.id == booking_a.cafe_id))).scalars().first()
    owner_a = (await db_session.execute(select(User).where(User.id == cafe_a.owner_id))).scalars().first()

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/owner/payouts/cafe-payouts", headers=auth_headers(owner_a)
        )
        assert res.status_code == 200
        assert res.json()["data"]["outstandingAmount"] == 50.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_owner_cafe_payouts_api.py -v`
Expected: FAIL with 404

- [ ] **Step 3: Add the endpoint**

Add to `backend/app/api/v1/owner_payouts.py` (alongside the existing `/status` and `/setup` routes, same file, same import style):
```python
from sqlalchemy import select
from app.models.cafe import Cafe
from app.repositories.cafe_payout_repository import CafePayoutRepository


@router.get("/cafe-payouts", status_code=status.HTTP_200_OK)
async def get_owner_cafe_payouts(
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db),
):
    cafe_stmt = (
        select(Cafe)
        .where(Cafe.owner_id == current_owner.id)
        .order_by(Cafe.created_at.desc())
    )
    cafe = (await db.execute(cafe_stmt)).scalars().first()

    if not cafe:
        return {"success": True, "data": {"outstandingAmount": 0.0, "history": []}}

    repo = CafePayoutRepository(db)
    outstanding = await repo.get_outstanding_amount(cafe.id)
    history = await repo.list_payouts(cafe_id=cafe.id)

    return {
        "success": True,
        "data": {
            "outstandingAmount": float(outstanding),
            "history": history["items"],
        },
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_owner_cafe_payouts_api.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/owner_payouts.py backend/tests/test_owner_cafe_payouts_api.py
git commit -m "feat(payouts): add owner-side café-payouts outstanding + history endpoint"
```

---

### Task 6: Bug fix — admin's existing "pending settlement" figure excludes refunded/paid-out bookings

**Files:**
- Modify: `backend/app/services/admin_service.py:791-797`
- Test: `backend/tests/test_admin_v2_features.py` (add a new test to this existing file — it already has the admin/owner-payouts fixtures this test needs)

**Interfaces:**
- Consumes: `CafePayoutRepository.get_outstanding_amount` (Task 2).

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_admin_v2_features.py`:
```python
@pytest.mark.asyncio
async def test_admin_owner_payouts_pending_settlement_excludes_refunded(db_session):
    from app.models.platform_fee import PlatformFee
    from app.models.owner_payout_account import OwnerPayoutAccount

    admin = await _make_admin(db_session)
    gamer = await _make_gamer(db_session, "settle_gamer")
    paid_booking, paid_payment = await _make_booking_with_payment(db_session, gamer)
    refunded_booking, refunded_payment = await _make_booking_with_payment(db_session, gamer)

    from app.models.cafe import Cafe
    from sqlalchemy import select
    cafe = (await db_session.execute(select(Cafe).where(Cafe.id == paid_booking.cafe_id))).scalars().first()

    db_session.add(PlatformFee(id=uuid4(), booking_id=paid_booking.id, owner_settlement_amount=95.0))
    db_session.add(PlatformFee(id=uuid4(), booking_id=refunded_booking.id, owner_settlement_amount=95.0))
    db_session.add(OwnerPayoutAccount(id=uuid4(), owner_id=cafe.owner_id, kyc_status="activated"))
    refunded_payment.status = PaymentStatus.REFUNDED
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.get("/api/v1/admin/payouts", headers=auth_headers(admin, is_admin=True))
        assert res.status_code == 200
        matching = [i for i in res.json()["data"]["items"] if i["ownerId"] == str(cafe.owner_id)]
        assert len(matching) == 1
        assert matching[0]["pendingSettlementAmount"] == 95.0
```
Check `OwnerPayoutAccount`'s required fields (`app/models/owner_payout_account.py`) before running — add any other `nullable=False` columns this constructor is missing.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_v2_features.py::test_admin_owner_payouts_pending_settlement_excludes_refunded -v`
Expected: FAIL — `pendingSettlementAmount` currently comes back as `190.0` (both bookings counted) instead of `95.0`.

- [ ] **Step 3: Fix the query**

In `backend/app/services/admin_service.py`, replace the existing `pending_settlement` block (around line 791):
```python
            pending_settlement = (await self.db.execute(
                select(func.coalesce(func.sum(PlatformFee.owner_settlement_amount), 0))
                .select_from(PlatformFee)
                .join(Booking, Booking.id == PlatformFee.booking_id)
                .join(Cafe, Cafe.id == Booking.cafe_id)
                .where(Cafe.owner_id == account.owner_id, PlatformFee.transfer_status != "transferred")
            )).scalar() or 0
```
with:
```python
            from app.repositories.cafe_payout_repository import CafePayoutRepository
            cafe_payout_repo = CafePayoutRepository(self.db)
            owner_cafes = (await self.db.execute(
                select(Cafe.id).where(Cafe.owner_id == account.owner_id)
            )).scalars().all()
            pending_settlement = 0
            for owner_cafe_id in owner_cafes:
                pending_settlement += await cafe_payout_repo.get_outstanding_amount(owner_cafe_id)
```
This also naturally fixes "already manually paid out" double-counting once Task 4 exists, since `get_outstanding_amount` excludes any `platform_fee_id` with a `CafePayoutItem`. Note this still uses `Payment.status == CAPTURED` (via the repository) rather than the old `transfer_status != "transferred"` filter — a fee row where Route is disabled has `transfer_status = "pending"` forever, which is exactly the money this admin view needs to keep showing as pending, so this is not a behavior regression for the non-refunded case, only a correctness fix for the refunded case.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_v2_features.py::test_admin_owner_payouts_pending_settlement_excludes_refunded -v`
Expected: PASS

- [ ] **Step 5: Run the full admin test file to check for regressions**

Run: `cd backend && pytest tests/test_admin_v2_features.py -v`
Expected: PASS (all tests, old and new)

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/admin_service.py backend/tests/test_admin_v2_features.py
git commit -m "fix(payouts): exclude refunded/already-paid-out bookings from admin pending-settlement figure"
```

---

### Task 7: Bug fix — owner's existing "pending settlement" figure excludes refunded/paid-out bookings

**Files:**
- Modify: `backend/app/api/v1/owner.py` (the `get_owner_payout_summary` function, around lines 1125-1230)
- Test: create `backend/tests/test_owner_payout_summary_bugfix.py`

**Interfaces:**
- Consumes: `CafePayoutRepository.get_outstanding_amount` (Task 2).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_owner_payout_summary_bugfix.py
import pytest
from uuid import uuid4
from httpx import AsyncClient
from sqlalchemy import select

from app.main import app
from app.models.platform_fee import PlatformFee
from app.models.payment import PaymentStatus
from app.models.cafe import Cafe
from app.models.user import User
from tests.conftest import auth_headers
from tests.test_admin_v2_features import _make_gamer, _make_booking_with_payment


@pytest.mark.asyncio
async def test_owner_payout_summary_pending_excludes_refunded(db_session):
    gamer = await _make_gamer(db_session, "summary_gamer")
    paid_booking, paid_payment = await _make_booking_with_payment(db_session, gamer)
    refunded_booking, refunded_payment = await _make_booking_with_payment(db_session, gamer)

    cafe = (await db_session.execute(select(Cafe).where(Cafe.id == paid_booking.cafe_id))).scalars().first()
    owner = (await db_session.execute(select(User).where(User.id == cafe.owner_id))).scalars().first()

    db_session.add(PlatformFee(id=uuid4(), booking_id=paid_booking.id, owner_settlement_amount=95.0, gateway_fee=5.0))
    db_session.add(PlatformFee(id=uuid4(), booking_id=refunded_booking.id, owner_settlement_amount=95.0, gateway_fee=5.0))
    refunded_payment.status = PaymentStatus.REFUNDED
    await db_session.commit()

    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.get("/api/v1/owner/payouts/summary", headers=auth_headers(owner))
        assert res.status_code == 200, res.text
        assert res.json()["data"]["summary"]["pendingSettlements"] == 95.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_owner_payout_summary_bugfix.py -v`
Expected: FAIL — `pendingSettlements` comes back as `190.0`.

- [ ] **Step 3: Fix the calculation**

In `backend/app/api/v1/owner.py`, inside `get_owner_payout_summary`, the loop currently does (around line 1169-1182):
```python
        for b, fee in rows:
            ...
            if transfer_status == "transferred":
                completed_settlements += net
            else:
                pending_settlements += net
```
The `rows` query (lines 1152-1165) already joins `Booking` + `PlatformFee` filtered by booking status — it does not join `Payment` at all, so a refunded booking's `PlatformFee` row is currently counted the same as any other. Add a `Payment` join and status check. Replace the `stmt_bookings` query:
```python
        from app.models.payment import Payment, PaymentStatus
        stmt_bookings = (
            select(Booking, PlatformFee, Payment.status)
            .join(PlatformFee, PlatformFee.booking_id == Booking.id)
            .join(Payment, Payment.booking_id == Booking.id)
            .where(
                Booking.cafe_id.in_(cafe_ids),
                Booking.status.in_([
                    BookingStatus.CONFIRMED,
                    BookingStatus.CHECKED_IN,
                    BookingStatus.ACTIVE,
                    BookingStatus.COMPLETED,
                ]),
            )
            .order_by(Booking.created_at.desc())
        )
        res_bookings = await db.execute(stmt_bookings)
        rows = res_bookings.all()

        for b, fee, payment_status in rows:
            gross = float(b.total_amount)
            platform_fee = float(fee.gateway_fee)
            net = float(fee.owner_settlement_amount)
            transfer_status = fee.transfer_status
            is_refunded = payment_status == PaymentStatus.REFUNDED

            total_gross += gross
            total_net_settlement += net
            total_gateway_fees += platform_fee
            total_platform_fees += platform_fee
            if is_refunded:
                pass  # refunded bookings are excluded from both completed and pending settlement
            elif transfer_status == "transferred":
                completed_settlements += net
            else:
                pending_settlements += net
```
Then subtract already-manually-paid-out amounts, using `CafePayoutRepository` for a second, cheap pass:
```python
        from app.repositories.cafe_payout_repository import CafePayoutRepository
        cafe_payout_repo = CafePayoutRepository(db)
        already_paid_out = 0.0
        for c_id in cafe_ids:
            fee_rows_for_cafe_all = [(fee, b) for b, fee, ps in rows if b.cafe_id == c_id and ps != PaymentStatus.REFUNDED]
            outstanding_for_cafe = float(await cafe_payout_repo.get_outstanding_amount(c_id))
            gross_pending_for_cafe = sum(float(fee.owner_settlement_amount) for fee, b in fee_rows_for_cafe_all if fee.transfer_status != "transferred")
            already_paid_out += max(0.0, gross_pending_for_cafe - outstanding_for_cafe)
        pending_settlements -= already_paid_out
```
Keep the rest of the function (the `recent_payout_items` list building, the account info, the response dict) unchanged — only `stmt_bookings`, the loop body, and the addition of the already-paid-out subtraction change.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_owner_payout_summary_bugfix.py -v`
Expected: PASS

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && pytest -x -q`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/owner.py backend/tests/test_owner_payout_summary_bugfix.py
git commit -m "fix(payouts): exclude refunded/already-paid-out bookings from owner pending-settlement figure"
```

---

### Task 8: Frontend API client functions

**Files:**
- Modify: `frontend/src/lib/api/admin.ts`
- Modify: `frontend/src/lib/api/owner.ts`

**Interfaces:**
- Produces: `listOutstandingCafePayouts()`, `getCafePayoutBreakdown(cafeId)`, `createCafePayout(cafeId, body)`, `listCafePayoutHistory(params)` in `admin.ts`; `getOwnerCafePayouts()` in `owner.ts`. Task 9 and Task 10 (UI) call these.

- [ ] **Step 1: Add admin API functions**

Add to `frontend/src/lib/api/admin.ts` (near the existing `listOwnerPayouts` function, same file, same `call(() => apiClient...)` pattern used throughout this file):
```typescript
export interface AdminOutstandingCafePayout {
  cafeId: string;
  cafeName: string;
  outstandingAmount: number;
}

export interface CafePayoutBreakdownItem {
  bookingId: string;
  bookingReference: string;
  sessionDate: string;
  grossAmount: number;
  ownerSettlementAmount: number;
}

export interface CafePayout {
  id: string;
  cafeId: string;
  amount: number;
  utrReference: string;
  paymentMethod: string;
  status: string;
  notes: string | null;
  paidAt: string | null;
  createdAt: string;
}

export async function listOutstandingCafePayouts(): Promise<{ cafes: AdminOutstandingCafePayout[] }> {
  return call(() => apiClient.get('/api/v1/admin/cafe-payouts/outstanding'));
}

export async function getCafePayoutBreakdown(cafeId: string): Promise<{ bookings: CafePayoutBreakdownItem[] }> {
  return call(() => apiClient.get(`/api/v1/admin/cafe-payouts/${cafeId}/breakdown`));
}

export async function createCafePayout(
  cafeId: string,
  body: { utrReference: string; paymentMethod: string; notes?: string },
): Promise<{ payout: CafePayout }> {
  return call(() => apiClient.post(`/api/v1/admin/cafe-payouts/${cafeId}`, body));
}

export async function listCafePayoutHistory(
  params: { cafeId?: string; status?: string; page?: number; limit?: number } = {},
): Promise<{ items: CafePayout[]; total: number; page: number; pageSize: number }> {
  return call(() => apiClient.get('/api/v1/admin/cafe-payouts', { params }));
}
```
Check the top of `admin.ts` for the exact name of the shared `call()` helper and `apiClient` import — match whatever this file already uses (the existing `listOwnerPayouts` function a few lines away is the reference).

- [ ] **Step 2: Add owner API function**

Add to `frontend/src/lib/api/owner.ts` (near `getOwnerPayoutSummary`):
```typescript
export interface OwnerCafePayoutHistoryItem {
  id: string;
  amount: number;
  utrReference: string;
  paymentMethod: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
}

export async function getOwnerCafePayouts(): Promise<{
  outstandingAmount: number;
  history: OwnerCafePayoutHistoryItem[];
}> {
  return call(() => apiClient.get('/api/v1/owner/payouts/cafe-payouts'));
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new type errors introduced by these additions.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api/admin.ts frontend/src/lib/api/owner.ts
git commit -m "feat(payouts): add frontend API client functions for café payouts"
```

---

### Task 9: Admin UI — "Café Payables" page

**Files:**
- Create: `frontend/src/app/(admin)/admin/cafe-payouts/page.tsx`
- Modify: `frontend/src/components/layout/AdminShell.tsx`

**Interfaces:**
- Consumes: `listOutstandingCafePayouts`, `getCafePayoutBreakdown`, `createCafePayout` (Task 8); `Card`, `CardContent`, `Badge`, `Button`, `EmptyState`, `SkeletonCard`, `ErrorState` (`@/components/ui`, same imports as `frontend/src/app/(admin)/admin/payouts/page.tsx`); `queryKeys` (`@/hooks/queries/keys`).

- [ ] **Step 1: Add the nav entry**

In `frontend/src/components/layout/AdminShell.tsx`, in the `Finance` section (around line 84-88), add a line after the existing `Owner Payouts` entry:
```typescript
      { label: 'Café Payables', href: '/admin/cafe-payouts', icon: Banknote },
```
Add `Banknote` to the `lucide-react` import list at the top of the file if it isn't already imported (check the existing import statement first — reuse it if `Banknote` or an equivalent icon is already imported).

- [ ] **Step 2: Write the page**

```tsx
// frontend/src/app/(admin)/admin/cafe-payouts/page.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, RefreshCw, ChevronRight } from 'lucide-react';
import {
  listOutstandingCafePayouts,
  getCafePayoutBreakdown,
  createCafePayout,
} from '@/lib/api/admin';
import { queryKeys } from '@/hooks/queries/keys';
import { Card, CardContent, Button, SkeletonCard, ErrorState, EmptyState } from '@/components/ui';

export default function AdminCafePayoutsPage() {
  const queryClient = useQueryClient();
  const [selectedCafeId, setSelectedCafeId] = useState<string | null>(null);
  const [utrReference, setUtrReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('neft');
  const [notes, setNotes] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.admin.all, 'cafe-payouts', 'outstanding'],
    queryFn: () => listOutstandingCafePayouts(),
    staleTime: 30_000,
  });

  const breakdownQuery = useQuery({
    queryKey: [...queryKeys.admin.all, 'cafe-payouts', 'breakdown', selectedCafeId],
    queryFn: () => getCafePayoutBreakdown(selectedCafeId as string),
    enabled: !!selectedCafeId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createCafePayout(selectedCafeId as string, {
        utrReference,
        paymentMethod,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      setSelectedCafeId(null);
      setUtrReference('');
      setNotes('');
      queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.all, 'cafe-payouts'] });
    },
  });

  const cafes = data?.cafes ?? [];
  const selectedCafe = cafes.find((c) => c.cafeId === selectedCafeId) ?? null;

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Banknote className="h-5 w-5 text-primary" />
            <h1 className="font-heading text-h1 text-text-primary">Café Payables</h1>
          </div>
          <p className="text-caption text-text-secondary">
            Money owed to cafés for captured bookings, paid manually via bank transfer while
            Razorpay Route is disabled.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-semibold text-text-secondary hover:bg-surface-hover transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}
      {isError && (
        <ErrorState
          title="Failed to load outstanding payables"
          message={(error as Error)?.message ?? 'Could not retrieve café payables.'}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && cafes.length === 0 && (
        <EmptyState
          title="Nothing owed right now"
          description="Every café's captured bookings have already been paid out or refunded."
          icon={<Banknote className="h-8 w-8 text-text-tertiary" />}
        />
      )}

      {!isLoading && !isError && cafes.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden bg-surface divide-y divide-border">
          {cafes
            .slice()
            .sort((a, b) => b.outstandingAmount - a.outstandingAmount)
            .map((c) => (
              <button
                key={c.cafeId}
                type="button"
                onClick={() => setSelectedCafeId(c.cafeId)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-hover transition-colors text-left"
              >
                <span className="text-caption font-semibold text-text-primary">{c.cafeName}</span>
                <div className="flex items-center gap-3">
                  <span className="text-caption font-bold font-data text-text-primary">
                    ₹{c.outstandingAmount.toFixed(2)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-text-tertiary" />
                </div>
              </button>
            ))}
        </div>
      )}

      {selectedCafeId && selectedCafe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card elevation="raised" className="max-w-lg w-full bg-surface border border-border p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-heading text-h3 text-text-primary">{selectedCafe.cafeName}</h3>
              <button onClick={() => setSelectedCafeId(null)} className="text-text-tertiary hover:text-text-primary font-bold">✕</button>
            </div>

            <div>
              <span className="text-caption font-semibold text-text-secondary">Outstanding</span>
              <div className="font-heading text-h1 text-text-primary">₹{selectedCafe.outstandingAmount.toFixed(2)}</div>
            </div>

            {breakdownQuery.data && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                {breakdownQuery.data.bookings.map((b) => (
                  <div key={b.bookingId} className="flex justify-between px-3 py-2 text-xs">
                    <span className="text-text-secondary">{b.bookingReference} · {b.sessionDate}</span>
                    <span className="font-bold text-text-primary">₹{b.ownerSettlementAmount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-3 pt-2 border-t border-border">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">UTR / Reference Number</span>
                <input
                  type="text"
                  value={utrReference}
                  onChange={(e) => setUtrReference(e.target.value)}
                  className="h-10 px-3 rounded-xl border border-border bg-surface text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="e.g. UTR2024090712345"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Payment Method</span>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="h-10 px-3 rounded-xl border border-border bg-surface text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="neft">NEFT</option>
                  <option value="upi">UPI</option>
                  <option value="imps">IMPS</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Notes (optional)</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-border bg-surface text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                  rows={2}
                />
              </label>

              {createMutation.isError && (
                <p className="text-xs text-error">
                  {(createMutation.error as Error)?.message ?? 'Failed to record payout.'}
                </p>
              )}

              <Button
                variant="primary"
                disabled={!utrReference.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Recording…' : `Mark ₹${selectedCafe.outstandingAmount.toFixed(2)} as Paid`}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

Run: `cd frontend && npm run dev` (or the project's existing dev-server command), then in a browser:
1. Log in as the admin seeded in this project (per project memory: admin account already exists in dev DB).
2. Navigate to `/admin/cafe-payouts`. Confirm the outstanding list renders (or the empty state, if dev DB currently has none).
3. Click a café, confirm the breakdown modal loads, fill in a UTR, click "Mark as Paid," confirm the row disappears from the outstanding list (or its amount decreases) after the mutation succeeds.
4. Navigate to `/admin/audit-log`, confirm a `cafe_payout.create` entry appears.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(admin\)/admin/cafe-payouts/page.tsx frontend/src/components/layout/AdminShell.tsx
git commit -m "feat(payouts): add admin Café Payables page"
```

---

### Task 10: Owner UI — manual payout history section

**Files:**
- Modify: `frontend/src/app/(owner)/owner/payouts/page.tsx`

**Interfaces:**
- Consumes: `getOwnerCafePayouts` (Task 8).

- [ ] **Step 1: Add the data fetch**

In `frontend/src/app/(owner)/owner/payouts/page.tsx`, add a new state + effect alongside the existing `loadPayouts` effect (keep the existing effect and state untouched — add, don't replace):
```typescript
import { getOwnerCafePayouts, type OwnerCafePayoutHistoryItem } from '@/lib/api/owner';

// inside OwnerPayoutsPage, alongside the existing useState calls:
const [outstandingAmount, setOutstandingAmount] = useState(0);
const [payoutHistory, setPayoutHistory] = useState<OwnerCafePayoutHistoryItem[]>([]);

// alongside the existing useEffect that calls loadPayouts():
useEffect(() => {
  async function loadCafePayouts() {
    try {
      const res = await getOwnerCafePayouts();
      setOutstandingAmount(res?.outstandingAmount ?? 0);
      setPayoutHistory(res?.history ?? []);
    } catch {
      // non-fatal: the rest of the page (Route settlement summary) still renders
    }
  }
  loadCafePayouts();
}, []);
```

- [ ] **Step 2: Add the UI section**

Add a new `Card` section after the existing "Recent Payouts" card (before the closing `</div>` of the page, after the `{/* Transactions & Breakdown Table */}` card's closing tag):
```tsx
{/* Manual Payout History */}
<Card elevation="raised" className="bg-surface border border-border">
  <CardContent className="p-6 flex flex-col gap-6">
    <div className="flex items-center justify-between flex-wrap gap-3">
      <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
        <Building2 className="h-5 w-5 text-emerald-500" />
        <span>Manual Bank Payouts</span>
      </h2>
      <div className="text-right">
        <span className="text-caption text-text-secondary block">Current Outstanding</span>
        <span className="font-heading text-h3 text-amber-600">₹{outstandingAmount.toFixed(2)}</span>
      </div>
    </div>
    <p className="text-xs text-text-secondary">
      While Razorpay Route is unavailable, KHEL-O pays out via direct bank transfer instead of
      automatic settlement. This is separate from the Route transfer status shown above.
    </p>

    {payoutHistory.length === 0 ? (
      <EmptyState
        title="No manual payouts yet"
        description="Once KHEL-O sends a bank transfer for your outstanding balance, it'll appear here with the UTR reference."
      />
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border text-caption text-text-secondary">
              <th className="py-3 px-4 font-semibold">Date</th>
              <th className="py-3 px-4 font-semibold">Amount</th>
              <th className="py-3 px-4 font-semibold">Method</th>
              <th className="py-3 px-4 font-semibold">UTR / Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-caption">
            {payoutHistory.map((p) => (
              <tr key={p.id}>
                <td className="py-3.5 px-4 text-text-secondary">
                  {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : '—'}
                </td>
                <td className="py-3.5 px-4 font-bold text-emerald-600">₹{p.amount.toFixed(2)}</td>
                <td className="py-3.5 px-4 text-text-secondary uppercase">{p.paymentMethod}</td>
                <td className="py-3.5 px-4 font-mono text-xs text-text-primary">{p.utrReference}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </CardContent>
</Card>
```

- [ ] **Step 3: Manual verification**

Run the frontend dev server, log in as one of the lead café owner accounts (or any owner with a booking), navigate to `/owner/payouts`, confirm the new "Manual Bank Payouts" section renders below the existing Route-transfer table, showing the outstanding amount and (once Task 9 is used to pay it out) the payout history row.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(owner\)/owner/payouts/page.tsx
git commit -m "feat(payouts): show manual payout outstanding balance and history to café owners"
```

---

## Self-Review Notes

- **Spec coverage**: data model (Task 1), outstanding calc + overpay-by-construction (Task 2), breakdown/history (Task 3), admin API + audit log (Task 4), owner read-only view (Task 5), refund/edge-case correctness — extended to the two *existing* endpoints that had the same bug (Tasks 6-7, an addition beyond the original spec text but required by the spec's own acceptance criterion "duplicate webhooks/refunds cannot duplicate or misstate money"), UI for both roles (Tasks 9-10). Deferred items (partial payouts, disputes, exports, float migration, commission dedup) are named in the spec's Context section and intentionally have no task here.
- **Type consistency checked**: `CafePayoutRepository.get_outstanding_amount` returns `Decimal`, used consistently in Task 2/3/6/7; API layer converts to `float` at the JSON boundary consistently (Task 4/5); frontend types (`AdminOutstandingCafePayout`, `CafePayout`, `OwnerCafePayoutHistoryItem`) match the camelCase field names produced by the corresponding backend dicts field-for-field.
- **No placeholders**: every step has runnable code; the two spots requiring an implementer to check something first (Task 1's migration `down_revision`, Task 4's `AdminService` constructor, Task 6's `OwnerPayoutAccount` fields) are pre-existing-code lookups the implementer must do to fill in a real value, not deferred design decisions.
