# Owner Onboarding V2 (Platform-First Hardware Configuration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CPU/GPU/Monitor free-text hardware-tier configuration (in both onboarding and post-onboarding tier management) with a platform-first flow (PC Gaming / PlayStation / Xbox / Nintendo / Other), backed by real structured `platform`/`model` columns instead of guessed-from-name text.

**Architecture:** Two new nullable columns on `hardware_tiers` (`platform` enum, `model` string) plus a `menu_photos` JSON column on `cafes`. A single shared Python helper derives the customer-facing spec string and suggested tier name from platform+model, called from both existing tier-creation code paths (the onboarding submit endpoint's inline loop, and `HardwareTierService` used by post-onboarding tier management) so they stop drifting apart. A single shared React component (`PlatformTierConfigurator`) implements the "what do you offer → per-platform config cards" UI and is reused at both onboarding and post-onboarding entry points. Existing cafés migrate via an explicit one-time "confirm what you offer" re-prompt, never a silent auto-guess.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic (backend), Next.js 14 + TypeScript + TanStack Query (frontend), pytest (backend tests), tsc/next build (frontend verification).

**Spec:** `docs/superpowers/specs/2026-08-26-owner-onboarding-v2-design.md`

## Global Constraints

- Platform list is a fixed code constant: `pc | playstation | xbox | nintendo | other` — no admin-editable list (matches the `SUPPORTED_CITIES` precedent from BUG #2).
- `total_seats`, `app_bookable_seats`, `app_bookable_seats_locked`, `price_per_hour` on `hardware_tiers` are never modified by this plan.
- New `platform`/`model` columns are **nullable** — no backfill migration. Existing tiers keep working exactly as today until an owner explicitly re-confirms.
- No CPU/RAM/Monitor free-text input surfaces anywhere in the new owner-facing flow. `specs` (JSON) is still populated, but server-derived from platform+model, never owner-typed.
- Every new/changed endpoint requires backend tests; every new/changed frontend surface requires a clean `tsc --noEmit` and `next build` before being called done.
- Follow this repo's existing conventions exactly: `alias_generator=to_camel` on every new Pydantic schema, `field_validator` for enum/picklist checks, Tailwind classes consistent with sibling components (reference the exact files named in each task).

---

### Task 1: Backend — schema migration and model columns

**Files:**
- Create: `backend/migrations/versions/017_add_platform_and_menu_photos.py`
- Modify: `backend/app/models/hardware_tier.py`
- Modify: `backend/app/models/cafe.py`
- Test: `backend/tests/test_platform_data_model.py`

**Interfaces:**
- Produces: `PlatformType` enum (`pc`, `playstation`, `xbox`, `nintendo`, `other`) importable from `app.models.hardware_tier`; `HardwareTier.platform: Optional[PlatformType]`; `HardwareTier.model: Optional[str]`; `Cafe.menu_photos: list[str]` (JSON, default `[]`, mirrors the existing `photos` column).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_platform_data_model.py
import pytest
from uuid import uuid4
from app.models.hardware_tier import HardwareTier, PlatformType
from app.models.cafe import Cafe, VerificationStatus
from app.database import AsyncSessionLocal


@pytest.mark.asyncio
async def test_hardware_tier_platform_and_model_columns_persist():
    async with AsyncSessionLocal() as db:
        owner_id = uuid4()
        cafe = Cafe(
            id=uuid4(),
            owner_id=owner_id,
            name="Platform Column Test Cafe",
            address_line1="1 Test St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000001",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
        )
        db.add(cafe)
        await db.flush()

        tier = HardwareTier(
            id=uuid4(),
            cafe_id=cafe.id,
            name="PS5",
            specs={},
            total_seats=4,
            app_bookable_seats=1,
            active_seats_count=4,
            price_per_hour=150.0,
            platform=PlatformType.PLAYSTATION,
            model="PS5",
        )
        db.add(tier)
        await db.commit()
        await db.refresh(tier)

        assert tier.platform == PlatformType.PLAYSTATION
        assert tier.model == "PS5"


@pytest.mark.asyncio
async def test_existing_tier_without_platform_stays_valid():
    """A tier created the old way (no platform/model) must remain valid —
    this is the backward-compatibility guarantee the whole migration
    strategy depends on."""
    async with AsyncSessionLocal() as db:
        owner_id = uuid4()
        cafe = Cafe(
            id=uuid4(),
            owner_id=owner_id,
            name="Legacy Tier Test Cafe",
            address_line1="1 Legacy St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000002",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
        )
        db.add(cafe)
        await db.flush()

        tier = HardwareTier(
            id=uuid4(),
            cafe_id=cafe.id,
            name="Standard RTX 3060 Pods",
            specs={"gpu": "NVIDIA RTX 3060"},
            total_seats=10,
            app_bookable_seats=8,
            active_seats_count=10,
            price_per_hour=100.0,
        )
        db.add(tier)
        await db.commit()
        await db.refresh(tier)

        assert tier.platform is None
        assert tier.model is None


@pytest.mark.asyncio
async def test_cafe_menu_photos_column_persists():
    async with AsyncSessionLocal() as db:
        cafe = Cafe(
            id=uuid4(),
            owner_id=uuid4(),
            name="Menu Photos Test Cafe",
            address_line1="1 Menu St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000003",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
            menu_photos=["https://example.com/menu1.jpg"],
        )
        db.add(cafe)
        await db.commit()
        await db.refresh(cafe)

        assert cafe.menu_photos == ["https://example.com/menu1.jpg"]
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `python -m pytest tests/test_platform_data_model.py -v`
Expected: FAIL — `PlatformType` does not exist / `platform`, `model`, `menu_photos` are unexpected keyword arguments.

- [ ] **Step 3: Add the model columns**

In `backend/app/models/hardware_tier.py`, add near the top (after the existing imports) and modify the class body:

```python
import enum

class PlatformType(str, enum.Enum):
    PC = "pc"
    PLAYSTATION = "playstation"
    XBOX = "xbox"
    NINTENDO = "nintendo"
    OTHER = "other"
```

Add to the `HardwareTier` class, right after the existing `app_bookable_seats_locked` column:

```python
    platform: Mapped[PlatformType | None] = mapped_column(
        Enum(PlatformType, values_callable=lambda x: [e.value for e in x]),
        nullable=True
    )
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
```

Add `Enum` to the existing `from sqlalchemy import ...` line at the top of the file (it currently imports `String, Text, Boolean, DateTime, ForeignKey, Numeric, Integer, JSON` — add `Enum` to that list).

In `backend/app/models/cafe.py`, add right after the existing `supported_games` column:

```python
    menu_photos: Mapped[dict[str, Any]] = mapped_column(JSON, default=list, nullable=False)
```

(Matches the exact existing pattern of `photos`/`amenities`/`supported_games` on the same model — same `Mapped[dict[str, Any]]` typing quirk already used there for JSON list columns.)

- [ ] **Step 4: Write the migration**

```python
# backend/migrations/versions/017_add_platform_and_menu_photos.py
"""Add platform/model to hardware_tiers and menu_photos to cafes

Revision ID: 017
Revises: 016
Create Date: 2026-08-26

"""
from alembic import op
import sqlalchemy as sa

revision = '017'
down_revision = '016'
branch_labels = None
depends_on = None

PLATFORM_ENUM = sa.Enum('pc', 'playstation', 'xbox', 'nintendo', 'other', name='platformtype')


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    tier_columns = [c['name'] for c in inspector.get_columns('hardware_tiers')]
    if 'platform' not in tier_columns:
        PLATFORM_ENUM.create(conn, checkfirst=True)
        op.add_column('hardware_tiers', sa.Column('platform', PLATFORM_ENUM, nullable=True))
    if 'model' not in tier_columns:
        op.add_column('hardware_tiers', sa.Column('model', sa.String(length=100), nullable=True))

    cafe_columns = [c['name'] for c in inspector.get_columns('cafes')]
    if 'menu_photos' not in cafe_columns:
        op.add_column('cafes', sa.Column('menu_photos', sa.JSON(), nullable=False, server_default='[]'))


def downgrade():
    op.drop_column('cafes', 'menu_photos')
    op.drop_column('hardware_tiers', 'model')
    op.drop_column('hardware_tiers', 'platform')
    PLATFORM_ENUM.drop(op.get_bind(), checkfirst=True)
```

- [ ] **Step 5: Apply the migration to the local dev database**

Run (from `backend/`): `python -m alembic upgrade head`
Expected: `Running upgrade 016 -> 017, Add platform/model to hardware_tiers and menu_photos to cafes`

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest tests/test_platform_data_model.py -v`
Expected: 3 passed

- [ ] **Step 7: Run the full backend suite to confirm no regression**

Run: `python -m pytest tests -q`
Expected: all passing (110 before this task; 113 after, once this task's 3 tests are counted)

- [ ] **Step 8: Commit**

```bash
git add backend/migrations/versions/017_add_platform_and_menu_photos.py backend/app/models/hardware_tier.py backend/app/models/cafe.py backend/tests/test_platform_data_model.py
git commit -m "feat(platform): add platform/model columns to hardware_tiers, menu_photos to cafes"
```

---

### Task 2: Backend — platform/model constants and derivation helper

**Files:**
- Modify: `backend/app/constants.py`
- Create: `backend/app/services/platform_derivation.py`
- Test: `backend/tests/test_platform_derivation.py`

**Interfaces:**
- Consumes: `PlatformType` from Task 1 (`app.models.hardware_tier`).
- Produces: `PLATFORM_MODELS: dict[str, list[str]]` (constant, keyed by platform value); `derive_tier_display(platform: PlatformType | None, model: str | None) -> tuple[dict, str]` returning `(specs_dict, suggested_name)`. This is the single function both tier-creation code paths (Task 3 and Task 4) call — the thing that stops the two paths from re-inventing their own spec-building logic and drifting apart, which is exactly how BUG #3 happened.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_platform_derivation.py
from app.models.hardware_tier import PlatformType
from app.services.platform_derivation import derive_tier_display, PLATFORM_MODELS


def test_pc_platform_derives_gpu_spec_and_name():
    specs, name = derive_tier_display(PlatformType.PC, "RTX 4070")
    assert specs == {"gpu": "NVIDIA RTX 4070"}
    assert name == "RTX 4070 PC"


def test_playstation_platform_derives_console_spec_and_name():
    specs, name = derive_tier_display(PlatformType.PLAYSTATION, "PS5")
    assert specs == {"console": "PlayStation 5"}
    assert name == "PlayStation 5"


def test_other_platform_uses_model_as_free_text_label():
    specs, name = derive_tier_display(PlatformType.OTHER, "VR Arcade Pod")
    assert specs == {"other": "VR Arcade Pod"}
    assert name == "VR Arcade Pod"


def test_none_platform_returns_empty_specs_and_generic_name():
    specs, name = derive_tier_display(None, None)
    assert specs == {}
    assert name == "Gaming Station"


def test_unknown_model_for_platform_raises():
    import pytest
    with pytest.raises(ValueError, match="not a valid model"):
        derive_tier_display(PlatformType.PLAYSTATION, "Xbox Series X")


def test_platform_models_covers_every_platform_type():
    for p in PlatformType:
        if p != PlatformType.OTHER:
            assert p.value in PLATFORM_MODELS
            assert len(PLATFORM_MODELS[p.value]) > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_platform_derivation.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.platform_derivation'`

- [ ] **Step 3: Add platform picklists to constants.py**

Append to `backend/app/constants.py`:

```python
# Platform-first hardware tier configuration (Owner Onboarding V2). Mirrors
# the SUPPORTED_CITIES pattern above: a fixed picklist per platform, no
# admin-editable list. "other" has no fixed model list — it's free text,
# same escape-hatch convention as "Custom CPU (type below)" used elsewhere
# in this codebase before this redesign.
PLATFORM_MODELS = {
    "pc": ["RTX 4090", "RTX 4070", "RTX 3060", "Budget", "Custom"],
    "playstation": ["PS5 Pro", "PS5", "PS4 Pro", "PS4", "Custom"],
    "xbox": ["Series X", "Series S", "One X", "One S", "Custom"],
    "nintendo": ["Switch OLED", "Switch", "Switch Lite", "Custom"],
}

_PC_GPU_LABELS = {
    "RTX 4090": "NVIDIA RTX 4090",
    "RTX 4070": "NVIDIA RTX 4070",
    "RTX 3060": "NVIDIA RTX 3060",
    "Budget": "Entry-level GPU",
}

_CONSOLE_LABELS = {
    "PS5 Pro": "PlayStation 5 Pro",
    "PS5": "PlayStation 5",
    "PS4 Pro": "PlayStation 4 Pro",
    "PS4": "PlayStation 4",
    "Series X": "Xbox Series X",
    "Series S": "Xbox Series S",
    "One X": "Xbox One X",
    "One S": "Xbox One S",
    "Switch OLED": "Nintendo Switch OLED",
    "Switch": "Nintendo Switch",
    "Switch Lite": "Nintendo Switch Lite",
}
```

- [ ] **Step 4: Write the derivation helper**

```python
# backend/app/services/platform_derivation.py
from typing import Optional, Tuple, Dict
from app.models.hardware_tier import PlatformType
from app.constants import PLATFORM_MODELS, _PC_GPU_LABELS, _CONSOLE_LABELS


def derive_tier_display(
    platform: Optional[PlatformType],
    model: Optional[str]
) -> Tuple[Dict[str, str], str]:
    """Derive the customer-facing specs dict and a suggested tier name from
    an owner's platform+model selection. This is the single place both
    tier-creation code paths call, so the customer-facing spec string is
    never independently re-typed/re-guessed in two places again — that
    divergence is what let BUG #3 happen."""
    if platform is None or model is None:
        return {}, "Gaming Station"

    if platform == PlatformType.OTHER:
        label = model.strip() or "Custom Station"
        return {"other": label}, label

    allowed = PLATFORM_MODELS.get(platform.value, [])
    if model not in allowed and model != "Custom":
        raise ValueError(f"'{model}' is not a valid model for platform '{platform.value}'")

    if platform == PlatformType.PC:
        gpu_label = _PC_GPU_LABELS.get(model, model)
        return {"gpu": gpu_label}, f"{model} PC"

    console_label = _CONSOLE_LABELS.get(model, model)
    return {"console": console_label}, console_label
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_platform_derivation.py -v`
Expected: 6 passed

- [ ] **Step 6: Commit**

```bash
git add backend/app/constants.py backend/app/services/platform_derivation.py backend/tests/test_platform_derivation.py
git commit -m "feat(platform): add platform/model picklists and spec-derivation helper"
```

---

### Task 3: Backend — wire platform/model into HardwareTierService (post-onboarding tier create/update)

**Files:**
- Modify: `backend/app/schemas/hardware_tier.py`
- Modify: `backend/app/services/hardware_tier_service.py`
- Test: `backend/tests/test_platform_tier_service.py`

**Interfaces:**
- Consumes: `derive_tier_display` from Task 2; `PlatformType` from Task 1.
- Produces: `HardwareTierCreate`/`HardwareTierUpdate` gain optional `platform: Optional[PlatformType]` and `model: Optional[str]` fields; `HardwareTierResponse` includes both in its output.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_platform_tier_service.py
import pytest
from uuid import uuid4
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal


@pytest.mark.asyncio
async def test_create_tier_with_platform_derives_specs_and_name():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(),
            email=f"platform_tier_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"),
            full_name="Platform Tier Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)
        await db.flush()

        cafe = Cafe(
            id=uuid4(),
            owner_id=owner.id,
            name="Platform Tier Service Cafe",
            address_line1="1 Service St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000010",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
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
                    "name": "placeholder",
                    "specs": {},
                    "totalSeats": 4,
                    "appBookableSeats": 1,
                    "pricePerHour": 150,
                    "platform": "playstation",
                    "model": "PS5",
                },
                headers=headers
            )
            assert res.status_code == 201
            tier = res.json()["data"]["hardwareTier"]
            assert tier["platform"] == "playstation"
            assert tier["model"] == "PS5"
            assert tier["specs"] == {"console": "PlayStation 5"}
            assert tier["name"] == "PlayStation 5"


