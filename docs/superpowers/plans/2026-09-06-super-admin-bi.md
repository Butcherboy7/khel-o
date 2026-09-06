# Super Admin BI & IA Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild KHELO's super admin from a café-verification queue with a few bolted-on counters into a full BI control panel — a data foundation (acquisition tracking, game tracking, top-of-funnel events) plus eight analytics surfaces and a restructured, grouped navigation — without rebuilding any existing admin page.

**Architecture:** Backend follows the existing repository → service → Pydantic-schema → FastAPI-router layering used throughout `backend/app`. New backend work lives in new files (`analytics_event.py`, `admin_analytics_service.py`, `admin_analytics.py` route/schema) rather than growing the already-927-line `admin.py`/823-line `admin_service.py`. Frontend follows the existing React Query + Zustand-store + `AdminShell` pattern; every existing admin page keeps its current URL, and new pages/tabs are added around them.

**Tech Stack:** FastAPI, SQLAlchemy (async), Alembic, Pydantic v2, pytest + pytest-asyncio + httpx `AsyncClient`, Next.js App Router, TanStack Query, Zustand, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-06-super-admin-bi-design.md`

## Global Constraints

- Every new Pydantic response/request schema uses the existing `to_camel` alias-generator pattern (`alias_generator=to_camel, populate_by_name=True`) — each schema file defines its own `to_camel` copy, matching the existing convention (no shared util exists in this codebase).
- No existing admin page's URL changes. `AdminShell.tsx`'s nav restructure (Task 21) only changes grouping/labels, never route paths, so no existing bookmark breaks.
- `POST /api/v1/analytics/events` must work **unauthenticated** — it has to capture pre-signup browsing.
- All new admin analytics endpoints require `Depends(require_admin)` (from `app.api.deps`), matching every existing `admin.py` endpoint.
- Migration numbering continues the existing sequence in `backend/migrations/versions/` — next is `019`.
- **Deviation note from the spec, resolved here:** the spec's IA table (§4) lists a "Growth" item under the Analytics nav group, but §5 (which defines actual scope) never defines a distinct Growth dashboard — period-over-period growth is already covered by the Executive Dashboard's deltas (§5.1). This plan folds Growth into the Overview page and does not create a separate Growth nav item or page, to avoid building an underspecified, redundant surface.

---

## File Structure

**Backend — new files:**
- `backend/migrations/versions/019_add_analytics_foundation.py` — schema migration
- `backend/app/models/analytics_event.py` — `AnalyticsEvent` model
- `backend/app/repositories/analytics_event_repository.py` — create + session-backfill
- `backend/app/schemas/analytics.py` — event ingestion request schema
- `backend/app/api/v1/analytics.py` — `POST /events` (unauthenticated)
- `backend/app/schemas/admin_analytics.py` — all 8 dashboard response schemas
- `backend/app/services/admin_analytics_service.py` — all 8 dashboard query methods
- `backend/app/api/v1/admin_analytics.py` — all 8 dashboard GET routes (admin-only)

**Backend — modified files:**
- `backend/app/models/user.py` — 4 new nullable columns
- `backend/app/models/booking.py` — 1 new nullable column (`game`)
- `backend/app/schemas/user.py` — `UserCreateRequest` gains optional fields
- `backend/app/services/auth_service.py` — `register_with_email` accepts + persists new fields, backfills session events
- `backend/app/schemas/booking.py` — `BookingBase` gains optional `game`
- `backend/app/services/booking_service.py` — persists `game` on create
- `backend/app/api/v1/router.py` — mounts the two new routers

**Frontend — new files:**
- `frontend/src/store/analyticsStore.ts` — session id + first-touch UTM attribution (localStorage, mirrors `locationStore.ts`)
- `frontend/src/lib/api/analyticsEvents.ts` — fire-and-forget event POST helper
- `frontend/src/lib/api/adminAnalytics.ts` — 8 dashboard GET calls
- `frontend/src/app/(admin)/admin/verification-queue/page.tsx` — today's queue UI, relocated verbatim
- `frontend/src/app/(admin)/admin/cafes/PerformanceTab.tsx` — new tab component for café performance
- `frontend/src/app/(admin)/admin/inventory/setups/page.tsx`
- `frontend/src/app/(admin)/admin/analytics/geography/page.tsx`
- `frontend/src/app/(admin)/admin/analytics/revenue/page.tsx`
- `frontend/src/app/(admin)/admin/marketplace-health/page.tsx`
- `frontend/src/app/(admin)/admin/analytics/attribution/page.tsx`
- `frontend/src/app/(admin)/admin/analytics/funnels/page.tsx`
- `frontend/src/app/(admin)/admin/promotions/CampaignLinksTab.tsx`

**Frontend — modified files:**
- `frontend/src/app/(admin)/admin/page.tsx` — becomes the new Overview/Executive Dashboard (today's queue content moves out, see above)
- `frontend/src/app/(admin)/admin/cafes/page.tsx` — gains an All Cafés / Performance tab switcher
- `frontend/src/app/(admin)/admin/promotions/page.tsx` — gains a Promotions / Campaign Links tab switcher
- `frontend/src/components/layout/AdminShell.tsx` — grouped nav (Task 21, last)
- `frontend/src/components/customer/ExploreClient.tsx` — fires `search_performed`
- `frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx` — fires `venue_viewed`
- `frontend/src/app/(customer)/bookings/new/page.tsx` — fires `booking_flow_started`, adds game combobox
- `frontend/src/app/(auth)/register/page.tsx` — sends `city` + attribution at signup
- `frontend/src/types/user.ts` — `RegisterRequest` gains optional fields
- `frontend/src/types/booking.ts` — `BookingCreateRequest` gains optional `game`
- `frontend/src/hooks/queries/keys.ts` — new `admin.analyticsV2` key namespace

---

## Task 1: Foundation migration — acquisition fields, `Booking.game`, `AnalyticsEvent`

**Files:**
- Create: `backend/migrations/versions/019_add_analytics_foundation.py`
- Modify: `backend/app/models/user.py`
- Modify: `backend/app/models/booking.py`
- Create: `backend/app/models/analytics_event.py`
- Test: `backend/tests/test_analytics_foundation_migration.py`

**Interfaces:**
- Produces: `User.city: str | None`, `User.acquisition_source: str | None`, `User.acquisition_medium: str | None`, `User.acquisition_campaign: str | None`; `Booking.game: str | None`; `AnalyticsEvent` model with `id, session_id, user_id, event_type, cafe_id, event_metadata, created_at`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_analytics_foundation_migration.py
import pytest
from uuid import uuid4
from sqlalchemy import select
from app.models.user import User, UserRole
from app.models.booking import Booking
from app.models.analytics_event import AnalyticsEvent
from app.core.security import get_password_hash


@pytest.mark.asyncio
async def test_user_has_acquisition_columns(db_session):
    user = User(
        id=uuid4(),
        email=f"acq_{uuid4().hex[:8]}@test.com",
        full_name="Acq Test",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.GAMER,
        is_active=True,
        city="Hyderabad",
        acquisition_source="whatsapp",
        acquisition_medium="share",
        acquisition_campaign="launch",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    assert user.city == "Hyderabad"
    assert user.acquisition_source == "whatsapp"
    assert user.acquisition_medium == "share"
    assert user.acquisition_campaign == "launch"


@pytest.mark.asyncio
async def test_analytics_event_roundtrip(db_session):
    event = AnalyticsEvent(
        id=uuid4(),
        session_id="sess-123",
        user_id=None,
        event_type="search_performed",
        cafe_id=None,
        event_metadata={"city": "Hyderabad", "result_count": 0},
    )
    db_session.add(event)
    await db_session.commit()
    await db_session.refresh(event)

    result = await db_session.execute(
        select(AnalyticsEvent).where(AnalyticsEvent.session_id == "sess-123")
    )
    fetched = result.scalars().first()
    assert fetched is not None
    assert fetched.event_type == "search_performed"
    assert fetched.event_metadata["result_count"] == 0
    assert fetched.user_id is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_analytics_foundation_migration.py -v`
Expected: FAIL — `AttributeError` / `ImportError` (columns and `AnalyticsEvent` don't exist yet)

- [ ] **Step 3: Add the model changes**

In `backend/app/models/user.py`, add after the existing `avatar_url` column (keep `created_at`/`updated_at` last, matching the existing layout):

```python
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    acquisition_source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    acquisition_medium: Mapped[str | None] = mapped_column(String(100), nullable=True)
    acquisition_campaign: Mapped[str | None] = mapped_column(String(100), nullable=True)
```

In `backend/app/models/booking.py`, add after `notes`:

```python
    game: Mapped[str | None] = mapped_column(String(100), nullable=True)
```

Create `backend/app/models/analytics_event.py`:

```python
import uuid
from datetime import datetime, timezone
from typing import Any
from sqlalchemy import String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AnalyticsEvent(Base):
    """Top-of-funnel tracking only — search/venue-view/booking-started.

    Everything from 'booking started' onward (confirmed/paid/completed) is
    already fully and authoritatively captured by Booking.status and
    Payment.status transitions; duplicating that here would create a second,
    driftable source of truth for no benefit.
    """
    __tablename__ = "analytics_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    cafe_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("cafes.id"), nullable=True)
    event_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )
```

- [ ] **Step 4: Write the migration**

```python
# backend/migrations/versions/019_add_analytics_foundation.py
"""Add analytics foundation: user acquisition fields, booking.game, analytics_events

Revision ID: 019
Revises: 018
Create Date: 2026-09-06

"""
from alembic import op
import sqlalchemy as sa

revision = '019'
down_revision = '018'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('city', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('acquisition_source', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('acquisition_medium', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('acquisition_campaign', sa.String(100), nullable=True))

    op.add_column('bookings', sa.Column('game', sa.String(100), nullable=True))

    op.create_table(
        'analytics_events',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('session_id', sa.String(64), nullable=False),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('cafe_id', sa.Uuid(), sa.ForeignKey('cafes.id'), nullable=True),
        sa.Column('event_metadata', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_analytics_events_session_id', 'analytics_events', ['session_id'])
    op.create_index('ix_analytics_events_user_id', 'analytics_events', ['user_id'])
    op.create_index('ix_analytics_events_event_type', 'analytics_events', ['event_type'])
    op.create_index('ix_analytics_events_created_at', 'analytics_events', ['created_at'])


def downgrade():
    op.drop_index('ix_analytics_events_created_at', table_name='analytics_events')
    op.drop_index('ix_analytics_events_event_type', table_name='analytics_events')
    op.drop_index('ix_analytics_events_user_id', table_name='analytics_events')
    op.drop_index('ix_analytics_events_session_id', table_name='analytics_events')
    op.drop_table('analytics_events')

    op.drop_column('bookings', 'game')

    op.drop_column('users', 'acquisition_campaign')
    op.drop_column('users', 'acquisition_medium')
    op.drop_column('users', 'acquisition_source')
    op.drop_column('users', 'city')
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_analytics_foundation_migration.py -v`
Expected: PASS (the test DB is created from the SQLAlchemy models directly per existing test setup, so no need to run alembic for the test to pass — but run `alembic upgrade head` against a scratch/dev DB too, to confirm the migration itself is valid before committing)

Run: `cd backend && alembic upgrade head` (against your local/dev database)
Expected: no errors; `alembic downgrade -1` then `alembic upgrade head` again to confirm reversibility

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/versions/019_add_analytics_foundation.py backend/app/models/user.py backend/app/models/booking.py backend/app/models/analytics_event.py backend/tests/test_analytics_foundation_migration.py
git commit -m "feat(db): add analytics foundation - user acquisition fields, booking.game, analytics_events"
```

---

## Task 2: Analytics events endpoint

**Depends on:** Task 1 (needs `AnalyticsEvent` model)

**Files:**
- Create: `backend/app/repositories/analytics_event_repository.py`
- Create: `backend/app/schemas/analytics.py`
- Create: `backend/app/api/v1/analytics.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_analytics_events.py`

**Interfaces:**
- Produces: `AnalyticsEventRepository.create(data: dict) -> AnalyticsEvent`, `AnalyticsEventRepository.backfill_session(session_id: str, user_id: UUID) -> int` (row count updated); `POST /api/v1/analytics/events` accepting `{sessionId, eventType, cafeId?, metadata?}`, returns 204.
- Consumes: `AnalyticsEvent` model from Task 1.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_analytics_events.py
import pytest
from sqlalchemy import select
from app.models.analytics_event import AnalyticsEvent


@pytest.mark.asyncio
async def test_post_event_unauthenticated_succeeds(async_client, db_session):
    resp = await async_client.post(
        "/api/v1/analytics/events",
        json={"sessionId": "sess-abc", "eventType": "search_performed", "metadata": {"resultCount": 0}},
    )
    assert resp.status_code == 204

    result = await db_session.execute(select(AnalyticsEvent).where(AnalyticsEvent.session_id == "sess-abc"))
    row = result.scalars().first()
    assert row is not None
    assert row.event_type == "search_performed"
    assert row.event_metadata["resultCount"] == 0


@pytest.mark.asyncio
async def test_post_event_rejects_unknown_event_type(async_client):
    resp = await async_client.post(
        "/api/v1/analytics/events",
        json={"sessionId": "sess-abc", "eventType": "not_a_real_event"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_post_event_rejects_oversized_metadata(async_client):
    resp = await async_client.post(
        "/api/v1/analytics/events",
        json={"sessionId": "sess-abc", "eventType": "venue_viewed", "metadata": {"pad": "x" * 3000}},
    )
    assert resp.status_code == 422
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_analytics_events.py -v`
Expected: FAIL — 404 (no `/api/v1/analytics/events` route exists yet)

- [ ] **Step 3: Implement the repository**

```python
# backend/app/repositories/analytics_event_repository.py
from typing import Any
from uuid import UUID
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analytics_event import AnalyticsEvent
from app.repositories.base import BaseRepository


class AnalyticsEventRepository(BaseRepository[AnalyticsEvent]):
    def __init__(self, db: AsyncSession):
        super().__init__(AnalyticsEvent, db)

    async def create_event(self, data: dict[str, Any]) -> AnalyticsEvent:
        event = AnalyticsEvent(**data)
        self.db.add(event)
        await self.db.commit()
        await self.db.refresh(event)
        return event

    async def backfill_session(self, session_id: str, user_id: UUID) -> int:
        """Link anonymous pre-signup events to the user who just registered."""
        stmt = (
            update(AnalyticsEvent)
            .where(AnalyticsEvent.session_id == session_id, AnalyticsEvent.user_id.is_(None))
            .values(user_id=user_id)
        )
        result = await self.db.execute(stmt)
        await self.db.commit()
        return result.rowcount or 0
```

- [ ] **Step 4: Implement the schema**

```python
# backend/app/schemas/analytics.py
import json
from enum import Enum
from typing import Any, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator


def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


class AnalyticsEventType(str, Enum):
    SEARCH_PERFORMED = "search_performed"
    VENUE_VIEWED = "venue_viewed"
    BOOKING_FLOW_STARTED = "booking_flow_started"


MAX_METADATA_BYTES = 2048


class AnalyticsEventCreateRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=64)
    event_type: AnalyticsEventType
    cafe_id: Optional[UUID] = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("metadata")
    @classmethod
    def cap_metadata_size(cls, v: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(v)) > MAX_METADATA_BYTES:
            raise ValueError(f"metadata exceeds {MAX_METADATA_BYTES} bytes")
        return v

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )
```

- [ ] **Step 5: Implement the route**

```python
# backend/app/api/v1/analytics.py
from fastapi import APIRouter, status
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.database import get_db
from app.schemas.analytics import AnalyticsEventCreateRequest
from app.repositories.analytics_event_repository import AnalyticsEventRepository

router = APIRouter()


@router.post("/events", status_code=status.HTTP_204_NO_CONTENT)
async def create_analytics_event(
    payload: AnalyticsEventCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    repo = AnalyticsEventRepository(db)
    await repo.create_event({
        "session_id": payload.session_id,
        "event_type": payload.event_type.value,
        "cafe_id": payload.cafe_id,
        "event_metadata": payload.metadata,
    })
    return None
```

In `backend/app/api/v1/router.py`, add near the other `include_router` calls:

```python
from app.api.v1.analytics import router as analytics_router
# ...
api_router.include_router(analytics_router, prefix="/analytics", tags=["Analytics"])
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/test_analytics_events.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/repositories/analytics_event_repository.py backend/app/schemas/analytics.py backend/app/api/v1/analytics.py backend/app/api/v1/router.py backend/tests/test_analytics_events.py
git commit -m "feat(analytics): add unauthenticated event ingestion endpoint"
```

---

## Task 3: Frontend event-capture infrastructure

**Depends on:** Task 2 (posts to the real endpoint)

**Files:**
- Create: `frontend/src/store/analyticsStore.ts`
- Create: `frontend/src/lib/api/analyticsEvents.ts`
- Test: `frontend/src/store/analyticsStore.test.ts`

**Interfaces:**
- Produces: `useAnalyticsStore()` exposing `sessionId: string`, `attribution: { source, medium, campaign } | null`, `captureAttributionFromUrl(searchParams: URLSearchParams) => void`; `fireAnalyticsEvent(eventType, opts?: { cafeId?: string, metadata?: object }) => void` (fire-and-forget, never throws).

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/store/analyticsStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAnalyticsStore } from './analyticsStore';

