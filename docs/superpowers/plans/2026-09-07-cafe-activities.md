# Café Activities (Snooker / Arcade / etc.) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a café owner list bookable "Activities" (Snooker, Pool, Arcade, Racing Simulator, VR, Air Hockey, Foosball, Bowling, or any custom activity) alongside their existing PC/console hardware tiers — in either of two inventory modes (named individual units like "Table 1/2/3", or pooled capacity like "Arcade Zone: 20") — and let customers discover and book them through the existing booking engine, with owner-managed per-unit maintenance status that can never silently break an already-booked slot.

**Architecture:** `HardwareTier` (the one table every booking already keys off via `hardware_tier_id` + pooled `seats_count`) gets two new columns — `tier_type` ('gaming'|'activity') and `activity_kind` (free-text label, no fixed enum) — so an "activity" is just a `HardwareTier` row with `platform=NULL`. `derive_tier_display()` already no-ops when `platform is None`, so tier create/update needs zero new branching logic, only the two new fields passed through. A new, **optional** `hardware_tier_units` table gives an activity owner-managed per-unit status ("Table 1: Available", "Table 3: Maintenance") — optional in the literal sense that its rows only exist for a tier the owner chose "individual units" for; a "pooled capacity" activity (e.g. Arcade Zone) never gets unit rows at all and behaves exactly like every existing PC/console tier does today. Unit existence is itself the mode signal — no separate "mode" column. A unit in `maintenance` status subtracts one seat from the tier's effective bookable capacity at the two existing capacity choke points. Because no booking is ever tied to a specific physical unit (bookings claim pooled capacity today, for every tier type, including PC), "don't break an existing booking" is enforced as a **capacity-safety check** — before maintenance or a quantity reduction is allowed to take effect, the system checks it against every future booking's actual overlap count and blocks (with the conflicting date) if the change would leave committed bookings oversold. Booking creation, availability, pricing, the Super Admin platform fee, and historical-fee snapshotting are all reused as-is.

**Tech Stack:** FastAPI + SQLAlchemy (async) + Alembic (backend), Next.js + React Query + TypeScript (frontend), existing test patterns (`pytest`, `httpx.AsyncClient` against the real app with a real Postgres test DB via `AsyncSessionLocal`).

**Spec:** This plan is transcribed from the user's approved requirements in-conversation (§§1–12 of the "KHELO — ADD SNOOKER + ARCADE ACTIVITIES" brief), then revised per a second round of 8 explicit requirements: (1) call the feature "Activities", never "non-gaming activities"; (2) support both individual-unit and pooled-capacity inventory modes; (3) maintenance must never silently break an existing booking; (4) quantity reduction must never delete a unit with a real booking conflict; (5) reuse `HardwareTier`/booking/pricing/fee, no parallel system; (6) verify (not assume) that a platform-less `HardwareTier` doesn't break existing code, and add a discriminator if it would; (7) preserve historical pricing/booking data exactly; (8) customer experience is just Activities shown alongside PC/PS5/Xbox, same booking/payment flow. Requirement 6 was acted on before writing this revision — see "Verified Assumptions" below.

## Verified Assumptions (requirement 6)

Investigated before finalizing this plan, not assumed:

- **`derive_tier_display()`** (`app/services/platform_derivation.py`) already returns `({}, "Gaming Station")`-style no-ops and is never even called with real effect when `platform is None` — `hardware_tier_service.py`'s `final_specs = derived_specs if tier_in.platform is not None else tier_in.specs` skips it entirely for activities. **No change needed.**
- **Two real bugs found and now fixed in this plan** (Task 3, Step 6 below):
  1. `cafe_repository.py:170`, `platforms_complete = all(t.platform is not None for t in cafe_tiers)` — computed over *every* tier including activities, which always have `platform=None`. Adding a single Snooker tier to any café would permanently flip `platforms_complete` to `False`, silently reverting that café's confirmed-platform badges to the fuzzy name-guessing fallback (`hasPcTier`/`hasConsoleTier` in `lib/platformTags.ts`) even though its PC/console tiers are fully migrated. **Fix:** filter to `tier_type == GAMING` before this computation.
  2. `compute_rating(specs)` (`performance_rating.py`) is called unconditionally on every tier, including activities with `specs={}` — every scoring function (`_score_gpu`, `_score_ram`, `_score_hz`, `_score_cpu`) falls back to a non-zero default for an empty string, so a Snooker table would silently get a meaningless "gaming performance rating" (e.g. 1.4/5) attached. Not currently rendered anywhere in the frontend, but still wrong data to compute and return from the API. **Fix:** skip it (`None`) for `tier_type == ACTIVITY`.
- **`platforms = sorted({t.platform.value for t in cafe_tiers if t.platform is not None})`** (same file, line 163) already filters out `None` — activities correctly never appear in a café's platform badge list. No fix needed.
- **`lib/platformTags.ts`'s `hasPcTier`/`hasConsoleTier`/`hasPlatformTier`** keyword-match against tier names/specs and return `false` on no match — an activity named "Snooker"/"Arcade"/"VR" matches none of the PC or console keyword lists, so these heuristics degrade safely (no crash, no false-positive platform claim).
- **`booking_service.create_booking`** never reads `tier.platform` — confirmed by re-reading the full method; it only uses `tier.price_per_hour`. No change needed there beyond what Task 2 already does.

## Global Constraints

