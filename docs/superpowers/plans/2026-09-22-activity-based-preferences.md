# Activity-Based Customer Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock, non-persisted "favorite games / preferred hardware tier" profile UI with a real, activity-based preferences system (PC Gaming, PS5, Xbox, Switch, Snooker, 8-Ball Pool, Bowling, ...) where hardware-tier/games fields only appear for gaming activities.

**Architecture:** A new `user_preferences` table (1:1 with `users`), a fixed shared `Activity` enum (gaming vs non-gaming), a `UserPreferenceRepository`/`UserPreferenceService` layer following the existing `HardwareTier` pattern, two new `GET`/`PUT` endpoints under `/api/v1/users/me/preferences`, and a rewritten profile-page UI section backed by a new frontend API client.

**Tech Stack:** FastAPI + SQLAlchemy (async) + Alembic + Pydantic v2 (backend); Next.js App Router + React + Zustand + TanStack Query (frontend); pytest + pytest-asyncio (backend tests).

**Spec:** `docs/superpowers/specs/2026-09-22-activity-based-preferences-design.md`

## Global Constraints

- Activity taxonomy is a fixed enum defined once per language (Python + TS), NOT database-driven. New activities are added by editing the enum in both places — no migration required for new activity values (per spec's "Non-goals").
- `preferred_tier` values: `budget`, `mid_range`, `high_end`, `ultra` (fixed enum, not free rig-name text).
- `preferred_tier` and `favorite_games` are only valid when at least one gaming activity (`pc_gaming`, `ps5`, `xbox`, `nintendo_switch`) is present in `activities`. The backend rejects (400) a payload that sets either field with no gaming activity selected, per spec.
- One shared `preferred_tier` across all gaming activities (not per-activity), per spec.
- API response envelope convention: `{"success": True, "data": {...}}` (see `backend/app/api/v1/auth.py`).
- Pydantic schemas use `ConfigDict(alias_generator=to_camel, populate_by_name=True)`, with `from_attributes=True` added only on response schemas (see `backend/app/schemas/hardware_tier.py`).
- Migration revision id `044`, `down_revision = '043'` (current head is `backend/migrations/versions/043_push_subscriptions.py`).

---

### Task 1: `UserPreference` model + migration

**Files:**
- Create: `backend/app/models/user_preference.py`
- Modify: `backend/app/models/__init__.py` (register model import if that file lists models explicitly — check it first; if it's empty/auto-discovering, skip this edit)
- Create: `backend/migrations/versions/044_add_user_preferences.py`
- Test: `backend/tests/test_user_preferences_model.py`

**Interfaces:**
- Produces: `Activity` enum (`app.models.user_preference.Activity`) with members `PC_GAMING`, `PS5`, `XBOX`, `NINTENDO_SWITCH`, `SNOOKER`, `EIGHT_BALL_POOL`, `BOWLING`, `CARROM`, `FOOSBALL`, values are the lowercase snake_case strings shown (e.g. `Activity.PC_GAMING.value == "pc_gaming"`).
- Produces: `GAMING_ACTIVITIES: set[str] = {"pc_gaming", "ps5", "xbox", "nintendo_switch"}` module-level constant, used by later tasks to check "does this activity list contain a gaming activity".
- Produces: `PreferredTier` enum (`app.models.user_preference.PreferredTier`) with members `BUDGET`, `MID_RANGE`, `HIGH_END`, `ULTRA` (values `"budget"`, `"mid_range"`, `"high_end"`, `"ultra"`).
- Produces: `UserPreference` model (table `user_preferences`), columns: `user_id: Mapped[uuid.UUID]` (primary key AND `ForeignKey("users.id")`), `activities: Mapped[list[str]]` (`JSON`, `default=list`, `nullable=False`), `preferred_tier: Mapped[str | None]` (`String(20)`, nullable), `favorite_games: Mapped[list[str]]` (`JSON`, `default=list`, `nullable=False`), `created_at`, `updated_at` (same pattern as `HardwareTier`).

- [ ] **Step 1: Check if models are explicitly registered**

Run: `grep -n "hardware_tier" backend/app/models/__init__.py`

If it prints a line importing `HardwareTier`, add the same style of import for `UserPreference` in Step 3. If the file is empty or doesn't reference other models by name, skip that edit.

- [ ] **Step 2: Write the failing model test**

Create `backend/tests/test_user_preferences_model.py`:

```python
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select

from app.models.user_preference import UserPreference, Activity, PreferredTier, GAMING_ACTIVITIES
from tests.conftest import create_test_user


async def _user(db_session):
    user = await create_test_user(db_session)
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_create_user_preference_row(db_session):
    user = await _user(db_session)
    pref = UserPreference(
        user_id=user.id,
        activities=[Activity.SNOOKER.value, Activity.BOWLING.value],
        preferred_tier=None,
        favorite_games=[],
    )
    db_session.add(pref)
    await db_session.commit()
    await db_session.refresh(pref)

    assert pref.activities == ["snooker", "bowling"]
    assert pref.preferred_tier is None


@pytest.mark.asyncio
async def test_create_user_preference_with_gaming_tier(db_session):
    user = await _user(db_session)
    pref = UserPreference(
        user_id=user.id,
        activities=[Activity.PC_GAMING.value],
        preferred_tier=PreferredTier.ULTRA.value,
        favorite_games=["Valorant"],
    )
    db_session.add(pref)
    await db_session.commit()
    await db_session.refresh(pref)

    assert pref.preferred_tier == "ultra"
    assert pref.favorite_games == ["Valorant"]


@pytest.mark.asyncio
async def test_user_preference_pk_is_user_id_unique(db_session):
    user = await _user(db_session)
    pref1 = UserPreference(user_id=user.id, activities=[], favorite_games=[])
    db_session.add(pref1)
    await db_session.commit()

    pref2 = UserPreference(user_id=user.id, activities=[Activity.PS5.value], favorite_games=[])
    db_session.add(pref2)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


def test_gaming_activities_constant_matches_enum():
    assert GAMING_ACTIVITIES == {
        Activity.PC_GAMING.value,
        Activity.PS5.value,
        Activity.XBOX.value,
        Activity.NINTENDO_SWITCH.value,
    }
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_user_preferences_model.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.user_preference'`

- [ ] **Step 4: Write the model**

Create `backend/app/models/user_preference.py`:

```python
import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Activity(str, enum.Enum):
    PC_GAMING = "pc_gaming"
    PS5 = "ps5"
    XBOX = "xbox"
    NINTENDO_SWITCH = "nintendo_switch"
    SNOOKER = "snooker"
    EIGHT_BALL_POOL = "eight_ball_pool"
    BOWLING = "bowling"
    CARROM = "carrom"
    FOOSBALL = "foosball"


GAMING_ACTIVITIES: set[str] = {
    Activity.PC_GAMING.value,
    Activity.PS5.value,
    Activity.XBOX.value,
    Activity.NINTENDO_SWITCH.value,
}


class PreferredTier(str, enum.Enum):
    BUDGET = "budget"
    MID_RANGE = "mid_range"
    HIGH_END = "high_end"
    ULTRA = "ultra"


class UserPreference(Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), primary_key=True
    )
    activities: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    preferred_tier: Mapped[str | None] = mapped_column(String(20), nullable=True)
    favorite_games: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
```

- [ ] **Step 5: Register the model import if needed**

Only if Step 1 found an explicit import list, add `from app.models.user_preference import UserPreference` to `backend/app/models/__init__.py` in the same style as the `HardwareTier` import line.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_user_preferences_model.py -v`
Expected: PASS (4 tests)

- [ ] **Step 7: Write the Alembic migration**

Create `backend/migrations/versions/044_add_user_preferences.py`:

```python
"""user_preferences table

Revision ID: 044
Revises: 043
Create Date: 2026-09-22
"""
from alembic import op
import sqlalchemy as sa

revision = '044'
down_revision = '043'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_preferences',
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), primary_key=True),
        sa.Column('activities', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('preferred_tier', sa.String(20), nullable=True),
        sa.Column('favorite_games', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade():
    op.drop_table('user_preferences')
```

- [ ] **Step 8: Run the migration against the dev database**

Run: `cd backend && alembic upgrade head`
Expected: applies `044` cleanly, prints the new revision as current (`alembic current`).

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/user_preference.py backend/migrations/versions/044_add_user_preferences.py backend/tests/test_user_preferences_model.py backend/app/models/__init__.py
git commit -m "feat(backend): add UserPreference model and migration"
```

---

### Task 2: Pydantic schemas

**Files:**
- Create: `backend/app/schemas/user_preference.py`

**Interfaces:**
- Consumes: `app.models.user_preference.Activity`, `GAMING_ACTIVITIES`, `PreferredTier` from Task 1.
- Produces: `UserPreferencesUpdate` (fields: `activities: list[str] | None = None`, `preferred_tier: str | None = None`, `favorite_games: list[str] | None = None`) with a `model_validator(mode='after')` named `validate_gaming_requirement` that raises `ValueError` if `preferred_tier` or `favorite_games` is truthy/non-None while none of `activities or []` intersects `GAMING_ACTIVITIES`. Note: this validator only fires when `activities` is included in the same request; the service layer (Task 3) re-validates using the merged/final state so a partial update can't bypass it.
- Produces: `UserPreferencesResponse` (fields: `activities: list[str]`, `preferred_tier: str | None`, `favorite_games: list[str]`), `ConfigDict(from_attributes=True, alias_generator=to_camel, populate_by_name=True)`.

- [ ] **Step 1: Write the schema**

Create `backend/app/schemas/user_preference.py`:

```python
from pydantic import BaseModel, ConfigDict, model_validator
from typing import Optional, List

from app.models.user_preference import GAMING_ACTIVITIES


def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


class UserPreferencesUpdate(BaseModel):
    activities: Optional[List[str]] = None
    preferred_tier: Optional[str] = None
    favorite_games: Optional[List[str]] = None

    @model_validator(mode='after')
    def validate_gaming_requirement(self) -> 'UserPreferencesUpdate':
        if self.activities is not None:
            has_gaming = any(a in GAMING_ACTIVITIES for a in self.activities)
            if not has_gaming and (self.preferred_tier or self.favorite_games):
                raise ValueError(
                    "preferredTier and favoriteGames require at least one gaming activity"
                )
        return self

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


UserPreferencesUpdateRequest = UserPreferencesUpdate


class UserPreferencesResponse(BaseModel):
    activities: List[str]
    preferred_tier: Optional[str]
    favorite_games: List[str]

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )
```

- [ ] **Step 2: Write a quick validator unit test**

Create `backend/tests/test_user_preferences_schema.py`:

```python
import pytest
from pydantic import ValidationError

from app.schemas.user_preference import UserPreferencesUpdate


def test_rejects_tier_without_gaming_activity():
    with pytest.raises(ValidationError):
        UserPreferencesUpdate(activities=["snooker"], preferred_tier="ultra")


def test_allows_tier_with_gaming_activity():
    payload = UserPreferencesUpdate(activities=["pc_gaming"], preferred_tier="ultra")
    assert payload.preferred_tier == "ultra"


def test_allows_non_gaming_only_activities():
    payload = UserPreferencesUpdate(activities=["snooker", "bowling"])
    assert payload.preferred_tier is None
    assert payload.favorite_games is None
```

- [ ] **Step 3: Run tests**

Run: `cd backend && python -m pytest tests/test_user_preferences_schema.py -v`
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/user_preference.py backend/tests/test_user_preferences_schema.py
git commit -m "feat(backend): add UserPreferences pydantic schemas with gaming-requirement validation"
```

---

### Task 3: Repository + Service

**Files:**
- Create: `backend/app/repositories/user_preference_repository.py`
- Create: `backend/app/services/user_preference_service.py`
- Test: `backend/tests/test_user_preferences_service.py`

**Interfaces:**
- Consumes: `UserPreference` model (Task 1), `UserPreferencesUpdate`/`UserPreferencesResponse` schemas (Task 2), `GAMING_ACTIVITIES` (Task 1).
- Produces: `UserPreferenceRepository(db: AsyncSession)` with `async def get_by_user_id(self, user_id: UUID) -> Optional[UserPreference]` and `async def upsert(self, user_id: UUID, data: dict) -> UserPreference` (creates a row with defaults if none exists, otherwise sets provided keys — including explicit `None`/`[]` — directly via `setattr`, unlike `BaseRepository.update` which skips `None` values).
- Produces: `UserPreferenceService(repo: UserPreferenceRepository)` with `async def get_preferences(self, user_id: UUID) -> UserPreferencesResponse` (returns defaults — empty lists, `None` tier — if no row exists yet, without creating one) and `async def update_preferences(self, user_id: UUID, payload: UserPreferencesUpdate) -> UserPreferencesResponse` (merges `payload` fields onto the existing row's current values before re-validating the gaming requirement, then persists via `repo.upsert`; raises `app.core.exceptions.ValidationException` with `error_code="TIER_REQUIRES_GAMING_ACTIVITY"` if the merged state has a tier/games but no gaming activity).

- [ ] **Step 1: Write the failing service test**

Create `backend/tests/test_user_preferences_service.py`:

```python
import pytest
from uuid import uuid4

from app.repositories.user_preference_repository import UserPreferenceRepository
from app.services.user_preference_service import UserPreferenceService
from app.schemas.user_preference import UserPreferencesUpdate
from app.core.exceptions import ValidationException
from tests.conftest import create_test_user


async def _service(db_session):
    repo = UserPreferenceRepository(db_session)
    return UserPreferenceService(repo), repo


@pytest.mark.asyncio
async def test_get_preferences_defaults_when_no_row(db_session):
    user = await create_test_user(db_session)
    await db_session.commit()
    service, _ = await _service(db_session)

    result = await service.get_preferences(user.id)

    assert result.activities == []
    assert result.preferred_tier is None
    assert result.favorite_games == []


@pytest.mark.asyncio
async def test_update_preferences_creates_row(db_session):
    user = await create_test_user(db_session)
    await db_session.commit()
    service, repo = await _service(db_session)

    result = await service.update_preferences(
        user.id, UserPreferencesUpdate(activities=["snooker", "bowling"])
    )

    assert result.activities == ["snooker", "bowling"]
    row = await repo.get_by_user_id(user.id)
    assert row is not None


@pytest.mark.asyncio
async def test_update_preferences_allows_gaming_tier(db_session):
    user = await create_test_user(db_session)
    await db_session.commit()
    service, _ = await _service(db_session)

    result = await service.update_preferences(
        user.id,
        UserPreferencesUpdate(activities=["pc_gaming"], preferred_tier="high_end", favorite_games=["Valorant"]),
    )

    assert result.preferred_tier == "high_end"
    assert result.favorite_games == ["Valorant"]


@pytest.mark.asyncio
async def test_update_preferences_rejects_tier_when_merged_state_has_no_gaming(db_session):
    user = await create_test_user(db_session)
    await db_session.commit()
    service, _ = await _service(db_session)

    # First set a gaming activity + tier.
    await service.update_preferences(
        user.id, UserPreferencesUpdate(activities=["pc_gaming"], preferred_tier="ultra")
    )

    # Then drop the gaming activity without explicitly clearing the tier —
    # the merged state (non-gaming activities + carried-over tier) must be
    # rejected rather than silently persisted.
    with pytest.raises(ValidationException):
        await service.update_preferences(
            user.id, UserPreferencesUpdate(activities=["snooker"])
        )


@pytest.mark.asyncio
async def test_update_preferences_clears_tier_when_explicitly_provided(db_session):
    user = await create_test_user(db_session)
    await db_session.commit()
    service, _ = await _service(db_session)

    await service.update_preferences(
        user.id, UserPreferencesUpdate(activities=["pc_gaming"], preferred_tier="ultra")
    )

    result = await service.update_preferences(
        user.id,
        UserPreferencesUpdate(activities=["snooker"], preferred_tier=None, favorite_games=[]),
    )

    assert result.activities == ["snooker"]
    assert result.preferred_tier is None
    assert result.favorite_games == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_user_preferences_service.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write the repository**

Create `backend/app/repositories/user_preference_repository.py`:

```python
from typing import Optional, Any
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_preference import UserPreference


class UserPreferenceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_user_id(self, user_id: UUID) -> Optional[UserPreference]:
        result = await self.db.execute(
            select(UserPreference).where(UserPreference.user_id == user_id)
        )
        return result.scalars().first()

    async def upsert(self, user_id: UUID, data: dict[str, Any]) -> UserPreference:
        row = await self.get_by_user_id(user_id)
        if row is None:
            row = UserPreference(
                user_id=user_id,
                activities=data.get("activities", []),
                preferred_tier=data.get("preferred_tier"),
                favorite_games=data.get("favorite_games", []),
            )
            self.db.add(row)
        else:
            for field in ("activities", "preferred_tier", "favorite_games"):
                if field in data:
                    setattr(row, field, data[field])
        await self.db.commit()
        await self.db.refresh(row)
        return row
```

- [ ] **Step 4: Write the service**

Create `backend/app/services/user_preference_service.py`:

```python
from uuid import UUID

from app.repositories.user_preference_repository import UserPreferenceRepository
from app.schemas.user_preference import UserPreferencesUpdate, UserPreferencesResponse
from app.models.user_preference import GAMING_ACTIVITIES
from app.core.exceptions import ValidationException


class UserPreferenceService:
    def __init__(self, repo: UserPreferenceRepository):
        self.repo = repo

    async def get_preferences(self, user_id: UUID) -> UserPreferencesResponse:
        row = await self.repo.get_by_user_id(user_id)
        if row is None:
            return UserPreferencesResponse(activities=[], preferred_tier=None, favorite_games=[])
        return UserPreferencesResponse.model_validate(row)

    async def update_preferences(
        self, user_id: UUID, payload: UserPreferencesUpdate
    ) -> UserPreferencesResponse:
        current = await self.repo.get_by_user_id(user_id)
        current_activities = current.activities if current else []
        current_tier = current.preferred_tier if current else None
        current_games = current.favorite_games if current else []

        merged_activities = (
            payload.activities if payload.activities is not None else current_activities
        )
        merged_tier = (
            payload.preferred_tier if "preferred_tier" in payload.model_fields_set else current_tier
        )
        merged_games = (
            payload.favorite_games if payload.favorite_games is not None else current_games
        )

        has_gaming = any(a in GAMING_ACTIVITIES for a in merged_activities)
        if not has_gaming and (merged_tier or merged_games):
            raise ValidationException(
                message="Preferred hardware tier and favorite games require at least one gaming activity",
                error_code="TIER_REQUIRES_GAMING_ACTIVITY",
            )

        update_dict: dict = {}
        if payload.activities is not None:
            update_dict["activities"] = merged_activities
        if "preferred_tier" in payload.model_fields_set:
            update_dict["preferred_tier"] = merged_tier
        if payload.favorite_games is not None:
            update_dict["favorite_games"] = merged_games

        row = await self.repo.upsert(user_id, update_dict)
        return UserPreferencesResponse.model_validate(row)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_user_preferences_service.py -v`
Expected: PASS (5 tests)

- [ ] **Step 6: Confirm `ValidationException` signature matches usage**

Run: `grep -n "class ValidationException" backend/app/core/exceptions.py`

If its constructor doesn't accept `message=`/`error_code=` keyword args as used above, adjust the `raise ValidationException(...)` call in Step 4 to match its actual signature (check how `hardware_tier_service.py` calls it and mirror exactly), then re-run Step 5.

- [ ] **Step 7: Commit**

```bash
git add backend/app/repositories/user_preference_repository.py backend/app/services/user_preference_service.py backend/tests/test_user_preferences_service.py
git commit -m "feat(backend): add UserPreference repository and service with merge-then-validate logic"
```

---

### Task 4: API endpoints

**Files:**
- Create: `backend/app/api/v1/user_preferences.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_user_preferences_api.py`

**Interfaces:**
- Consumes: `UserPreferenceService`/`UserPreferenceRepository` (Task 3), `UserPreferencesUpdate`/`UserPreferencesResponse` (Task 2), `get_current_active_user`/`get_db` deps (existing, same as `backend/app/api/v1/auth.py`).
- Produces: `GET /api/v1/users/me/preferences` → `{"success": True, "data": {"preferences": <UserPreferencesResponse camelCase dict>}}`.
- Produces: `PUT /api/v1/users/me/preferences` (body: `UserPreferencesUpdateRequest`) → same envelope shape; 400 with the service's error message on validation failure; 401/403 with no auth header.

- [ ] **Step 1: Write the failing API test**

Create `backend/tests/test_user_preferences_api.py`:

```python
import pytest

from tests.conftest import create_test_user, auth_headers


@pytest.mark.asyncio
async def test_get_preferences_defaults(async_client, db_session):
    user = await create_test_user(db_session)
    await db_session.commit()

    r = await async_client.get("/api/v1/users/me/preferences", headers=auth_headers(user))

    assert r.status_code == 200
    body = r.json()
    assert body["data"]["preferences"]["activities"] == []
    assert body["data"]["preferences"]["preferredTier"] is None


@pytest.mark.asyncio
async def test_put_preferences_non_gaming(async_client, db_session):
    user = await create_test_user(db_session)
    await db_session.commit()

    r = await async_client.put(
        "/api/v1/users/me/preferences",
        json={"activities": ["snooker", "bowling"]},
        headers=auth_headers(user),
    )

    assert r.status_code == 200
    body = r.json()
    assert body["data"]["preferences"]["activities"] == ["snooker", "bowling"]


@pytest.mark.asyncio
async def test_put_preferences_gaming_with_tier(async_client, db_session):
    user = await create_test_user(db_session)
    await db_session.commit()

    r = await async_client.put(
        "/api/v1/users/me/preferences",
        json={"activities": ["pc_gaming"], "preferredTier": "ultra", "favoriteGames": ["Valorant"]},
        headers=auth_headers(user),
    )

    assert r.status_code == 200
    body = r.json()["data"]["preferences"]
    assert body["preferredTier"] == "ultra"
    assert body["favoriteGames"] == ["Valorant"]


@pytest.mark.asyncio
async def test_put_preferences_rejects_tier_without_gaming(async_client, db_session):
    user = await create_test_user(db_session)
    await db_session.commit()

    r = await async_client.put(
        "/api/v1/users/me/preferences",
        json={"activities": ["snooker"], "preferredTier": "ultra"},
        headers=auth_headers(user),
    )

    assert r.status_code in (400, 422)


@pytest.mark.asyncio
async def test_get_preferences_requires_auth(async_client):
    r = await async_client.get("/api/v1/users/me/preferences")
    assert r.status_code in (401, 403)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_user_preferences_api.py -v`
Expected: FAIL with 404 (route doesn't exist yet)

- [ ] **Step 3: Write the router**

Create `backend/app/api/v1/user_preferences.py`:

```python
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.repositories.user_preference_repository import UserPreferenceRepository
from app.services.user_preference_service import UserPreferenceService
from app.schemas.user_preference import UserPreferencesUpdateRequest

router = APIRouter()


@router.get("", status_code=status.HTTP_200_OK)
async def get_my_preferences(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    service = UserPreferenceService(UserPreferenceRepository(db))
    prefs = await service.get_preferences(current_user.id)
    return {"success": True, "data": {"preferences": prefs.model_dump(by_alias=True)}}


@router.put("", status_code=status.HTTP_200_OK)
async def update_my_preferences(
    payload: UserPreferencesUpdateRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    service = UserPreferenceService(UserPreferenceRepository(db))
    prefs = await service.update_preferences(current_user.id, payload)
    return {"success": True, "data": {"preferences": prefs.model_dump(by_alias=True)}}
```

- [ ] **Step 4: Register the router**

Read `backend/app/api/v1/router.py` first to confirm the exact import/include style, then add, mirroring the existing `auth_router` line:

```python
from app.api.v1.user_preferences import router as user_preferences_router
```

and

```python
api_router.include_router(user_preferences_router, prefix="/users/me/preferences", tags=["User Preferences"])
```

- [ ] **Step 5: Confirm `ValidationException` maps to an HTTP 400/422**

Run: `grep -n "ValidationException" backend/app/main.py backend/app/core/exceptions.py`

Confirm there's a registered exception handler that turns `ValidationException` into a 400 (or 422) response. If none exists, check how `hardware_tiers.py`'s endpoints handle it (likely a global handler in `main.py`) — do not add a duplicate handler, this is just a sanity check.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_user_preferences_api.py -v`
Expected: PASS (5 tests)

- [ ] **Step 7: Run the full backend test suite to check for regressions**

Run: `cd backend && python -m pytest -q`
Expected: all tests pass (no regressions from the new router/model)

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/v1/user_preferences.py backend/app/api/v1/router.py backend/tests/test_user_preferences_api.py
git commit -m "feat(backend): add GET/PUT /api/v1/users/me/preferences endpoints"
```

---

### Task 5: Frontend API client + shared activity constants

**Files:**
- Create: `frontend/src/lib/api/preferences.ts`
- Create: `frontend/src/lib/constants/activities.ts`

**Interfaces:**
- Produces (`activities.ts`): `type Activity = 'pc_gaming' | 'ps5' | 'xbox' | 'nintendo_switch' | 'snooker' | 'eight_ball_pool' | 'bowling' | 'carrom' | 'foosball'`; `interface ActivityOption { value: Activity; label: string; isGaming: boolean }`; `export const ACTIVITY_OPTIONS: ActivityOption[]` (9 entries, values/order matching the backend `Activity` enum in Task 1); `export const GAMING_ACTIVITIES: Activity[]` (the 4 gaming values); `export const PREFERRED_TIER_OPTIONS: { value: string; label: string }[]` for `budget`/`mid_range`/`high_end`/`ultra` with labels "Budget", "Mid-Range", "High-End", "Ultra".
- Produces (`preferences.ts`): `interface UserPreferences { activities: Activity[]; preferredTier: string | null; favoriteGames: string[] }`; `async function getMyPreferences(): Promise<{ preferences: UserPreferences }>` (GET); `async function updateMyPreferences(body: Partial<UserPreferences>): Promise<{ preferences: UserPreferences }>` (PUT).

- [ ] **Step 1: Write the activity constants file**

Create `frontend/src/lib/constants/activities.ts`:

```ts
export type Activity =
  | 'pc_gaming'
  | 'ps5'
  | 'xbox'
  | 'nintendo_switch'
  | 'snooker'
  | 'eight_ball_pool'
  | 'bowling'
  | 'carrom'
  | 'foosball';

export interface ActivityOption {
  value: Activity;
  label: string;
  isGaming: boolean;
}

export const ACTIVITY_OPTIONS: ActivityOption[] = [
  { value: 'pc_gaming', label: 'PC Gaming', isGaming: true },
  { value: 'ps5', label: 'PS5', isGaming: true },
  { value: 'xbox', label: 'Xbox', isGaming: true },
  { value: 'nintendo_switch', label: 'Nintendo Switch', isGaming: true },
  { value: 'snooker', label: 'Snooker', isGaming: false },
  { value: 'eight_ball_pool', label: '8-Ball Pool', isGaming: false },
  { value: 'bowling', label: 'Bowling', isGaming: false },
  { value: 'carrom', label: 'Carrom', isGaming: false },
  { value: 'foosball', label: 'Foosball', isGaming: false },
];

export const GAMING_ACTIVITIES: Activity[] = ACTIVITY_OPTIONS.filter((a) => a.isGaming).map(
  (a) => a.value
);

export const PREFERRED_TIER_OPTIONS: { value: string; label: string }[] = [
  { value: 'budget', label: 'Budget' },
  { value: 'mid_range', label: 'Mid-Range' },
  { value: 'high_end', label: 'High-End' },
  { value: 'ultra', label: 'Ultra' },
];

export function hasGamingActivity(activities: string[]): boolean {
  return activities.some((a) => (GAMING_ACTIVITIES as string[]).includes(a));
}
```

- [ ] **Step 2: Write the API client**

Create `frontend/src/lib/api/preferences.ts`:

```ts
import { apiClient, call } from './client';
import type { Activity } from '@/lib/constants/activities';

export interface UserPreferences {
  activities: Activity[];
  preferredTier: string | null;
  favoriteGames: string[];
}

export async function getMyPreferences(): Promise<{ preferences: UserPreferences }> {
  return call(() => apiClient.get('/api/v1/users/me/preferences'));
}

export async function updateMyPreferences(
  body: Partial<UserPreferences>
): Promise<{ preferences: UserPreferences }> {
  return call(() => apiClient.put('/api/v1/users/me/preferences', body));
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors from these two files (pre-existing unrelated errors, if any, are not this task's concern)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/constants/activities.ts frontend/src/lib/api/preferences.ts
git commit -m "feat(frontend): add activity constants and preferences API client"
```

---

### Task 6: Wire the profile page to real preferences

**Files:**
- Modify: `frontend/src/app/(customer)/profile/page.tsx`

**Interfaces:**
- Consumes: `getMyPreferences`/`updateMyPreferences` (Task 5), `ACTIVITY_OPTIONS`/`GAMING_ACTIVITIES`/`PREFERRED_TIER_OPTIONS`/`hasGamingActivity` (Task 5).

- [ ] **Step 1: Remove the mock constants and imports**

In `frontend/src/app/(customer)/profile/page.tsx:43-44`, delete:

```ts
const GAME_OPTIONS = ['Valorant', 'CS2', 'EA FC 24', 'GTA V', 'Apex Legends', 'Dota 2', 'Fortnite', 'Cyberpunk 2077'];
const RIG_TIERS = ['Ultra RTX 4080 (240Hz)', 'RTX 4070 Super Rig', 'PS5 DualSense Lounge', 'Standard Esports PC'];
```

Add near the top imports (after line 9's `updateMe, changePassword` import):

```ts
import { getMyPreferences, updateMyPreferences } from '@/lib/api/preferences';
import { ACTIVITY_OPTIONS, PREFERRED_TIER_OPTIONS, hasGamingActivity } from '@/lib/constants/activities';
```

- [ ] **Step 2: Replace the mock preference state (lines 93-94)**

Replace:

```ts
const [favGames, setFavGames] = useState<string[]>(['Valorant', 'EA FC 24']);
const [preferredTier, setPreferredTier] = useState('Ultra RTX 4080 (240Hz)');
```

with:

```ts
const [activities, setActivities] = useState<string[]>([]);
const [favGames, setFavGames] = useState<string[]>([]);
const [preferredTier, setPreferredTier] = useState<string | null>(null);
const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
```

- [ ] **Step 3: Load preferences on mount**

Add a `useEffect` right after the state declarations from Step 2 (needs `useEffect` added to the `'use client'` React import on line 3: change `import { useState } from 'react';` to `import { useState, useEffect } from 'react';`):

```ts
useEffect(() => {
  let cancelled = false;
  getMyPreferences()
    .then(({ preferences }) => {
      if (cancelled) return;
      setActivities(preferences.activities);
      setFavGames(preferences.favoriteGames);
      setPreferredTier(preferences.preferredTier);
    })
    .catch(() => {
      // Preferences are optional/best-effort on the profile view; leave
      // the empty defaults rather than blocking the rest of the page.
    })
    .finally(() => {
      if (!cancelled) setIsLoadingPreferences(false);
    });
  return () => {
    cancelled = true;
  };
}, []);
```

- [ ] **Step 4: Replace `toggleGame` and add `toggleActivity` (lines 213-219)**

Replace:

```ts
const toggleGame = (game: string) => {
  if (favGames.includes(game)) {
    setFavGames(favGames.filter((g) => g !== game));
  } else {
    setFavGames([...favGames, game]);
  }
};
```

with:

```ts
const toggleGame = (game: string) => {
  if (favGames.includes(game)) {
    setFavGames(favGames.filter((g) => g !== game));
  } else {
    setFavGames([...favGames, game]);
  }
};

const toggleActivity = (activity: string) => {
  setActivities((prev) => {
    const next = prev.includes(activity)
      ? prev.filter((a) => a !== activity)
      : [...prev, activity];
    // Clearing the last gaming activity also clears the fields that only
    // make sense alongside one, so stale tier/games can't be saved silently.
    if (!hasGamingActivity(next)) {
      setPreferredTier(null);
      setFavGames([]);
    }
    return next;
  });
};
```

- [ ] **Step 5: Save preferences alongside the profile save (lines 221-242)**

Replace the body of `handleSaveProfile`:

```ts
const handleSaveProfile = async () => {
  if (phoneError || nameError || phoneNumber.length !== 10) return;
  setSaveError('');
  setIsSaving(true);
  try {
    const res = await updateMe({
      fullName,
      phoneNumber: `+91 ${phoneNumber}`,
    });
    setUser(res.user);
    await updateMyPreferences({
      activities,
      preferredTier,
      favoriteGames: favGames,
    });
    // The gamer's name is also displayed wherever their past reviews are
    // cached (React Query's ['cafe-reviews', cafeId]), which setUser above
    // doesn't touch — without this, a name change wouldn't show up on
    // reviews already fetched into the cache until it naturally expired.
    queryClient.invalidateQueries({ queryKey: ['cafe-reviews'] });
    setIsEditOpen(false);
  } catch (err: any) {
    setSaveError(err?.message || 'Failed to save profile. Please try again.');
  } finally {
    setIsSaving(false);
  }
};
```

- [ ] **Step 6: Update the display card (lines 332-352)**

Replace the two-column grid inside the "Gamer Preferences Breakdown" card:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-caption">
  <div className="p-3 rounded-2xl bg-surface flex flex-col gap-1">
    <span className="text-overline text-text-secondary flex items-center gap-1">
      <Gamepad2 className="h-3 w-3 text-primary" /> Preferred Activities
    </span>
    <div className="flex items-center gap-1 flex-wrap mt-0.5">
      {activities.length === 0 && (
        <span className="text-text-secondary">Not set</span>
      )}
      {activities.map((a) => {
        const opt = ACTIVITY_OPTIONS.find((o) => o.value === a);
        return (
          <span key={a} className="rounded-full bg-card px-2.5 py-0.5 font-semibold text-text-primary border border-border">
            {opt?.label ?? a}
          </span>
        );
      })}
    </div>
  </div>

  {hasGamingActivity(activities) && (
    <div className="p-3 rounded-2xl bg-surface flex flex-col gap-1">
      <span className="text-overline text-text-secondary flex items-center gap-1">
        <Cpu className="h-3 w-3 text-accent" /> Preferred Hardware Tier
      </span>
      <span className="font-semibold text-primary mt-0.5">
        {PREFERRED_TIER_OPTIONS.find((t) => t.value === preferredTier)?.label ?? 'Not set'}
      </span>
    </div>
  )}
</div>
```

- [ ] **Step 7: Update the edit modal fields (lines 576-612)**

Replace the "Preferred Hardware Tier" `<select>` and "Favorite Games" blocks entirely with an activity picker plus conditional tier/games fields:

```tsx
<div>
  <label className="text-caption font-semibold text-text-secondary mb-1.5 block">Preferred Activities</label>
  <div className="flex items-center gap-1.5 flex-wrap">
    {ACTIVITY_OPTIONS.map((opt) => {
      const isSelected = activities.includes(opt.value);
      return (
        <button
          key={opt.value}
          type="button"
          onClick={() => toggleActivity(opt.value)}
          className={`rounded-full px-3 py-1 text-caption font-semibold transition-all ${
            isSelected
              ? 'bg-primary text-white shadow-sm'
              : 'bg-surface text-text-secondary border border-border hover:bg-border/40'
          }`}
        >
          {opt.label} {isSelected ? '✓' : ''}
        </button>
      );
    })}
  </div>
</div>

{hasGamingActivity(activities) && (
  <>
    <div>
      <label className="text-caption font-semibold text-text-secondary mb-1 block">Preferred Hardware Tier</label>
      <select
        value={preferredTier ?? ''}
        onChange={(e) => setPreferredTier(e.target.value || null)}
        className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-body text-text-primary focus:ring-2 focus:ring-primary/40 focus:outline-none"
      >
        <option value="">Not set</option>
        {PREFERRED_TIER_OPTIONS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </div>

    <div>
      <label className="text-caption font-semibold text-text-secondary mb-1.5 block">Favorite Games</label>
      <p className="text-caption text-text-secondary mb-1">
        Add games as free text; press Enter to add.
      </p>
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {favGames.map((game) => (
          <span
            key={game}
            className="flex items-center gap-1 rounded-full bg-secondary text-white px-3 py-1 text-caption font-semibold"
          >
            {game}
            <button type="button" onClick={() => toggleGame(game)} className="ml-1">
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        placeholder="Type a game and press Enter"
        onKeyDown={(e) => {
          const val = (e.target as HTMLInputElement).value.trim();
          if (e.key === 'Enter' && val) {
            e.preventDefault();
            if (!favGames.includes(val)) setFavGames([...favGames, val]);
            (e.target as HTMLInputElement).value = '';
          }
        }}
        className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-body text-text-primary focus:ring-2 focus:ring-primary/40 focus:outline-none"
      />
    </div>
  </>
)}
```

This drops the old fixed `GAME_OPTIONS` chip-toggle UI in favor of free-text entry, since favorite games were never meant to be limited to a fixed list and the backend schema stores arbitrary strings — reusing `toggleGame` (which already does add/remove-by-value) for the "×" removal keeps that helper meaningful post-refactor.

- [ ] **Step 8: Manual browser verification**

Start the dev servers (backend `uvicorn`, frontend `npm run dev`), log in as a test customer, open Profile → Edit:
1. Confirm activity chips render, toggle a few non-gaming ones (Snooker, Bowling) → tier/games fields stay hidden.
2. Toggle "PC Gaming" on → tier select and favorite-games input appear.
3. Set a tier, add a game, click Save Profile → modal closes, display card shows the new activities/tier.
4. Reload the page → confirm the same values reappear (proves persistence, not just local state).
5. Toggle off the only gaming activity, save → tier/games disappear from the display card and are cleared server-side (re-open edit modal to confirm they're empty, not stale).

- [ ] **Step 9: Commit**

```bash
git add "frontend/src/app/(customer)/profile/page.tsx"
git commit -m "feat(frontend): wire profile preferences to activity-based backend API"
```

---

## Self-Review Notes

- Spec coverage: activity multi-select (Task 6), gaming-conditional tier/games (Tasks 2/3/6), persistence via new table (Task 1), fixed extensible enum (Task 1/5), favorite games kept (Task 6), testing (Tasks 1-4 automated, Task 6 manual browser pass) — all covered.
- The service's "merge-then-validate" design (Task 3) specifically prevents the case where a client sends only `activities: ["snooker"]` while an old `preferred_tier: "ultra"` sits in the DB from a prior save — that combination is now invalid and must be caught using the *merged* state, not just the payload in isolation. Test `test_update_preferences_rejects_tier_when_merged_state_has_no_gaming` in Task 3 exercises exactly this.
- Type/name consistency check: `Activity`, `GAMING_ACTIVITIES`, `PreferredTier` (Task 1) → imported identically in Task 2 and Task 3 → mirrored as TS `Activity`/`GAMING_ACTIVITIES` (Task 5, values matched by string, not by import) → consumed in Task 6. `UserPreferencesUpdateRequest`/`UserPreferencesResponse` names consistent across Tasks 2-4.