describe('analyticsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAnalyticsStore.setState({ sessionId: useAnalyticsStore.getState().sessionId, attribution: null });
  });

  it('generates a session id that persists across calls', () => {
    const id1 = useAnalyticsStore.getState().sessionId;
    const id2 = useAnalyticsStore.getState().sessionId;
    expect(id1).toBeTruthy();
    expect(id1).toBe(id2);
  });

  it('captures utm params on first touch and ignores them afterwards', () => {
    const store = useAnalyticsStore.getState();
    store.captureAttributionFromUrl(new URLSearchParams('utm_source=whatsapp&utm_medium=share&utm_campaign=launch'));
    expect(useAnalyticsStore.getState().attribution).toEqual({
      source: 'whatsapp',
      medium: 'share',
      campaign: 'launch',
    });

    // Second visit with different UTM params must NOT overwrite first-touch attribution.
    useAnalyticsStore.getState().captureAttributionFromUrl(new URLSearchParams('utm_source=google'));
    expect(useAnalyticsStore.getState().attribution?.source).toBe('whatsapp');
  });

  it('does nothing when no utm params are present', () => {
    useAnalyticsStore.getState().captureAttributionFromUrl(new URLSearchParams(''));
    expect(useAnalyticsStore.getState().attribution).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/store/analyticsStore.test.ts`
Expected: FAIL — module `./analyticsStore` does not exist

- [ ] **Step 3: Implement the store**

```typescript
// frontend/src/store/analyticsStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

function generateSessionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface Attribution {
  source: string;
  medium: string | null;
  campaign: string | null;
}

interface AnalyticsState {
  sessionId: string;
  attribution: Attribution | null;
  captureAttributionFromUrl: (params: URLSearchParams) => void;
}

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set, get) => ({
      sessionId: generateSessionId(),
      attribution: null,
      captureAttributionFromUrl: (params) => {
        // First-touch wins — never overwrite attribution already captured.
        if (get().attribution) return;
        const source = params.get('utm_source');
        if (!source) return;
        set({
          attribution: {
            source,
            medium: params.get('utm_medium'),
            campaign: params.get('utm_campaign'),
          },
        });
      },
    }),
    {
      name: 'khelo-analytics-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
```

- [ ] **Step 4: Implement the fire-and-forget event helper**

```typescript
// frontend/src/lib/api/analyticsEvents.ts
import { apiClient } from './client';
import { useAnalyticsStore } from '@/store/analyticsStore';

export type AnalyticsEventType = 'search_performed' | 'venue_viewed' | 'booking_flow_started';

export function fireAnalyticsEvent(
  eventType: AnalyticsEventType,
  opts: { cafeId?: string; metadata?: Record<string, unknown> } = {}
): void {
  const sessionId = useAnalyticsStore.getState().sessionId;
  apiClient
    .post('/api/v1/analytics/events', {
      sessionId,
      eventType,
      cafeId: opts.cafeId,
      metadata: opts.metadata ?? {},
    })
    .catch(() => {
      // Fire-and-forget: a dropped analytics event must never surface as a
      // user-facing error or block the page it was fired from.
    });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/store/analyticsStore.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/store/analyticsStore.ts frontend/src/lib/api/analyticsEvents.ts frontend/src/store/analyticsStore.test.ts
git commit -m "feat(analytics): add client-side session id, attribution capture, event firing helper"
```

---

## Task 4: Instrument search (`ExploreClient.tsx`)

**Depends on:** Task 3

**Files:**
- Modify: `frontend/src/components/customer/ExploreClient.tsx`

**Interfaces:**
- Consumes: `fireAnalyticsEvent('search_performed', { metadata }) ` from Task 3.

This page already computes `effectiveCity`, `debouncedQuery`, `minPrice`, `maxPrice`, and the query results (see existing lines ~198-230). Find the `useQuery` call that fetches café search results (the one using `effectiveCity`, `debouncedQuery`, `minPrice`, `maxPrice` as `queryKey`/params) and add an effect that fires once per completed search.

- [ ] **Step 1: Add the import**

```typescript
import { fireAnalyticsEvent } from '@/lib/api/analyticsEvents';
```

- [ ] **Step 2: Add the effect after the search query's `useQuery` call**

```typescript
useEffect(() => {
  if (isSearchLoading || !searchData) return;
  fireAnalyticsEvent('search_performed', {
    metadata: {
      city: effectiveCity ?? null,
      platformFilter: platformFilter ?? null,
      minPrice: minPrice ?? null,
      maxPrice: maxPrice ?? null,
      queryText: debouncedQuery || null,
      resultCount: searchData.items?.length ?? 0,
    },
  });
  // Only re-fire when the actual search inputs change, not on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [effectiveCity, debouncedQuery, minPrice, maxPrice, platformFilter, searchData]);
```

Replace `isSearchLoading`/`searchData` with whatever the existing search `useQuery`'s destructured `isLoading`/`data` variables are actually named in this file (read the surrounding code at the query call around line 210-230 to match the exact variable names already in scope — do not rename the existing query's variables to match this snippet).

- [ ] **Step 3: Manually verify in the browser**

Run the frontend dev server, open the Explore page, perform a search, then check (via a temporary `console.log` in `fireAnalyticsEvent` or the Network tab) that a `POST /api/v1/analytics/events` fires with `eventType: "search_performed"` and a populated `resultCount`. Remove any temporary debug logging before committing.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/customer/ExploreClient.tsx
git commit -m "feat(analytics): instrument search_performed on the Explore page"
```

---

## Task 5: Instrument venue view (`CafeDetailClient.tsx`)

**Depends on:** Task 3

**Files:**
- Modify: `frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx`

**Interfaces:**
- Consumes: `fireAnalyticsEvent('venue_viewed', { cafeId })` from Task 3.

- [ ] **Step 1: Add the import**

```typescript
import { useEffect } from 'react';
import { fireAnalyticsEvent } from '@/lib/api/analyticsEvents';
```

(`useEffect` may already be imported from `react` alongside `useRef`/`useState` at the top of the file — add it to that existing import rather than a second `react` import line.)

- [ ] **Step 2: Add the effect right after `cafeId` is derived (`const cafeId = params.id as string;`)**

```typescript
useEffect(() => {
  fireAnalyticsEvent('venue_viewed', { cafeId });
  // Fires exactly once per mount of a given café's detail page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [cafeId]);
```

- [ ] **Step 3: Manually verify**

Open any café detail page and confirm (Network tab) a `POST /api/v1/analytics/events` with `eventType: "venue_viewed"` and the correct `cafeId`.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx"
git commit -m "feat(analytics): instrument venue_viewed on the café detail page"
```

---

## Task 6: Instrument booking flow start (`bookings/new/page.tsx`)

**Depends on:** Task 3

**Files:**
- Modify: `frontend/src/app/(customer)/bookings/new/page.tsx`

**Interfaces:**
- Consumes: `fireAnalyticsEvent('booking_flow_started', { cafeId, metadata: { tierId } })` from Task 3.

- [ ] **Step 1: Add the import**

```typescript
import { fireAnalyticsEvent } from '@/lib/api/analyticsEvents';
```

- [ ] **Step 2: Add an effect after `activeTier` is resolved (near where `pricePerHour`/`activeTier?.pricePerHour` is read, around line 387)**

```typescript
useEffect(() => {
  if (!activeTier) return;
  fireAnalyticsEvent('booking_flow_started', {
    cafeId,
    metadata: { tierId: activeTier.id },
  });
  // Fires once per (cafe, tier) selection, not on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [cafeId, activeTier?.id]);
```

`useEffect` must be present in this file's `react` import — add it if the file doesn't already import it.

- [ ] **Step 3: Manually verify**

Start a booking flow for any café/tier and confirm a `POST /api/v1/analytics/events` with `eventType: "booking_flow_started"` fires with the correct `cafeId` and `tierId`.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(customer)/bookings/new/page.tsx"
git commit -m "feat(analytics): instrument booking_flow_started on the booking page"
```

---

## Task 7: Registration backend — accept acquisition fields, backfill session

**Depends on:** Task 1 (columns), Task 2 (`AnalyticsEventRepository.backfill_session`)

**Files:**
- Modify: `backend/app/schemas/user.py`
- Modify: `backend/app/services/auth_service.py`
- Modify: `backend/app/api/v1/auth.py`
- Test: `backend/tests/test_registration_acquisition.py`

**Interfaces:**
- Consumes: `AnalyticsEventRepository.backfill_session(session_id, user_id) -> int` from Task 2.
- Produces: `register_with_email(user_data, session_id=None)` now persists `city`/`acquisition_*` and backfills events.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_registration_acquisition.py
import pytest
from uuid import uuid4
from sqlalchemy import select
from app.models.user import User
from app.models.analytics_event import AnalyticsEvent


@pytest.mark.asyncio
async def test_register_persists_city_and_acquisition(async_client, db_session):
    email = f"newuser_{uuid4().hex[:8]}@test.com"
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "testpass123",
            "fullName": "New User",
            "city": "Hyderabad",
            "acquisitionSource": "whatsapp",
            "acquisitionMedium": "share",
            "acquisitionCampaign": "launch",
        },
    )
    assert resp.status_code == 201

    result = await db_session.execute(select(User).where(User.email == email))
    user = result.scalars().first()
    assert user.city == "Hyderabad"
    assert user.acquisition_source == "whatsapp"


@pytest.mark.asyncio
async def test_register_without_acquisition_fields_still_succeeds(async_client):
    email = f"newuser_{uuid4().hex[:8]}@test.com"
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "testpass123", "fullName": "New User"},
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_register_backfills_anonymous_session_events(async_client, db_session):
    session_id = f"sess-{uuid4().hex[:8]}"
    pre_signup_event = AnalyticsEvent(
        id=uuid4(), session_id=session_id, user_id=None,
        event_type="venue_viewed", event_metadata={},
    )
    db_session.add(pre_signup_event)
    await db_session.commit()

    email = f"newuser_{uuid4().hex[:8]}@test.com"
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "testpass123", "fullName": "New User", "sessionId": session_id},
    )
    assert resp.status_code == 201
    new_user_id = resp.json()["data"]["user"]["id"]

    await db_session.refresh(pre_signup_event)
    assert str(pre_signup_event.user_id) == new_user_id
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_registration_acquisition.py -v`
Expected: FAIL — 422 (unrecognized fields rejected or ignored) / assertion errors on `user.city`

- [ ] **Step 3: Update the schema**

In `backend/app/schemas/user.py`, modify `UserCreateRequest`:

```python
class UserCreateRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=2, max_length=255)
    phone_number: Optional[str] = Field(None, max_length=20)
    city: Optional[str] = Field(None, max_length=100)
    acquisition_source: Optional[str] = Field(None, max_length=100)
    acquisition_medium: Optional[str] = Field(None, max_length=100)
    acquisition_campaign: Optional[str] = Field(None, max_length=100)
    session_id: Optional[str] = Field(None, max_length=64)

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )
```

- [ ] **Step 4: Update the service**

In `backend/app/services/auth_service.py`, modify `register_with_email`:

```python
    async def register_with_email(self, user_data: UserCreateRequest) -> Dict[str, Any]:
        clean_email = user_data.email.strip().lower()
        existing = await self.user_repo.get_by_email(clean_email)
        if existing:
            raise ConflictException(
                message="An account with this email already exists",
                error_code="EMAIL_ALREADY_EXISTS"
            )

        hashed_password = get_password_hash(user_data.password)

        user_dict = {
            "id": uuid4(),
            "email": clean_email,
            "password_hash": hashed_password,
            "full_name": user_data.full_name.strip(),
            "phone_number": user_data.phone_number,
            "role": UserRole.GAMER,
            "is_active": True,
            "google_id": None,
            "avatar_url": None,
            "city": user_data.city,
            "acquisition_source": user_data.acquisition_source,
            "acquisition_medium": user_data.acquisition_medium,
            "acquisition_campaign": user_data.acquisition_campaign,
        }

        created_user = await self.user_repo.create(user_dict)
        await self._claim_pending_staff_invitations(created_user)

        if user_data.session_id:
            from app.repositories.analytics_event_repository import AnalyticsEventRepository
            await AnalyticsEventRepository(self.user_repo.db).backfill_session(
                user_data.session_id, created_user.id
            )

        access_token, refresh_token = self.create_tokens(created_user)

        return {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "user": await self._user_response_with_roles(created_user)
        }