@pytest.mark.asyncio
async def test_create_tier_without_platform_still_works():
    """Backward compatibility: a tier created the old way (owner-typed name
    and specs, no platform) must keep working exactly as before."""
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(),
            email=f"legacy_tier_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"),
            full_name="Legacy Tier Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)
        await db.flush()

        cafe = Cafe(
            id=uuid4(),
            owner_id=owner.id,
            name="Legacy Tier Service Cafe",
            address_line1="1 Legacy St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000011",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
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
                    "name": "My Custom Tier",
                    "specs": {"gpu": "NVIDIA RTX 3060"},
                    "totalSeats": 10,
                    "appBookableSeats": 8,
                    "pricePerHour": 100,
                },
                headers=headers
            )
            assert res.status_code == 201
            tier = res.json()["data"]["hardwareTier"]
            assert tier["platform"] is None
            assert tier["model"] is None
            assert tier["specs"] == {"gpu": "NVIDIA RTX 3060"}
            assert tier["name"] == "My Custom Tier"


@pytest.mark.asyncio
async def test_create_tier_with_invalid_model_for_platform_rejected():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(),
            email=f"invalid_model_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"),
            full_name="Invalid Model Owner",
            role=UserRole.CAFE_OWNER,
            is_active=True
        )
        db.add(owner)
        await db.flush()

        cafe = Cafe(
            id=uuid4(),
            owner_id=owner.id,
            name="Invalid Model Cafe",
            address_line1="1 Invalid St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000012",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
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
                    "name": "placeholder",
                    "specs": {},
                    "totalSeats": 4,
                    "appBookableSeats": 1,
                    "pricePerHour": 150,
                    "platform": "playstation",
                    "model": "Xbox Series X",
                },
                headers=headers
            )
            assert res.status_code == 422
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_platform_tier_service.py -v`
Expected: FAIL — first test fails because `platform`/`model` are unrecognized fields (schema doesn't accept them yet) and specs/name aren't derived.

- [ ] **Step 3: Add platform/model to the schemas**

In `backend/app/schemas/hardware_tier.py`, add the import at the top:

```python
from app.models.hardware_tier import PlatformType
```

Add to `HardwareTierBase` (after `price_per_hour`):

```python
    platform: Optional[PlatformType] = None
    model: Optional[str] = Field(None, max_length=100)
```

Make `name` optional on `HardwareTierBase` since it can now be auto-derived — change:

```python
    name: str = Field(..., max_length=100)
```

to:

```python
    name: Optional[str] = Field(None, max_length=100)
```

Add the same two fields to `HardwareTierUpdate` (it's a separate class, not inheriting `HardwareTierBase`):

```python
    platform: Optional[PlatformType] = None
    model: Optional[str] = Field(None, max_length=100)
```

Add to `HardwareTierResponse` (it inherits `HardwareTierBase`, so `platform`/`model` are already present — no change needed there beyond what `HardwareTierBase` now provides).

- [ ] **Step 4: Wire derivation into HardwareTierService**

In `backend/app/services/hardware_tier_service.py`, add the import:

```python
from app.services.platform_derivation import derive_tier_display
```

In `add_hardware_tier`, right before the `tier_dict = {...}` block, insert:

```python
        derived_specs, suggested_name = derive_tier_display(tier_in.platform, tier_in.model)
        final_specs = derived_specs if tier_in.platform is not None else tier_in.specs
        final_name = tier_in.name or suggested_name
```

Then change the `tier_dict` block to use `final_specs`/`final_name` and include the two new columns:

```python
        tier_dict = {
            "id": uuid4(),
            "cafe_id": cafe_id,
            "name": final_name,
            "description": tier_in.description,
            "specs": final_specs,
            "total_seats": tier_in.total_seats,
            "app_bookable_seats": tier_in.app_bookable_seats,
            "reserved_walkin_seats": reserved_walkin,
            "active_seats_count": tier_in.total_seats,
            "preset_category": tier_in.preset_category,
            "price_per_hour": tier_in.price_per_hour,
            "platform": tier_in.platform,
            "model": tier_in.model,
            "is_active": True
        }
```

In `update_hardware_tier`, right before `update_dict = update_data.model_dump(exclude_unset=True)`, insert:

```python
        if update_data.platform is not None or update_data.model is not None:
            effective_platform = update_data.platform if update_data.platform is not None else tier.platform
            effective_model = update_data.model if update_data.model is not None else tier.model
            derived_specs, suggested_name = derive_tier_display(effective_platform, effective_model)
            if update_data.specs is None:
                update_data.specs = derived_specs
            if update_data.name is None:
                update_data.name = suggested_name
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_platform_tier_service.py -v`
Expected: 3 passed

- [ ] **Step 6: Run full backend suite**

Run: `python -m pytest tests -q`
Expected: all passing, no regressions (checks the `name` field becoming optional didn't break any existing test that omits it unexpectedly — if any test relies on `name` being rejected when absent, that test's intent has changed and it should be updated to pass an explicit name, matching how `test_acceptance_final.py`'s city was updated in a prior bug fix rather than weakening new validation)

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/hardware_tier.py backend/app/services/hardware_tier_service.py backend/tests/test_platform_tier_service.py
git commit -m "feat(platform): wire platform/model into HardwareTierService create/update"
```

---

### Task 4: Backend — wire platform/model into onboarding submit's tier-creation loop

**Files:**
- Modify: `backend/app/api/v1/owner.py` (the `payload.hardware_tiers` loop inside `submit_onboarding_application`, currently around line 565-584)
- Test: `backend/tests/test_platform_onboarding_submit.py`