- `activity_kind` is **never** a constrained backend enum — always a free string. The frontend may suggest presets (Snooker/Pool, Arcade, Racing Simulator, VR, Air Hockey, Foosball, Bowling, Other→custom text), but the backend accepts any string ≤50 chars. Adding a brand-new activity type (e.g. "Darts") must never require a backend change.
- Do not touch `derive_tier_display`, `PLATFORM_MODELS`, or any PC/console code path — activity tiers always send `platform=null`, which already short-circuits all of that.
- No specs form (GPU/RAM/monitor) for activity tiers, ever — enforced by never rendering the specs UI when `tierType === 'activity'`, and the backend already treats `specs` as an untyped free JSON dict.
- Historical bookings' price/fee must never change retroactively — already guaranteed by the existing `booking_service.py`/`PlatformFee` machinery (see prior session work); this plan must not bypass `booking_service.create_booking`.
- Every new backend field uses the existing `to_camel` alias convention (`tierType`, `activityKind`) so it matches the rest of the API without special-casing.
- **Individual-unit tracking is opt-in per activity and decided once, at creation.** Whether a tier has any `hardware_tier_units` rows *is* the mode signal — there is no separate "mode" enum/column to keep in sync. A pooled activity (e.g. Arcade Zone) has zero unit rows, forever; an individual-unit activity (e.g. Snooker) gets `total_seats` rows generated once at creation and resynced only when `total_seats` changes later.
- **Neither maintenance nor a quantity reduction may ever oversell a future booking that already exists.** Both go through the same capacity-safety check (Task 2) before taking effect; on conflict, the write is rejected with a clear error naming the conflicting date — it is never silently allowed to make an already-confirmed booking's slot unbookable.
- This capacity-safety check applies only to `tier_type == 'activity'` — existing PC/console tier editing behavior is intentionally left unchanged (no new guard added to a code path real owners already rely on, since that wasn't asked for and isn't this feature's problem to solve).
- "Individual vs pooled" is purely an owner-facing inventory-tracking choice — it changes nothing about how a `Booking` is created or how capacity is computed (`app_bookable_seats` minus `count_in_maintenance`, always); pooled tiers simply always have `count_in_maintenance == 0` since they have no units to mark.

---

## File Structure

**Backend — new files:**
- `backend/migrations/versions/024_add_cafe_activities.py` — schema migration.
- `backend/app/models/hardware_tier_unit.py` — `HardwareTierUnit` model + `UnitStatus` enum.
- `backend/app/repositories/hardware_tier_unit_repository.py` — CRUD + `count_in_maintenance` + `sync_units_to_quantity`.
- `backend/tests/test_cafe_activities.py` — all new backend tests for this feature.

**Backend — modified files:**
- `backend/app/models/hardware_tier.py` — add `TierType` enum, `tier_type`, `activity_kind` columns.
- `backend/app/schemas/hardware_tier.py` — add `tier_type`/`activity_kind`/`individual_units` to `HardwareTierBase`/`HardwareTierUpdate`.
- `backend/app/services/hardware_tier_service.py` — pass `tier_type`/`activity_kind` through on create; sync units on create only when opted into individual-unit mode, and on update only when units already exist for that tier; skip `compute_rating` for activities.
- `backend/app/repositories/booking_repository.py` — `get_overlapping_bookings_count_with_lock` subtracts maintenance-unit count from capacity; new `find_first_capacity_conflict` used by the two safety checks below.
- `backend/app/repositories/cafe_repository.py` — fix `platforms_complete` to only consider gaming tiers (bug found under requirement 6, see Verified Assumptions).
- `backend/app/api/v1/cafes.py` — `get_cafe_availability` subtracts maintenance-unit count; new `GET/PATCH /cafes/{cafe_id}/tiers/{tier_id}/units` endpoints, the `PATCH` capacity-safety-checked; `update_hardware_tier`'s quantity-reduction path capacity-safety-checked for activity tiers.

**Frontend — new files:**
- `frontend/src/components/icons/ActivityIcons.tsx` — Arcade/Racing/VR/Air Hockey/Foosball/Bowling marks + `ActivityIcon` helper (mirrors `PlatformIcons.tsx`'s pattern).
- `frontend/src/lib/api/hardwareTierUnits.ts` — `listTierUnits`/`updateTierUnitStatus` client functions.
- `frontend/src/components/owner/ActivityUnitsManager.tsx` — the "Table 1 Available / Table 2 Maintenance" owner panel.
- `frontend/src/components/customer/ActivitiesSection.tsx` — café-detail "Activities" cards.

**Frontend — modified files:**
- `frontend/src/types/tier.ts` — `tierType`/`activityKind` on `HardwareTier`, `TierCreateRequest`, `TierUpdateRequest`, `TierConfig`.
- `frontend/src/components/owner/PlatformTierConfigurator.tsx` — new "Activities" mode (preset chips, no specs form).
- `frontend/src/app/(owner)/owner/tiers/page.tsx` — renders `ActivityUnitsManager` for activity tiers.
- `frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx` — renders `ActivitiesSection`, excludes activity tiers from the "Hardware tiers" list.

---

## Task 1: Schema — `tier_type`/`activity_kind` columns + `hardware_tier_units` table

**Files:**
- Create: `backend/migrations/versions/024_add_cafe_activities.py`
- Create: `backend/app/models/hardware_tier_unit.py`
- Modify: `backend/app/models/hardware_tier.py`
- Modify: `backend/app/models/__init__.py` (register the new model, matching the pattern every other model uses)
- Test: `backend/tests/test_cafe_activities.py`

**Interfaces:**
- Produces: `TierType` enum (`GAMING="gaming"`, `ACTIVITY="activity"`) and `UnitStatus` enum (`AVAILABLE="available"`, `MAINTENANCE="maintenance"`) in `app/models/hardware_tier.py` and `app/models/hardware_tier_unit.py` respectively; `HardwareTier.tier_type: Mapped[TierType]`, `HardwareTier.activity_kind: Mapped[str | None]`; `HardwareTierUnit(id, tier_id, label, status, created_at, updated_at)`.

- [ ] **Step 1: Write the failing model/migration test**

```python
# backend/tests/test_cafe_activities.py
import pytest
from uuid import uuid4
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.hardware_tier import HardwareTier, TierType, PlatformType
from app.models.hardware_tier_unit import HardwareTierUnit, UnitStatus
from app.models.cafe import Cafe, VerificationStatus
from app.models.user import User, UserRole
from app.core.security import get_password_hash


@pytest.mark.asyncio
async def test_hardware_tier_defaults_to_gaming_type():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"activity_owner_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Activity Owner",
            role=UserRole.CAFE_OWNER, is_active=True,
        )
        db.add(owner)
        await db.flush()
        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Activity Test Cafe",
            address_line1="1 Cue St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000099",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.flush()

        tier = HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="RTX 4090 PC",
            total_seats=4, app_bookable_seats=4, price_per_hour=100,
        )
        db.add(tier)
        await db.commit()
        await db.refresh(tier)

        assert tier.tier_type == TierType.GAMING
        assert tier.activity_kind is None


@pytest.mark.asyncio
async def test_activity_tier_and_units_roundtrip():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"activity_owner2_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Activity Owner 2",
            role=UserRole.CAFE_OWNER, is_active=True,
        )
        db.add(owner)
        await db.flush()
        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Snooker Test Cafe",
            address_line1="2 Cue St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000098",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.flush()

        tier = HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="Snooker",
            tier_type=TierType.ACTIVITY, activity_kind="Snooker",
            total_seats=3, app_bookable_seats=3, price_per_hour=400,
            platform=None,
        )
        db.add(tier)
        await db.flush()

        for i in range(1, 4):
            db.add(HardwareTierUnit(id=uuid4(), tier_id=tier.id, label=f"Table {i}", status=UnitStatus.AVAILABLE))
        await db.commit()

        result = await db.execute(select(HardwareTierUnit).where(HardwareTierUnit.tier_id == tier.id))
        units = result.scalars().all()
        assert len(units) == 3
        assert all(u.status == UnitStatus.AVAILABLE for u in units)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_cafe_activities.py -v`
Expected: FAIL — `ImportError: cannot import name 'TierType'` (module doesn't exist yet).

- [ ] **Step 3: Add `TierType` + columns to `HardwareTier`, create `HardwareTierUnit`**

In `backend/app/models/hardware_tier.py`, add alongside the existing `PlatformType` enum:

```python
class TierType(str, enum.Enum):
    GAMING = "gaming"
    ACTIVITY = "activity"
```

Add to the `HardwareTier` class body (after `platform`/`model`):

```python
    # 'gaming' = PC/console tier (existing behavior, platform/specs apply).
    # 'activity' = non-gaming bookable inventory (snooker, arcade, etc.) —
    # platform/specs are always unused/null for these; see activity_kind.
    tier_type: Mapped[TierType] = mapped_column(
        Enum(TierType, values_callable=lambda x: [e.value for e in x]),
        default=TierType.GAMING, server_default=TierType.GAMING.value, nullable=False
    )
    # Free text ("Snooker", "Arcade", "Racing Simulator", or any custom
    # name) — deliberately NOT a fixed enum. A new activity type must never
    # require a backend change; see docs/superpowers/plans/2026-09-07-cafe-activities.md.
    activity_kind: Mapped[str | None] = mapped_column(String(50), nullable=True)
```

Create `backend/app/models/hardware_tier_unit.py`:

```python
import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UnitStatus(str, enum.Enum):
    AVAILABLE = "available"
    MAINTENANCE = "maintenance"


class HardwareTierUnit(Base):
    """One physical bookable unit within an activity tier — e.g. "Table 2"
    within a "Snooker" tier with total_seats=4. Never assigned to a specific
    Booking (bookings still claim pooled capacity via HardwareTier the same
    way every tier works today) — a unit's only job is to let an owner mark
    one physical table/machine as unavailable without touching the rest of
    the tier's capacity or deleting the activity. See
    HardwareTierUnitRepository.count_in_maintenance, which is subtracted
    from the tier's effective bookable capacity at booking time."""
    __tablename__ = "hardware_tier_units"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("hardware_tiers.id", ondelete="CASCADE"), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[UnitStatus] = mapped_column(
        Enum(UnitStatus, values_callable=lambda x: [e.value for e in x]),
        default=UnitStatus.AVAILABLE, server_default=UnitStatus.AVAILABLE.value, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
```

Register it in `backend/app/models/__init__.py` the same way every other model file is imported there (check the existing pattern in that file and add the matching line for `HardwareTierUnit`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_cafe_activities.py -v`
Expected: PASS (2 tests) — the test DB is built from `Base.metadata.create_all` per `tests/conftest.py`, so no migration run is required for tests to pass.

- [ ] **Step 5: Write the migration for real deployments**

Create `backend/migrations/versions/024_add_cafe_activities.py`:

```python
"""Add tier_type/activity_kind to hardware_tiers, add hardware_tier_units

Revision ID: 024
Revises: 023
Create Date: 2026-09-07

"""
from alembic import op
import sqlalchemy as sa

revision = '024'
down_revision = '023'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'hardware_tiers',
        sa.Column('tier_type', sa.String(length=20), nullable=False, server_default='gaming'),
    )
    op.add_column(
        'hardware_tiers',
        sa.Column('activity_kind', sa.String(length=50), nullable=True),
    )
    op.create_table(
        'hardware_tier_units',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tier_id', sa.UUID(), nullable=False),
        sa.Column('label', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='available'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tier_id'], ['hardware_tiers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_hardware_tier_units_tier_id'), 'hardware_tier_units', ['tier_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_hardware_tier_units_tier_id'), table_name='hardware_tier_units')
    op.drop_table('hardware_tier_units')
    op.drop_column('hardware_tiers', 'activity_kind')
    op.drop_column('hardware_tiers', 'tier_type')
```

Note: `tier_type`/`status` are plain `String` columns in the migration (not a Postgres native `ENUM` type), matching how `transfer_status` on `PlatformFee` and other string-backed enums in this codebase are already migrated — avoids an `ALTER TYPE` migration the day a third `TierType` value is added.

- [ ] **Step 6: Verify the migration loads (no live DB required for this check)**

Run: `cd backend && python -c "import importlib.util; spec = importlib.util.spec_from_file_location('m', 'migrations/versions/024_add_cafe_activities.py'); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); print('OK', m.revision, m.down_revision)"`
Expected: `OK 024 023`

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/hardware_tier.py backend/app/models/hardware_tier_unit.py backend/app/models/__init__.py backend/migrations/versions/024_add_cafe_activities.py backend/tests/test_cafe_activities.py
git commit -m "feat(activities): add tier_type/activity_kind columns and hardware_tier_units table"
```

---

## Task 2: `HardwareTierUnitRepository` + wire maintenance count into capacity checks

**Files:**
- Create: `backend/app/repositories/hardware_tier_unit_repository.py`
- Modify: `backend/app/repositories/booking_repository.py:147-174` (`get_overlapping_bookings_count_with_lock`)
- Modify: `backend/app/api/v1/cafes.py:75-136` (`get_cafe_availability`)
- Test: `backend/tests/test_cafe_activities.py` (append)

**Interfaces:**
- Consumes: `HardwareTierUnit`, `UnitStatus` from Task 1.
- Produces: `HardwareTierUnitRepository.count_in_maintenance(tier_id: UUID) -> int`, `.list_by_tier(tier_id: UUID) -> list[HardwareTierUnit]`, `.set_status(unit_id: UUID, status: UnitStatus) -> HardwareTierUnit | None`, `.sync_units_to_quantity(tier_id: UUID, quantity: int, label_prefix: str) -> list[HardwareTierUnit]` (a pure DB grow/shrink — callers are responsible for the capacity-safety check *before* calling this, it does not check anything itself); `BookingRepository.find_first_capacity_conflict(tier_id: UUID, new_capacity: int) -> Booking | None` — later tasks call all five by these exact names.

- [ ] **Step 1: Write the failing test for maintenance reducing capacity**

```python
# append to backend/tests/test_cafe_activities.py
from app.repositories.hardware_tier_unit_repository import HardwareTierUnitRepository
from app.repositories.booking_repository import BookingRepository


@pytest.mark.asyncio
async def test_maintenance_unit_reduces_booking_capacity():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"activity_owner3_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Activity Owner 3",
            role=UserRole.CAFE_OWNER, is_active=True,
        )
        db.add(owner)
        await db.flush()
        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Maintenance Test Cafe",
            address_line1="3 Cue St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000097",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.flush()

        tier = HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="Snooker",
            tier_type=TierType.ACTIVITY, activity_kind="Snooker",
            total_seats=3, app_bookable_seats=3, price_per_hour=400,
        )
        db.add(tier)
        await db.flush()

        unit_repo = HardwareTierUnitRepository(db)
        units = await unit_repo.sync_units_to_quantity(tier.id, 3, "Table")
        await unit_repo.set_status(units[0].id, UnitStatus.MAINTENANCE)

        assert await unit_repo.count_in_maintenance(tier.id) == 1

        booking_repo = BookingRepository(db)
        from datetime import date, time
        count, capacity = await booking_repo.get_overlapping_bookings_count_with_lock(
            tier_id=tier.id, session_date=date(2026, 9, 10),
            start_time=time(18, 0), end_time=time(19, 0),
        )
        assert capacity == 2  # 3 total - 1 in maintenance
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_cafe_activities.py::test_maintenance_unit_reduces_booking_capacity -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.repositories.hardware_tier_unit_repository'`

- [ ] **Step 3: Write `HardwareTierUnitRepository`**

Create `backend/app/repositories/hardware_tier_unit_repository.py`:

```python
from typing import List, Optional
from uuid import UUID, uuid4
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hardware_tier_unit import HardwareTierUnit, UnitStatus


class HardwareTierUnitRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_by_tier(self, tier_id: UUID) -> List[HardwareTierUnit]:
        result = await self.db.execute(
            select(HardwareTierUnit).where(HardwareTierUnit.tier_id == tier_id).order_by(HardwareTierUnit.label)
        )
        return list(result.scalars().all())

    async def count_in_maintenance(self, tier_id: UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(HardwareTierUnit).where(
                HardwareTierUnit.tier_id == tier_id,
                HardwareTierUnit.status == UnitStatus.MAINTENANCE,
            )
        )
        return int(result.scalar() or 0)

    async def set_status(self, unit_id: UUID, status: UnitStatus) -> Optional[HardwareTierUnit]:
        result = await self.db.execute(select(HardwareTierUnit).where(HardwareTierUnit.id == unit_id))
        unit = result.scalars().first()
        if not unit:
            return None
        unit.status = status
        await self.db.commit()
        await self.db.refresh(unit)
        return unit

    async def sync_units_to_quantity(self, tier_id: UUID, quantity: int, label_prefix: str) -> List[HardwareTierUnit]:
        """Grow/shrink the tier's unit rows to match `quantity`, called after
        an owner creates an activity tier or changes its total_seats. Existing
        units (and their maintenance status) are preserved — growth appends
        new "{label_prefix} N" rows, shrinkage removes the highest-numbered
        rows first regardless of status (this is a quantity edit, not a
        targeted removal — an owner shrinking from 4 to 3 tables expects
        Table 4 to go away, not to be asked which one)."""
        existing = await self.list_by_tier(tier_id)
        if len(existing) < quantity:
            for i in range(len(existing) + 1, quantity + 1):
                unit = HardwareTierUnit(id=uuid4(), tier_id=tier_id, label=f"{label_prefix} {i}", status=UnitStatus.AVAILABLE)
                self.db.add(unit)
            await self.db.commit()
        elif len(existing) > quantity:
            for unit in existing[quantity:]:
                await self.db.delete(unit)
            await self.db.commit()
        return await self.list_by_tier(tier_id)
```

- [ ] **Step 4: Subtract maintenance count in `booking_repository.get_overlapping_bookings_count_with_lock`**

In `backend/app/repositories/booking_repository.py`, add the import at the top:

```python
from app.models.hardware_tier_unit import HardwareTierUnit, UnitStatus
```

Replace the body of `get_overlapping_bookings_count_with_lock` (currently lines 147-174) with:

```python
    async def get_overlapping_bookings_count_with_lock(
        self,
        tier_id: UUID,
        session_date: date,
        start_time: time,
        end_time: time,
        use_cafe_capacity: bool = False,
        cafe_id: Optional[UUID] = None
    ) -> Tuple[int, int]:
        """Returns (overlapping_count, capacity) with row lock. Uses cafe.bookable_stations if use_cafe_capacity=True."""
        if use_cafe_capacity and cafe_id:
            cafe_stmt = select(Cafe).where(Cafe.id == cafe_id).with_for_update()
            cafe_result = await self.db.execute(cafe_stmt)
            cafe = cafe_result.scalars().first()
            capacity = cafe.bookable_stations if cafe else 0
        else:
            tier_stmt = select(HardwareTier).where(HardwareTier.id == tier_id).with_for_update()
            tier_result = await self.db.execute(tier_stmt)
            tier = tier_result.scalars().first()
            capacity = tier.app_bookable_seats if tier else 0
            # A unit in maintenance (owner-set — e.g. a broken snooker table)
            # takes one seat out of the bookable pool without touching
            # app_bookable_seats itself, so re-enabling the unit later
            # restores capacity without the owner re-entering a number.
            maintenance_stmt = select(func.count()).select_from(HardwareTierUnit).where(
                HardwareTierUnit.tier_id == tier_id,
                HardwareTierUnit.status == UnitStatus.MAINTENANCE,
            )
            maintenance_result = await self.db.execute(maintenance_stmt)
            capacity = max(0, capacity - int(maintenance_result.scalar() or 0))

        count = await self.get_overlapping_bookings_count(
            tier_id=tier_id,
            session_date=session_date,
            start_time=start_time,
            end_time=end_time
        )
        return count, capacity
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_cafe_activities.py -v`
Expected: PASS (3 tests)

- [ ] **Step 6: Subtract maintenance count in the customer-facing availability endpoint**

In `backend/app/api/v1/cafes.py`, add the import near the top (alongside the other repository imports):

```python
from app.repositories.hardware_tier_unit_repository import HardwareTierUnitRepository
```

In `get_cafe_availability`, right after the existing line `app_bookable_seats = tier.app_bookable_seats or tier.total_seats or 10` (line 117), insert:

```python
    unit_repo = HardwareTierUnitRepository(db)
    maintenance_count = await unit_repo.count_in_maintenance(tier_id)
    app_bookable_seats = max(0, app_bookable_seats - maintenance_count)
```

- [ ] **Step 7: Run the full booking/availability test suite to confirm no regression**

Run: `cd backend && python -m pytest tests/ -q -k "booking or availability or activities"`
Expected: all pass (this endpoint/repo change is additive — `count_in_maintenance` returns 0 for every existing tier, since no `hardware_tier_units` rows exist for them, so `app_bookable_seats` is unchanged for every tier created before this feature).

- [ ] **Step 8: Write the failing test for the capacity-safety check**

This is the mechanism requirements 3 and 4 depend on: before shrinking a tier's capacity (via maintenance or a quantity reduction), find whether any already-committed future booking would be oversold by the shrink. Append to `backend/tests/test_cafe_activities.py`:

```python
from datetime import date, time


@pytest.mark.asyncio
async def test_capacity_conflict_detected_for_fully_booked_future_slot():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"activity_owner4_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Activity Owner 4",
            role=UserRole.CAFE_OWNER, is_active=True,
        )
        db.add(owner)
        await db.flush()
        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Conflict Test Cafe",
            address_line1="5 Cue St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000095",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.flush()

        tier = HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="Snooker",
            tier_type=TierType.ACTIVITY, activity_kind="Snooker",
            total_seats=3, app_bookable_seats=3, price_per_hour=400,
        )
        db.add(tier)
        await db.flush()

        from app.models.booking import Booking, BookingStatus
        future_booking = Booking(
            id=uuid4(), booking_reference=f"CONF{uuid4().hex[:8].upper()}",
            gamer_id=owner.id, cafe_id=cafe.id, hardware_tier_id=tier.id,
            seats_count=3, session_date=date(2026, 12, 1),
            start_time=time(18, 0), end_time=time(19, 0), duration_hours=1,
            base_amount=1200, total_amount=1200, status=BookingStatus.CONFIRMED,
        )
        db.add(future_booking)
        await db.commit()

        booking_repo = BookingRepository(db)
        # All 3 seats are booked for that slot — shrinking to 2 must conflict.
        conflict = await booking_repo.find_first_capacity_conflict(tier.id, new_capacity=2)
        assert conflict is not None
        assert conflict.id == future_booking.id

        # Shrinking to 3 (no real reduction) or leaving capacity alone is safe.
        no_conflict = await booking_repo.find_first_capacity_conflict(tier.id, new_capacity=3)
        assert no_conflict is None
```

- [ ] **Step 9: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_cafe_activities.py::test_capacity_conflict_detected_for_fully_booked_future_slot -v`
Expected: FAIL — `AttributeError: 'BookingRepository' object has no attribute 'find_first_capacity_conflict'`

- [ ] **Step 10: Add `find_first_capacity_conflict` to `BookingRepository`**

In `backend/app/repositories/booking_repository.py`, add this method (it can go right after `get_overlapping_bookings_count_with_lock`):

```python
    async def find_first_capacity_conflict(self, tier_id: UUID, new_capacity: int) -> Optional[Booking]:
        """Would reducing this tier's effective capacity to `new_capacity`
        oversell any already-committed future booking? Checked before both
        a maintenance toggle and a quantity reduction (requirements 3–4) —
        neither may ever silently make a confirmed booking's slot exceed
        capacity.

        Correctness note: peak concurrent demand across a set of time
        intervals is always achieved at one of the intervals' own start
        times (a standard interval-scheduling fact), so checking the
        overlap count at each future booking's own window — via the
        existing get_overlapping_bookings_count, unchanged — is sufficient
        to find the true worst case without a separate sweep-line pass.
        Returns the first conflicting Booking found, or None if the
        reduction is safe."""
        now_utc = datetime.now(timezone.utc)
        today = now_utc.date()
        stmt = select(Booking).where(
            Booking.hardware_tier_id == tier_id,
            Booking.session_date >= today,
            or_(
                Booking.status == BookingStatus.CONFIRMED,
                and_(
                    Booking.status == BookingStatus.PENDING_PAYMENT,
                    Booking.created_at >= now_utc - timedelta(minutes=15)
                )
            ),
        )
        result = await self.db.execute(stmt)
        future_bookings = result.scalars().all()

        for booking in future_bookings:
            overlap = await self.get_overlapping_bookings_count(
                tier_id=tier_id,
                session_date=booking.session_date,
                start_time=booking.start_time,
                end_time=booking.end_time,
            )
            if overlap > new_capacity:
                return booking
        return None
```

- [ ] **Step 11: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_cafe_activities.py -v`
Expected: PASS (4 tests)

- [ ] **Step 12: Commit**

```bash
git add backend/app/repositories/hardware_tier_unit_repository.py backend/app/repositories/booking_repository.py backend/app/api/v1/cafes.py backend/tests/test_cafe_activities.py
git commit -m "feat(activities): subtract maintenance-unit count from capacity, add capacity-safety conflict check"
```

---

## Task 3: Schemas + `HardwareTierService` — create/update activity tiers, auto-sync units

**Files:**
- Modify: `backend/app/schemas/hardware_tier.py`
- Modify: `backend/app/services/hardware_tier_service.py`
- Test: `backend/tests/test_cafe_activities.py` (append)

**Interfaces:**
- Consumes: `TierType`, `HardwareTierUnitRepository.sync_units_to_quantity`/`.list_by_tier` from Task 2, `BookingRepository.find_first_capacity_conflict` from Task 2.
- Produces: `HardwareTierService(tier_repo, cafe_repo=None, promo_repo=None, unit_repo=None, booking_repo=None)` — two new optional constructor args; `HardwareTierResponse.tier_type`, `.activity_kind` fields present on every tier the API returns, `.performance_rating` is `None` for activity tiers.

- [ ] **Step 1: Write the failing endpoint test**

```python
# append to backend/tests/test_cafe_activities.py
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.security import create_access_token
from app.models.user_role import UserRoleMapping


@pytest.mark.asyncio
async def test_create_activity_tier_via_api_generates_units():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"activity_api_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Activity API Owner",
            role=UserRole.CAFE_OWNER, is_active=True,
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Activity API Cafe",
            address_line1="4 Cue St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000096",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post(
                f"/api/v1/cafes/{cafe.id}/tiers",
                json={
                    "name": "Snooker",
                    "description": "4 full-size tables with professional cues.",
                    "specs": {},
                    "totalSeats": 4,
                    "appBookableSeats": 4,
                    "pricePerHour": 400,
                    "tierType": "activity",
                    "activityKind": "Snooker",
                },
                headers=headers,
            )
            assert res.status_code == 201
            tier = res.json()["data"]["hardwareTier"]
            assert tier["tierType"] == "activity"
            assert tier["activityKind"] == "Snooker"
            assert tier["platform"] is None
            assert tier["performanceRating"] is None  # bugfix: no gaming rating on an activity

            units_res = await client.get(
                f"/api/v1/cafes/{cafe.id}/tiers/{tier['id']}/units", headers=headers
            )
            assert units_res.status_code == 200
            units = units_res.json()["data"]["units"]
            assert [u["label"] for u in units] == ["Snooker 1", "Snooker 2", "Snooker 3", "Snooker 4"]


@pytest.mark.asyncio
async def test_create_pooled_activity_tier_has_no_units():
    """Requirement 2: pooled-capacity mode (e.g. Arcade Zone) never gets
    hardware_tier_units rows — capacity is just total_seats/app_bookable_seats,
    exactly like every existing PC/console tier. individualUnits omitted
    (defaults to pooled) is the same as sending it false."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"pooled_owner_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Pooled Owner",
            role=UserRole.CAFE_OWNER, is_active=True,
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Pooled Activity Cafe",
            address_line1="6 Cue St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000094",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post(
                f"/api/v1/cafes/{cafe.id}/tiers",
                json={
                    "name": "Arcade Zone",
                    "specs": {},
                    "totalSeats": 20,
                    "appBookableSeats": 20,
                    "pricePerHour": 150,
                    "tierType": "activity",
                    "activityKind": "Arcade",
                    # individualUnits omitted — pooled by default
                },
                headers=headers,
            )
            assert res.status_code == 201
            tier = res.json()["data"]["hardwareTier"]

            units_res = await client.get(
                f"/api/v1/cafes/{cafe.id}/tiers/{tier['id']}/units", headers=headers
            )
            assert units_res.json()["data"]["units"] == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_cafe_activities.py::test_create_activity_tier_via_api_generates_units -v`
Expected: FAIL — `tierType`/`activityKind` missing from the response (422 or KeyError on `tier["tierType"]`), and the `/units` route 404s.

- [ ] **Step 3: Add fields to schemas**

In `backend/app/schemas/hardware_tier.py`, add the import and two fields to `HardwareTierBase`:

```python
from app.models.hardware_tier import PlatformType, TierType
```

```python
class HardwareTierBase(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    specs: Dict[str, Any] = Field(default_factory=dict)
    total_seats: int = Field(..., gt=0)
    app_bookable_seats: int = Field(..., ge=0)
    reserved_walkin_seats: Optional[int] = Field(None, ge=0)
    preset_category: Optional[str] = Field(None, max_length=50)
    price_per_hour: float = Field(..., gt=0.0)
    platform: Optional[PlatformType] = None
    model: Optional[str] = Field(None, max_length=100)
    tier_type: TierType = TierType.GAMING
    activity_kind: Optional[str] = Field(None, max_length=50)
```

`individual_units` is deliberately **not** on `HardwareTierBase` — putting it there would make it leak into `HardwareTierResponse` (which inherits `HardwareTierBase`), implying every tier has a persisted "mode" flag when it doesn't (see Global Constraints — unit *existence* is the only signal, nothing is stored). Add it only to the `Create` subclass instead:

```python
class HardwareTierCreate(HardwareTierBase):
    # Create-only, never persisted as its own column and never echoed back
    # on HardwareTierResponse — whether to generate named hardware_tier_units
    # rows ("Snooker 1".."Snooker N") for this activity right now. False (the
    # default) = pooled capacity (e.g. Arcade Zone), no unit rows ever. This
    # is a one-time choice at creation; HardwareTierUpdate has no equivalent
    # field — whether a later update resyncs units is decided by whether
    # units already exist for that tier, not by a stored flag.
    individual_units: bool = False

HardwareTierCreateRequest = HardwareTierCreate
```

(replacing the existing bare `class HardwareTierCreate(HardwareTierBase): pass` / `HardwareTierCreateRequest = HardwareTierCreate` two lines.)

And to `HardwareTierUpdate` (which does not inherit from `HardwareTierBase`):

```python
class HardwareTierUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    specs: Optional[Dict[str, Any]] = None
    total_seats: Optional[int] = Field(None, gt=0)
    app_bookable_seats: Optional[int] = Field(None, ge=0)
    reserved_walkin_seats: Optional[int] = Field(None, ge=0)
    active_seats_count: Optional[int] = Field(None, ge=0)
    preset_category: Optional[str] = Field(None, max_length=50)
    price_per_hour: Optional[float] = Field(None, gt=0.0)
    is_active: Optional[bool] = None
    platform: Optional[PlatformType] = None
    model: Optional[str] = Field(None, max_length=100)
    activity_kind: Optional[str] = Field(None, max_length=50)
```

(`tier_type` is deliberately **not** on `HardwareTierUpdate` — a tier never switches between gaming and activity after creation; that avoids having to reconcile specs/units mid-flight.)

- [ ] **Step 4: Pass `tier_type`/`activity_kind` through, sync units only when opted in, skip rating for activities**

In `backend/app/services/hardware_tier_service.py`, update the constructor and imports:

```python
from app.repositories.hardware_tier_unit_repository import HardwareTierUnitRepository
from app.repositories.booking_repository import BookingRepository
from app.models.hardware_tier import HardwareTier, TierType
from app.core.exceptions import ValidationException  # already imported — confirm, don't duplicate
```

```python
    def __init__(
        self,
        tier_repo: HardwareTierRepository,
        cafe_repo: Optional[CafeRepository] = None,
        promo_repo: Optional[PromotionRepository] = None,
        unit_repo: Optional[HardwareTierUnitRepository] = None,
        booking_repo: Optional[BookingRepository] = None,
    ):
        self.tier_repo = tier_repo
        self.cafe_repo = cafe_repo
        self.promo_repo = promo_repo
        self.unit_repo = unit_repo
        self.booking_repo = booking_repo
```

In `add_hardware_tier`, add two keys to `tier_dict` (right after `"model": tier_in.model,`):

```python
            "tier_type": tier_in.tier_type,
            "activity_kind": tier_in.activity_kind,
```

Immediately after `created = await self.tier_repo.create(tier_dict)`, add — note the `tier_in.individual_units` check (requirement 2: pooled is the default, units are only generated when explicitly opted into):

```python
        if created.tier_type == TierType.ACTIVITY and tier_in.individual_units and self.unit_repo:
            await self.unit_repo.sync_units_to_quantity(
                created.id, created.total_seats, created.activity_kind or created.name or "Unit"
            )
```

Find the line `rating = compute_rating(final_specs)` in this same method and change it to:

```python
        rating = compute_rating(final_specs) if tier_in.tier_type == TierType.GAMING else None
```

In `update_hardware_tier`, the quantity-reduction path needs the capacity-safety check (requirement 4) **before** the tier is even written, so insert this right after the existing seat-validation block (after the existing `if active > total: raise ValidationException(...)` line, before `if update_data.platform is not None or update_data.model is not None:`):

```python
        if tier.tier_type == TierType.ACTIVITY and update_data.total_seats is not None and update_data.total_seats < tier.total_seats:
            if self.booking_repo and self.unit_repo:
                # Conservative: assume any units already in maintenance
                # survive the resize (sync_units_to_quantity removes the
                # highest-numbered rows first regardless of status, so an
                # existing maintenance unit is not guaranteed to be one of
                # the ones removed) — subtracting the current maintenance
                # count keeps this check from ever under-estimating risk.
                maintenance_count = await self.unit_repo.count_in_maintenance(tier_id)
                new_effective_capacity = max(0, bookable - maintenance_count)
                conflict = await self.booking_repo.find_first_capacity_conflict(tier_id, new_capacity=new_effective_capacity)
                if conflict:
                    raise ValidationException(
                        message=f"Can't reduce quantity — {conflict.booking_reference} on {conflict.session_date} would no longer fit. Cancel or wait for that booking first.",
                        error_code="CAPACITY_REDUCTION_CONFLICT"
                    )
```

(`bookable` here is the already-computed `update_data.app_bookable_seats if update_data.app_bookable_seats is not None else tier.app_bookable_seats` local variable a few lines above this insertion point in the existing method — reuse it, don't recompute.)

Right after `updated = await self.tier_repo.update(tier_id, update_dict)`, replace units resync to be existence-gated, not tier-type-gated (requirement 2 — a *pooled* activity must never suddenly grow unit rows just because its quantity changed; only a tier that already opted into individual units at creation resyncs):

```python
        if updated.tier_type == TierType.ACTIVITY and self.unit_repo and "total_seats" in update_dict:
            existing_units = await self.unit_repo.list_by_tier(updated.id)
            if existing_units:  # only individual-unit-mode tiers ever have rows here
                await self.unit_repo.sync_units_to_quantity(
                    updated.id, updated.total_seats, updated.activity_kind or updated.name or "Unit"
                )
```

Find `rating = compute_rating(updated.specs)` in this same method and change it the same way:

```python
        rating = compute_rating(updated.specs) if updated.tier_type == TierType.GAMING else None
```

Apply the identical one-line change (`compute_rating(...) if <tier's tier_type> == TierType.GAMING else None`) to the two remaining call sites in this file: `get_tier` (uses `tier.tier_type`/`tier.specs`) and `get_cafe_tiers` (uses `t.tier_type`/`t.specs`, inside its loop).

- [ ] **Step 5: Fix the `platforms_complete` bug found under requirement 6**

In `backend/app/repositories/cafe_repository.py`, find line 163–170 and change:

```python
            platforms = sorted({t.platform.value for t in cafe_tiers if t.platform is not None})
```

to filter to gaming tiers first (both this line and `platforms_complete` below it should read from the same filtered list):

```python
            gaming_tiers_for_platforms = [t for t in cafe_tiers if t.tier_type == TierType.GAMING]
            platforms = sorted({t.platform.value for t in gaming_tiers_for_platforms if t.platform is not None})
```

and change:

```python
            platforms_complete = all(t.platform is not None for t in cafe_tiers)
```

to:

```python
            platforms_complete = all(t.platform is not None for t in gaming_tiers_for_platforms)
```

Add the import `from app.models.hardware_tier import TierType` at the top of this file if `HardwareTier`/`PlatformType` aren't already imported there under a name that also exposes `TierType` — check the existing import line for `HardwareTier` in this file and extend it.

Add a regression test — append to `backend/tests/test_cafe_activities.py`:

```python
@pytest.mark.asyncio
async def test_platforms_complete_ignores_activity_tiers():
    """Bugfix (requirement 6): a café with one fully-migrated PC tier and one
    Snooker activity must still report platforms_complete=True in the
    Explore-page search results — activities have no platform by design and
    must not count against it. flex_search_verified is the one method in
    cafe_repository.py that computes platforms_complete (confirmed by
    grepping the file — it appears nowhere else)."""
    from app.repositories.cafe_repository import CafeRepository

    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"platforms_owner_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Platforms Owner",
            role=UserRole.CAFE_OWNER, is_active=True,
        )
        db.add(owner)
        await db.flush()
        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Platforms Complete Cafe",
            address_line1="7 Cue St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000093",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.flush()

        db.add(HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="RTX 4090 PC",
            platform=PlatformType.PC, model="RTX 4090",
            total_seats=4, app_bookable_seats=4, price_per_hour=100,
        ))
        db.add(HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="Snooker",
            tier_type=TierType.ACTIVITY, activity_kind="Snooker",
            total_seats=3, app_bookable_seats=3, price_per_hour=400,
        ))
        await db.commit()

        cafe_repo = CafeRepository(db)
        items, total = await cafe_repo.flex_search_verified(city="Hyderabad", query="Platforms Complete Cafe")
        assert total == 1
        assert items[0]["platforms_complete"] is True
        assert items[0]["platforms"] == ["pc"]  # Snooker never contributes a platform
```

- [ ] **Step 6: Wire `unit_repo`/`booking_repo` into the two call sites and add the units endpoints**

In `backend/app/api/v1/cafes.py`, update both `add_hardware_tier` and `update_hardware_tier` to construct and pass `unit_repo`/`booking_repo`:

```python
    unit_repo = HardwareTierUnitRepository(db)
    booking_repo = BookingRepository(db)
    service = HardwareTierService(tier_repo, cafe_repo, unit_repo=unit_repo, booking_repo=booking_repo)
```

(replacing the existing `service = HardwareTierService(tier_repo, cafe_repo)` line in both functions — `list_hardware_tiers` is unaffected, it doesn't need either.)

Add two new endpoints right after `update_hardware_tier` (before the existing `# Hardware Tiers under Cafe` section ends):

```python
@router.get("/{cafe_id}/tiers/{tier_id}/units", status_code=status.HTTP_200_OK)
async def list_tier_units(cafe_id: UUID, tier_id: UUID, db: AsyncSession = Depends(get_db)):
    unit_repo = HardwareTierUnitRepository(db)
    units = await unit_repo.list_by_tier(tier_id)
    return {
        "success": True,
        "data": {
            "units": [
                {"id": str(u.id), "label": u.label, "status": u.status.value}
                for u in units
            ]
        }
    }


class TierUnitStatusUpdateRequest(BaseModel):
    status: str  # 'available' | 'maintenance'


@router.patch("/{cafe_id}/tiers/{tier_id}/units/{unit_id}", status_code=status.HTTP_200_OK)
async def update_tier_unit_status(
    cafe_id: UUID,
    tier_id: UUID,
    unit_id: UUID,
    payload: TierUnitStatusUpdateRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    from app.models.hardware_tier_unit import UnitStatus
    from app.core.exceptions import NotFoundException, ForbiddenException, ValidationException

    tier_repo = HardwareTierRepository(db)
    tier = await tier_repo.get_by_id(tier_id)
    if not tier or str(tier.cafe_id) != str(cafe_id):
        raise NotFoundException(message="Hardware tier not found", error_code="TIER_NOT_FOUND")

    cafe_repo = CafeRepository(db)
    cafe = await cafe_repo.get_by_id(cafe_id)
    if not cafe or str(cafe.owner_id) != str(current_owner.id):
        raise ForbiddenException(message="You can only manage your own café's activities", error_code="FORBIDDEN")

    try:
        status_enum = UnitStatus(payload.status)
    except ValueError:
        raise ValidationException(message="status must be 'available' or 'maintenance'", error_code="INVALID_UNIT_STATUS")

    unit_repo = HardwareTierUnitRepository(db)

    # Requirement 3: going INTO maintenance must never oversell a future
    # booking. Coming back to 'available' only ever increases capacity, so
    # it's always safe and skips this check.
    if status_enum == UnitStatus.MAINTENANCE:
        booking_repo = BookingRepository(db)
        maintenance_count = await unit_repo.count_in_maintenance(tier_id)
        new_capacity = max(0, tier.app_bookable_seats - (maintenance_count + 1))
        conflict = await booking_repo.find_first_capacity_conflict(tier_id, new_capacity=new_capacity)
        if conflict:
            raise ValidationException(
                message=f"Can't set this to maintenance — {conflict.booking_reference} on {conflict.session_date} needs the capacity. Schedule maintenance after that booking instead.",
                error_code="MAINTENANCE_CAPACITY_CONFLICT"
            )

    updated_unit = await unit_repo.set_status(unit_id, status_enum)
    if not updated_unit or str(updated_unit.tier_id) != str(tier_id):
        raise NotFoundException(message="Unit not found", error_code="UNIT_NOT_FOUND")

    return {
        "success": True,
        "data": {"unit": {"id": str(updated_unit.id), "label": updated_unit.label, "status": updated_unit.status.value}}
    }
```

Add the import for `BaseModel` at the top of `cafes.py` if it isn't already imported (`from pydantic import BaseModel`), and the `BookingRepository`/`HardwareTierUnitRepository` imports (the latter already added in Task 2 Step 6).

- [ ] **Step 7: Write the failing test for maintenance being blocked by a conflicting booking**

Append to `backend/tests/test_cafe_activities.py`:

```python
@pytest.mark.asyncio
async def test_maintenance_blocked_when_it_would_oversell_a_booking():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"maint_block_owner_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Maint Block Owner",
            role=UserRole.CAFE_OWNER, is_active=True,
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Maint Block Cafe",
            address_line1="8 Cue St", city="Hyderabad", state="Telangana",
            pincode="500001", phone_number="+919000000092",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            create_res = await client.post(
                f"/api/v1/cafes/{cafe.id}/tiers",
                json={
                    "name": "Snooker", "specs": {}, "totalSeats": 2, "appBookableSeats": 2,
                    "pricePerHour": 400, "tierType": "activity", "activityKind": "Snooker",
                    "individualUnits": True,
                },
                headers=headers,
            )
            tier_id = create_res.json()["data"]["hardwareTier"]["id"]

        async with AsyncSessionLocal() as db2:
            from app.models.booking import Booking, BookingStatus
            from datetime import date, time
            db2.add(Booking(
                id=uuid4(), booking_reference=f"MBLK{uuid4().hex[:8].upper()}",
                gamer_id=owner.id, cafe_id=cafe.id, hardware_tier_id=tier_id,
                seats_count=2, session_date=date(2026, 12, 5),
                start_time=time(18, 0), end_time=time(19, 0), duration_hours=1,
                base_amount=800, total_amount=800, status=BookingStatus.CONFIRMED,
            ))
            await db2.commit()

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            units_res = await client.get(f"/api/v1/cafes/{cafe.id}/tiers/{tier_id}/units", headers=headers)
            first_unit_id = units_res.json()["data"]["units"][0]["id"]

            # Both units are needed for the CONFIRMED 2-seat booking above —
            # putting either one into maintenance must be rejected.
            maint_res = await client.patch(
                f"/api/v1/cafes/{cafe.id}/tiers/{tier_id}/units/{first_unit_id}",
                json={"status": "maintenance"}, headers=headers,
            )
            assert maint_res.status_code == 422
            body = maint_res.json()
            assert body["error"]["code"] == "MAINTENANCE_CAPACITY_CONFLICT"
            assert "MBLK" in body["error"]["message"]
```

(Error envelope shape confirmed from `app/main.py`'s `custom_app_exception_handler`: `{"success": false, "data": null, "error": {"code": ..., "message": ..., "details": [...]}, "meta": {...}}` — this is what `ValidationException` always serializes to, matching every other `error_code`-raising endpoint in this codebase.)

- [ ] **Step 8: Run test to verify it fails, then implement until it passes**

Run: `cd backend && python -m pytest tests/test_cafe_activities.py -v`
Iterate Steps 4–6 above until every test in this file passes.

- [ ] **Step 9: Run the full backend suite**

Run: `cd backend && python -m pytest tests/ -q`
Expected: all pass — `tier_type` defaults to `'gaming'` for every existing call site that doesn't send it, so `test_platform_tier_service.py` and every other tier test is unaffected; the `platforms_complete` fix is a pure bugfix filtering to a subset that was previously the entire set for every café that has no activity tiers (i.e. every café today), so no existing café's computed value changes.

- [ ] **Step 10: Commit**

```bash
git add backend/app/schemas/hardware_tier.py backend/app/services/hardware_tier_service.py backend/app/repositories/cafe_repository.py backend/app/api/v1/cafes.py backend/tests/test_cafe_activities.py
git commit -m "feat(activities): create/update activity tiers with booking-safe maintenance and quantity reduction; fix platforms_complete/rating for activities"
```

---

## Task 4: Frontend types + activity icons + API client

**Files:**
- Create: `frontend/src/components/icons/ActivityIcons.tsx`
- Create: `frontend/src/lib/api/hardwareTierUnits.ts`
- Modify: `frontend/src/types/tier.ts`

**Interfaces:**
- Produces: `ActivityIcon({ activityKind }: { activityKind: string | null | undefined })` component; `ACTIVITY_PRESETS: { key, label, icon, defaultIndividualUnits }[]` (Snooker/Pool, Arcade, Racing Simulator, VR, Air Hockey, Foosball, Bowling, Other); `listTierUnits(cafeId, tierId)`, `updateTierUnitStatus(cafeId, tierId, unitId, status)`; `HardwareTier.tierType`, `.activityKind`.

- [ ] **Step 1: Add activity icons**

Create `frontend/src/components/icons/ActivityIcons.tsx`:

```tsx
// Marks for café Activities (snooker, arcade, etc.) — a separate axis from
// PlatformIcons.tsx's PC/console marks (a café's PC tiers and its Snooker
// tables both exist independently), so this is its own small icon set +
// helper, not a case added to PlatformIcon.
import type { SVGProps } from 'react';
import { Joystick, Zap, Rocket, CircleDot } from 'lucide-react';
import { SnookerIcon } from '@/components/icons/PlatformIcons';

export function AirHockeyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg role="img" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>Air Hockey</title>
      <rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <line x1="12" y1="6" x2="12" y2="18" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.5 1.5" />
      <circle cx="7" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function FoosballIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg role="img" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>Foosball</title>
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <line x1="7" y1="5" x2="7" y2="19" stroke="currentColor" strokeWidth="1.4" />
      <line x1="17" y1="5" x2="17" y2="19" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    </svg>
  );
}

/** Preset chips the owner picks from when adding an activity — deliberately
 *  a frontend-only suggestion list, not a backend enum. `key` is what gets
 *  sent as `activityKind`; "Other" is handled specially by the caller (free
 *  text input) and isn't sent as a literal activityKind value.
 *  `defaultIndividualUnits` is just this chip's starting suggestion for the
 *  Individual/Pooled toggle (Task 5) — table/machine-shaped activities
 *  default to individually-tracked units, an open zone defaults to pooled;
 *  the owner can always flip it before saving either way. */
export const ACTIVITY_PRESETS: { key: string; label: string; icon: React.ComponentType<{ className?: string }>; defaultIndividualUnits: boolean }[] = [
  { key: 'Snooker / Pool', label: 'Snooker / Pool', icon: SnookerIcon, defaultIndividualUnits: true },
  { key: 'Arcade', label: 'Arcade', icon: Joystick, defaultIndividualUnits: false },
  { key: 'Racing Simulator', label: 'Racing Simulator', icon: Rocket, defaultIndividualUnits: true },
  { key: 'VR', label: 'VR', icon: Zap, defaultIndividualUnits: true },
  { key: 'Air Hockey', label: 'Air Hockey', icon: AirHockeyIcon, defaultIndividualUnits: true },
  { key: 'Foosball', label: 'Foosball', icon: FoosballIcon, defaultIndividualUnits: true },
  { key: 'Bowling', label: 'Bowling', icon: CircleDot, defaultIndividualUnits: true },
];

/** Best-effort icon lookup for an arbitrary activityKind string (including
 *  ones an owner typed as custom text and that never matches a preset
 *  exactly) — falls back to a generic joystick mark rather than guessing. */
export function ActivityIcon({
  activityKind,
  className,
}: {
  activityKind: string | null | undefined;
  className?: string;
}) {
  const preset = ACTIVITY_PRESETS.find(
    (p) => p.key.toLowerCase() === (activityKind || '').toLowerCase()
  );
  const Icon = preset?.icon || Joystick;
  return <Icon className={className} />;
}
```

- [ ] **Step 2: Add the units API client**

Create `frontend/src/lib/api/hardwareTierUnits.ts`:

```ts
import { apiClient, call } from './client';

export interface HardwareTierUnit {
  id: string;
  label: string;
  status: 'available' | 'maintenance';
}

export async function listTierUnits(cafeId: string, tierId: string): Promise<{ units: HardwareTierUnit[] }> {
  return call(() => apiClient.get(`/api/v1/cafes/${cafeId}/tiers/${tierId}/units`));
}

export async function updateTierUnitStatus(
  cafeId: string,
  tierId: string,
  unitId: string,
  status: 'available' | 'maintenance',
): Promise<{ unit: HardwareTierUnit }> {
  return call(() => apiClient.patch(`/api/v1/cafes/${cafeId}/tiers/${tierId}/units/${unitId}`, { status }));
}
```

- [ ] **Step 3: Add `tierType`/`activityKind` to the tier types**

In `frontend/src/types/tier.ts`, add to `HardwareTier`, `TierCreateRequest`, `TierUpdateRequest`, and `TierConfig`:

```ts
export interface HardwareTier {
  // ...existing fields...
  tierType: 'gaming' | 'activity';
  activityKind: string | null;
}

export interface TierCreateRequest {
  // ...existing fields...
  tierType?: 'gaming' | 'activity';
  activityKind?: string;
  /** Create-only — see backend HardwareTierCreate.individual_units. Absent
   *  or false = pooled capacity, never sent/used again after creation. */
  individualUnits?: boolean;
}

export interface TierUpdateRequest {
  // ...existing fields...
  activityKind?: string;
}

export interface TierConfig {
  // ...existing fields...
  tierType: 'gaming' | 'activity';
  activityKind?: string;
  /** This component's own working state for the create-time toggle — see
   *  TierCreateRequest.individualUnits above for what it maps to on submit. */
  individualUnits?: boolean;
}
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: new errors only in files not yet updated to satisfy the now-required `TierConfig.tierType` (that's Task 5 — expected at this point).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/icons/ActivityIcons.tsx frontend/src/lib/api/hardwareTierUnits.ts frontend/src/types/tier.ts
git commit -m "feat(activities): add activity icons, units API client, tier type fields"
```

---

## Task 5: `PlatformTierConfigurator` — Activities mode

**Files:**
- Modify: `frontend/src/components/owner/PlatformTierConfigurator.tsx`

**Interfaces:**
- Consumes: `ACTIVITY_PRESETS`, `ActivityIcon` from Task 4; `TierConfig.tierType`/`.activityKind`.
- Produces: same `configs`/`onChange` contract as before (`TierConfig[]`), now carrying `tierType: 'activity'` rows alongside `tierType: 'gaming'` ones — `owner/tiers/page.tsx` (Task 6) and the onboarding wizard both consume this unchanged.

- [ ] **Step 1: Extend `makeDefaultConfig` and add an "Add Activity" section**

In `frontend/src/components/owner/PlatformTierConfigurator.tsx`, update the import and `makeDefaultConfig`:

```ts
import { ACTIVITY_PRESETS, ActivityIcon } from '@/components/icons/ActivityIcons';
```

```ts
function makeDefaultConfig(platform: Platform): TierConfig {
  const models = platform === 'other' ? [] : PLATFORM_MODELS[platform];
  return {
    id: safeRandomUUID(),
    platform,
    model: platform === 'other' ? '' : models[0],
    totalSeats: 4,
    appBookableSeats: 1,
    pricePerHour: 100,
    tierType: 'gaming',
  };
}

function makeDefaultActivityConfig(activityKind: string, defaultIndividualUnits: boolean): TierConfig {
  return {
    id: safeRandomUUID(),
    platform: 'other',
    model: activityKind,
    totalSeats: 2,
    appBookableSeats: 2,
    pricePerHour: 300,
    tierType: 'activity',
    activityKind,
    individualUnits: defaultIndividualUnits,
  };
}
```

(`platform: 'other'`/`model: activityKind` here is intentionally never sent to the backend as-is — Step 3 below strips `platform` before submit for activity rows, since `HardwareTierCreateRequest.platform` must stay `null` for activities per the Global Constraints. `TierConfig.platform` keeping a non-optional `Platform` value is just this component's own internal shape; only the submit mapping cares about the real payload.)

Add state + UI for the activity add-flow, right after the closing `</div>` of the existing "What does your café offer?" platform-chip block (before the `{PLATFORMS.filter(...)}` tier-detail cards):

```tsx
      <div>
        <label className="text-caption font-semibold text-text-primary mb-2 block">
          Activities (snooker, arcade, and other bookable extras)
        </label>
        <div className="flex flex-wrap gap-2 mb-3">
          {ACTIVITY_PRESETS.map(({ key, label, icon: Icon, defaultIndividualUnits }) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange([...configs, makeDefaultActivityConfig(key, defaultIndividualUnits)])}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-caption font-semibold border border-border bg-surface text-text-secondary hover:border-primary/60 transition-all"
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange([...configs, makeDefaultActivityConfig('', true)])}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-caption font-semibold border border-border bg-surface text-text-secondary hover:border-primary/60 transition-all"
          >
            <ActivityIcon activityKind={null} className="h-4 w-4" />
            Other
          </button>
        </div>

        {configs.filter((c) => c.tierType === 'activity').map((config) => (
          <div key={config.id} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-card border border-border/80 mb-3">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-overline font-semibold text-text-secondary">Activity name</label>
              <Input
                placeholder="e.g. Snooker"
                value={config.activityKind || ''}
                onChange={(e) => updateConfig(config.id, { activityKind: e.target.value, model: e.target.value })}
              />
            </div>

            <Input
              label={config.individualUnits ? 'Quantity (tables/machines)' : 'Capacity (people at once)'}
              type="number"
              min="1"
              value={config.totalSeats}
              onChange={(e) => updateConfig(config.id, { totalSeats: Number(e.target.value) })}
            />

            <Input
              label="Price per hour (₹)"
              type="number"
              min="1"
              value={config.pricePerHour}
              onChange={(e) => updateConfig(config.id, { pricePerHour: Number(e.target.value), appBookableSeats: config.totalSeats })}
            />

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-overline font-semibold text-text-secondary">Availability tracking</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateConfig(config.id, { individualUnits: true })}
                  className={`flex-1 px-3 py-2 rounded-xl text-caption font-semibold border transition-all ${
                    config.individualUnits ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-surface text-text-secondary'
                  }`}
                >
                  Individual units (e.g. Table 1, 2, 3)
                </button>
                <button
                  type="button"
                  onClick={() => updateConfig(config.id, { individualUnits: false })}
                  className={`flex-1 px-3 py-2 rounded-xl text-caption font-semibold border transition-all ${
                    !config.individualUnits ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-surface text-text-secondary'
                  }`}
                >
                  Pooled capacity (one shared count)
                </button>
              </div>
            </div>

            <div className="flex items-end justify-end sm:col-span-2">
              <button
                type="button"
                onClick={() => removeConfig(config.id)}
                className="flex items-center gap-1 text-caption font-semibold text-error hover:text-error/80 p-2"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
```

`updateConfig` already exists and works generically over `TierConfig` patches — no change needed there. Note `appBookableSeats` is kept equal to `totalSeats` for activities (no walk-in reservation carve-out — that PC/console concept doesn't map cleanly to "how many snooker tables are walk-in-only", and the spec says keep this minimal).

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: clean (no more errors from Task 4's `TierConfig.tierType` becoming required, since both `makeDefaultConfig` and `makeDefaultActivityConfig` now set it).

- [ ] **Step 3: Map `TierConfig` → `TierCreateRequest` correctly for activities at the call site**

The onboarding wizard and `owner/tiers/page.tsx` both convert `TierConfig` → the create/update request payload before calling the API — find that mapping (`config.platform`/`config.model` → `platform`/`model` fields) and change it so that when `config.tierType === 'activity'`, the payload sends `platform: undefined` (never `'other'`) and `activityKind: config.activityKind`, `name: config.activityKind`, `tierType: 'activity'`, and — **create requests only** — `individualUnits: config.individualUnits` (omit this field entirely on an update payload; per the backend's Global Constraints, mode is one-time-at-creation, `TierUpdateRequest` has no such field); when `'gaming'`, behavior is unchanged. This mapping already exists per call site (owner/tiers/page.tsx has one at `PlatformTierConfigurator` onChange around line 369, per Task 6 below) — Task 6 makes this exact edit in context since it owns that call site.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/owner/PlatformTierConfigurator.tsx
git commit -m "feat(activities): add Activities mode to PlatformTierConfigurator"
```

---

## Task 6: Owner — activity tier submission + per-unit maintenance manager

**Files:**
- Modify: `frontend/src/app/(owner)/owner/tiers/page.tsx`
- Create: `frontend/src/components/owner/ActivityUnitsManager.tsx`

**Interfaces:**
- Consumes: `listTierUnits`, `updateTierUnitStatus` (Task 4); `PlatformTierConfigurator` (Task 5).
- Produces: nothing consumed further — this is the owner-facing leaf.

- [ ] **Step 1: Read the existing submit mapping**

Open `frontend/src/app/(owner)/owner/tiers/page.tsx` around the `PlatformTierConfigurator` usage (~line 369) and the function that turns a `TierConfig` into the create/update request body (look for where `config.platform`/`config.model` are read before calling the tier create/update API). Locate the exact variable/function name in this file before editing — this plan assumes it's a `configToPayload`-shaped mapping local to this file; adapt the edit below to whatever it's actually named.

- [ ] **Step 2: Fix the mapping for activity configs**

Wherever that mapping builds the request body, change it so an activity config produces — note `individualUnits` is only included in the **create** branch (this page has separate create/update call sites; find both and apply the field only to the one that calls the `POST` tier-creation endpoint):

```ts
config.tierType === 'activity'
  ? {
      name: config.activityKind || 'Activity',
      totalSeats: config.totalSeats,
      appBookableSeats: config.appBookableSeats,
      pricePerHour: config.pricePerHour,
      specs: {},
      tierType: 'activity' as const,
      activityKind: config.activityKind,
      platform: undefined,
      model: undefined,
      ...(isCreate ? { individualUnits: config.individualUnits } : {}),
    }
  : {
      // existing gaming-tier mapping, unchanged
    }
```

- [ ] **Step 3: Build the per-unit maintenance manager**

Create `frontend/src/components/owner/ActivityUnitsManager.tsx`:

```tsx
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wrench, CheckCircle2 } from 'lucide-react';
import { listTierUnits, updateTierUnitStatus } from '@/lib/api/hardwareTierUnits';

interface ActivityUnitsManagerProps {
  cafeId: string;
  tierId: string;
  tierName: string;
}

/** The owner-facing "Table 1 Available / Table 2 Maintenance" view (spec
 *  §6) — reads/writes hardware_tier_units, never touches booking data. A
 *  unit in maintenance is excluded from bookable capacity server-side
 *  (see booking_repository.get_overlapping_bookings_count_with_lock); this
 *  component only toggles that status, it does not compute availability
 *  itself.
 *
 *  Self-hides (renders nothing) for a pooled-capacity activity — one with
 *  no hardware_tier_units rows at all, per the existence-based mode signal
 *  (see Global Constraints in the plan) — since there's nothing to manage
 *  per-unit for e.g. an Arcade Zone. The caller (owner/tiers/page.tsx) can
 *  therefore render this unconditionally for every activity tier without
 *  needing to know its mode itself. A rejected maintenance toggle (booking
 *  conflict, requirement 3) surfaces the backend's error message inline. */
export function ActivityUnitsManager({ cafeId, tierId, tierName }: ActivityUnitsManagerProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tier-units', tierId],
    queryFn: () => listTierUnits(cafeId, tierId),
    staleTime: 10_000,
  });

  const toggleMut = useMutation({
    mutationFn: ({ unitId, status }: { unitId: string; status: 'available' | 'maintenance' }) =>
      updateTierUnitStatus(cafeId, tierId, unitId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tier-units', tierId] });
    },
  });

  if (isLoading || !data) {
    return <p className="text-caption text-text-secondary">Loading {tierName} units...</p>;
  }

  if (data.units.length === 0) {
    return null; // pooled-capacity activity — nothing to manage per-unit
  }

  return (
    <div className="flex flex-col gap-1.5 mt-2">
      {toggleMut.isError && (
        <p className="text-caption text-error font-medium">
          {(toggleMut.error as Error)?.message || 'Could not update that unit.'}
        </p>
      )}
      {data.units.map((unit) => {
        const isMaintenance = unit.status === 'maintenance';
        return (
          <div key={unit.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface border border-border/60">
            <span className="text-caption font-semibold text-text-primary">{unit.label}</span>
            <button
              type="button"
              disabled={toggleMut.isPending}
              onClick={() =>
                toggleMut.mutate({ unitId: unit.id, status: isMaintenance ? 'available' : 'maintenance' })
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors disabled:opacity-50 ${
                isMaintenance
                  ? 'bg-warning/15 text-warning hover:bg-warning/25'
                  : 'bg-success/15 text-success hover:bg-success/25'
              }`}
            >
              {isMaintenance ? <Wrench className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
              {isMaintenance ? 'Maintenance' : 'Available'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Render it under each activity tier in the owner tiers list**

In `owner/tiers/page.tsx`, find where each tier row is rendered in the tiers list (the read-only list view, not the edit modal), and add — for rows where `tier.tierType === 'activity'` — an expandable section rendering `<ActivityUnitsManager cafeId={cafeId} tierId={tier.id} tierName={tier.name} />` (a simple `useState`-backed toggle button, matching the "Compare all tiers" expand pattern already used on the café detail page, is enough — no new UI primitive needed).

- [ ] **Step 5: Typecheck + manual verification**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: clean.

Manual check (per this project's UI-change convention — start the dev server and click through): as a café owner, go to Café → Tiers → Add Activity → Snooker → quantity 3 → save; confirm the new "Snooker" row appears, expand its units panel, confirm "Snooker 1/2/3" show as Available, toggle one to Maintenance, confirm it persists on refetch.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\(owner\)/owner/tiers/page.tsx frontend/src/components/owner/ActivityUnitsManager.tsx
git commit -m "feat(activities): owner activity submission + per-unit maintenance manager"
```

---

## Task 7: Customer — café-detail "Activities" section

**Files:**
- Create: `frontend/src/components/customer/ActivitiesSection.tsx`
- Modify: `frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx`

**Interfaces:**
- Consumes: `ActivityIcon` (Task 4), `CafeDetail.tiers` (now carrying `tierType`/`activityKind` per Task 4's type change).
- Produces: nothing consumed further.

- [ ] **Step 1: Build the Activities section**

Create `frontend/src/components/customer/ActivitiesSection.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { ActivityIcon } from '@/components/icons/ActivityIcons';
import type { HardwareTier } from '@/types/tier';

interface ActivitiesSectionProps {
  cafeId: string;
  activities: HardwareTier[];
}

/** Café-detail "Activities" cards (spec §7) — deliberately shows only what
 *  a customer cares about: what it is, price, and how many are available.
 *  No specs/technical fields, since activity tiers never have them (see
 *  Global Constraints in the implementation plan). Tapping a card reuses
 *  the exact same booking route every gaming tier already uses. */
export function ActivitiesSection({ cafeId, activities }: ActivitiesSectionProps) {
  if (activities.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-h2 text-text-primary">Activities</h2>
      <div className="flex flex-col gap-2.5">
        {activities.map((tier) => (
          <Link
            key={tier.id}
            href={`/bookings/new?cafeId=${cafeId}&tierId=${tier.id}`}
            className="flex items-center gap-4 p-4 rounded-2xl border border-border/80 bg-card hover:shadow-float hover:bg-surface transition-all"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-surface text-text-secondary">
              <ActivityIcon activityKind={tier.activityKind} className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-heading text-body-emphasis font-bold text-text-primary">{tier.name}</h3>
              <div className="flex flex-wrap items-center gap-x-1.5 text-caption text-text-secondary">
                <span>{tier.totalSeats} {tier.totalSeats === 1 ? 'unit' : 'units'}</span>
                {tier.description && (
                  <>
                    <span className="text-text-secondary/50">·</span>
                    <span className="truncate">{tier.description}</span>
                  </>
                )}
              </div>
            </div>
            <div className="font-data text-body-emphasis font-bold text-text-primary flex-shrink-0">
              <span className="rupee-symbol">₹</span>{tier.pricePerHour}
              <span className="text-caption font-normal text-text-secondary">/hr</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire it into the café detail page, split from gaming tiers**

In `frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx`:

```ts
import { ActivitiesSection } from '@/components/customer/ActivitiesSection';
```

Right after the line `const cheapestTier = ...` computation, add:

```ts
  const gamingTiers = (cafe.tiers ?? []).filter((t) => t.tierType !== 'activity');
  const activityTiers = (cafe.tiers ?? []).filter((t) => t.tierType === 'activity');
```

Change every subsequent `cafe.tiers` reference inside the "Hardware Tiers" section (`cafe.tiers.map`, `cafe.tiers.length`, `cafe.tiers!.map` in the comparison table) to `gamingTiers` instead, so activities never show up as a "hardware tier" card with an irrelevant spec table. `activeTier`/`cheapestTier` should keep deriving from the full `cafe.tiers` list (a café whose only inventory is Snooker should still default "Book now" to it) — leave those two computations as-is.

Add `<ActivitiesSection cafeId={cafe.id} activities={activityTiers} />` right after the closing `</section>` of the "Hardware Tiers" section.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 4: Manual verification**

Start the dev server, open a café detail page for the café seeded in Task 6's manual check, confirm "Activities" section shows the Snooker card with the right price/unit count, tap it, confirm it lands on `/bookings/new` with that tier preselected and the existing timeline/checkout flow works unchanged (this is the same booking route every PC/console tier already uses — no new booking code exists to test here, only that routing/preselection works).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/customer/ActivitiesSection.tsx frontend/src/app/\(customer\)/cafe/\[id\]/CafeDetailClient.tsx
git commit -m "feat(activities): show café Activities section on the customer detail page"
```

---

## Deliberately out of scope for v1

- **Explore-page filtering by activity type** ("show me cafés with Snooker") — `lib/platformTags.ts`'s heuristics and the Explore quick-filter chips only understand gaming platforms today. Natural follow-up once real activity data exists; not blocking booking a specific café's activities from its own detail page.
- **Activity photos** — `description` ships in this plan; an image field is a straightforward follow-up (café photo upload already exists as a pattern to copy) but adds scope without being required for the core booking flow to work.
- **Per-unit *assignment*** (customer picks "Table 2" specifically) — never built, and confirmed unnecessary: capacity math, the maintenance view, and the booking-safety checks all work off pooled quantity + unit *status*, not per-booking unit assignment, because no booking is tied to a specific physical unit anywhere in this codebase today (verified, not assumed — see Verified Assumptions).
- **Admin analytics bucket for activities** — `admin/inventory/setups` currently groups by `platform`; activity tiers have `platform=None` and will show under "Unspecified" until analytics gets a `tier_type`-aware grouping. Cosmetic, not booking-affecting.
- **Reassigning an existing gaming tier to individual-unit tracking retroactively** — the individual/pooled choice is create-time-only for activities, and PC/console tiers were never in scope for per-unit tracking at all (Global Constraints).

## Self-Review

**Requirement coverage (second round, the 8 explicit adjustments):**
1. "Activities", never "non-gaming" → feature name, file names, UI copy, and the `ActivityIcons.tsx` comment all say "Activities"; scrubbed the one stray "non-gaming" phrase found.
2. Individual units vs pooled capacity → unit-existence-based mode (Global Constraints), `individual_units` create-only field (Task 3), Individual/Pooled toggle in the owner UI defaulting per preset (Task 5), `test_create_pooled_activity_tier_has_no_units` proves a pooled tier never gets rows (Task 3).
3. Maintenance booking-safety → `find_first_capacity_conflict` (Task 2) gates the maintenance PATCH endpoint (Task 3, Step 6) with `test_maintenance_blocked_when_it_would_oversell_a_booking`.
4. Quantity-reduction booking-safety → the same `find_first_capacity_conflict` gates `update_hardware_tier`'s shrink path (Task 3, Step 4) — never deletes a unit backing a real booking, blocks with a named conflicting booking reference/date instead.
5. No parallel booking system → Architecture section states and the whole plan enforces zero new tables/paths in `booking_service.py`, `PlatformFee`, or the payment flow; activities are `HardwareTier` rows, full stop.
6. Verify-before-build → "Verified Assumptions" section, produced by re-reading `derive_tier_display`, `booking_service.create_booking`, `lib/platformTags.ts`, and `cafe_repository.py` before finalizing this plan; found and fixed two real bugs (`platforms_complete`, `compute_rating`) rather than assuming they'd be fine.
7. Preserve historical pricing/booking data → inherited unchanged from the prior session's `PlatformFee`/Super-Admin-fee work; this plan adds zero code on the booking-creation or fee-calculation path itself, only reads/subtracts a maintenance count before that path runs.
8. Customer experience = Activities alongside PC/PS5/Xbox, same flow → Task 7's `ActivitiesSection` links straight into the existing `/bookings/new?cafeId&tierId` route, no new booking UI.

**Original spec (§§1–12) coverage:** unchanged from the first pass — §1 Activities concept → Tasks 1,3,5. §2 Snooker table-based → individual-unit mode (now explicit, not implicit pooling only). §3 Arcade modes A/B → the individual/pooled toggle from requirement 2 *is* the resolution of A vs B, replacing the first draft's "both collapse to pooled" simplification. §4 custom activities → Task 5 "Other". §5 one-time setup/auto-generated resources → Task 3's `sync_units_to_quantity`, now gated by the `individual_units` opt-in. §6 management/maintenance → Task 6, now booking-safe. §7 customer experience → Task 7. §8 don't duplicate architecture → Verified Assumptions + requirement 5. §9 correct availability math → Task 2. §10 pricing/fees → inherited. §11 photos/description → description shipped, photos deferred. §12 simplicity → Out-of-Scope section.

**Placeholder scan:** the one placeholder from the first draft (`test_platforms_complete_ignores_activity_tiers`'s locate-and-adjust note) has been resolved into a real, runnable test against the actual `flex_search_verified` method found during Task 3 Step 5's investigation. No other TBD/TODO markers. Task 6 Step 1 still asks the implementer to locate an existing mapping by description rather than a guessed line number (the plan's author did not have that exact file section open) — flagged inline as a locate-before-edit step, consistent with how Task 3 Step 5's equivalent note was resolved by doing that lookup during plan-writing instead of deferring it.

**Type consistency:** `TierConfig.tierType`/`.activityKind`/`.individualUnits` (Task 4) match `makeDefaultConfig`/`makeDefaultActivityConfig` (Task 5) match the submit mapping (Task 6, create-only for `individualUnits`) match `HardwareTier.tierType`/`.activityKind` (Task 4, consumed by Task 7). `HardwareTierUnitRepository`'s and `BookingRepository.find_first_capacity_conflict`'s method names, and `UnitStatus`/`TierType` enum values, are unchanged from Task 1/2 through every later consumer (Tasks 3, 4, 6). `HardwareTierService`'s constructor signature (`unit_repo`, `booking_repo`) is defined once in Task 3 Step 4 and consumed consistently in Step 6's two call sites.