```

`self.user_repo.db` assumes `UserRepository` exposes `self.db` (it's a `BaseRepository` subclass, per `base.py`, which stores `self.db` in `__init__` — confirm this attribute name in `user_repository.py` before wiring; if the attribute has a different name there, use that name instead).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_registration_acquisition.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/user.py backend/app/services/auth_service.py backend/tests/test_registration_acquisition.py
git commit -m "feat(auth): accept city/acquisition fields at registration, backfill anonymous session events"
```

---

## Task 8: Registration frontend — send city + attribution at signup

**Depends on:** Task 3 (attribution/session stores), Task 7 (backend accepts the fields)

**Files:**
- Modify: `frontend/src/types/user.ts`
- Modify: `frontend/src/app/(auth)/register/page.tsx`

**Interfaces:**
- Consumes: `useLocationStore` (`selectedCity`, existing), `useAnalyticsStore` (`sessionId`, `attribution`, `captureAttributionFromUrl`) from Task 3.

- [ ] **Step 1: Update the type**

```typescript
// frontend/src/types/user.ts
export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
  city?: string;
  acquisitionSource?: string;
  acquisitionMedium?: string;
  acquisitionCampaign?: string;
  sessionId?: string;
}
```

- [ ] **Step 2: Wire capture + payload in `register/page.tsx`**

Add imports:

```typescript
import { useEffect, useState } from 'react'; // useEffect added to the existing react import
import { useLocationStore } from '@/store/locationStore';
import { useAnalyticsStore } from '@/store/analyticsStore';
```

Inside `RegisterForm`, after the existing `useState` declarations, add:

```typescript
const selectedCity = useLocationStore((s) => s.selectedCity);
const isPreciseLocation = useLocationStore((s) => s.isPreciseLocation);
const sessionId = useAnalyticsStore((s) => s.sessionId);
const attribution = useAnalyticsStore((s) => s.attribution);
const captureAttributionFromUrl = useAnalyticsStore((s) => s.captureAttributionFromUrl);
const [heardAboutUs, setHeardAboutUs] = useState('');

useEffect(() => {
  captureAttributionFromUrl(searchParams);
  // Runs once on mount to catch any utm_* params this landing carried.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

In `handleSubmit`, extend the `register(...)` call:

```typescript
const res = await register({
  fullName,
  email,
  password,
  phoneNumber: phoneNumber || undefined,
  city: isPreciseLocation && selectedCity !== 'All Cities' ? selectedCity : undefined,
  acquisitionSource: attribution?.source ?? (heardAboutUs || undefined),
  acquisitionMedium: attribution?.medium ?? (heardAboutUs ? 'self_reported' : undefined),
  acquisitionCampaign: attribution?.campaign ?? undefined,
  sessionId,
});
```

Add the fallback dropdown, shown only when no UTM attribution was captured, right before the submit `Button`:

```tsx
{!attribution && (
  <div>
    <label className="text-caption font-semibold text-text-secondary mb-1 block">
      How did you hear about us? (optional)
    </label>
    <select
      value={heardAboutUs}
      onChange={(e) => setHeardAboutUs(e.target.value)}
      className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-body text-text-primary"
    >
      <option value="">Select one</option>
      <option value="instagram">Instagram</option>
      <option value="google">Google</option>
      <option value="referral">Friend/Referral</option>
      <option value="college">College</option>
      <option value="other">Other</option>
    </select>
  </div>
)}
```

- [ ] **Step 3: Manually verify**

1. Visit `/register?utm_source=whatsapp&utm_medium=share&utm_campaign=launch`, confirm the dropdown does NOT show, register a new account, and check (via backend logs or a DB query) that the new user's `acquisition_source` is `whatsapp`.
2. Visit `/register` directly (no UTM), confirm the dropdown DOES show, pick "Instagram", register, and confirm `acquisition_source = "instagram"`, `acquisition_medium = "self_reported"`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/user.ts "frontend/src/app/(auth)/register/page.tsx"
git commit -m "feat(auth): send city and acquisition attribution at registration"
```

---

## Task 9: `Booking.game` — backend

**Depends on:** Task 1 (column exists)

**Files:**
- Modify: `backend/app/schemas/booking.py`
- Modify: `backend/app/services/booking_service.py`
- Test: `backend/tests/test_booking_game_field.py`

**Interfaces:**
- Produces: `BookingCreateRequest.game: Optional[str]`; `create_booking` persists it onto the `Booking` row.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_booking_game_field.py
import pytest
from datetime import date, time, timedelta
from uuid import uuid4
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.core.security import get_password_hash
from app.repositories.cafe_repository import CafeRepository
from app.repositories.booking_repository import BookingRepository
from app.repositories.hardware_tier_repository import HardwareTierRepository
from app.services.booking_service import BookingService
from app.schemas.booking import BookingCreateRequest


@pytest.mark.asyncio
async def test_create_booking_persists_game(db_session):
    owner = User(
        id=uuid4(), email=f"owner_{uuid4().hex[:8]}@test.com", full_name="Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    gamer = User(
        id=uuid4(), email=f"gamer_{uuid4().hex[:8]}@test.com", full_name="Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    db_session.add_all([owner, gamer])
    await db_session.flush()

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Game Test Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
        supported_games=["FIFA 24", "Call of Duty"],
    )
    db_session.add(cafe)
    await db_session.flush()

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Standard", specs={}, price_per_hour=100.0,
        total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db_session.add(tier)
    await db_session.commit()

    service = BookingService(
        db=db_session,
        booking_repo=BookingRepository(db_session),
        cafe_repo=CafeRepository(db_session),
        tier_repo=HardwareTierRepository(db_session),
    )
    tomorrow = date.today() + timedelta(days=2)
    request = BookingCreateRequest(
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=tomorrow,
        start_time=time(18, 0), duration_hours=1.0, seats_count=1, game="FIFA 24",
    )
    result = await service.create_booking(gamer.id, request)
    assert result.game == "FIFA 24"
```

Confirm `BookingService.__init__`'s actual parameter names against `booking_service.py` before writing this test — the fixture above assumes `db`, `booking_repo`, `cafe_repo`, `tier_repo`; adjust to match whatever the constructor actually names them if different.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_booking_game_field.py -v`
Expected: FAIL — `TypeError: game is an invalid keyword argument` or `result.game` is `AttributeError`

- [ ] **Step 3: Update the schema**

In `backend/app/schemas/booking.py`, add to `BookingBase`:

```python
    game: Optional[str] = Field(None, max_length=100)
```

- [ ] **Step 4: Update the service**

In `backend/app/services/booking_service.py`, add `"game": booking_in.game,` to the `booking_dict` literal (next to `"notes": booking_in.notes`).

Also update `BookingResponse` in `backend/app/schemas/booking.py` to include `game: Optional[str] = None` so it round-trips back out through the API — find the `class BookingResponse` definition and add the field alongside its other optional fields (e.g. next to `notes`).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_booking_game_field.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/booking.py backend/app/services/booking_service.py backend/tests/test_booking_game_field.py
git commit -m "feat(booking): accept and persist an optional free-text game per booking"
```

---

## Task 10: `Booking.game` — frontend combobox

**Depends on:** Task 9

**Files:**
- Modify: `frontend/src/types/booking.ts`
- Modify: `frontend/src/app/(customer)/bookings/new/page.tsx`

**Interfaces:**
- Consumes: `cafe.supportedGames: string[]` (already returned by `getCafe`, per `frontend/src/types/cafe.ts:53`).

- [ ] **Step 1: Update the type**

```typescript
// frontend/src/types/booking.ts
export interface BookingCreateRequest {
  cafeId: string;
  hardwareTierId: string;
  sessionDate: string;
  startTime: string;
  durationHours: number;
  seatsCount?: number;
  promotionId?: string;
  notes?: string;
  game?: string;
}
```

- [ ] **Step 2: Add the combobox state and UI**

Add state near the other `useState` declarations in `bookings/new/page.tsx`:

```typescript
const [selectedGame, setSelectedGame] = useState('');
```

Add the UI (a plain `<input>` with a `<datalist>` — native HTML combobox, no new dependency) somewhere in the booking summary form, near where `seatsCount`/`notes` are collected:

```tsx
<div>
  <label className="text-caption font-semibold text-text-secondary mb-1 block">
    What are you playing? (optional)
  </label>
  <input
    type="text"
    list="cafe-games"
    value={selectedGame}
    onChange={(e) => setSelectedGame(e.target.value)}
    placeholder="Type any game name"
    className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-body text-text-primary"
  />
  <datalist id="cafe-games">
    {(cafe?.supportedGames ?? []).map((g) => (
      <option key={g} value={g} />
    ))}
  </datalist>
</div>
```

- [ ] **Step 3: Include it in the booking creation payload**

Find the `createBooking({...})` call in this file and add `game: selectedGame || undefined,` to its payload object.

- [ ] **Step 4: Manually verify**

Start a booking for a café that has `supportedGames` set, confirm the datalist suggests those names but also accepts a typed value not in the list, complete the booking, and confirm (via the admin Bookings page or a DB query) the `game` column is populated.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/booking.ts "frontend/src/app/(customer)/bookings/new/page.tsx"
git commit -m "feat(booking): add free-text game selector to the booking flow"
```

---

## Task 11: Overview / Executive Dashboard — backend + relocate verification queue

**Depends on:** Task 1 (uses `PlatformFee`/`Booking`/`Cafe`/`User`, all pre-existing except nothing new needed here — no new columns required for this task specifically, but ordered after Task 1 for consistency of "foundation first")

**Files:**
- Create: `backend/app/schemas/admin_analytics.py` (starts with the executive-dashboard schema; later tasks append to this file)
- Create: `backend/app/services/admin_analytics_service.py` (starts with `get_executive_dashboard`; later tasks append methods)
- Create: `backend/app/api/v1/admin_analytics.py` (starts with the executive-dashboard route; later tasks append routes)
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_admin_analytics_executive.py`

**Interfaces:**
- Produces: `AdminAnalyticsService.get_executive_dashboard(period_days: int = 30) -> ExecutiveDashboardResponse`; `GET /api/v1/admin/analytics/executive?periodDays=30`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_admin_analytics_executive.py
import pytest
from datetime import date, time, timedelta
from uuid import uuid4
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.models.platform_fee import PlatformFee
from app.core.security import get_password_hash
from tests.conftest import auth_headers


async def _make_admin(db_session) -> User:
    admin = User(
        id=uuid4(), email=f"admin_{uuid4().hex[:8]}@test.com", full_name="Admin",
        password_hash=get_password_hash("testpass123"), role=UserRole.ADMIN, is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()
    return admin


@pytest.mark.asyncio
async def test_executive_dashboard_totals(async_client, db_session):
    admin = await _make_admin(db_session)

    owner = User(
        id=uuid4(), email=f"owner_{uuid4().hex[:8]}@test.com", full_name="Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    gamer = User(
        id=uuid4(), email=f"gamer_{uuid4().hex[:8]}@test.com", full_name="Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    db_session.add_all([owner, gamer])
    await db_session.flush()

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Exec Test Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db_session.add(cafe)
    await db_session.flush()

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Standard", specs={}, price_per_hour=100.0,
        total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db_session.add(tier)
    await db_session.flush()

    booking = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today(),
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=0.0, gateway_fee=4.0, convenience_fee=0.0,
        total_amount=104.0, status=BookingStatus.COMPLETED,
    )
    db_session.add(booking)
    await db_session.flush()

    db_session.add(PlatformFee(
        id=uuid4(), booking_id=booking.id, convenience_fee=0.0, gateway_fee=4.0,
        tds_amount=0.0, owner_settlement_amount=100.0,
    ))
    await db_session.commit()

    headers = await auth_headers(admin)
    resp = await async_client.get("/api/v1/admin/analytics/executive", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["totalUsers"] >= 2
    assert data["totalCafes"] >= 1
    assert data["gmv"] >= 104.0
    assert data["khelRevenue"] >= 4.0
```