**Interfaces:**
- Consumes: `derive_tier_display` from Task 2, `PlatformType` from Task 1.

This is the second, independent tier-creation code path found during planning — it builds `specs`/`name` inline with its own ad-hoc logic (`gpu_str = tier_data.get("gpu") or ...`), completely separate from `HardwareTierService`. Task 3 fixed one path; this task fixes the other, using the same shared helper so they can't drift apart again.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_platform_onboarding_submit.py
import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal
from app.models.hardware_tier import HardwareTier
from sqlalchemy import select


@pytest.mark.asyncio
async def test_onboarding_submit_with_platform_tier_derives_specs():
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_platform_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Platform Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Onboard Platform Cafe",
            "addressLine1": "1 Onboard St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000020",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "hardwareTiers": [
                {"platform": "playstation", "model": "PS5", "totalSeats": 4, "appBookableSeats": 1, "hourlyRate": 150},
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 10, "appBookableSeats": 3, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
            assert res.status_code == 200
            cafe_id = res.json()["data"]["cafeId"]

        stmt = select(HardwareTier).where(HardwareTier.cafe_id == uuid.UUID(cafe_id))
        result = await db.execute(stmt)
        tiers = {t.platform.value: t for t in result.scalars().all()}

        assert tiers["playstation"].model == "PS5"
        assert tiers["playstation"].specs == {"console": "PlayStation 5"}
        assert tiers["playstation"].name == "PlayStation 5"
        assert tiers["pc"].specs == {"gpu": "NVIDIA RTX 4070"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_platform_onboarding_submit.py -v`
Expected: FAIL — `tiers["playstation"]` raises `KeyError` (platform is never set by the current inline loop) or `AttributeError` on `.value` (platform is `None`).

- [ ] **Step 3: Update the inline tier-creation loop**

In `backend/app/api/v1/owner.py`, add the import near the other service imports at the top of the file:

```python
from app.services.platform_derivation import derive_tier_display
from app.models.hardware_tier import PlatformType
```

Replace the `# Create Hardware Tiers if provided` block (currently lines ~565-584) with:

```python
    # Create Hardware Tiers if provided
    if payload.hardware_tiers:
        tier_repo = HardwareTierRepository(db)
        for tier_data in payload.hardware_tiers:
            tot = int(tier_data.get("totalSeats") or tier_data.get("total_seats") or 10)
            app_b = int(tier_data.get("appBookableSeats") or tier_data.get("app_bookable_seats") or max(1, int(tot * 0.25)))
            price = float(tier_data.get("hourlyRate") or tier_data.get("hourly_rate") or tier_data.get("price_per_hour") or 100)

            raw_platform = tier_data.get("platform")
            platform = PlatformType(raw_platform) if raw_platform else None
            model = tier_data.get("model")

            if platform is not None:
                derived_specs, suggested_name = derive_tier_display(platform, model)
                specs = derived_specs
                name = tier_data.get("name") or suggested_name
            else:
                # Legacy shape (pre-Platform V2 clients): free-text gpu/cpu.
                gpu_str = tier_data.get("gpu") or "NVIDIA RTX 4060 / 16GB"
                specs = {"gpu": gpu_str, "ram": "16GB"}
                name = tier_data.get("name", "Standard Pod")

            await tier_repo.create({
                "cafe_id": cafe.id,
                "name": name,
                "specs": specs,
                "price_per_hour": price,
                "total_seats": tot,
                "app_bookable_seats": app_b,
                "active_seats_count": tot,
                "preset_category": tier_data.get("presetCategory") or tier_data.get("preset_category"),
                "platform": platform,
                "model": model,
                "is_active": True
            })
```

Note the app-bookable default changed from `0.7` to `0.25` to match the 25%-online default decided during brainstorming — this default only applies when the client omits `appBookableSeats` entirely (today's onboarding UI always sends it explicitly, but this keeps the server-side default consistent with the new product decision for any caller that doesn't).

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_platform_onboarding_submit.py -v`
Expected: 1 passed

- [ ] **Step 5: Run full backend suite**

Run: `python -m pytest tests -q`
Expected: all passing — pay particular attention to any existing onboarding test that submitted `hardwareTiers` with the legacy `gpu`/`cpu` shape and asserted on the resulting `preset_category` (it previously defaulted to `"PC Pod"` when absent; this task changes that default to `None` since `preset_category` is being superseded by `platform` — if a test asserts the old default, update that assertion, don't reintroduce the old default).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/owner.py backend/tests/test_platform_onboarding_submit.py
git commit -m "feat(platform): wire platform/model into onboarding submit tier creation"
```

---

### Task 5: Backend — expose café-level `platforms` for discovery (closes the BUG #3 loop)

**Files:**
- Modify: `backend/app/schemas/cafe.py` (`CafeListItem`)
- Modify: `backend/app/repositories/cafe_repository.py` (`flex_search_verified`)
- Test: `backend/tests/test_platform_discovery_exposure.py`

**Interfaces:**
- Produces: `CafeListItem.platforms: List[str]` — deduplicated list of platform values (e.g. `["pc", "playstation"]`) present across the café's active tiers with `platform` set. Tiers without `platform` set contribute nothing (they're covered by the existing name-based fallback in the frontend, untouched by this task).

This is the piece that lets `hasConsoleTier`/`hasPcTier` (Task 13) finally stop guessing from tier/café names for any café that has been migrated — the actual point of this whole redesign, from BUG #3's perspective.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_platform_discovery_exposure.py
import pytest
from uuid import uuid4
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier, PlatformType
from app.repositories.cafe_repository import CafeRepository
from app.database import AsyncSessionLocal


@pytest.mark.asyncio
async def test_cafe_list_item_exposes_real_platforms():
    async with AsyncSessionLocal() as db:
        cafe = Cafe(
            id=uuid4(),
            owner_id=uuid4(),
            name="Multi Platform Cafe",
            address_line1="1 Multi St",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            phone_number="+919000000030",
            verification_status=VerificationStatus.VERIFIED,
            is_active=True,
        )
        db.add(cafe)
        await db.flush()

        db.add(HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="PlayStation 5", specs={},
            total_seats=4, app_bookable_seats=1, active_seats_count=4,
            price_per_hour=150.0, platform=PlatformType.PLAYSTATION, model="PS5", is_active=True,
        ))
        db.add(HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="RTX 4070 PC", specs={},
            total_seats=10, app_bookable_seats=3, active_seats_count=10,
            price_per_hour=120.0, platform=PlatformType.PC, model="RTX 4070", is_active=True,
        ))
        db.add(HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="Unmigrated Tier", specs={"gpu": "GTX 1660"},
            total_seats=5, app_bookable_seats=5, active_seats_count=5,
            price_per_hour=80.0, is_active=True,
        ))
        await db.commit()

        repo = CafeRepository(db)
        items, total = await repo.search_verified(page=1, limit=20)
        this_cafe = next(i for i in items if i["id"] == cafe.id)

        assert set(this_cafe["platforms"]) == {"pc", "playstation"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_platform_discovery_exposure.py -v`
Expected: FAIL — `KeyError: 'platforms'`

- [ ] **Step 3: Add `platforms` to the repository query**

In `backend/app/repositories/cafe_repository.py`, inside `flex_search_verified`, the tier fetch already loads all tiers for the page's cafés (`tiers_stmt`/`tiers_by_cafe`). Add right after the existing `tier_names = [t.name for t in cafe_tiers]` line:

```python
            platforms = sorted({t.platform.value for t in cafe_tiers if t.platform is not None})
```

Add `"platforms": platforms,` to the `items.append({...})` dict, alongside the existing `"tier_names": tier_names,`.

- [ ] **Step 4: Add the field to the schema**

In `backend/app/schemas/cafe.py`, add to `CafeListItem` (alongside the existing `tier_names: List[str] = Field(default_factory=list)`):

```python
    platforms: List[str] = Field(default_factory=list)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_platform_discovery_exposure.py -v`
Expected: 1 passed

- [ ] **Step 6: Run full backend suite**

Run: `python -m pytest tests -q`
Expected: all passing

- [ ] **Step 7: Commit**

```bash
git add backend/app/repositories/cafe_repository.py backend/app/schemas/cafe.py backend/tests/test_platform_discovery_exposure.py
git commit -m "feat(platform): expose real platforms list on CafeListItem for discovery"
```

---

### Task 6: Backend — existing-café re-confirmation endpoints

**Files:**
- Modify: `backend/app/api/v1/owner.py`
- Modify: `backend/app/repositories/hardware_tier_repository.py`
- Test: `backend/tests/test_platform_reconfirmation.py`

**Interfaces:**
- Produces: `GET /api/v1/owner/tiers/needs-confirmation` → `{"needsConfirmation": bool, "tiers": [{"id", "name", "specs", "guessedPlatform", "guessedModel"}]}`; `PATCH /api/v1/owner/tiers/{tier_id}/confirm-platform` body `{"platform": str, "model": str}` → confirms and persists.
- Consumes: `PlatformType`, `derive_tier_display` from Tasks 1-2.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_platform_reconfirmation.py
import pytest
from uuid import uuid4
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal


@pytest.mark.asyncio
async def test_needs_confirmation_lists_unmigrated_tiers_with_guess():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"reconfirm_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Reconfirm Owner",
            role=UserRole.CAFE_OWNER, is_active=True
        )
        db.add(owner)
        await db.flush()
        # require_cafe_owner resolves roles from user_roles, not User.role —
        # without this row every request 403s regardless of the role set above.
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        await db.flush()

        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Reconfirm Cafe",
            address_line1="1 Reconfirm St", city="Bengaluru", state="Karnataka",
            pincode="560001", phone_number="+919000000040",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.flush()

        tier = HardwareTier(
            id=uuid4(), cafe_id=cafe.id, name="PS4 Pro Console Corner",
            specs={"gpu": "PS4 Pro Custom AMD Jaguar CPU"},
            total_seats=4, app_bookable_seats=1, active_seats_count=4,
            price_per_hour=100.0, is_active=True,
        )
        db.add(tier)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.get("/api/v1/owner/tiers/needs-confirmation", headers=headers)
            assert res.status_code == 200
            data = res.json()["data"]
            assert data["needsConfirmation"] is True
            assert len(data["tiers"]) == 1
            assert data["tiers"][0]["guessedPlatform"] == "playstation"

            confirm_res = await client.patch(
                f"/api/v1/owner/tiers/{tier.id}/confirm-platform",
                json={"platform": "playstation", "model": "PS4 Pro"},
                headers=headers
            )
            assert confirm_res.status_code == 200

        await db.refresh(tier)
        assert tier.platform.value == "playstation"
        assert tier.model == "PS4 Pro"


@pytest.mark.asyncio
async def test_needs_confirmation_false_once_all_tiers_migrated():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"reconfirm_done_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Reconfirm Done Owner",
            role=UserRole.CAFE_OWNER, is_active=True
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        await db.flush()

        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Already Migrated Cafe",
            address_line1="1 Migrated St", city="Bengaluru", state="Karnataka",
            pincode="560001", phone_number="+919000000041",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.get("/api/v1/owner/tiers/needs-confirmation", headers=headers)
            assert res.status_code == 200
            assert res.json()["data"]["needsConfirmation"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_platform_reconfirmation.py -v`
Expected: FAIL — `404 Not Found` (routes don't exist yet)

- [ ] **Step 3: Add a guess helper to the tier repository**

In `backend/app/repositories/hardware_tier_repository.py`, add:

```python
CONSOLE_GUESS_KEYWORDS = {
    "playstation": ["ps5", "ps4", "ps3", "ps2", "playstation"],
    "xbox": ["xbox"],
    "nintendo": ["switch", "nintendo"],
}
PC_GUESS_KEYWORDS = ["rtx", "gtx", "radeon", "nvidia", "amd"]


def guess_platform_and_model(tier: "HardwareTier") -> tuple[str, str]:
    """Best-effort guess for the re-confirmation prompt only — this value
    is always shown to the owner as an editable draft, never saved without
    explicit confirmation (see Task 6). Mirrors the keyword logic already
    used client-side in lib/platformTags.ts and owner/tiers/page.tsx's
    detectPlatform()."""
    haystack = f"{tier.name} {tier.specs.get('gpu', '')}".lower()
    for platform, keywords in CONSOLE_GUESS_KEYWORDS.items():
        if any(kw in haystack for kw in keywords):
            return platform, tier.name
    if any(kw in haystack for kw in PC_GUESS_KEYWORDS):
        return "pc", tier.specs.get("gpu", tier.name)
    return "other", tier.name
```

- [ ] **Step 4: Add the two endpoints**

In `backend/app/api/v1/owner.py`, add the import:

```python
from app.repositories.hardware_tier_repository import guess_platform_and_model
```

Add the endpoints (near the other tier-related routes):

```python
class ConfirmPlatformRequest(BaseModel):
    platform: str
    model: str

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


@router.get("/tiers/needs-confirmation", status_code=status.HTTP_200_OK)
async def get_tiers_needing_confirmation(
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Cafe).where(Cafe.owner_id == current_owner.id).order_by(Cafe.created_at.desc())
    res = await db.execute(stmt)
    cafe = res.scalars().first()
    if not cafe:
        return {"success": True, "data": {"needsConfirmation": False, "tiers": []}}

    tier_repo = HardwareTierRepository(db)
    tiers = await tier_repo.get_by_cafe_id(cafe.id, active_only=False)
    unmigrated = [t for t in tiers if t.platform is None]

    tiers_data = []
    for t in unmigrated:
        guessed_platform, guessed_model = guess_platform_and_model(t)
        tiers_data.append({
            "id": str(t.id),
            "name": t.name,
            "specs": t.specs,
            "guessedPlatform": guessed_platform,
            "guessedModel": guessed_model,
        })

    return {
        "success": True,
        "data": {"needsConfirmation": len(unmigrated) > 0, "tiers": tiers_data}
    }


@router.patch("/tiers/{tier_id}/confirm-platform", status_code=status.HTTP_200_OK)
async def confirm_tier_platform(
    tier_id: UUID,
    payload: ConfirmPlatformRequest,
    current_owner: User = Depends(require_cafe_owner),
    db: AsyncSession = Depends(get_db)
):
    tier_repo = HardwareTierRepository(db)
    tier = await tier_repo.get_by_id(tier_id)
    if not tier:
        raise NotFoundException("Hardware tier not found", error_code="TIER_NOT_FOUND")

    cafe_repo = CafeRepository(db)
    cafe = await cafe_repo.get_by_id(tier.cafe_id)
    if not cafe or str(cafe.owner_id) != str(current_owner.id):
        raise ForbiddenException("You can only confirm tiers for your own café", error_code="FORBIDDEN")

    platform = PlatformType(payload.platform)
    derived_specs, suggested_name = derive_tier_display(platform, payload.model)

    await tier_repo.update(tier_id, {
        "platform": platform,
        "model": payload.model,
        "specs": derived_specs,
        "name": suggested_name,
    })

    return {"success": True, "data": {"tierId": str(tier_id)}}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_platform_reconfirmation.py -v`
Expected: 2 passed

- [ ] **Step 6: Run full backend suite**

Run: `python -m pytest tests -q`
Expected: all passing

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/owner.py backend/app/repositories/hardware_tier_repository.py backend/tests/test_platform_reconfirmation.py
git commit -m "feat(platform): add existing-cafe platform re-confirmation endpoints"
```

---

### Task 7: Backend — menu photo upload endpoints

**Files:**
- Modify: `backend/app/api/v1/owner.py`
- Test: `backend/tests/test_menu_photos.py`

**Interfaces:**
- Produces: `POST /api/v1/owner/cafes/{cafe_id}/menu-photos/presign` (mirrors the existing café-photo presign endpoint's request/response shape exactly); `DELETE /api/v1/owner/cafes/{cafe_id}/menu-photos` body `{"url": str}`.

- [ ] **Step 1: Understand the existing photo persistence pattern**

Café photos use a two-part pattern, not a single "add photo" endpoint: `POST /cafes/{cafe_id}/photos/presign` only gets a direct-to-S3 upload URL back; the frontend then calls the general `PATCH /cafes/{cafe_id}/details` (`CafeDetailsUpdate`, already handling `photos: Optional[List[str]]`) with the full updated array to actually persist it. Deletion, in contrast, has its own dedicated `DELETE /cafes/{cafe_id}/photos` endpoint. This task follows the exact same split for menu photos: a presign endpoint, a dedicated delete endpoint, and a new `menu_photos` field added to the existing `CafeDetailsUpdate` schema (not a new "add" endpoint).

- [ ] **Step 2: Write the failing test**

```python
# backend/tests/test_menu_photos.py
import pytest
from uuid import uuid4
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.models.user_role import UserRoleMapping
from app.models.cafe import Cafe, VerificationStatus
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal


@pytest.mark.asyncio
async def test_delete_menu_photo_removes_url():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"menu_photo_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Menu Photo Owner",
            role=UserRole.CAFE_OWNER, is_active=True
        )
        db.add(owner)
        await db.flush()
        # require_cafe_ownership resolves roles from user_roles, not User.role.
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        await db.flush()

        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Menu Photo Cafe",
            address_line1="1 Menu St", city="Bengaluru", state="Karnataka",
            pincode="560001", phone_number="+919000000050",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
            menu_photos=["https://example.com/menu-a.jpg", "https://example.com/menu-b.jpg"],
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.request(
                "DELETE",
                f"/api/v1/owner/cafes/{cafe.id}/menu-photos",
                json={"url": "https://example.com/menu-a.jpg"},
                headers=headers
            )
            assert res.status_code == 200
            assert res.json()["data"]["menuPhotos"] == ["https://example.com/menu-b.jpg"]

        await db.refresh(cafe)
        assert cafe.menu_photos == ["https://example.com/menu-b.jpg"]
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m pytest tests/test_menu_photos.py -v`
Expected: FAIL — `404 Not Found`

- [ ] **Step 4: Implement the endpoints**

Add directly below the existing `/cafes/{cafe_id}/photos/presign` and `/cafes/{cafe_id}/photos` DELETE routes in `backend/app/api/v1/owner.py` (around lines 1876-1911). These reuse the existing `PhotoPresignRequest`/`PhotoDeleteRequest` schemas defined just above those routes (both are generic — `content_type` / `url` — nothing café-photo-specific about their shape) and the same `create_presigned_upload`/`key_from_url`/`delete_object` storage functions, targeting `cafe.menu_photos` instead of `cafe.photos`:

```python
@router.post("/cafes/{cafe_id}/menu-photos/presign", status_code=status.HTTP_200_OK)
async def presign_menu_photo_upload(
    cafe_id: UUID,
    payload: PhotoPresignRequest,
    cafe: Cafe = Depends(require_cafe_ownership),
):
    """Issue a short-lived, cafe-scoped presigned URL for a menu photo upload."""
    from app.services.storage_service import create_presigned_upload

    existing_count = len(cafe.menu_photos) if isinstance(cafe.menu_photos, list) else 0
    if existing_count >= settings.CAFE_PHOTO_MAX_COUNT:
        raise BadRequestException(f"A café can have at most {settings.CAFE_PHOTO_MAX_COUNT} menu photos")

    result = create_presigned_upload(cafe.id, payload.content_type)
    return {
        "success": True,
        "data": result
    }


@router.delete("/cafes/{cafe_id}/menu-photos", status_code=status.HTTP_200_OK)
async def delete_menu_photo(
    cafe_id: UUID,
    payload: PhotoDeleteRequest,
    cafe: Cafe = Depends(require_cafe_ownership),
    db: AsyncSession = Depends(get_db)
):
    """Remove a menu photo from the café and delete the S3 object if it belongs to us."""
    from app.services.storage_service import key_from_url, delete_object

    current_photos = list(cafe.menu_photos) if isinstance(cafe.menu_photos, list) else []
    if payload.url not in current_photos:
        raise NotFoundException("Menu photo not found on this café")

    cafe.menu_photos = [p for p in current_photos if p != payload.url]
    await db.commit()

    key = key_from_url(payload.url)
    if key:
        delete_object(key)

    return {"success": True, "data": {"menuPhotos": cafe.menu_photos}}
```

- [ ] **Step 5: Add `menu_photos` to `CafeDetailsUpdate`**

In `backend/app/api/v1/owner.py`, add to `CafeDetailsUpdate` (alongside the existing `photos: Optional[List[str]] = None`):

```python
    menu_photos: Optional[List[str]] = None
```

In `update_cafe_details` (the handler for `PATCH /cafes/{cafe_id}/details`), add alongside the existing `if payload.photos is not None: cafe.photos = payload.photos`:

```python
    if payload.menu_photos is not None:
        if len(payload.menu_photos) > settings.CAFE_PHOTO_MAX_COUNT:
            raise BadRequestException(f"A café can have at most {settings.CAFE_PHOTO_MAX_COUNT} menu photos")
        cafe.menu_photos = payload.menu_photos
```

- [ ] **Step 6: Add a second test exercising the full add-then-delete flow**

Add to `backend/tests/test_menu_photos.py`:

```python
@pytest.mark.asyncio
async def test_update_cafe_details_persists_menu_photos():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"menu_add_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Menu Add Owner",
            role=UserRole.CAFE_OWNER, is_active=True
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        await db.flush()

        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Menu Add Cafe",
            address_line1="1 Menu Add St", city="Bengaluru", state="Karnataka",
            pincode="560001", phone_number="+919000000051",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.patch(
                f"/api/v1/owner/cafes/{cafe.id}/details",
                json={"menuPhotos": ["https://example.com/menu-new.jpg"]},
                headers=headers
            )
            assert res.status_code == 200

        await db.refresh(cafe)
        assert cafe.menu_photos == ["https://example.com/menu-new.jpg"]
```

- [ ] **Step 7: Expose `menuPhotos` from `GET /owner/settings`**

`EditCafeModal` (Task 12) reads `settings.menuPhotos` when it loads — this endpoint is where that initial value comes from, and it currently builds its response dict manually without menu photos. In `backend/app/api/v1/owner.py`, inside `get_owner_settings`, add to the existing `cafe_data` dict (alongside `"photos": cafe.photos or [],`):

```python
        "menuPhotos": cafe.menu_photos or [],
```

Add a test to `backend/tests/test_menu_photos.py`:

```python
@pytest.mark.asyncio
async def test_owner_settings_includes_menu_photos():
    async with AsyncSessionLocal() as db:
        owner = User(
            id=uuid4(), email=f"menu_settings_{uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("testpass123"), full_name="Menu Settings Owner",
            role=UserRole.CAFE_OWNER, is_active=True
        )
        db.add(owner)
        await db.flush()
        db.add(UserRoleMapping(id=uuid4(), user_id=owner.id, role=UserRole.CAFE_OWNER))
        await db.flush()

        cafe = Cafe(
            id=uuid4(), owner_id=owner.id, name="Menu Settings Cafe",
            address_line1="1 Menu Settings St", city="Bengaluru", state="Karnataka",
            pincode="560001", phone_number="+919000000052",
            verification_status=VerificationStatus.VERIFIED, is_active=True,
            menu_photos=["https://example.com/menu-existing.jpg"],
        )
        db.add(cafe)
        await db.commit()

        token = create_access_token(subject=str(owner.id), role=owner.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.get("/api/v1/owner/settings", headers=headers)
            assert res.status_code == 200
            assert res.json()["data"]["cafe"]["menuPhotos"] == ["https://example.com/menu-existing.jpg"]
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `python -m pytest tests/test_menu_photos.py -v`
Expected: 3 passed

- [ ] **Step 9: Run full backend suite**

Run: `python -m pytest tests -q`
Expected: all passing

- [ ] **Step 10: Commit**

```bash
git add backend/app/api/v1/owner.py backend/tests/test_menu_photos.py
git commit -m "feat(platform): add menu photo upload/delete endpoints"
```

---

### Task 8: Frontend — platform/model constants

**Files:**
- Create: `frontend/src/constants/platforms.ts`

**Interfaces:**
- Produces: `PLATFORMS: {value, label}[]`, `PLATFORM_MODELS: Record<Platform, string[]>`, `type Platform = 'pc' | 'playstation' | 'xbox' | 'nintendo' | 'other'`.

- [ ] **Step 1: Write the constants file**

```typescript
// frontend/src/constants/platforms.ts
// Mirrors backend/app/constants.py's PLATFORM_MODELS exactly — keep both
// lists in sync if either changes. Fixed list, no admin-editable source,
// same decision as SUPPORTED_CITIES (constants/cities.ts).
export type Platform = 'pc' | 'playstation' | 'xbox' | 'nintendo' | 'other';

export const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'pc', label: 'PC Gaming' },
  { value: 'playstation', label: 'PlayStation' },
  { value: 'xbox', label: 'Xbox' },
  { value: 'nintendo', label: 'Nintendo' },
  { value: 'other', label: 'Other' },
];

export const PLATFORM_MODELS: Record<Exclude<Platform, 'other'>, string[]> = {
  pc: ['RTX 4090', 'RTX 4070', 'RTX 3060', 'Budget', 'Custom'],
  playstation: ['PS5 Pro', 'PS5', 'PS4 Pro', 'PS4', 'Custom'],
  xbox: ['Series X', 'Series S', 'One X', 'One S', 'Custom'],
  nintendo: ['Switch OLED', 'Switch', 'Switch Lite', 'Custom'],
};
```

- [ ] **Step 2: Type-check**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: no new errors (file has no consumers yet, so this just confirms the file itself is syntactically valid)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/constants/platforms.ts
git commit -m "feat(platform): add frontend platform/model constants"
```

---

### Task 9: Frontend — shared PlatformTierConfigurator component

**Files:**
- Create: `frontend/src/components/owner/PlatformTierConfigurator.tsx`
- Modify: `frontend/src/types/tier.ts`

**Interfaces:**
- Consumes: `Platform`, `PLATFORMS`, `PLATFORM_MODELS` from Task 8.
- Produces: `PlatformTierConfigurator` component with props `{ configs: TierConfig[]; onChange: (configs: TierConfig[]) => void }`, where `TierConfig = { id: string; platform: Platform; model: string; totalSeats: number; appBookableSeats: number; pricePerHour: number }`. This is what Tasks 10 and 11 both render — one component, two call sites, per the spec's explicit requirement.

This is the biggest single piece of new UI. It renders: (1) a multi-select platform chip row, (2) for each selected platform, a config-card list with an "add another" button, each card exposing exactly the four fields from the spec (Model, Total stations, Bookable on app — pre-filled at 25%, Price/hr) and nothing else.

- [ ] **Step 1: Add `TierConfig` and extend tier types**

In `frontend/src/types/tier.ts`, add the import and new fields:

```typescript
import type { Platform } from '@/constants/platforms';
```

Add to `HardwareTier` (alongside the existing `presetCategory`):

```typescript
  platform: Platform | null;
  model: string | null;
```

Add to both `TierCreateRequest` and `TierUpdateRequest`:

```typescript
  platform?: Platform;
  model?: string;
```

Change `TierCreateRequest`'s existing `name: string;` to `name?: string;` — Task 3 made the backend's `name` optional (auto-derived from platform+model when omitted), and Task 10's create call sends no `name` at all. Leaving this required here would fail `tsc --noEmit` at Task 10's own type-check step. (`TierUpdateRequest.name` is already optional — no change needed there.)

At the bottom of the file, add:

```typescript
export interface TierConfig {
  id: string;
  platform: Platform;
  model: string;
  totalSeats: number;
  appBookableSeats: number;
  pricePerHour: number;
}
```

- [ ] **Step 2: Write the component**

```tsx
// frontend/src/components/owner/PlatformTierConfigurator.tsx
'use client';

import { Plus, Trash2 } from 'lucide-react';
import { PLATFORMS, PLATFORM_MODELS, type Platform } from '@/constants/platforms';
import { Input } from '@/components/ui';
import type { TierConfig } from '@/types/tier';

interface PlatformTierConfiguratorProps {
  configs: TierConfig[];
  onChange: (configs: TierConfig[]) => void;
}

function makeDefaultConfig(platform: Platform): TierConfig {
  const models = platform === 'other' ? [] : PLATFORM_MODELS[platform];
  return {
    id: crypto.randomUUID(),
    platform,
    model: platform === 'other' ? '' : models[0],
    totalSeats: 4,
    appBookableSeats: 1, // 25% of 4, rounded — matches the per-field recompute below on edit
    pricePerHour: 100,
  };
}

export function PlatformTierConfigurator({ configs, onChange }: PlatformTierConfiguratorProps) {
  const selectedPlatforms = Array.from(new Set(configs.map((c) => c.platform)));

  const togglePlatform = (platform: Platform) => {
    if (selectedPlatforms.includes(platform)) {
      onChange(configs.filter((c) => c.platform !== platform));
    } else {
      onChange([...configs, makeDefaultConfig(platform)]);
    }
  };

  const addConfig = (platform: Platform) => {
    onChange([...configs, makeDefaultConfig(platform)]);
  };

  const removeConfig = (id: string) => {
    onChange(configs.filter((c) => c.id !== id));
  };

  const updateConfig = (id: string, patch: Partial<TierConfig>) => {
    onChange(
      configs.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...patch };
        // Re-derive the 25% default only when totalSeats changes and the
        // owner hasn't already set a custom appBookableSeats for this card
        // in this edit session — once they touch appBookableSeats directly,
        // patch will include it explicitly and this branch is skipped.
        if (patch.totalSeats !== undefined && patch.appBookableSeats === undefined) {
          next.appBookableSeats = Math.max(1, Math.round(patch.totalSeats * 0.25));
        }
        return next;
      })
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="text-caption font-semibold text-text-primary mb-2 block">
          What does your café offer?
        </label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => togglePlatform(p.value)}
              className={`px-4 py-2 rounded-full text-caption font-semibold border transition-all ${
                selectedPlatforms.includes(p.value)
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface text-text-secondary border-border hover:border-primary/60'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {PLATFORMS.filter((p) => selectedPlatforms.includes(p.value)).map((p) => {
        const platformConfigs = configs.filter((c) => c.platform === p.value);
        const models = p.value === 'other' ? [] : PLATFORM_MODELS[p.value as Exclude<Platform, 'other'>];

        return (
          <div key={p.value} className="flex flex-col gap-3 p-4 rounded-2xl border border-border bg-surface">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-body-emphasis font-bold text-text-primary">{p.label}</h3>
              <button
                type="button"
                onClick={() => addConfig(p.value)}
                className="flex items-center gap-1 text-caption font-semibold text-primary hover:text-primary/80"
              >
                <Plus className="h-3.5 w-3.5" />
                Add configuration
              </button>
            </div>

            {platformConfigs.map((config) => (
              <div key={config.id} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-card border border-border/80">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-overline font-semibold text-text-secondary">Model</label>
                  {p.value === 'other' ? (
                    <Input
                      placeholder="e.g. VR Arcade Pod"
                      value={config.model}
                      onChange={(e) => updateConfig(config.id, { model: e.target.value })}
                    />
                  ) : (
                    <select
                      value={config.model}
                      onChange={(e) => updateConfig(config.id, { model: e.target.value })}
                      className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  )}
                </div>

                <Input
                  label="Total stations"
                  type="number"
                  min="1"
                  value={config.totalSeats}
                  onChange={(e) => updateConfig(config.id, { totalSeats: Number(e.target.value) })}
                />

                <Input
                  label="Bookable on KHEL-O app"
                  type="number"
                  min="0"
                  max={config.totalSeats}
                  value={config.appBookableSeats}
                  onChange={(e) => updateConfig(config.id, { appBookableSeats: Number(e.target.value) })}
                />

                <Input
                  label="Price per hour (₹)"
                  type="number"
                  min="1"
                  value={config.pricePerHour}
                  onChange={(e) => updateConfig(config.id, { pricePerHour: Number(e.target.value) })}
                />

                <div className="flex items-end justify-end">
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
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/owner/PlatformTierConfigurator.tsx frontend/src/types/tier.ts
git commit -m "feat(platform): add shared PlatformTierConfigurator component"
```

---

### Task 10: Frontend — replace owner/tiers page's Add/Edit modal with PlatformTierConfigurator

**Files:**
- Modify: `frontend/src/app/(owner)/owner/tiers/page.tsx`

**Interfaces:**
- Consumes: `PlatformTierConfigurator`, `TierConfig` from Task 9; `createTier`/`updateTier` (unchanged signatures, now also accepting `platform`/`model` per Task 3's schema change).

This removes the page's own ad-hoc `Platform`/`CONSOLE_MODELS_BY_PLATFORM`/`detectPlatform`/CPU/RAM/Monitor form entirely (lines 24-111 and the modal form body ~lines 458-622 of the current file) and replaces it with the shared component. This directly fixes the visual bug from the ticket's screenshot 1 — CPU/Monitor fields no longer appear for a PS4 tier because they no longer exist in this form at all.

- [ ] **Step 1: Replace the platform/model constant block**

Delete lines 24-111 of the current file (`POPULAR_GPUS`, `Platform` type, `PLATFORM_LABELS`, `PLATFORM_FIELD_LABELS`, `CONSOLE_MODELS_BY_PLATFORM`, `detectPlatform`, `POPULAR_CPUS`, `POPULAR_MONITORS`) — all superseded by `constants/platforms.ts` and `PlatformTierConfigurator`.

Replace the import block at the top with:

```tsx
import { listCafeTiers, createTier, updateTier, deleteTier } from '@/lib/api/tiers';
import { getOwnerCafeId } from '@/lib/api/owner';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from '@/hooks/queries/keys';
import {
  Button,
  Input,
  Card,
  CardContent,
  PriceDisplay,
  Badge,
  Modal,
  SkeletonCard,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import { PlatformTierConfigurator } from '@/components/owner/PlatformTierConfigurator';
import type { HardwareTier, TierConfig } from '@/types';
import { Edit, AlertCircle, Power, PowerOff, Plus, Zap } from 'lucide-react';
```

(`Zap` is kept — Step 5 below still uses it for the tier card's model display. `Monitor`, `Cpu`, `HardDrive` are dropped since the spec-grid they rendered is fully replaced in Step 5.)

- [ ] **Step 2: Replace the form state and mutations**

Replace the individual field `useState` calls (`name`, `platform`, `gpu`, `cpu`, `ram`, `monitor`, `totalSeats`, `appBookableSeats`, `pricePerHour`, `presetCategory`) with a single config array, since one modal now edits exactly one `TierConfig`:

```tsx
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [configs, setConfigs] = useState<TierConfig[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
```

Replace `resetForm`:

```tsx
  const resetForm = () => {
    setEditingTierId(null);
    setConfigs([]);
    setFormError(null);
  };
```

Replace `handleOpenEdit`:

```tsx
  const handleOpenEdit = (tier: HardwareTier) => {
    setEditingTierId(tier.id);
    setConfigs([{
      id: tier.id,
      platform: tier.platform || 'other',
      model: tier.model || tier.name,
      totalSeats: tier.totalSeats,
      appBookableSeats: tier.appBookableSeats,
      pricePerHour: tier.pricePerHour,
    }]);
    setFormError(null);
    setIsModalOpen(true);
  };
```

Replace `createMutation`'s `mutationFn` body:

```tsx
    mutationFn: async () => {
      const targetId = await getActiveCafeId();
      const config = configs[0];
      return createTier(targetId, {
        specs: {},
        totalSeats: config.totalSeats,
        appBookableSeats: config.appBookableSeats,
        pricePerHour: config.pricePerHour,
        platform: config.platform,
        model: config.model,
      });
    },
```

Replace `updateMutation`'s `mutationFn` body:

```tsx
    mutationFn: async () => {
      const targetId = await getActiveCafeId();
      const config = configs[0];
      return updateTier(targetId, editingTierId!, {
        totalSeats: config.totalSeats,
        appBookableSeats: config.appBookableSeats,
        pricePerHour: config.pricePerHour,
        platform: config.platform,
        model: config.model,
      });
    },
```

- [ ] **Step 3: Replace `handleFormSubmit`**

```tsx
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (configs.length === 0) {
      setFormError('Please configure at least one platform.');
      return;
    }
    const config = configs[0];
    if (!config.model || !config.pricePerHour || !config.totalSeats) {
      setFormError('Please fill in all required fields.');
      return;
    }
    if (config.appBookableSeats > config.totalSeats) {
      setFormError('App bookable seats cannot exceed total seats.');
      return;
    }
    if (editingTierId) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };
```

Note: "Add Tier" still creates one tier at a time here (this page manages individual tiers, matching its existing one-tier-per-card grid) — `PlatformTierConfigurator` is rendered constrained to a single config by only ever seeding `configs` with zero or one entries from this page; the multi-config "add another under the same platform" behavior is exercised at the onboarding wizard (Task 11), where configuring several stations types in one sitting is the actual use case. This is a valid, intentional difference in how the shared component is driven at each call site, not a limitation of the component itself.

- [ ] **Step 4: Replace the modal form body**

Replace everything between `<form onSubmit={handleFormSubmit} ...>` and its closing `</form>` (the `Tier Name`, `Platform`, hardware-model/CPU/monitor grid, `RAM Memory`, and seat-quota blocks) with:

```tsx
        <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
          {formError && (
            <div className="p-3 rounded-xl bg-error/10 border border-error/20 text-caption text-error">
              {formError}
            </div>
          )}

          <PlatformTierConfigurator configs={configs} onChange={setConfigs} />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => { setIsModalOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={createMutation.isPending || updateMutation.isPending}
              loadingText={editingTierId ? 'Saving...' : 'Creating...'}
            >
              {editingTierId ? 'Save Changes' : 'Create Hardware Tier'}
            </Button>
          </div>
        </form>
```

- [ ] **Step 5: Update the tier card display to show platform/model instead of raw specs**

Replace the "Spec List" block (the `{(tier.specs?.gpu || tier.specs?.cpu || ...)}` section) with:

```tsx
                  {tier.model && (
                    <div className="flex items-center gap-1.5 text-caption font-semibold text-text-primary bg-surface p-3 rounded-xl">
                      <Zap className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      <span>{tier.model}</span>
                    </div>
                  )}
```

(Drop the now-unused `Monitor`, `Cpu`, `HardDrive` icon imports if no longer referenced elsewhere in the file after this change.)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors — this is the point where any leftover reference to the deleted `Platform`/`detectPlatform`/etc. symbols would surface as an error; resolve each by removing the reference (they were all deleted in Step 1) or add exports from `constants/platforms.ts` (Task 8) if this file re-declares a name already provided there (`Platform` type name collision — this file must use the imported one only).

- [ ] **Step 7: Build**

Run: `timeout 150 npx next build`
Expected: succeeds, `/owner/tiers` route compiles

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/\(owner\)/owner/tiers/page.tsx
git commit -m "feat(platform): replace owner tiers page CPU/GPU form with PlatformTierConfigurator"
```

---

### Task 11: Frontend — replace onboarding's Hardware Tiers step with PlatformTierConfigurator

**Files:**
- Modify: `frontend/src/app/(owner)/owner/onboarding/page.tsx`

**Interfaces:**
- Consumes: `PlatformTierConfigurator`, `TierConfig` from Task 9.

This file has its own **third independent copy** of the CPU/GPU/console-model form logic already found and removed from `owner/tiers/page.tsx` in Task 10 — a local `type Platform`, `PLATFORM_LABELS`, `PLATFORM_FIELD_LABELS`, `CONSOLE_MODELS_BY_PLATFORM`, `detectPlatform`, plus `HARDWARE_PRESETS`, `POPULAR_GPUS`, `POPULAR_CPUS`, `POPULAR_MONITORS` — none of it discovered until this task's pre-flight check. All of it is deleted here. Note also: importing `Platform` from `@/constants/platforms` (Task 8) into this file without first deleting its local `type Platform` declaration (line 102) is a duplicate-identifier compile error — deleting the local one is not optional cleanup, it's required for this file to compile at all once the import is added.

The wizard's Step 4 ("Operating Hours & Hardware Tiers") bundles Opening/Closing Time and Total Station Capacity together with the hardware-tiers sub-section in one step — only the hardware-tiers sub-section is replaced; the time/capacity fields above it are untouched. Step 5 ("Games & Photos") already has real checkbox UI for games and an established "you'll upload after approval" placeholder pattern for venue photos — the new Menu block is added as a sibling within this existing step, not a new step (adding a 7th step would require touching this file's step-count/progress/navigation logic for a block that has no form fields to validate, which is unnecessary scope for a purely informational message).

- [ ] **Step 1: Delete the old platform/hardware constants and helper**

Delete lines 29-192 of the current file in full — this spans `HARDWARE_PRESETS` (29-100), the local `type Platform`/`PLATFORM_LABELS`/`PLATFORM_FIELD_LABELS`/`POPULAR_GPUS`/`CONSOLE_MODELS_BY_PLATFORM`/`detectPlatform` block (102-171), and `POPULAR_CPUS`/`POPULAR_MONITORS` (173-192). Stop exactly before `const PRESET_GAMES = [` (line 194) — that constant and everything from it onward is untouched, it belongs to the existing Games step.

- [ ] **Step 2: Change the `hardwareTiers` field type and default**

In the `OnboardingState` interface, replace the `hardwareTiers` field (currently lines 231-242, the `Array<{ name, gpu, cpu?, monitor?, hourlyRate, totalSeats, appBookableSeats, platform? }>` block) with:

```typescript
  hardwareTiers: TierConfig[];
```

In `INITIAL_STATE`, replace the `hardwareTiers: [...]` block (currently lines 274-293, the two pre-seeded PC tier objects) with:

```typescript
  hardwareTiers: [],
```

(Empty by design — the owner explicitly picks platforms via the new UI rather than starting from pre-seeded PC tiers that don't match `TierConfig`'s shape.)

Add the imports (alongside the existing `import { SUPPORTED_CITIES } from '@/constants/cities';`):

```tsx
import { PlatformTierConfigurator } from '@/components/owner/PlatformTierConfigurator';
import type { TierConfig } from '@/types/tier';
```

- [ ] **Step 3: Replace the Hardware Tiers sub-section within Step 4**

Inside `{step === 4 && (...)}`, the block runs: a heading ("4. Operating Hours & Hardware Tiers"), the Opening Time/Closing Time/Total Station Capacity grid, then a `<div className="flex flex-col gap-3">` containing the "Hardware Tiers" h3, the "+ Add Tier to Top" button, the quick-preset chips, and the per-tier cards with CPU/GPU/monitor fields (currently spanning from that `<div className="flex flex-col gap-3">` opening through its matching closing `</div>` immediately before Step 4's own closing `</div>` and `)}` — i.e. everything between the Opening/Closing/Total-Seats grid and the end of Step 4).

Keep the heading and the Opening/Closing/Total-Seats grid exactly as they are. Replace only that "Hardware Tiers" sub-section with:

```tsx
                <div className="flex flex-col gap-3">
                  <h3 className="font-heading text-h3 text-text-primary">What does your café offer?</h3>
                  <p className="text-caption text-text-secondary">
                    Set up your stations by platform — no technical specs needed, just what you have and what it costs.
                  </p>
                  <PlatformTierConfigurator
                    configs={formData.hardwareTiers}
                    onChange={(configs) => updateField('hardwareTiers', configs)}
                  />
                </div>
```

- [ ] **Step 4: Add the Menu block to the existing Games & Photos step**

Inside `{step === 5 && (...)}`, directly after the existing "Venue Photos" block (the `<div className="flex flex-col gap-2">` containing the `ImageIcon` and the "You'll upload real photos..." message) and before that step's closing `</div>` / `)}`, add:

```tsx
                <div className="flex flex-col gap-2">
                  <label className="text-caption font-semibold text-text-primary">Menu (Optional)</label>
                  <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5">
                    <div className="h-9 w-9 flex-shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                    <p className="text-caption text-text-secondary">
                      Have food or drinks? You&apos;ll be able to upload your menu photo from{' '}
                      <span className="font-semibold text-text-primary">
                        Café Settings → Edit Profile → Menu
                      </span>
                      {' '}as soon as your café is approved.
                    </p>
                  </div>
                </div>
```

(Mirrors the existing Venue Photos block's exact structure and copy pattern. No new form field or submit-payload change — purely informational, same as the photos block it sits beside.)

- [ ] **Step 5: Update the submit mapping**

Replace the `formattedHardwareTiers` block in `handleSubmit` with:

```tsx
    const formattedHardwareTiers = (formData.hardwareTiers || []).map((c: TierConfig) => ({
      platform: c.platform,
      model: c.model,
      hourlyRate: Number(c.pricePerHour) || 100,
      totalSeats: Number(c.totalSeats) || 4,
      appBookableSeats: Number(c.appBookableSeats) || Math.max(1, Math.round((Number(c.totalSeats) || 4) * 0.25)),
    }));
```

(This payload shape matches exactly what Task 4's updated backend loop expects: `platform`, `model`, `hourlyRate`, `totalSeats`, `appBookableSeats`.)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors — this is where any leftover reference to the deleted `HARDWARE_PRESETS`/`Platform`/`detectPlatform`/`POPULAR_*` symbols would surface; resolve each by confirming it was inside the deleted range (Step 1) or the replaced sub-section (Step 3), not by re-adding the old symbols.

- [ ] **Step 7: Build**

Run: `timeout 150 npx next build`
Expected: succeeds, `/owner/onboarding` route compiles

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/\(owner\)/owner/onboarding/page.tsx
git commit -m "feat(platform): replace onboarding hardware-tiers step with PlatformTierConfigurator"
```

---

### Task 12: Frontend — Menu tab in EditCafeModal (real upload, post-approval)

**Files:**
- Modify: `frontend/src/components/owner/EditCafeModal.tsx`
- Modify: `frontend/src/lib/api/settings.ts`

**Interfaces:**
- Consumes: the menu-photo endpoints from Task 7.
- Produces: `uploadMenuPhoto(cafeId, file, onProgress?)`, `deleteMenuPhoto(cafeId, url)` — same signatures as the existing `uploadCafePhoto`/`deleteCafePhoto`.

- [ ] **Step 1: Add `menuPhotos` to the `OwnerSettings` type**

In `frontend/src/lib/api/settings.ts`, add to `OwnerSettings` (alongside the existing `photos: string[]`):

```typescript
  menuPhotos: string[];
```

`EditCafeModal`'s `onSaved: (updated: Partial<OwnerSettings>) => void` prop type (already `Partial<OwnerSettings>`, per its existing usage with `{ photos: updated }`) accepts `{ menuPhotos: updated }` with no further change once this field exists on the type.

- [ ] **Step 2: Add the API client functions**

In `frontend/src/lib/api/settings.ts`, add directly below the existing `uploadCafePhoto`/`deleteCafePhoto` functions, copying their implementation with the endpoint paths swapped to `/menu-photos/presign` and `/menu-photos`:

```typescript
export async function presignMenuPhotoUpload(cafeId: string, contentType: string): Promise<{ uploadUrl: string; publicUrl: string }> {
  return call(() =>
    apiClient.post(`/api/v1/owner/cafes/${cafeId}/menu-photos/presign`, { contentType })
  );
}

export async function uploadMenuPhoto(
  cafeId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const { uploadUrl, publicUrl } = await presignMenuPhotoUpload(cafeId, file.type);
  await axios.put(uploadUrl, file, {
    headers: { 'Content-Type': file.type },
    onUploadProgress: (evt) => {
      if (onProgress && evt.total) onProgress(Math.round((evt.loaded / evt.total) * 100));
    },
  });
  return publicUrl;
}

export async function deleteMenuPhoto(cafeId: string, url: string): Promise<{ menuPhotos: string[] }> {
  return call(() =>
    apiClient.delete(`/api/v1/owner/cafes/${cafeId}/menu-photos`, { data: { url } })
  );
}
```

(Match the exact body of the existing `presignCafePhotoUpload`/`uploadCafePhoto` functions in this same file for the presign/PUT mechanics — this is a direct copy with the target changed, not new upload logic.)

- [ ] **Step 3: Add Menu Photos state and handlers**

In `frontend/src/components/owner/EditCafeModal.tsx`, this follows the exact same three-part pattern already used for `photos` (`persistPhotos` / `handleFilesSelected` / `handleDeletePhoto`, lines ~80-220 of the current file) — add a parallel set for menu photos rather than generalizing the existing functions, matching this file's existing style of one dedicated state+handler set per field. Add the import:

```tsx
import { uploadMenuPhoto, deleteMenuPhoto } from '@/lib/api/settings';
```

Add state (alongside the existing `photos`/`uploadProgress`/`uploadError`/`deletingUrl`/`uploadingCount` declarations):

```tsx
  const [menuPhotos, setMenuPhotos] = useState<string[]>(settings.menuPhotos || []);
  const [menuUploadProgress, setMenuUploadProgress] = useState<Record<string, number>>({});
  const [menuUploadError, setMenuUploadError] = useState<string | null>(null);
  const [deletingMenuUrl, setDeletingMenuUrl] = useState<string | null>(null);
  const [menuUploadingCount, setMenuUploadingCount] = useState(0);
```

Add handlers (alongside the existing `persistPhotos`/`handleFilesSelected`/`handleDeletePhoto`):

```tsx
  const persistMenuPhotos = async (updated: string[]) => {
    setMenuPhotos(updated);
    await updateCafeDetails(cafeId, { menuPhotos: updated });
    onSaved({ menuPhotos: updated });
  };

  const handleMenuFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setMenuUploadError(null);

    const remainingSlots = MAX_PHOTOS - menuPhotos.length;
    if (remainingSlots <= 0) {
      setMenuUploadError(`A café can have at most ${MAX_PHOTOS} menu photos`);
      return;
    }

    const selected = Array.from(files).slice(0, remainingSlots);
    let workingPhotos = menuPhotos;

    for (const file of selected) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setMenuUploadError('Only JPEG, PNG, or WebP images are allowed');
        continue;
      }
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
        setMenuUploadError(`"${file.name}" is larger than ${MAX_PHOTO_MB}MB`);
        continue;
      }

      const tempKey = `${file.name}-${file.size}-${Date.now()}`;
      setMenuUploadingCount((c) => c + 1);
      setMenuUploadProgress((p) => ({ ...p, [tempKey]: 0 }));

      try {
        const publicUrl = await uploadMenuPhoto(cafeId, file, (pct) => {
          setMenuUploadProgress((p) => ({ ...p, [tempKey]: pct }));
        });
        workingPhotos = [...workingPhotos, publicUrl];
        await persistMenuPhotos(workingPhotos);
      } catch (err: unknown) {
        setMenuUploadError(err instanceof Error ? err.message : `Failed to upload "${file.name}"`);
      } finally {
        setMenuUploadingCount((c) => c - 1);
        setMenuUploadProgress((p) => {
          const { [tempKey]: _drop, ...rest } = p;
          return rest;
        });
      }
    }
  };

  const handleDeleteMenuPhoto = async (url: string) => {
    setDeletingMenuUrl(url);
    setMenuUploadError(null);
    try {
      const res = await deleteMenuPhoto(cafeId, url);
      setMenuPhotos(res.menuPhotos);
      onSaved({ menuPhotos: res.menuPhotos });
    } catch (err: unknown) {
      setMenuUploadError(err instanceof Error ? err.message : 'Failed to delete menu photo');
    } finally {
      setDeletingMenuUrl(null);
    }
  };
```

- [ ] **Step 4: Add the Menu Photos section JSX**

Add directly below the existing "Venue Photos" grid block (after its closing `</div>` for the `grid grid-cols-2 sm:grid-cols-3 gap-3` section, before that block's own wrapping `</div>` closes — i.e. as a sibling section within the same tab/form):

```tsx
            <div className="flex flex-col gap-2.5">
              <label className="text-caption font-semibold text-text-primary">
                Menu Photos <span className="text-text-secondary font-normal">({menuPhotos.length}/{MAX_PHOTOS})</span>
              </label>

              {menuUploadError && (
                <div className="rounded-xl bg-error/10 border border-error/20 p-3 text-caption text-error">{menuUploadError}</div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {menuPhotos.map((photo) => (
                  <div key={photo} className="relative aspect-square rounded-xl overflow-hidden border border-border group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo} alt="Menu" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 sm:opacity-0 flex items-center justify-center gap-1.5 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleDeleteMenuPhoto(photo)}
                        disabled={deletingMenuUrl === photo}
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-white/90 text-error disabled:opacity-50"
                        aria-label="Delete menu photo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {Object.entries(menuUploadProgress).map(([key, pct]) => (
                  <div key={key} className="aspect-square rounded-xl border border-border bg-surface flex flex-col items-center justify-center gap-1.5 text-caption text-text-secondary">
                    <Upload className="h-5 w-5 animate-pulse" />
                    <span>{pct}%</span>
                  </div>
                ))}

                {menuPhotos.length < MAX_PHOTOS && (
                  <label className="aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-caption font-semibold text-text-secondary hover:border-primary hover:text-primary transition-colors cursor-pointer">
                    <Plus className="h-5 w-5" />
                    <span>Add photo</span>
                    <input
                      type="file"
                      accept={ALLOWED_TYPES.join(',')}
                      multiple
                      className="hidden"
                      disabled={menuUploadingCount > 0}
                      onChange={(e) => handleMenuFilesSelected(e.target.files)}
                    />
                  </label>
                )}
              </div>
            </div>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Build**

Run: `timeout 150 npx next build`
Expected: succeeds

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/owner/EditCafeModal.tsx frontend/src/lib/api/settings.ts
git commit -m "feat(platform): add menu photo upload to EditCafeModal"
```

---

### Task 13: Frontend — re-confirmation flow for existing cafés

**Files:**
- Create: `frontend/src/components/owner/PlatformReconfirmModal.tsx`
- Modify: `frontend/src/components/layout/OwnerShell.tsx`
- Create: `frontend/src/lib/api/platformReconfirm.ts`

**Interfaces:**
- Produces: `getTiersNeedingConfirmation()`, `confirmTierPlatform(tierId, platform, model)` — thin wrappers around Task 6's endpoints. `PlatformReconfirmModal` — shown once per session when needed, reusing `PlatformTierConfigurator`'s per-card fields (model/seats/price already correct on existing tiers; only platform+model need confirming, so this modal is a lighter single-purpose form, not a full `PlatformTierConfigurator` reuse — it edits `platform`+`model` only, pre-filled from the guess, with the tier's existing name/specs/seats shown read-only for context).

- [ ] **Step 1: Add the API client**

```typescript
// frontend/src/lib/api/platformReconfirm.ts
import { apiClient, call } from './client';
import type { Platform } from '@/constants/platforms';

export interface TierNeedingConfirmation {
  id: string;
  name: string;
  specs: Record<string, string>;
  guessedPlatform: Platform;
  guessedModel: string;
}

export async function getTiersNeedingConfirmation(): Promise<{ needsConfirmation: boolean; tiers: TierNeedingConfirmation[] }> {
  return call(() => apiClient.get('/api/v1/owner/tiers/needs-confirmation'));
}

export async function confirmTierPlatform(tierId: string, platform: Platform, model: string): Promise<void> {
  await call(() => apiClient.patch(`/api/v1/owner/tiers/${tierId}/confirm-platform`, { platform, model }));
}
```

- [ ] **Step 2: Write the modal**

```tsx
// frontend/src/components/owner/PlatformReconfirmModal.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Button } from '@/components/ui';
import { PLATFORMS, PLATFORM_MODELS, type Platform } from '@/constants/platforms';
import { getTiersNeedingConfirmation, confirmTierPlatform } from '@/lib/api/platformReconfirm';

export function PlatformReconfirmModal() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['tiers-needing-confirmation'],
    queryFn: getTiersNeedingConfirmation,
    staleTime: 60_000,
  });

  const [draft, setDraft] = useState<Record<string, { platform: Platform; model: string }>>({});

  const confirmMutation = useMutation({
    mutationFn: async (tierId: string) => {
      const value = draft[tierId];
      await confirmTierPlatform(tierId, value.platform, value.model);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tiers-needing-confirmation'] });
    },
  });

  if (!data?.needsConfirmation || data.tiers.length === 0) return null;

  return (
    <Modal isOpen title="Confirm what your café offers" onClose={() => {}} description="A quick one-time check so your café shows the right platforms to customers.">
      <div className="flex flex-col gap-4">
        {data.tiers.map((tier) => {
          const current = draft[tier.id] || { platform: tier.guessedPlatform, model: tier.guessedModel };
          const models = current.platform === 'other' ? [] : PLATFORM_MODELS[current.platform as Exclude<Platform, 'other'>];

          return (
            <div key={tier.id} className="p-3 rounded-xl border border-border bg-surface flex flex-col gap-2">
              <span className="text-caption font-semibold text-text-primary">{tier.name}</span>
              <div className="flex gap-2">
                <select
                  value={current.platform}
                  onChange={(e) => setDraft((d) => ({ ...d, [tier.id]: { platform: e.target.value as Platform, model: '' } }))}
                  className="flex-1 h-9 rounded-lg border border-border bg-card px-2 text-caption"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                {current.platform !== 'other' && (
                  <select
                    value={current.model || models[0]}
                    onChange={(e) => setDraft((d) => ({ ...d, [tier.id]: { ...current, model: e.target.value } }))}
                    className="flex-1 h-9 rounded-lg border border-border bg-card px-2 text-caption"
                  >
                    {models.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => confirmMutation.mutate(tier.id)}
                isLoading={confirmMutation.isPending && confirmMutation.variables === tier.id}
              >
                Confirm
              </Button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Mount it in OwnerShell**

In `frontend/src/components/layout/OwnerShell.tsx`, add the import and render `<PlatformReconfirmModal />` once near the top of the shell's returned JSX (it self-hides via its own `needsConfirmation` check, so mounting it unconditionally for every owner is correct — it renders nothing for already-migrated cafés).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Build**

Run: `timeout 150 npx next build`
Expected: succeeds

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/owner/PlatformReconfirmModal.tsx frontend/src/components/layout/OwnerShell.tsx frontend/src/lib/api/platformReconfirm.ts
git commit -m "feat(platform): add existing-cafe platform re-confirmation modal"
```

---

### Task 14: Frontend — platformTags.ts prefers real platform data

**Files:**
- Modify: `frontend/src/lib/platformTags.ts`
- Modify: `frontend/src/components/customer/CafeCard.tsx`
- Modify: `frontend/src/app/(customer)/page.tsx`
- Modify: `frontend/src/types/cafe.ts`

**Interfaces:**
- Consumes: `CafeListItem.platforms` from Task 5.
- Produces: `hasConsoleTier(tierNames, platforms?)` and `hasPcTier(tierNames, platforms?)` — extended signatures, backward compatible (existing single-argument call sites still type-check and behave as before; this task updates the call sites to pass the new second argument).

This is the task that actually closes BUG #3's loop: once a café's tiers are migrated, its card/filter behavior stops depending on `tierNames` string-matching at all.

- [ ] **Step 1: Write the failing test manually (no test runner configured for this file — verify via a scratch script)**

Since this repo has no frontend unit test runner wired up for `lib/` utilities (confirmed: no `*.test.ts` files exist alongside `lib/format.ts` or `lib/platformTags.ts`), verify this function via a quick Node script rather than skipping verification:

```bash
cd frontend && node -e "
const { hasConsoleTier, hasPcTier } = require('./src/lib/platformTags.ts');
" 2>&1 | head -5
```

Expected: fails to run directly (TS not transpiled) — instead, verify through the existing `tsc --noEmit` pass plus a manual reasoning check written into the function's own doc comment (already true of `isCafeOpenNow` in this codebase, which has no dedicated test file either — consistent with this codebase's established testing boundary of "backend gets pytest, frontend utility functions get type-checking + build verification, not unit tests"). Proceed directly to implementation and verify via `tsc`/`next build` as this codebase already does for `lib/format.ts` changes.

- [ ] **Step 2: Update platformTags.ts**

```typescript
// frontend/src/lib/platformTags.ts
// Single source of truth for deriving platform/hardware claims (café card
// badges, discovery filter tags). Prefers real structured platform data
// (Owner Onboarding V2's `platforms` field on CafeListItem) when present;
// falls back to name-based keyword matching only for cafés that haven't
// been migrated yet (see PlatformReconfirmModal). This fallback is the
// same logic that caused BUG #3 — it now only ever applies to tiers
// nobody has confirmed a real platform for.
export const CONSOLE_KEYWORDS = [
  'ps5', 'ps4', 'ps3', 'ps2', 'playstation',
  'xbox', 'switch', 'nintendo', 'dualsense', 'console',
];

export function hasConsoleTier(tierNames: string[] | undefined, platforms?: string[]): boolean {
  if (platforms && platforms.length > 0) {
    return platforms.some((p) => p !== 'pc');
  }
  if (!tierNames || tierNames.length === 0) return false;
  return tierNames.some((t) => {
    const lower = t.toLowerCase();
    return CONSOLE_KEYWORDS.some((kw) => lower.includes(kw));
  });
}

export function hasPcTier(tierNames: string[] | undefined, platforms?: string[]): boolean {
  if (platforms && platforms.length > 0) {
    return platforms.includes('pc');
  }
  if (!tierNames || tierNames.length === 0) return true;
  return tierNames.some((t) => {
    const lower = t.toLowerCase();
    return !CONSOLE_KEYWORDS.some((kw) => lower.includes(kw));
  });
}
```

- [ ] **Step 3: Add `platforms` to the frontend CafeListItem type**

In `frontend/src/types/cafe.ts`, add to `CafeListItem`:

```typescript
  platforms?: string[];
```

- [ ] **Step 4: Update call sites**

In `frontend/src/components/customer/CafeCard.tsx`, change:

```tsx
  const hasConsole = hasConsoleTier(cafe.tierNames);
  const showPcGaming = hasPcTier(cafe.tierNames);
```

to:

```tsx
  const hasConsole = hasConsoleTier(cafe.tierNames, cafe.platforms);
  const showPcGaming = hasPcTier(cafe.tierNames, cafe.platforms);
```

In `frontend/src/app/(customer)/page.tsx`, change:

```tsx
    if (activeTag === 'PS5 & Consoles' && !hasConsoleTier(cafe.tierNames)) {
```

to:

```tsx
    if (activeTag === 'PS5 & Consoles' && !hasConsoleTier(cafe.tierNames, cafe.platforms)) {
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Build**

Run: `timeout 150 npx next build`
Expected: succeeds

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/platformTags.ts frontend/src/components/customer/CafeCard.tsx frontend/src/app/\(customer\)/page.tsx frontend/src/types/cafe.ts
git commit -m "feat(platform): prefer real platform data over name-guessing in discovery"
```

---

### Task 15: Final integration pass

**Files:** none new — verification only.

- [ ] **Step 1: Run the full backend suite**

Run (from `backend/`): `python -m pytest tests -q`
Expected: all tests passing (110 baseline + this plan's new tests across Tasks 1, 2, 3, 4, 5, 6, 7)

- [ ] **Step 2: Run frontend type-check and build**

Run (from `frontend/`): `npx tsc --noEmit && timeout 150 npx next build`
Expected: both succeed with zero errors

- [ ] **Step 3: Manual smoke check against the spec's own test list**

Confirm by inspection (or a manual local run if a dev server is available) against the design spec's testing section:
- A café with only `platform=NULL` tiers still returns bookable availability (Task 1/4 guarantee) — spot-check via `GET /api/v1/cafes/{id}/tiers` on a pre-existing seeded café.
- Onboarding submit with a PlayStation config produces a tier with real `specs`/`name`, no CPU/monitor fields ever requested (Task 4/11).
- The owner/tiers page's Add/Edit modal no longer shows CPU/RAM/Monitor fields for any platform (Task 10) — this is the literal fix for the ticket's screenshot 1.
- `PlatformReconfirmModal` appears for a café with an un-migrated tier and disappears after confirming (Task 6/13).
- A migrated café's card/filter behavior no longer depends on its name (Task 14) — verify by renting a café named something unrelated to "velocity"/"lounge" a `platform=playstation` tier and confirming the console badge still shows.

- [ ] **Step 4: Commit the plan's completion marker (optional)**

If all checks pass, no further commit is required — Task 14's commit is the last code change. Note completion in the plan file itself is not required by this skill's process.