Check `tests/conftest.py` for the exact existing helper name/signature used to build an `Authorization` header for a given user (`auth_headers` is referenced in `test_admin_v2_features.py` — confirm its exact signature there before using it here).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_analytics_executive.py -v`
Expected: FAIL — 404 (route doesn't exist)

- [ ] **Step 3: Implement the schema**

```python
# backend/app/schemas/admin_analytics.py
from pydantic import BaseModel, ConfigDict
from typing import List, Dict, Any


def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


class ExecutiveDashboardResponse(BaseModel):
    total_users: int
    total_cafes: int
    active_cafes: int
    new_users_this_period: int
    new_cafes_this_period: int
    bookings_this_period: int
    gmv: float
    khel_revenue: float
    avg_booking_value: float
    cancellation_rate: float
    repeat_booking_rate: float
    period_days: int

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )
```

- [ ] **Step 4: Implement the service method**

```python
# backend/app/services/admin_analytics_service.py
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.cafe import Cafe, VerificationStatus
from app.models.booking import Booking, BookingStatus
from app.models.platform_fee import PlatformFee
from app.schemas.admin_analytics import ExecutiveDashboardResponse


class AdminAnalyticsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_executive_dashboard(self, period_days: int = 30) -> ExecutiveDashboardResponse:
        cutoff = datetime.now(timezone.utc) - timedelta(days=period_days)

        total_users = (await self.db.execute(select(func.count(User.id)))).scalar() or 0
        total_cafes = (await self.db.execute(select(func.count(Cafe.id)))).scalar() or 0
        active_cafes = (await self.db.execute(
            select(func.count(Cafe.id)).where(Cafe.verification_status == VerificationStatus.VERIFIED, Cafe.is_active == True)
        )).scalar() or 0
        new_users = (await self.db.execute(
            select(func.count(User.id)).where(User.created_at >= cutoff)
        )).scalar() or 0
        new_cafes = (await self.db.execute(
            select(func.count(Cafe.id)).where(Cafe.created_at >= cutoff)
        )).scalar() or 0

        counted_statuses = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED]
        period_bookings_row = (await self.db.execute(
            select(func.count(Booking.id), func.sum(Booking.total_amount))
            .where(Booking.status.in_(counted_statuses), Booking.created_at >= cutoff)
        )).first()
        bookings_this_period = period_bookings_row[0] or 0
        gmv = float(period_bookings_row[1] or 0.0)

        khel_revenue_row = (await self.db.execute(
            select(func.sum(PlatformFee.convenience_fee + PlatformFee.gateway_fee))
            .join(Booking, Booking.id == PlatformFee.booking_id)
            .where(Booking.status.in_(counted_statuses), Booking.created_at >= cutoff)
        )).scalar()
        khel_revenue = float(khel_revenue_row or 0.0)

        avg_booking_value = gmv / bookings_this_period if bookings_this_period else 0.0

        total_period_bookings = (await self.db.execute(
            select(func.count(Booking.id)).where(Booking.created_at >= cutoff)
        )).scalar() or 0
        cancelled_row = (await self.db.execute(
            select(func.count(Booking.id)).where(
                Booking.status.in_([BookingStatus.CANCELLED, BookingStatus.NO_SHOW]),
                Booking.created_at >= cutoff,
            )
        )).scalar() or 0
        cancellation_rate = (cancelled_row / total_period_bookings * 100) if total_period_bookings else 0.0

        repeat_gamers_row = (await self.db.execute(
            select(func.count())
            .select_from(
                select(Booking.gamer_id)
                .where(Booking.status.in_(counted_statuses))
                .group_by(Booking.gamer_id)
                .having(func.count(Booking.id) > 1)
                .subquery()
            )
        )).scalar() or 0
        distinct_gamers_row = (await self.db.execute(
            select(func.count(func.distinct(Booking.gamer_id))).where(Booking.status.in_(counted_statuses))
        )).scalar() or 0
        repeat_booking_rate = (repeat_gamers_row / distinct_gamers_row * 100) if distinct_gamers_row else 0.0

        return ExecutiveDashboardResponse(
            total_users=total_users,
            total_cafes=total_cafes,
            active_cafes=active_cafes,
            new_users_this_period=new_users,
            new_cafes_this_period=new_cafes,
            bookings_this_period=bookings_this_period,
            gmv=gmv,
            khel_revenue=khel_revenue,
            avg_booking_value=round(avg_booking_value, 2),
            cancellation_rate=round(cancellation_rate, 2),
            repeat_booking_rate=round(repeat_booking_rate, 2),
            period_days=period_days,
        )
```

- [ ] **Step 5: Implement the route**

```python
# backend/app/api/v1/admin_analytics.py
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.admin_analytics_service import AdminAnalyticsService
from app.api.deps import require_admin
from app.models.user import User

router = APIRouter()


@router.get("/executive", status_code=status.HTTP_200_OK)
async def get_executive_dashboard(
    periodDays: int = Query(30, ge=1, le=365),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_executive_dashboard(period_days=periodDays)
    return {"success": True, "data": result}
```

In `backend/app/api/v1/router.py`:

```python
from app.api.v1.admin_analytics import router as admin_analytics_router
# ...
api_router.include_router(admin_analytics_router, prefix="/admin/analytics", tags=["Admin Analytics"])
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_analytics_executive.py -v`
Expected: PASS

- [ ] **Step 7: Relocate the existing verification-queue UI**

Create `frontend/src/app/(admin)/admin/verification-queue/page.tsx` containing the **entire current contents** of `frontend/src/app/(admin)/admin/page.tsx` verbatim (the full verification queue component — header, pending-applications grid, reject/approve modals — everything currently in that file), unchanged.

- [ ] **Step 8: Build the new Overview page**

Create `frontend/src/lib/api/adminAnalytics.ts`:

```typescript
import { apiClient, call } from './client';

export interface ExecutiveDashboard {
  totalUsers: number;
  totalCafes: number;
  activeCafes: number;
  newUsersThisPeriod: number;
  newCafesThisPeriod: number;
  bookingsThisPeriod: number;
  gmv: number;
  khelRevenue: number;
  avgBookingValue: number;
  cancellationRate: number;
  repeatBookingRate: number;
  periodDays: number;
}

export async function getExecutiveDashboard(periodDays = 30): Promise<ExecutiveDashboard> {
  return call(() => apiClient.get('/api/v1/admin/analytics/executive', { params: { periodDays } }));
}
```

Replace `frontend/src/app/(admin)/admin/page.tsx` with a new Overview page. Keep the existing "Needs Attention" section (the `getAdminActionItems` query and its rendering, copied verbatim from the old file) and add the executive metrics above it:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, IndianRupee, Users, Store, CalendarDays } from 'lucide-react';
import { getAdminActionItems } from '@/lib/api/admin';
import { getExecutiveDashboard } from '@/lib/api/adminAnalytics';
import { StatCard } from '@/components/ui';
import { formatCurrencyCompact } from '@/lib/format';
// ... (copy the "Needs Attention" imports and JSX verbatim from the old page.tsx here)

export default function AdminOverviewPage() {
  const { data: exec } = useQuery({
    queryKey: ['admin', 'analytics', 'executive'],
    queryFn: () => getExecutiveDashboard(30),
    staleTime: 60_000,
  });

  // ... (copy the actionItems useQuery + actionCards + hasUrgentItems logic verbatim from the old page.tsx here)

  return (
    <div className="flex flex-col gap-8 pb-12">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="h-6 w-6 text-primary" />
          <h1 className="font-heading text-h1 text-text-primary">Overview</h1>
        </div>
        <p className="text-body text-text-secondary">
          KHELO marketplace performance for the last {exec?.periodDays ?? 30} days.
        </p>
      </div>

      {exec && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Users" value={exec.totalUsers} subtext={`+${exec.newUsersThisPeriod} this period`} icon={<Users className="h-4 w-4" />} />
          <StatCard label="Active Cafés" value={exec.activeCafes} subtext={`of ${exec.totalCafes} total`} icon={<Store className="h-4 w-4" />} />
          <StatCard label="Bookings" value={exec.bookingsThisPeriod} subtext="this period" icon={<CalendarDays className="h-4 w-4" />} />
          <StatCard label="GMV" value={formatCurrencyCompact(exec.gmv)} subtext="this period" icon={<IndianRupee className="h-4 w-4" />} />
          <StatCard label="KHELO Revenue" value={formatCurrencyCompact(exec.khelRevenue)} subtext="this period" icon={<TrendingUp className="h-4 w-4" />} />
          <StatCard label="Avg Booking Value" value={formatCurrencyCompact(exec.avgBookingValue)} />
          <StatCard label="Cancellation Rate" value={`${exec.cancellationRate}%`} />
          <StatCard label="Repeat Booking Rate" value={`${exec.repeatBookingRate}%`} />
        </div>
      )}

      {/* ... paste the "Needs Attention" section JSX verbatim here ... */}
    </div>
  );
}
```

Add a link to the (now relocated) Verification Queue from this new Overview page, since it's no longer the landing page — e.g. a `StatCard`-style link showing the pending count, linking to `/admin/verification-queue` (reuse the existing `listPendingCafes` query for the count).

- [ ] **Step 9: Manually verify**

Load `/admin` and confirm it shows the new executive metrics + needs-attention strip (no queue UI). Load `/admin/verification-queue` and confirm the full original approve/reject workflow still works unchanged.

- [ ] **Step 10: Commit**

```bash
git add backend/app/schemas/admin_analytics.py backend/app/services/admin_analytics_service.py backend/app/api/v1/admin_analytics.py backend/app/api/v1/router.py backend/tests/test_admin_analytics_executive.py frontend/src/lib/api/adminAnalytics.ts "frontend/src/app/(admin)/admin/page.tsx" "frontend/src/app/(admin)/admin/verification-queue/page.tsx"
git commit -m "feat(admin): add executive dashboard as the new Overview page, relocate verification queue"
```

---

## Task 12: Café Performance tab

**Depends on:** Task 11 (extends the same `admin_analytics_service.py`/`admin_analytics.py`/`adminAnalytics.ts` files)

**Files:**
- Modify: `backend/app/schemas/admin_analytics.py`
- Modify: `backend/app/services/admin_analytics_service.py`
- Modify: `backend/app/api/v1/admin_analytics.py`
- Modify: `frontend/src/lib/api/adminAnalytics.ts`
- Create: `frontend/src/app/(admin)/admin/cafes/PerformanceTab.tsx`
- Modify: `frontend/src/app/(admin)/admin/cafes/page.tsx`
- Test: `backend/tests/test_admin_analytics_cafe_performance.py`

**Interfaces:**
- Produces: `AdminAnalyticsService.get_cafe_performance() -> List[CafePerformanceItem]`; `GET /api/v1/admin/analytics/cafes`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_admin_analytics_cafe_performance.py
import pytest
from datetime import date, time
from uuid import uuid4
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.core.security import get_password_hash
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_cafe_performance_ranks_by_gmv(async_client, db_session):
    admin = User(
        id=uuid4(), email=f"admin_{uuid4().hex[:8]}@test.com", full_name="Admin",
        password_hash=get_password_hash("testpass123"), role=UserRole.ADMIN, is_active=True,
    )
    owner = User(
        id=uuid4(), email=f"owner_{uuid4().hex[:8]}@test.com", full_name="Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    gamer = User(
        id=uuid4(), email=f"gamer_{uuid4().hex[:8]}@test.com", full_name="Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    db_session.add_all([admin, owner, gamer])
    await db_session.flush()

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Top Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db_session.add(cafe)
    await db_session.flush()

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Standard", specs={}, price_per_hour=100.0,
        total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db_session.add(tier)
    await db_session.flush()

    booking = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today(),
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=0.0, gateway_fee=4.0, convenience_fee=0.0,
        total_amount=104.0, status=BookingStatus.COMPLETED, game="FIFA 24",
    )
    db_session.add(booking)
    await db_session.commit()

    headers = await auth_headers(admin)
    resp = await async_client.get("/api/v1/admin/analytics/cafes", headers=headers)
    assert resp.status_code == 200
    items = resp.json()["data"]
    assert len(items) >= 1
    top = next(i for i in items if i["cafeId"] == str(cafe.id))
    assert top["bookings"] == 1
    assert top["gmv"] == 104.0
    assert top["topGame"] == "FIFA 24"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_analytics_cafe_performance.py -v`
Expected: FAIL — 404

- [ ] **Step 3: Add the schema**

Append to `backend/app/schemas/admin_analytics.py`:

```python
class CafePerformanceItem(BaseModel):
    cafe_id: str
    cafe_name: str
    city: str
    bookings: int
    gmv: float
    cancellations: int
    repeat_customers: int
    avg_booking_value: float
    top_game: str | None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )
```

- [ ] **Step 4: Add the service method**

Append to `AdminAnalyticsService` in `admin_analytics_service.py`:

```python
    async def get_cafe_performance(self) -> list[CafePerformanceItem]:
        counted = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED]

        rows = (await self.db.execute(
            select(
                Cafe.id, Cafe.name, Cafe.city,
                func.count(Booking.id).label("bookings"),
                func.sum(Booking.total_amount).label("gmv"),
            )
            .join(Booking, Booking.cafe_id == Cafe.id)
            .where(Booking.status.in_(counted))
            .group_by(Cafe.id, Cafe.name, Cafe.city)
            .order_by(func.sum(Booking.total_amount).desc())
        )).all()

        results = []
        for cafe_id, name, city, bookings, gmv in rows:
            cancellations = (await self.db.execute(
                select(func.count(Booking.id)).where(
                    Booking.cafe_id == cafe_id,
                    Booking.status.in_([BookingStatus.CANCELLED, BookingStatus.NO_SHOW]),
                )
            )).scalar() or 0

            repeat_customers = (await self.db.execute(
                select(func.count()).select_from(
                    select(Booking.gamer_id)
                    .where(Booking.cafe_id == cafe_id, Booking.status.in_(counted))
                    .group_by(Booking.gamer_id)
                    .having(func.count(Booking.id) > 1)
                    .subquery()
                )
            )).scalar() or 0

            top_game_row = (await self.db.execute(
                select(Booking.game, func.count(Booking.id).label("cnt"))
                .where(Booking.cafe_id == cafe_id, Booking.status.in_(counted), Booking.game.is_not(None))
                .group_by(Booking.game)
                .order_by(func.count(Booking.id).desc())
                .limit(1)
            )).first()
            top_game = top_game_row[0] if top_game_row else None

            results.append(CafePerformanceItem(
                cafe_id=str(cafe_id),
                cafe_name=name,
                city=city,
                bookings=bookings,
                gmv=float(gmv or 0.0),
                cancellations=cancellations,
                repeat_customers=repeat_customers,
                avg_booking_value=round(float(gmv or 0.0) / bookings, 2) if bookings else 0.0,
                top_game=top_game,
            ))
        return results
```

Add `CafePerformanceItem` to the existing `from app.schemas.admin_analytics import ...` line at the top of the service file.

- [ ] **Step 5: Add the route**

Append to `admin_analytics.py`:

```python
@router.get("/cafes", status_code=status.HTTP_200_OK)
async def get_cafe_performance(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_cafe_performance()
    return {"success": True, "data": result}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_analytics_cafe_performance.py -v`
Expected: PASS

- [ ] **Step 7: Frontend — API call + tab**

Append to `frontend/src/lib/api/adminAnalytics.ts`:

```typescript
export interface CafePerformanceItem {
  cafeId: string;
  cafeName: string;
  city: string;
  bookings: number;
  gmv: number;
  cancellations: number;
  repeatCustomers: number;
  avgBookingValue: number;
  topGame: string | null;
}

export async function getCafePerformance(): Promise<CafePerformanceItem[]> {
  return call(() => apiClient.get('/api/v1/admin/analytics/cafes'));
}
```

Create `frontend/src/app/(admin)/admin/cafes/PerformanceTab.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { getCafePerformance } from '@/lib/api/adminAnalytics';
import { formatCurrencyCompact } from '@/lib/format';
import { SkeletonCard } from '@/components/ui';

export function PerformanceTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'cafePerformance'],
    queryFn: getCafePerformance,
    staleTime: 60_000,
  });

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full text-body">
        <thead className="bg-surface text-caption text-text-secondary">
          <tr>
            <th className="text-left p-3">Café</th>
            <th className="text-left p-3">City</th>
            <th className="text-right p-3">Bookings</th>
            <th className="text-right p-3">GMV</th>
            <th className="text-right p-3">Avg Value</th>
            <th className="text-right p-3">Cancellations</th>
            <th className="text-right p-3">Repeat Customers</th>
            <th className="text-left p-3">Top Game</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((row) => (
            <tr key={row.cafeId} className="border-t border-border">
              <td className="p-3 font-semibold">{row.cafeName}</td>
              <td className="p-3">{row.city}</td>
              <td className="p-3 text-right">{row.bookings}</td>
              <td className="p-3 text-right">{formatCurrencyCompact(row.gmv)}</td>
              <td className="p-3 text-right">{formatCurrencyCompact(row.avgBookingValue)}</td>
              <td className="p-3 text-right">{row.cancellations}</td>
              <td className="p-3 text-right">{row.repeatCustomers}</td>
              <td className="p-3">{row.topGame ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

In `frontend/src/app/(admin)/admin/cafes/page.tsx`, add a tab switcher at the top of the existing page component (read the file first to find its current top-level return structure and root component name before editing) — add:

```tsx
import { useState } from 'react'; // add to existing react import if present
import { PerformanceTab } from './PerformanceTab';

// inside the existing page component, before its current return:
const [activeCafesTab, setActiveCafesTab] = useState<'all' | 'performance'>('all');

// wrap the existing JSX return value in a fragment with a tab switcher above it:
// <div className="flex gap-2 mb-4">
//   <button onClick={() => setActiveCafesTab('all')} className={activeCafesTab === 'all' ? 'font-bold' : ''}>All Cafés</button>
//   <button onClick={() => setActiveCafesTab('performance')} className={activeCafesTab === 'performance' ? 'font-bold' : ''}>Performance</button>
// </div>
// {activeCafesTab === 'all' ? (...the existing JSX...) : <PerformanceTab />}
```

Apply this by wrapping the existing page's entire current return JSX under the `activeCafesTab === 'all'` branch, unchanged, and rendering `<PerformanceTab />` in the other branch — do not alter any of the existing "All Cafés" logic or JSX.

- [ ] **Step 8: Manually verify**

Load `/admin/cafes`, confirm the "All Cafés" tab is unchanged from before, switch to "Performance", confirm the ranked table loads.

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/admin_analytics.py backend/app/services/admin_analytics_service.py backend/app/api/v1/admin_analytics.py backend/tests/test_admin_analytics_cafe_performance.py frontend/src/lib/api/adminAnalytics.ts "frontend/src/app/(admin)/admin/cafes/PerformanceTab.tsx" "frontend/src/app/(admin)/admin/cafes/page.tsx"
git commit -m "feat(admin): add café performance ranking tab"
```

---

## Task 13: Setup/Platform Performance page

**Depends on:** Task 11 (shared files)

**Files:**
- Modify: `backend/app/schemas/admin_analytics.py`
- Modify: `backend/app/services/admin_analytics_service.py`
- Modify: `backend/app/api/v1/admin_analytics.py`
- Modify: `frontend/src/lib/api/adminAnalytics.ts`
- Create: `frontend/src/app/(admin)/admin/inventory/setups/page.tsx`
- Test: `backend/tests/test_admin_analytics_setups.py`

**Interfaces:**
- Produces: `AdminAnalyticsService.get_setup_performance() -> List[SetupPerformanceItem]`; `GET /api/v1/admin/analytics/setups`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_admin_analytics_setups.py
import pytest
from datetime import date, time
from uuid import uuid4
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier, PlatformType
from app.models.booking import Booking, BookingStatus
from app.core.security import get_password_hash
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_setup_performance_groups_by_platform(async_client, db_session):
    admin = User(
        id=uuid4(), email=f"admin_{uuid4().hex[:8]}@test.com", full_name="Admin",
        password_hash=get_password_hash("testpass123"), role=UserRole.ADMIN, is_active=True,
    )
    owner = User(
        id=uuid4(), email=f"owner_{uuid4().hex[:8]}@test.com", full_name="Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    gamer = User(
        id=uuid4(), email=f"gamer_{uuid4().hex[:8]}@test.com", full_name="Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    db_session.add_all([admin, owner, gamer])
    await db_session.flush()

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Setup Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db_session.add(cafe)
    await db_session.flush()

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="PS5 Slot", specs={}, price_per_hour=150.0,
        total_seats=4, app_bookable_seats=4, active_seats_count=4, is_active=True,
        platform=PlatformType.PLAYSTATION,
    )
    db_session.add(tier)
    await db_session.flush()

    booking = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today(),
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=150.0, discount_amount=0.0, gateway_fee=6.0, convenience_fee=0.0,
        total_amount=156.0, status=BookingStatus.COMPLETED,
    )
    db_session.add(booking)
    await db_session.commit()

    headers = await auth_headers(admin)
    resp = await async_client.get("/api/v1/admin/analytics/setups", headers=headers)
    assert resp.status_code == 200
    items = resp.json()["data"]
    ps5 = next(i for i in items if i["platform"] == "playstation")
    assert ps5["bookings"] == 1
    assert ps5["gmv"] == 156.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_analytics_setups.py -v`
Expected: FAIL — 404

- [ ] **Step 3: Add the schema**

Append to `admin_analytics.py` schema file:

```python
class SetupPerformanceItem(BaseModel):
    platform: str
    bookings: int
    gmv: float
    total_seats: int
    utilization_hours: float

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )
```

- [ ] **Step 4: Add the service method**

```python
    async def get_setup_performance(self) -> list[SetupPerformanceItem]:
        counted = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED]

        rows = (await self.db.execute(
            select(
                HardwareTier.platform,
                func.count(Booking.id).label("bookings"),
                func.sum(Booking.total_amount).label("gmv"),
                func.sum(Booking.duration_hours).label("hours"),
            )
            .join(Booking, Booking.hardware_tier_id == HardwareTier.id)
            .where(Booking.status.in_(counted))
            .group_by(HardwareTier.platform)
            .order_by(func.sum(Booking.total_amount).desc())
        )).all()

        seats_by_platform = dict((await self.db.execute(
            select(HardwareTier.platform, func.sum(HardwareTier.total_seats))
            .group_by(HardwareTier.platform)
        )).all())

        return [
            SetupPerformanceItem(
                platform=(platform.value if platform else "unspecified"),
                bookings=bookings,
                gmv=float(gmv or 0.0),
                total_seats=int(seats_by_platform.get(platform, 0) or 0),
                utilization_hours=float(hours or 0.0),
            )
            for platform, bookings, gmv, hours in rows
        ]
```

Add `SetupPerformanceItem` and `HardwareTier` to the relevant imports at the top of the service file (`HardwareTier` is already imported per Task 12; only `SetupPerformanceItem` needs adding to the schema import line).

- [ ] **Step 5: Add the route**

```python
@router.get("/setups", status_code=status.HTTP_200_OK)
async def get_setup_performance(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_setup_performance()
    return {"success": True, "data": result}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_analytics_setups.py -v`
Expected: PASS

- [ ] **Step 7: Frontend**

Append to `adminAnalytics.ts`:

```typescript
export interface SetupPerformanceItem {
  platform: string;
  bookings: number;
  gmv: number;
  totalSeats: number;
  utilizationHours: number;
}

export async function getSetupPerformance(): Promise<SetupPerformanceItem[]> {
  return call(() => apiClient.get('/api/v1/admin/analytics/setups'));
}
```

Create `frontend/src/app/(admin)/admin/inventory/setups/page.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { Monitor } from 'lucide-react';
import { getSetupPerformance } from '@/lib/api/adminAnalytics';
import { formatCurrencyCompact } from '@/lib/format';
import { SkeletonCard } from '@/components/ui';

const PLATFORM_LABELS: Record<string, string> = {
  pc: 'PC',
  playstation: 'PlayStation',
  xbox: 'Xbox',
  nintendo: 'Nintendo',
  other: 'Other',
  unspecified: 'Unspecified',
};

export default function SetupPerformancePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'setups'],
    queryFn: getSetupPerformance,
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-center gap-2">
        <Monitor className="h-6 w-6 text-primary" />
        <h1 className="font-heading text-h1 text-text-primary">Setup / Platform Performance</h1>
      </div>

      {isLoading && <SkeletonCard />}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((row) => (
            <div key={row.platform} className="rounded-2xl border border-border p-5 bg-surface">
              <h3 className="font-heading text-h3 text-text-primary">{PLATFORM_LABELS[row.platform] ?? row.platform}</h3>
              <div className="mt-3 flex flex-col gap-1 text-body text-text-secondary">
                <span>Bookings: <strong className="text-text-primary">{row.bookings}</strong></span>
                <span>GMV: <strong className="text-text-primary">{formatCurrencyCompact(row.gmv)}</strong></span>
                <span>Seats: <strong className="text-text-primary">{row.totalSeats}</strong></span>
                <span>Utilization: <strong className="text-text-primary">{row.utilizationHours.toFixed(1)}h</strong></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Manually verify**

Load `/admin/inventory/setups` and confirm each platform card renders correct counts.

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/admin_analytics.py backend/app/services/admin_analytics_service.py backend/app/api/v1/admin_analytics.py backend/tests/test_admin_analytics_setups.py frontend/src/lib/api/adminAnalytics.ts "frontend/src/app/(admin)/admin/inventory/setups/page.tsx"
git commit -m "feat(admin): add setup/platform performance page"
```

---

## Task 14: Geography page

**Depends on:** Task 11 (shared files)

**Files:**
- Modify: `backend/app/schemas/admin_analytics.py`
- Modify: `backend/app/services/admin_analytics_service.py`
- Modify: `backend/app/api/v1/admin_analytics.py`
- Modify: `frontend/src/lib/api/adminAnalytics.ts`
- Create: `frontend/src/app/(admin)/admin/analytics/geography/page.tsx`
- Test: `backend/tests/test_admin_analytics_geography.py`

**Interfaces:**
- Produces: `AdminAnalyticsService.get_geography() -> List[CityGeographyItem]`; `GET /api/v1/admin/analytics/geography`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_admin_analytics_geography.py
import pytest
from datetime import date, time
from uuid import uuid4
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.core.security import get_password_hash
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_geography_groups_by_cafe_city(async_client, db_session):
    admin = User(
        id=uuid4(), email=f"admin_{uuid4().hex[:8]}@test.com", full_name="Admin",
        password_hash=get_password_hash("testpass123"), role=UserRole.ADMIN, is_active=True,
    )
    owner = User(
        id=uuid4(), email=f"owner_{uuid4().hex[:8]}@test.com", full_name="Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    gamer = User(
        id=uuid4(), email=f"gamer_{uuid4().hex[:8]}@test.com", full_name="Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    db_session.add_all([admin, owner, gamer])
    await db_session.flush()

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Geo Café", address_line1="1 Test St",
        city="Hyderabad", state="Telangana", pincode="500001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db_session.add(cafe)
    await db_session.flush()

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Standard", specs={}, price_per_hour=100.0,
        total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db_session.add(tier)
    await db_session.flush()

    booking = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today(),
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=0.0, gateway_fee=4.0, convenience_fee=0.0,
        total_amount=104.0, status=BookingStatus.COMPLETED,
    )
    db_session.add(booking)
    await db_session.commit()

    headers = await auth_headers(admin)
    resp = await async_client.get("/api/v1/admin/analytics/geography", headers=headers)
    assert resp.status_code == 200
    items = resp.json()["data"]
    hyd = next(i for i in items if i["city"] == "Hyderabad")
    assert hyd["cafeCount"] == 1
    assert hyd["bookings"] == 1
    assert hyd["gmv"] == 104.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_analytics_geography.py -v`
Expected: FAIL — 404

- [ ] **Step 3: Add the schema**

```python
class CityGeographyItem(BaseModel):
    city: str
    cafe_count: int
    bookings: int
    gmv: float

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )
```

- [ ] **Step 4: Add the service method**

```python
    async def get_geography(self) -> list[CityGeographyItem]:
        counted = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED]

        cafe_counts = dict((await self.db.execute(
            select(Cafe.city, func.count(Cafe.id)).group_by(Cafe.city)
        )).all())

        booking_rows = (await self.db.execute(
            select(Cafe.city, func.count(Booking.id), func.sum(Booking.total_amount))
            .join(Booking, Booking.cafe_id == Cafe.id)
            .where(Booking.status.in_(counted))
            .group_by(Cafe.city)
        )).all()
        booking_by_city = {city: (cnt, float(gmv or 0.0)) for city, cnt, gmv in booking_rows}

        return [
            CityGeographyItem(
                city=city,
                cafe_count=count,
                bookings=booking_by_city.get(city, (0, 0.0))[0],
                gmv=booking_by_city.get(city, (0, 0.0))[1],
            )
            for city, count in cafe_counts.items()
        ]
```

- [ ] **Step 5: Add the route**

```python
@router.get("/geography", status_code=status.HTTP_200_OK)
async def get_geography(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_geography()
    return {"success": True, "data": result}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_analytics_geography.py -v`
Expected: PASS

- [ ] **Step 7: Frontend**

Append to `adminAnalytics.ts`:

```typescript
export interface CityGeographyItem {
  city: string;
  cafeCount: number;
  bookings: number;
  gmv: number;
}

export async function getGeography(): Promise<CityGeographyItem[]> {
  return call(() => apiClient.get('/api/v1/admin/analytics/geography'));
}
```

Create `frontend/src/app/(admin)/admin/analytics/geography/page.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { getGeography } from '@/lib/api/adminAnalytics';
import { formatCurrencyCompact } from '@/lib/format';
import { SkeletonCard } from '@/components/ui';

export default function GeographyPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'geography'],
    queryFn: getGeography,
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-center gap-2">
        <MapPin className="h-6 w-6 text-primary" />
        <h1 className="font-heading text-h1 text-text-primary">Geography</h1>
      </div>

      {isLoading && <SkeletonCard />}

      {data && (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-body">
            <thead className="bg-surface text-caption text-text-secondary">
              <tr>
                <th className="text-left p-3">City</th>
                <th className="text-right p-3">Cafés</th>
                <th className="text-right p-3">Bookings</th>
                <th className="text-right p-3">GMV</th>
              </tr>
            </thead>
            <tbody>
              {data.sort((a, b) => b.gmv - a.gmv).map((row) => (
                <tr key={row.city} className="border-t border-border">
                  <td className="p-3 font-semibold">{row.city}</td>
                  <td className="p-3 text-right">{row.cafeCount}</td>
                  <td className="p-3 text-right">{row.bookings}</td>
                  <td className="p-3 text-right">{formatCurrencyCompact(row.gmv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Manually verify**

Load `/admin/analytics/geography` and confirm the table lists every city with cafés, sorted by GMV.

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/admin_analytics.py backend/app/services/admin_analytics_service.py backend/app/api/v1/admin_analytics.py backend/tests/test_admin_analytics_geography.py frontend/src/lib/api/adminAnalytics.ts "frontend/src/app/(admin)/admin/analytics/geography/page.tsx"
git commit -m "feat(admin): add café-level geography breakdown page"
```

---

## Task 15: Revenue/Finance page

**Depends on:** Task 11 (shared files)

**Files:**
- Modify: `backend/app/schemas/admin_analytics.py`
- Modify: `backend/app/services/admin_analytics_service.py`
- Modify: `backend/app/api/v1/admin_analytics.py`
- Modify: `frontend/src/lib/api/adminAnalytics.ts`
- Create: `frontend/src/app/(admin)/admin/analytics/revenue/page.tsx`
- Test: `backend/tests/test_admin_analytics_revenue.py`

**Interfaces:**
- Produces: `AdminAnalyticsService.get_revenue_breakdown() -> RevenueBreakdownResponse`; `GET /api/v1/admin/analytics/revenue`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_admin_analytics_revenue.py
import pytest
from datetime import date, time
from uuid import uuid4
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.models.platform_fee import PlatformFee
from app.core.security import get_password_hash
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_revenue_splits_gmv_and_khel_revenue(async_client, db_session):
    admin = User(
        id=uuid4(), email=f"admin_{uuid4().hex[:8]}@test.com", full_name="Admin",
        password_hash=get_password_hash("testpass123"), role=UserRole.ADMIN, is_active=True,
    )
    owner = User(
        id=uuid4(), email=f"owner_{uuid4().hex[:8]}@test.com", full_name="Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    gamer = User(
        id=uuid4(), email=f"gamer_{uuid4().hex[:8]}@test.com", full_name="Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    db_session.add_all([admin, owner, gamer])
    await db_session.flush()

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Rev Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db_session.add(cafe)
    await db_session.flush()

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Standard", specs={}, price_per_hour=100.0,
        total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db_session.add(tier)
    await db_session.flush()

    booking = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today(),
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=0.0, gateway_fee=4.0, convenience_fee=0.0,
        total_amount=104.0, status=BookingStatus.COMPLETED,
    )
    db_session.add(booking)
    await db_session.flush()

    db_session.add(PlatformFee(
        id=uuid4(), booking_id=booking.id, convenience_fee=0.0, gateway_fee=4.0,
        tds_amount=0.0, owner_settlement_amount=100.0,
    ))
    await db_session.commit()

    headers = await auth_headers(admin)
    resp = await async_client.get("/api/v1/admin/analytics/revenue", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["gmv"] == 104.0
    assert data["khelRevenue"] == 4.0
    assert data["ownerSettlements"] == 100.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_analytics_revenue.py -v`
Expected: FAIL — 404

- [ ] **Step 3: Add the schema**

```python
class RevenueBreakdownResponse(BaseModel):
    gmv: float
    khel_revenue: float
    owner_settlements: float
    revenue_by_city: Dict[str, float]
    revenue_by_platform: Dict[str, float]

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )
```

- [ ] **Step 4: Add the service method**

```python
    async def get_revenue_breakdown(self) -> RevenueBreakdownResponse:
        counted = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED]

        totals_row = (await self.db.execute(
            select(
                func.sum(Booking.total_amount),
                func.sum(PlatformFee.convenience_fee + PlatformFee.gateway_fee),
                func.sum(PlatformFee.owner_settlement_amount),
            )
            .join(PlatformFee, PlatformFee.booking_id == Booking.id)
            .where(Booking.status.in_(counted))
        )).first()
        gmv = float(totals_row[0] or 0.0)
        khel_revenue = float(totals_row[1] or 0.0)
        owner_settlements = float(totals_row[2] or 0.0)

        by_city_rows = (await self.db.execute(
            select(Cafe.city, func.sum(Booking.total_amount))
            .join(Booking, Booking.cafe_id == Cafe.id)
            .where(Booking.status.in_(counted))
            .group_by(Cafe.city)
        )).all()
        revenue_by_city = {city: float(total or 0.0) for city, total in by_city_rows}

        by_platform_rows = (await self.db.execute(
            select(HardwareTier.platform, func.sum(Booking.total_amount))
            .join(Booking, Booking.hardware_tier_id == HardwareTier.id)
            .where(Booking.status.in_(counted))
            .group_by(HardwareTier.platform)
        )).all()
        revenue_by_platform = {
            (platform.value if platform else "unspecified"): float(total or 0.0)
            for platform, total in by_platform_rows
        }

        return RevenueBreakdownResponse(
            gmv=gmv,
            khel_revenue=khel_revenue,
            owner_settlements=owner_settlements,
            revenue_by_city=revenue_by_city,
            revenue_by_platform=revenue_by_platform,
        )
```

Add `PlatformFee` and `RevenueBreakdownResponse` to the service file's imports.

- [ ] **Step 5: Add the route**

```python
@router.get("/revenue", status_code=status.HTTP_200_OK)
async def get_revenue_breakdown(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_revenue_breakdown()
    return {"success": True, "data": result}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_analytics_revenue.py -v`
Expected: PASS

- [ ] **Step 7: Frontend**

Append to `adminAnalytics.ts`:

```typescript
export interface RevenueBreakdown {
  gmv: number;
  khelRevenue: number;
  ownerSettlements: number;
  revenueByCity: Record<string, number>;
  revenueByPlatform: Record<string, number>;
}

export async function getRevenueBreakdown(): Promise<RevenueBreakdown> {
  return call(() => apiClient.get('/api/v1/admin/analytics/revenue'));
}
```

Create `frontend/src/app/(admin)/admin/analytics/revenue/page.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { IndianRupee } from 'lucide-react';
import { getRevenueBreakdown } from '@/lib/api/adminAnalytics';
import { formatCurrencyCompact } from '@/lib/format';
import { StatCard, SkeletonCard } from '@/components/ui';

export default function RevenuePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'revenue'],
    queryFn: getRevenueBreakdown,
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-center gap-2">
        <IndianRupee className="h-6 w-6 text-primary" />
        <h1 className="font-heading text-h1 text-text-primary">Revenue</h1>
      </div>

      {isLoading && <SkeletonCard />}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="GMV" value={formatCurrencyCompact(data.gmv)} subtext="all-time, confirmed+completed" />
            <StatCard label="KHELO Revenue" value={formatCurrencyCompact(data.khelRevenue)} subtext="convenience + gateway fee" />
            <StatCard label="Owner Settlements" value={formatCurrencyCompact(data.ownerSettlements)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="font-heading text-h3 text-text-primary mb-2">By City</h2>
              <ul className="flex flex-col gap-1">
                {Object.entries(data.revenueByCity).sort((a, b) => b[1] - a[1]).map(([city, amt]) => (
                  <li key={city} className="flex justify-between text-body border-b border-border py-1">
                    <span>{city}</span>
                    <span className="font-semibold">{formatCurrencyCompact(amt)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-heading text-h3 text-text-primary mb-2">By Platform</h2>
              <ul className="flex flex-col gap-1">
                {Object.entries(data.revenueByPlatform).sort((a, b) => b[1] - a[1]).map(([platform, amt]) => (
                  <li key={platform} className="flex justify-between text-body border-b border-border py-1">
                    <span>{platform}</span>
                    <span className="font-semibold">{formatCurrencyCompact(amt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Manually verify**

Load `/admin/analytics/revenue` and confirm GMV/KHELO revenue/settlements match a manual sum of a few known bookings.

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/admin_analytics.py backend/app/services/admin_analytics_service.py backend/app/api/v1/admin_analytics.py backend/tests/test_admin_analytics_revenue.py frontend/src/lib/api/adminAnalytics.ts "frontend/src/app/(admin)/admin/analytics/revenue/page.tsx"
git commit -m "feat(admin): add GMV vs KHELO revenue breakdown page"
```

---

## Task 16: Marketplace Health page

**Depends on:** Task 11 (shared files), Task 2 (`AnalyticsEvent` for search-with-no-results)

**Files:**
- Modify: `backend/app/schemas/admin_analytics.py`
- Modify: `backend/app/services/admin_analytics_service.py`
- Modify: `backend/app/api/v1/admin_analytics.py`
- Modify: `frontend/src/lib/api/adminAnalytics.ts`
- Create: `frontend/src/app/(admin)/admin/marketplace-health/page.tsx`
- Test: `backend/tests/test_admin_analytics_marketplace_health.py`

**Interfaces:**
- Produces: `AdminAnalyticsService.get_marketplace_health() -> MarketplaceHealthResponse`; `GET /api/v1/admin/analytics/marketplace-health`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_admin_analytics_marketplace_health.py
import pytest
from datetime import date, time
from uuid import uuid4
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.models.analytics_event import AnalyticsEvent
from app.core.security import get_password_hash
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_marketplace_health_rates(async_client, db_session):
    admin = User(
        id=uuid4(), email=f"admin_{uuid4().hex[:8]}@test.com", full_name="Admin",
        password_hash=get_password_hash("testpass123"), role=UserRole.ADMIN, is_active=True,
    )
    owner = User(
        id=uuid4(), email=f"owner_{uuid4().hex[:8]}@test.com", full_name="Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    gamer = User(
        id=uuid4(), email=f"gamer_{uuid4().hex[:8]}@test.com", full_name="Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    db_session.add_all([admin, owner, gamer])
    await db_session.flush()

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Health Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db_session.add(cafe)
    await db_session.flush()

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Standard", specs={}, price_per_hour=100.0,
        total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db_session.add(tier)
    await db_session.flush()

    completed = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today(),
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=0.0, gateway_fee=4.0, convenience_fee=0.0,
        total_amount=104.0, status=BookingStatus.COMPLETED,
    )
    cancelled = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today(),
        start_time=time(19, 0), end_time=time(20, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=0.0, gateway_fee=4.0, convenience_fee=0.0,
        total_amount=104.0, status=BookingStatus.CANCELLED,
    )
    db_session.add_all([completed, cancelled])

    db_session.add(AnalyticsEvent(
        id=uuid4(), session_id="s1", event_type="search_performed",
        event_metadata={"resultCount": 0},
    ))
    db_session.add(AnalyticsEvent(
        id=uuid4(), session_id="s2", event_type="search_performed",
        event_metadata={"resultCount": 3},
    ))
    await db_session.commit()

    headers = await auth_headers(admin)
    resp = await async_client.get("/api/v1/admin/analytics/marketplace-health", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["totalBookings"] == 2
    assert data["cancelledCount"] == 1
    assert data["completedCount"] == 1
    assert data["totalSearches"] == 2
    assert data["searchesWithNoResults"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_analytics_marketplace_health.py -v`
Expected: FAIL — 404

- [ ] **Step 3: Add the schema**

```python
class MarketplaceHealthResponse(BaseModel):
    total_bookings: int
    completed_count: int
    cancelled_count: int
    no_show_count: int
    failed_count: int
    total_searches: int
    searches_with_no_results: int

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )
```

- [ ] **Step 4: Add the service method**

```python
    async def get_marketplace_health(self) -> MarketplaceHealthResponse:
        status_rows = (await self.db.execute(
            select(Booking.status, func.count(Booking.id)).group_by(Booking.status)
        )).all()
        by_status = {status: count for status, count in status_rows}
        total_bookings = sum(by_status.values())

        search_rows = (await self.db.execute(
            select(AnalyticsEvent.event_metadata).where(AnalyticsEvent.event_type == "search_performed")
        )).all()
        total_searches = len(search_rows)
        searches_with_no_results = sum(1 for (meta,) in search_rows if (meta or {}).get("resultCount") == 0)

        return MarketplaceHealthResponse(
            total_bookings=total_bookings,
            completed_count=by_status.get(BookingStatus.COMPLETED, 0),
            cancelled_count=by_status.get(BookingStatus.CANCELLED, 0),
            no_show_count=by_status.get(BookingStatus.NO_SHOW, 0),
            failed_count=by_status.get(BookingStatus.FAILED, 0),
            total_searches=total_searches,
            searches_with_no_results=searches_with_no_results,
        )
```

Add `AnalyticsEvent` and `MarketplaceHealthResponse` to the service file's imports.

- [ ] **Step 5: Add the route**

```python
@router.get("/marketplace-health", status_code=status.HTTP_200_OK)
async def get_marketplace_health(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_marketplace_health()
    return {"success": True, "data": result}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_analytics_marketplace_health.py -v`
Expected: PASS

- [ ] **Step 7: Frontend**

Append to `adminAnalytics.ts`:

```typescript
export interface MarketplaceHealth {
  totalBookings: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  failedCount: number;
  totalSearches: number;
  searchesWithNoResults: number;
}

export async function getMarketplaceHealth(): Promise<MarketplaceHealth> {
  return call(() => apiClient.get('/api/v1/admin/analytics/marketplace-health'));
}
```

Create `frontend/src/app/(admin)/admin/marketplace-health/page.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { getMarketplaceHealth } from '@/lib/api/adminAnalytics';
import { StatCard, SkeletonCard } from '@/components/ui';

export default function MarketplaceHealthPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'marketplaceHealth'],
    queryFn: getMarketplaceHealth,
    staleTime: 60_000,
  });

  const successRate = data && data.totalBookings > 0
    ? ((data.completedCount / data.totalBookings) * 100).toFixed(1)
    : '0.0';
  const noResultRate = data && data.totalSearches > 0
    ? ((data.searchesWithNoResults / data.totalSearches) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-center gap-2">
        <Activity className="h-6 w-6 text-primary" />
        <h1 className="font-heading text-h1 text-text-primary">Marketplace Health</h1>
      </div>

      {isLoading && <SkeletonCard />}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Completed" value={data.completedCount} subtext={`${successRate}% of ${data.totalBookings}`} />
          <StatCard label="Cancelled" value={data.cancelledCount} />
          <StatCard label="No-Shows" value={data.noShowCount} />
          <StatCard label="Failed" value={data.failedCount} />
          <StatCard label="Total Searches" value={data.totalSearches} />
          <StatCard label="Searches, No Results" value={data.searchesWithNoResults} subtext={`${noResultRate}%`} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Manually verify**

Load `/admin/marketplace-health` and confirm counts match manually tallied booking statuses and search events.

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/admin_analytics.py backend/app/services/admin_analytics_service.py backend/app/api/v1/admin_analytics.py backend/tests/test_admin_analytics_marketplace_health.py frontend/src/lib/api/adminAnalytics.ts "frontend/src/app/(admin)/admin/marketplace-health/page.tsx"
git commit -m "feat(admin): add marketplace health page"
```

---

## Task 17: Marketing Attribution page

**Depends on:** Task 11 (shared files), Task 7 (`User.acquisition_*` columns populated going forward)

**Files:**
- Modify: `backend/app/schemas/admin_analytics.py`
- Modify: `backend/app/services/admin_analytics_service.py`
- Modify: `backend/app/api/v1/admin_analytics.py`
- Modify: `frontend/src/lib/api/adminAnalytics.ts`
- Create: `frontend/src/app/(admin)/admin/analytics/attribution/page.tsx`
- Test: `backend/tests/test_admin_analytics_attribution.py`

**Interfaces:**
- Produces: `AdminAnalyticsService.get_marketing_attribution() -> List[AttributionItem]`; `GET /api/v1/admin/analytics/attribution`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_admin_analytics_attribution.py
import pytest
from datetime import date, time
from uuid import uuid4
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.core.security import get_password_hash
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_attribution_groups_by_source(async_client, db_session):
    admin = User(
        id=uuid4(), email=f"admin_{uuid4().hex[:8]}@test.com", full_name="Admin",
        password_hash=get_password_hash("testpass123"), role=UserRole.ADMIN, is_active=True,
    )
    owner = User(
        id=uuid4(), email=f"owner_{uuid4().hex[:8]}@test.com", full_name="Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    gamer = User(
        id=uuid4(), email=f"gamer_{uuid4().hex[:8]}@test.com", full_name="Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
        acquisition_source="whatsapp",
    )
    db_session.add_all([admin, owner, gamer])
    await db_session.flush()

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Attr Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db_session.add(cafe)
    await db_session.flush()

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Standard", specs={}, price_per_hour=100.0,
        total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db_session.add(tier)
    await db_session.flush()

    booking = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today(),
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=0.0, gateway_fee=4.0, convenience_fee=0.0,
        total_amount=104.0, status=BookingStatus.COMPLETED,
    )
    db_session.add(booking)
    await db_session.commit()

    headers = await auth_headers(admin)
    resp = await async_client.get("/api/v1/admin/analytics/attribution", headers=headers)
    assert resp.status_code == 200
    items = resp.json()["data"]
    whatsapp = next(i for i in items if i["source"] == "whatsapp")
    assert whatsapp["users"] == 1
    assert whatsapp["bookings"] == 1
    assert whatsapp["gmv"] == 104.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_analytics_attribution.py -v`
Expected: FAIL — 404

- [ ] **Step 3: Add the schema**

```python
class AttributionItem(BaseModel):
    source: str
    users: int
    bookings: int
    gmv: float

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )
```

- [ ] **Step 4: Add the service method**

```python
    async def get_marketing_attribution(self) -> list[AttributionItem]:
        counted = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED]

        user_rows = (await self.db.execute(
            select(User.acquisition_source, func.count(User.id))
            .where(User.acquisition_source.is_not(None))
            .group_by(User.acquisition_source)
        )).all()
        users_by_source = {source: count for source, count in user_rows}

        booking_rows = (await self.db.execute(
            select(User.acquisition_source, func.count(Booking.id), func.sum(Booking.total_amount))
            .join(Booking, Booking.gamer_id == User.id)
            .where(User.acquisition_source.is_not(None), Booking.status.in_(counted))
            .group_by(User.acquisition_source)
        )).all()
        bookings_by_source = {source: (cnt, float(gmv or 0.0)) for source, cnt, gmv in booking_rows}

        return [
            AttributionItem(
                source=source,
                users=count,
                bookings=bookings_by_source.get(source, (0, 0.0))[0],
                gmv=bookings_by_source.get(source, (0, 0.0))[1],
            )
            for source, count in users_by_source.items()
        ]
```

- [ ] **Step 5: Add the route**

```python
@router.get("/attribution", status_code=status.HTTP_200_OK)
async def get_marketing_attribution(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_marketing_attribution()
    return {"success": True, "data": result}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_analytics_attribution.py -v`
Expected: PASS

- [ ] **Step 7: Frontend**

Append to `adminAnalytics.ts`:

```typescript
export interface AttributionItem {
  source: string;
  users: number;
  bookings: number;
  gmv: number;
}

export async function getMarketingAttribution(): Promise<AttributionItem[]> {
  return call(() => apiClient.get('/api/v1/admin/analytics/attribution'));
}
```

Create `frontend/src/app/(admin)/admin/analytics/attribution/page.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { getMarketingAttribution } from '@/lib/api/adminAnalytics';
import { formatCurrencyCompact } from '@/lib/format';
import { SkeletonCard, EmptyState } from '@/components/ui';

export default function AttributionPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'attribution'],
    queryFn: getMarketingAttribution,
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-center gap-2">
        <Megaphone className="h-6 w-6 text-primary" />
        <h1 className="font-heading text-h1 text-text-primary">Marketing Attribution</h1>
      </div>

      {isLoading && <SkeletonCard />}

      {data && data.length === 0 && (
        <EmptyState
          title="No attributed signups yet"
          description="This fills in as users register through campaign links or the signup dropdown — it only covers signups from today onward."
        />
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-body">
            <thead className="bg-surface text-caption text-text-secondary">
              <tr>
                <th className="text-left p-3">Source</th>
                <th className="text-right p-3">Users</th>
                <th className="text-right p-3">Bookings</th>
                <th className="text-right p-3">GMV</th>
              </tr>
            </thead>
            <tbody>
              {data.sort((a, b) => b.gmv - a.gmv).map((row) => (
                <tr key={row.source} className="border-t border-border">
                  <td className="p-3 font-semibold capitalize">{row.source}</td>
                  <td className="p-3 text-right">{row.users}</td>
                  <td className="p-3 text-right">{row.bookings}</td>
                  <td className="p-3 text-right">{formatCurrencyCompact(row.gmv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Manually verify**

Register a new test user via a `?utm_source=whatsapp` link, complete a booking as them, then confirm `/admin/analytics/attribution` shows one WhatsApp-attributed user/booking.

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/admin_analytics.py backend/app/services/admin_analytics_service.py backend/app/api/v1/admin_analytics.py backend/tests/test_admin_analytics_attribution.py frontend/src/lib/api/adminAnalytics.ts "frontend/src/app/(admin)/admin/analytics/attribution/page.tsx"
git commit -m "feat(admin): add marketing attribution page"
```

---

## Task 18: Funnels page

**Depends on:** Task 11 (shared files), Task 2 (`AnalyticsEvent`)

**Files:**
- Modify: `backend/app/schemas/admin_analytics.py`
- Modify: `backend/app/services/admin_analytics_service.py`
- Modify: `backend/app/api/v1/admin_analytics.py`
- Modify: `frontend/src/lib/api/adminAnalytics.ts`
- Create: `frontend/src/app/(admin)/admin/analytics/funnels/page.tsx`
- Test: `backend/tests/test_admin_analytics_funnels.py`

**Interfaces:**
- Produces: `AdminAnalyticsService.get_funnel() -> FunnelResponse`; `GET /api/v1/admin/analytics/funnels`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_admin_analytics_funnels.py
import pytest
from datetime import date, time
from uuid import uuid4
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.models.hardware_tier import HardwareTier
from app.models.booking import Booking, BookingStatus
from app.models.analytics_event import AnalyticsEvent
from app.core.security import get_password_hash
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_funnel_stage_counts(async_client, db_session):
    admin = User(
        id=uuid4(), email=f"admin_{uuid4().hex[:8]}@test.com", full_name="Admin",
        password_hash=get_password_hash("testpass123"), role=UserRole.ADMIN, is_active=True,
    )
    owner = User(
        id=uuid4(), email=f"owner_{uuid4().hex[:8]}@test.com", full_name="Owner",
        password_hash=get_password_hash("testpass123"), role=UserRole.CAFE_OWNER, is_active=True,
    )
    gamer = User(
        id=uuid4(), email=f"gamer_{uuid4().hex[:8]}@test.com", full_name="Gamer",
        password_hash=get_password_hash("testpass123"), role=UserRole.GAMER, is_active=True,
    )
    db_session.add_all([admin, owner, gamer])
    await db_session.flush()

    cafe = Cafe(
        id=uuid4(), owner_id=owner.id, name="Funnel Café", address_line1="1 Test St",
        city="Bengaluru", state="Karnataka", pincode="560001", phone_number="+919876543210",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        opening_time=time(9, 0), closing_time=time(23, 0), bookable_stations=10,
    )
    db_session.add(cafe)
    await db_session.flush()

    tier = HardwareTier(
        id=uuid4(), cafe_id=cafe.id, name="Standard", specs={}, price_per_hour=100.0,
        total_seats=10, app_bookable_seats=10, active_seats_count=10, is_active=True,
    )
    db_session.add(tier)
    await db_session.flush()

    db_session.add_all([
        AnalyticsEvent(id=uuid4(), session_id="s1", event_type="search_performed", event_metadata={"resultCount": 3}),
        AnalyticsEvent(id=uuid4(), session_id="s1", event_type="venue_viewed", cafe_id=cafe.id, event_metadata={}),
        AnalyticsEvent(id=uuid4(), session_id="s1", event_type="booking_flow_started", cafe_id=cafe.id, event_metadata={"tierId": str(tier.id)}),
    ])

    booking = Booking(
        id=uuid4(), booking_reference=f"GC-{uuid4().hex[:8].upper()}", gamer_id=gamer.id,
        cafe_id=cafe.id, hardware_tier_id=tier.id, session_date=date.today(),
        start_time=time(18, 0), end_time=time(19, 0), duration_hours=1.0,
        base_amount=100.0, discount_amount=0.0, gateway_fee=4.0, convenience_fee=0.0,
        total_amount=104.0, status=BookingStatus.COMPLETED,
    )
    db_session.add(booking)
    await db_session.commit()

    headers = await auth_headers(admin)
    resp = await async_client.get("/api/v1/admin/analytics/funnels", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["searches"] == 1
    assert data["venueViews"] == 1
    assert data["bookingsStarted"] == 1
    assert data["bookingsConfirmedOrCompleted"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_analytics_funnels.py -v`
Expected: FAIL — 404

- [ ] **Step 3: Add the schema**

```python
class FunnelResponse(BaseModel):
    searches: int
    venue_views: int
    bookings_started: int
    bookings_confirmed_or_completed: int

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True
    )
```

- [ ] **Step 4: Add the service method**

```python
    async def get_funnel(self) -> FunnelResponse:
        counted = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED]

        event_counts = dict((await self.db.execute(
            select(AnalyticsEvent.event_type, func.count(AnalyticsEvent.id)).group_by(AnalyticsEvent.event_type)
        )).all())

        bookings_confirmed = (await self.db.execute(
            select(func.count(Booking.id)).where(Booking.status.in_(counted))
        )).scalar() or 0

        return FunnelResponse(
            searches=event_counts.get("search_performed", 0),
            venue_views=event_counts.get("venue_viewed", 0),
            bookings_started=event_counts.get("booking_flow_started", 0),
            bookings_confirmed_or_completed=bookings_confirmed,
        )
```

- [ ] **Step 5: Add the route**

```python
@router.get("/funnels", status_code=status.HTTP_200_OK)
async def get_funnel(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminAnalyticsService(db)
    result = await service.get_funnel()
    return {"success": True, "data": result}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_analytics_funnels.py -v`
Expected: PASS

- [ ] **Step 7: Frontend**

Append to `adminAnalytics.ts`:

```typescript
export interface FunnelData {
  searches: number;
  venueViews: number;
  bookingsStarted: number;
  bookingsConfirmedOrCompleted: number;
}

export async function getFunnel(): Promise<FunnelData> {
  return call(() => apiClient.get('/api/v1/admin/analytics/funnels'));
}
```

Create `frontend/src/app/(admin)/admin/analytics/funnels/page.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { Filter } from 'lucide-react';
import { getFunnel } from '@/lib/api/adminAnalytics';
import { SkeletonCard } from '@/components/ui';

export default function FunnelsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'funnels'],
    queryFn: getFunnel,
    staleTime: 60_000,
  });

  const stages = data
    ? [
        { label: 'Searches', value: data.searches },
        { label: 'Venue Views', value: data.venueViews },
        { label: 'Bookings Started', value: data.bookingsStarted },
        { label: 'Confirmed/Completed', value: data.bookingsConfirmedOrCompleted },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-center gap-2">
        <Filter className="h-6 w-6 text-primary" />
        <h1 className="font-heading text-h1 text-text-primary">Funnels</h1>
      </div>

      {isLoading && <SkeletonCard />}

      {data && (
        <div className="flex flex-col gap-3 max-w-xl">
          {stages.map((stage, idx) => {
            const prevValue = idx > 0 ? stages[idx - 1].value : stage.value;
            const dropoffPct = prevValue > 0 ? (100 - (stage.value / prevValue) * 100).toFixed(1) : '0.0';
            return (
              <div key={stage.label} className="rounded-xl border border-border p-4 bg-surface">
                <div className="flex justify-between items-baseline">
                  <span className="text-body-emphasis text-text-primary">{stage.label}</span>
                  <span className="font-data text-h3 text-text-primary">{stage.value}</span>
                </div>
                {idx > 0 && (
                  <span className="text-caption text-text-secondary">{dropoffPct}% drop from previous stage</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Manually verify**

Perform a search, view a café, start a booking, and confirm `/admin/analytics/funnels` reflects each stage incrementing.

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/admin_analytics.py backend/app/services/admin_analytics_service.py backend/app/api/v1/admin_analytics.py backend/tests/test_admin_analytics_funnels.py frontend/src/lib/api/adminAnalytics.ts "frontend/src/app/(admin)/admin/analytics/funnels/page.tsx"
git commit -m "feat(admin): add top-of-funnel aggregate stage counts page"
```

---

## Task 19: Campaign Links tab on Promotions

**Depends on:** nothing new (no backend storage needed — see spec §3.3, links are just URL templates)

**Files:**
- Create: `frontend/src/app/(admin)/admin/promotions/CampaignLinksTab.tsx`
- Modify: `frontend/src/app/(admin)/admin/promotions/page.tsx`

**Interfaces:**
- Produces: a client-only URL generator, no new API calls.

- [ ] **Step 1: Build the tab component**

```tsx
// frontend/src/app/(admin)/admin/promotions/CampaignLinksTab.tsx
'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button, Input } from '@/components/ui';

const CHANNELS = ['whatsapp', 'instagram', 'college', 'influencer', 'referral', 'other'];

export function CampaignLinksTab() {
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [campaign, setCampaign] = useState('');
  const [copied, setCopied] = useState(false);

  const slug = campaign.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'campaign';
  const url = `https://khel-o.com/?utm_source=${channel}&utm_medium=share&utm_campaign=${slug}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      <p className="text-body text-text-secondary">
        Generate a trackable link. Anyone who registers after opening it is automatically
        attributed to this channel and campaign on the Marketing Attribution page.
      </p>

      <div>
        <label className="text-caption font-semibold text-text-secondary mb-1 block">Channel</label>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-body text-text-primary"
        >
          {CHANNELS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <Input
        label="Campaign label"
        placeholder="e.g. september-launch"
        value={campaign}
        onChange={(e) => setCampaign(e.target.value)}
      />

      <div className="rounded-xl bg-surface border border-border p-3 flex items-center justify-between gap-2">
        <code className="text-caption break-all">{url}</code>
        <Button variant="ghost" size="sm" onClick={handleCopy}>
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the tab switcher to the promotions page**

Modify `frontend/src/app/(admin)/admin/promotions/page.tsx` the same way as Task 12's café tab: add `const [activeTab, setActiveTab] = useState<'promotions' | 'campaignLinks'>('promotions');`, a small tab-switcher UI, wrap the existing full page JSX under the `'promotions'` branch unchanged, and render `<CampaignLinksTab />` under the `'campaignLinks'` branch.

- [ ] **Step 3: Manually verify**

Load `/admin/promotions`, switch to "Campaign Links", generate a WhatsApp link, copy it, open it in an incognito window, confirm `utm_source=whatsapp` survives to the register page and (per Task 8) shows no fallback dropdown.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(admin)/admin/promotions/CampaignLinksTab.tsx" "frontend/src/app/(admin)/admin/promotions/page.tsx"
git commit -m "feat(admin): add campaign link generator tab to Promotions"
```

---

## Task 20: Admin nav restructure (`AdminShell.tsx`)

**Depends on:** Tasks 11-19 (every route this task links to must already exist)

**Files:**
- Modify: `frontend/src/components/layout/AdminShell.tsx`

**Interfaces:**
- Consumes: every admin route created/relocated in Tasks 11-19. No route paths change — only the nav's grouping/rendering.

- [ ] **Step 1: Replace the flat `adminNavItems` array with a grouped structure**

```typescript
interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string | null; // null = ungrouped, rendered flat (Overview, Verification Queue)
  items: NavItem[];
}

const adminNavGroups: NavGroup[] = [
  {
    label: null,
    items: [
      { label: 'Overview', href: '/admin', icon: BarChart3 },
      { label: 'Verification Queue', href: '/admin/verification-queue', icon: ShieldCheck },
    ],
  },
  {
    label: 'Marketplace',
    items: [
      { label: 'Bookings', href: '/admin/bookings', icon: CalendarDays },
      { label: 'Marketplace Health', href: '/admin/marketplace-health', icon: Activity },
    ],
  },
  {
    label: 'Cafés',
    items: [
      { label: 'All Cafés', href: '/admin/cafes', icon: Store },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { label: 'Setup Performance', href: '/admin/inventory/setups', icon: Monitor },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { label: 'Geography', href: '/admin/analytics/geography', icon: MapPin },
      { label: 'Revenue', href: '/admin/analytics/revenue', icon: IndianRupee },
      { label: 'Attribution', href: '/admin/analytics/attribution', icon: Megaphone },
      { label: 'Funnels', href: '/admin/analytics/funnels', icon: Filter },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Payments', href: '/admin/payments', icon: CreditCard },
      { label: 'Owner Payouts', href: '/admin/payouts', icon: Landmark },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Support', href: '/admin/support', icon: LifeBuoy },
      { label: 'Audit Log', href: '/admin/audit-log', icon: ScrollText },
    ],
  },
  {
    label: 'Platform',
    items: [
      { label: 'Users', href: '/admin/users', icon: Users },
      { label: 'Staff', href: '/admin/staff', icon: UsersRound },
      { label: 'Promotions', href: '/admin/promotions', icon: Tag },
      { label: 'Reviews', href: '/admin/reviews', icon: MessageSquare },
      { label: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
];
```

Add the new icon imports to the top of the file: `BarChart3` (already imported), plus `Activity, Monitor, MapPin, Megaphone, Filter` from `lucide-react`.

- [ ] **Step 2: Update `AdminNavBody` to render groups**

Replace the `adminNavItems.map(...)` block inside `AdminNavBody` with:

```tsx
{adminNavGroups.map((group, groupIdx) => (
  <div key={group.label ?? `ungrouped-${groupIdx}`} className={groupIdx > 0 ? 'mt-4' : ''}>
    {group.label && (
      <div className="px-3 pb-1 text-overline text-white/40 uppercase tracking-wider font-semibold">
        {group.label}
      </div>
    )}
    {group.items.map((item) => {
      const isActive =
        item.href === '/admin'
          ? pathname === '/admin'
          : pathname.startsWith(item.href);

      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={cn(
            'flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-body-emphasis transition-colors duration-fast',
            isActive
              ? 'bg-white/15 text-white font-bold'
              : 'text-white/60 hover:bg-white/10 hover:text-white',
          )}
          aria-current={isActive ? 'page' : undefined}
        >
          <item.icon className="h-4 w-4 flex-shrink-0" />
          <span>{item.label}</span>
        </Link>
      );
    })}
  </div>
))}
```

Keep the "Marketplace" external link and the user footer below this block exactly as they are today — only the nav-items rendering changes.

Note the `isActive` check for `/admin/cafes` will also match `/admin/cafes` sub-paths via `startsWith`, which is correct and already how the pre-existing logic behaved for every non-`/admin` item.

- [ ] **Step 2: Manually verify**

Load every admin route in the browser (Overview, Verification Queue, Bookings, Marketplace Health, Cafés, Setup Performance, Geography, Revenue, Attribution, Funnels, Payments, Payouts, Support, Audit Log, Users, Staff, Promotions, Reviews, Settings) and confirm each is reachable from the grouped sidebar, and the currently-active item is highlighted correctly, on both desktop sidebar and mobile drawer.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/AdminShell.tsx
git commit -m "feat(admin): restructure sidebar into grouped sections for the new analytics surfaces"
```

---

## Task 21: Full regression pass

**Depends on:** all previous tasks

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && pytest -v`
Expected: all tests pass, including every pre-existing admin/booking/auth test file — confirms nothing in Tasks 1-19 broke existing behavior (registration, booking creation, café verification, etc.)

- [ ] **Step 2: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: all tests pass, including the new `analyticsStore.test.ts` from Task 3

- [ ] **Step 3: Manually walk every pre-existing admin URL to confirm no route regressed**

`/admin`, `/admin/verification-queue`, `/admin/cafes`, `/admin/users`, `/admin/staff`, `/admin/bookings`, `/admin/payments`, `/admin/payouts`, `/admin/promotions`, `/admin/reviews`, `/admin/support`, `/admin/audit-log`, `/admin/settings` — each must load without error and retain its pre-existing functionality (this plan never modified their core logic, only added tabs/regrouped nav around them).

- [ ] **Step 4: Manually walk the full customer funnel end-to-end**

Register a new account via a UTM-tagged link → search for a café → view a café → start and complete a booking with a typed game name → confirm, in sequence: the registration captured `city`/`acquisition_source`, the pre-signup `venue_viewed`/`search_performed` events got backfilled to the new user, the booking has a `game` value, and `/admin/analytics/funnels` + `/admin/analytics/attribution` + `/admin/analytics/marketplace-health` all reflect the activity.

- [ ] **Step 5: No commit for this task** — it's verification-only. If any regression is found, fix it in the task that introduced it and re-run that task's tests before re-running this full pass.

---

## Parallelization Notes

**Must run sequentially (shared files / hard dependencies):**
- Task 1 → Task 2 → Task 3 blocks everything downstream (migration, event model+endpoint, and client capture infra are load-bearing for nearly everything else).
- Task 7 depends on Tasks 1+2. Task 8 depends on Tasks 3+7.
- Task 9 depends on Task 1. Task 10 depends on Task 9.
- Task 11 must land before Tasks 12-18, since they all append to the same three files it creates (`admin_analytics.py` schema/service/route, `adminAnalytics.ts`). Running 12-18 concurrently against those shared files will produce merge conflicts — land Task 11 first, then run 12-18 one at a time (or hand each its own short-lived branch and merge sequentially).
- Task 20 must be last among the frontend nav-facing tasks — it links to every route Tasks 11-19 create, so it can only be written once they all exist.
- Task 21 is last, full stop.

**Safe to parallelize once their prerequisites are merged:**
- Tasks 4, 5, 6 (search/venue/booking-flow instrumentation) touch three different files and only depend on Task 3 — no shared state between them, run concurrently.
- Task 19 (Campaign Links) has no backend dependency at all and touches files no other task touches — it can run in parallel with any of Tasks 12-18 once Task 11 is merged.
- Tasks 12-18 touch the *same* three shared backend files (`admin_analytics.py` ×3) and the same `adminAnalytics.ts` — despite being logically independent, running them truly concurrently will conflict on those shared files. Either serialize them, or if running as parallel subagents, have each one only append its own new function/schema/route/interface (never edit another task's addition) and merge sequentially rather than all at once.
