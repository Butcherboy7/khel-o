# Real Café Listings + Explore Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed 22 researched real gaming cafés as visible-but-unbookable listings, add a notify-me waitlist that measures demand, and rework the explore grid to hold real content.

**Architecture:** A new `is_lead_listing` flag marks cafés KHEL-O listed but that have not yet agreed to take bookings. Customer search deliberately ignores the flag (so they appear); booking creation rejects it (so they cannot be booked). A `cafe_waitlist` table records one-person-one-vote interest, whose count becomes both customer-facing FOMO and the owner-facing sales pitch. Frontend changes are contained to the card, the explore page and the café detail page — the palette is untouched.

**Tech Stack:** FastAPI · SQLAlchemy 2.0 async · Alembic · PostgreSQL · pytest (`asyncio_mode=auto`) · Next.js 14 App Router · TanStack Query · Tailwind · Playwright

**Spec:** `docs/superpowers/specs/2026-09-10-explore-real-cafes-design.md` — read it before Task 1. This plan argues from it; where they disagree, the spec wins.

---

## Skills to use

| When | Skill | Why |
|---|---|---|
| Before starting | `superpowers:using-git-worktrees` | Migration + seed scripts touch real data; isolate the workspace |
| Driving the plan | `superpowers:subagent-driven-development` **or** `superpowers:executing-plans` | Fresh subagent per task with review gates, or inline with checkpoints |
| Every code task | `superpowers:test-driven-development` | Test first, watch it fail, then implement |
| Task 1 only | `superpowers:systematic-debugging` | Task 1 is an investigation with a contradiction in it — do not guess |
| Before any "done" claim | `superpowers:verification-before-completion` | Run the command, paste the output, then claim |
| After Task 7 | `/security-review` | Task 7 changes how login identity is reassigned on accounts holding payout bank details |
| After Task 12 | `/run` | Screenshot the real grid; the 2:1 crop must be judged by eye, not by assertion |
| At the end | `/code-review high`, then `superpowers:finishing-a-development-branch` | |

**Task 13 (research) is human-supervised and must not be auto-approved.** See its warning block.

---

## Global Constraints

Exact values. Copy them verbatim; do not paraphrase.

- **Badge copy:** `Booking soon` — never "Opening soon", never "Almost open", never "onboarding"
- **Hardware fallback chip:** `Hardware coming soon`
- **Booking rejection message:** `This café isn't taking bookings on KHEL-O yet.`
- **Waitlist count display threshold:** show the count only when `count >= 5`; below that render the button alone
- **Photo ratio classes:** `aspect-[2/1] sm:aspect-[16/9]` — the `max-h-32 sm:max-h-36` cap is removed
- **Card shadow:** `0 4px 6px -1px rgba(72, 54, 42, 0.09), 0 2px 4px -1px rgba(72, 54, 42, 0.06)`
- **Palette:** no other value in `frontend/src/globals.css` may change. No dark mode.
- **Cities:** `banglore/` → `Bengaluru` / `Karnataka`; `hyderabad/` → `Hyderabad` / `Telangana`. Must match `SUPPORTED_CITIES` exactly.
- **Placeholder phone:** `0000000000`
- **Never fabricate** hours, prices, hardware or station counts. Unknown → `NULL` → UI hides the claim.
- **View counts are owner-only.** Never rendered on a public card.
- **Migration number:** `020` (latest existing is `019_add_analytics_foundation.py`)
- **Credentials** never get committed, pasted into docs, or written to agent memory.

---

## File structure

**Backend — create**
- `backend/migrations/versions/020_lead_listings_and_waitlist.py` — schema for both features
- `backend/app/models/cafe_waitlist.py` — `CafeWaitlistEntry` only
- `backend/app/repositories/waitlist_repository.py` — all waitlist SQL
- `backend/app/api/v1/waitlist.py` — waitlist HTTP surface
- `backend/scripts/seed_real_cafes.py` — the 22 cafés
- `backend/scripts/photo_ingest.py` — cover selection + S3 upload, importable by the seed script
- `backend/scripts/remove_fabricated_tiers.py` — one-shot cleanup
- `backend/tests/test_lead_listings.py`, `test_cafe_waitlist.py`, `test_email_change.py`

**Backend — modify**
- `backend/app/models/cafe.py` — add `is_lead_listing`
- `backend/app/api/v1/router.py` — register waitlist router
- `backend/app/services/booking_service.py` — lead-listing guard
- `backend/app/repositories/cafe_repository.py` — surface the flag + waitlist count
- `backend/app/schemas/user.py`, `backend/app/api/v1/auth.py` (or wherever `UserUpdateRequest` is handled) — email change
- `backend/app/api/v1/owner.py` — demand summary

**Frontend — modify**
- `frontend/src/globals.css` — shadow token only
- `frontend/src/types/cafe.ts` — `isLeadListing`, `waitlistCount`
- `frontend/src/lib/api/waitlist.ts` *(create)* — client for the three endpoints
- `frontend/src/components/customer/CafeCard.tsx` — ratio, type, badge, lead content
- `frontend/src/components/customer/ExploreClient.tsx` — city tabs, facet availability
- `frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx` — notify-me panel
- `frontend/e2e/lead_listings.spec.ts` *(create)*

**Rationale for the splits:** waitlist SQL lives in its own repository rather than inside `cafe_repository.py`, which is already ~250 lines and owns a different concern. Photo ingest is separate from the seed script so the seed can be re-run without re-uploading, and so the cover-selection heuristic is testable on its own.

---

## Task 1: Verify zero-tier café visibility

**No code changes.** This resolves a contradiction that could invalidate Tasks 14–15. Use `superpowers:systematic-debugging`.

**The contradiction:** the commit message on `bootstrap_lead_cafe_tiers.py` (01e1630) states the 6 lead cafés were "invisible/unbookable in customer search" with no `HardwareTier`. But reading `backend/app/repositories/cafe_repository.py` (~line 81), the base search query filters only on `verification_status`, `is_active`, `is_emergency_mode` and `bookings_paused` — there is no tier requirement. Both cannot be true.

This matters because the spec requires cafés with no confirmed hardware to have **zero tiers** and still appear.

- [ ] **Step 1: Reproduce**

Create one café with `verification_status=VERIFIED`, `is_active=True`, `is_emergency_mode=False`, `bookings_paused=False` and **no** `HardwareTier` rows. Call `GET /api/v1/cafes` with no filters. Record whether it appears.

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_lead_listings.py::test_zero_tier_cafe_is_listed -v
```

- [ ] **Step 2: Write that as a permanent test**

```python
# backend/tests/test_lead_listings.py
import uuid
from app.models.cafe import Cafe, VerificationStatus
from app.models.user import UserRole
from tests.conftest import create_test_user


async def test_zero_tier_cafe_is_listed(db_session, async_client):
    """A café with no HardwareTier must still appear in customer search.

    Guards the spec requirement that cafés with unconfirmed hardware are
    listed with 'Hardware coming soon' rather than given a fabricated tier.
    """
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await db_session.flush()
    cafe = Cafe(
        id=uuid.uuid4(), owner_id=owner.id, name="Zero Tier Cafe",
        address_line1="1 Test Rd", city="Hyderabad", state="Telangana",
        pincode="500001", phone_number="0000000000",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        amenities=[], photos=[], supported_games=[], menu_photos=[],
        house_rules=[], social_links={},
    )
    db_session.add(cafe)
    await db_session.commit()

    resp = await async_client.get("/api/v1/cafes", params={"limit": 100})
    assert resp.status_code == 200
    names = [c["name"] for c in resp.json()["items"]]
    assert "Zero Tier Cafe" in names
```

- [ ] **Step 3: Run it**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_lead_listings.py -v
```

- [ ] **Step 4: Branch on the result**

- **Passes** → the commit message was wrong (likely the cafés were invisible for a different reason, e.g. `bookable_stations=0` affecting the detail page rather than the list). Record that finding in the task notes and continue to Task 2 unchanged.
- **Fails** → find the *actual* filter excluding it. Read the full query path including any service-layer filtering in `app/services/cafe_service.py`. **Do not** work around it by creating placeholder tiers — that is the exact fabrication the spec forbids. Report the cause and stop for review.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_lead_listings.py
git commit -m "test: assert zero-tier cafés remain visible in customer search"
```

---

## Task 2: Migration 020 + models

**Files:**
- Create: `backend/migrations/versions/020_lead_listings_and_waitlist.py`
- Create: `backend/app/models/cafe_waitlist.py`
- Modify: `backend/app/models/cafe.py` (add one column after `bookings_paused`, ~line 47)
- Test: `backend/tests/test_lead_listings.py`

**Interfaces:**
- Produces: `Cafe.is_lead_listing: bool`; `CafeWaitlistEntry` with fields `id, cafe_id, user_id, session_id, contact, notified_at, created_at`

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/test_lead_listings.py
from app.models.cafe_waitlist import CafeWaitlistEntry


async def test_cafe_has_is_lead_listing_defaulting_false(db_session):
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await db_session.flush()
    cafe = Cafe(
        id=uuid.uuid4(), owner_id=owner.id, name="Flag Default Cafe",
        address_line1="1 Test Rd", city="Hyderabad", state="Telangana",
        pincode="500001", phone_number="0000000000",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        amenities=[], photos=[], supported_games=[], menu_photos=[],
        house_rules=[], social_links={},
    )
    db_session.add(cafe)
    await db_session.commit()
    await db_session.refresh(cafe)
    assert cafe.is_lead_listing is False


async def test_waitlist_entry_persists(db_session):
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await db_session.flush()
    cafe = Cafe(
        id=uuid.uuid4(), owner_id=owner.id, name="Waitlist Cafe",
        address_line1="1 Test Rd", city="Hyderabad", state="Telangana",
        pincode="500001", phone_number="0000000000",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        is_lead_listing=True,
        amenities=[], photos=[], supported_games=[], menu_photos=[],
        house_rules=[], social_links={},
    )
    db_session.add(cafe)
    await db_session.flush()
    entry = CafeWaitlistEntry(
        id=uuid.uuid4(), cafe_id=cafe.id, user_id=None,
        session_id="sess-abc", contact="9999999999",
    )
    db_session.add(entry)
    await db_session.commit()
    assert entry.created_at is not None
    assert entry.notified_at is None
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_lead_listings.py -v
```
Expected: FAIL — `ModuleNotFoundError: app.models.cafe_waitlist` / unexpected keyword `is_lead_listing`.

- [ ] **Step 3: Add the column to `Cafe`**

In `backend/app/models/cafe.py`, immediately after the `bookings_paused` line:

```python
    # Listed by KHEL-O from research, but the venue has not yet agreed to take
    # bookings. Deliberately NOT part of the customer search filter (see
    # cafe_repository.search) — these cafés must remain visible.
    is_lead_listing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
```

- [ ] **Step 4: Create the waitlist model**

```python
# backend/app/models/cafe_waitlist.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CafeWaitlistEntry(Base):
    """One person asking to be told when a café starts taking bookings.

    One row per person per café — the count is shown to customers and used as
    the demand pitch to café owners, so a duplicate silently inflates a number
    both audiences are told is real.
    """
    __tablename__ = "cafe_waitlist"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    cafe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cafes.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
```

Register it wherever the other models are imported for metadata (check `app/models/__init__.py` and follow the existing pattern).

- [ ] **Step 5: Write the migration**

```python
# backend/migrations/versions/020_lead_listings_and_waitlist.py
"""lead listings and cafe waitlist

Revision ID: 020
Revises: 019
"""
import sqlalchemy as sa
from alembic import op

revision = "020"
down_revision = "019"


def upgrade():
    op.add_column("cafes", sa.Column(
        "is_lead_listing", sa.Boolean(), nullable=False, server_default=sa.false()
    ))
    # The 6 cafés seeded by scripts/seed_lead_cafes.py are lead listings.
    op.execute("UPDATE cafes SET is_lead_listing = true WHERE email LIKE '%@khel-o.com'")

    op.create_table(
        "cafe_waitlist",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("cafe_id", sa.UUID(), sa.ForeignKey("cafes.id"), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("contact", sa.String(255), nullable=True),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_cafe_waitlist_cafe_id", "cafe_waitlist", ["cafe_id"])
    op.create_index("ix_cafe_waitlist_user_id", "cafe_waitlist", ["user_id"])
    op.create_index("ix_cafe_waitlist_session_id", "cafe_waitlist", ["session_id"])
    # One vote per person per café.
    op.create_index("uq_waitlist_cafe_user", "cafe_waitlist", ["cafe_id", "user_id"],
                    unique=True, postgresql_where=sa.text("user_id IS NOT NULL"))
    op.create_index("uq_waitlist_cafe_session", "cafe_waitlist", ["cafe_id", "session_id"],
                    unique=True, postgresql_where=sa.text("user_id IS NULL"))

    # analytics_events.cafe_id is the only column on that table without an
    # index; the per-café view count in owner.py filters on all three.
    op.create_index("ix_analytics_events_cafe_event_time", "analytics_events",
                    ["cafe_id", "event_type", "created_at"])


def downgrade():
    op.drop_index("ix_analytics_events_cafe_event_time", table_name="analytics_events")
    op.drop_table("cafe_waitlist")
    op.drop_column("cafes", "is_lead_listing")
```

Check `019_add_analytics_foundation.py` first and match its `revision`/`down_revision` string style exactly — if that file uses a longer identifier, use the same convention here.

- [ ] **Step 6: Run tests + migration**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_lead_listings.py -v
cd backend && .venv/Scripts/python.exe -m alembic upgrade head
```
Expected: tests PASS, migration applies clean.

- [ ] **Step 7: Commit**

```bash
git add backend/migrations/versions/020_lead_listings_and_waitlist.py backend/app/models/cafe_waitlist.py backend/app/models/cafe.py backend/app/models/__init__.py backend/tests/test_lead_listings.py
git commit -m "feat(db): add is_lead_listing flag and cafe_waitlist table"
```

---

## Task 3: Block bookings on lead listings

**Files:**
- Modify: `backend/app/services/booking_service.py`
- Test: `backend/tests/test_lead_listings.py`

**Interfaces:**
- Consumes: `Cafe.is_lead_listing` from Task 2

- [ ] **Step 1: Write the failing test**

```python
async def test_booking_rejected_for_lead_listing(db_session, async_client):
    from tests.conftest import auth_headers
    gamer = await create_test_user(db_session, role=UserRole.GAMER)
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await db_session.flush()
    cafe = Cafe(
        id=uuid.uuid4(), owner_id=owner.id, name="Lead Cafe",
        address_line1="1 Test Rd", city="Hyderabad", state="Telangana",
        pincode="500001", phone_number="0000000000",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        is_lead_listing=True,
        amenities=[], photos=[], supported_games=[], menu_photos=[],
        house_rules=[], social_links={},
    )
    db_session.add(cafe)
    await db_session.commit()

    resp = await async_client.post(
        "/api/v1/bookings",
        headers=auth_headers(gamer),
        json={"cafeId": str(cafe.id), "tierId": str(uuid.uuid4()),
              "startTime": "2026-10-01T10:00:00Z", "durationHours": 1, "seats": 1},
    )
    assert resp.status_code in (400, 409)
    assert "isn't taking bookings on KHEL-O yet" in resp.text
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_lead_listings.py::test_booking_rejected_for_lead_listing -v
```

- [ ] **Step 3: Add the guard**

Find the existing café validation in `booking_service.py` — the block that already checks `verification_status` / `is_active` / `bookings_paused`. Extend **that** block; do not add a second validation site:

```python
        if cafe.is_lead_listing:
            raise HTTPException(
                status_code=400,
                detail="This café isn't taking bookings on KHEL-O yet.",
            )
```

Match the surrounding error-raising style — if neighbouring checks raise a domain exception rather than `HTTPException`, use that instead.

- [ ] **Step 4: Add the same guard to availability**

Find the availability/slots endpoint for a café and return an empty availability payload (not a 500) for lead listings, so the detail page never renders a slot grid.

- [ ] **Step 5: Run tests**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_lead_listings.py -v
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/booking_service.py backend/tests/test_lead_listings.py
git commit -m "feat(bookings): reject bookings for lead listings"
```

---

## Task 4: Waitlist repository + API

**Files:**
- Create: `backend/app/repositories/waitlist_repository.py`
- Create: `backend/app/api/v1/waitlist.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_cafe_waitlist.py`

**Interfaces:**
- Produces:
  - `WaitlistRepository.join(cafe_id, user_id, session_id, contact) -> CafeWaitlistEntry`
  - `WaitlistRepository.leave(cafe_id, user_id, session_id) -> bool`
  - `WaitlistRepository.count(cafe_id) -> int`
  - `WaitlistRepository.counts_for(cafe_ids: list[UUID]) -> dict[UUID, int]` — used by Task 5
  - `POST/DELETE /api/v1/cafes/{cafe_id}/waitlist`, `GET /api/v1/cafes/{cafe_id}/waitlist/count`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_cafe_waitlist.py
import uuid
import pytest
from app.models.cafe import Cafe, VerificationStatus
from app.models.user import UserRole
from tests.conftest import create_test_user, auth_headers


async def _lead_cafe(db_session):
    owner = await create_test_user(db_session, role=UserRole.CAFE_OWNER)
    await db_session.flush()
    cafe = Cafe(
        id=uuid.uuid4(), owner_id=owner.id, name="Waitlist Target",
        address_line1="1 Test Rd", city="Hyderabad", state="Telangana",
        pincode="500001", phone_number="0000000000",
        verification_status=VerificationStatus.VERIFIED, is_active=True,
        is_lead_listing=True,
        amenities=[], photos=[], supported_games=[], menu_photos=[],
        house_rules=[], social_links={},
    )
    db_session.add(cafe)
    await db_session.commit()
    return cafe


async def test_join_is_idempotent_for_signed_in_user(db_session, async_client):
    cafe = await _lead_cafe(db_session)
    user = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()
    h = auth_headers(user)

    r1 = await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist", headers=h,
                                 json={"sessionId": "s1"})
    r2 = await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist", headers=h,
                                 json={"sessionId": "s1"})
    assert r1.status_code == 200 and r2.status_code == 200

    c = await async_client.get(f"/api/v1/cafes/{cafe.id}/waitlist/count")
    assert c.json()["count"] == 1
    assert c.json()["joined"] is False  # anonymous caller has not joined


async def test_join_is_idempotent_for_anonymous_session(db_session, async_client):
    cafe = await _lead_cafe(db_session)
    body = {"sessionId": "anon-1", "contact": "9999999999"}
    await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist", json=body)
    await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist", json=body)

    c = await async_client.get(f"/api/v1/cafes/{cafe.id}/waitlist/count")
    assert c.json()["count"] == 1


async def test_leave_removes_entry(db_session, async_client):
    cafe = await _lead_cafe(db_session)
    user = await create_test_user(db_session, role=UserRole.GAMER)
    await db_session.commit()
    h = auth_headers(user)

    await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist", headers=h,
                            json={"sessionId": "s2"})
    await async_client.request("DELETE", f"/api/v1/cafes/{cafe.id}/waitlist",
                               headers=h, json={"sessionId": "s2"})
    c = await async_client.get(f"/api/v1/cafes/{cafe.id}/waitlist/count")
    assert c.json()["count"] == 0


async def test_count_returns_true_number_not_thresholded(db_session, async_client):
    """The >=5 threshold is a display rule. The API returns the real count so
    the owner-facing demand figure stays accurate."""
    cafe = await _lead_cafe(db_session)
    for i in range(3):
        await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist",
                                json={"sessionId": f"anon-{i}"})
    c = await async_client.get(f"/api/v1/cafes/{cafe.id}/waitlist/count")
    assert c.json()["count"] == 3
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_cafe_waitlist.py -v
```
Expected: FAIL — 404 on every route.

- [ ] **Step 3: Implement the repository**

```python
# backend/app/repositories/waitlist_repository.py
import uuid
from typing import Optional
from sqlalchemy import select, func, delete, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cafe_waitlist import CafeWaitlistEntry


class WaitlistRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _identity_clause(self, cafe_id: uuid.UUID, user_id: Optional[uuid.UUID], session_id: str):
        if user_id is not None:
            return and_(CafeWaitlistEntry.cafe_id == cafe_id,
                        CafeWaitlistEntry.user_id == user_id)
        return and_(CafeWaitlistEntry.cafe_id == cafe_id,
                    CafeWaitlistEntry.user_id.is_(None),
                    CafeWaitlistEntry.session_id == session_id)

    async def join(self, cafe_id, user_id, session_id, contact=None) -> CafeWaitlistEntry:
        existing = (await self.db.execute(
            select(CafeWaitlistEntry).where(self._identity_clause(cafe_id, user_id, session_id))
        )).scalar_one_or_none()
        if existing:
            return existing
        entry = CafeWaitlistEntry(
            id=uuid.uuid4(), cafe_id=cafe_id, user_id=user_id,
            session_id=session_id, contact=contact,
        )
        self.db.add(entry)
        await self.db.commit()
        return entry

    async def leave(self, cafe_id, user_id, session_id) -> bool:
        result = await self.db.execute(
            delete(CafeWaitlistEntry).where(self._identity_clause(cafe_id, user_id, session_id))
        )
        await self.db.commit()
        return result.rowcount > 0

    async def count(self, cafe_id) -> int:
        return (await self.db.execute(
            select(func.count(CafeWaitlistEntry.id)).where(CafeWaitlistEntry.cafe_id == cafe_id)
        )).scalar() or 0

    async def has_joined(self, cafe_id, user_id, session_id) -> bool:
        return (await self.db.execute(
            select(func.count(CafeWaitlistEntry.id))
            .where(self._identity_clause(cafe_id, user_id, session_id))
        )).scalar() > 0

    async def counts_for(self, cafe_ids: list) -> dict:
        """Batch count for the explore grid — one query, not N."""
        if not cafe_ids:
            return {}
        rows = (await self.db.execute(
            select(CafeWaitlistEntry.cafe_id, func.count(CafeWaitlistEntry.id))
            .where(CafeWaitlistEntry.cafe_id.in_(cafe_ids))
            .group_by(CafeWaitlistEntry.cafe_id)
        )).all()
        return {cafe_id: n for cafe_id, n in rows}
```

- [ ] **Step 4: Implement the router**

Create `backend/app/api/v1/waitlist.py` with the three routes. Follow the dependency-injection and response-model conventions of an existing router (read `app/api/v1/reviews.py` first — it has the same shape of café-scoped public + authenticated routes). Auth must be **optional**: a signed-out visitor can join with `sessionId` alone.

Register in `app/api/v1/router.py` alongside the other includes.

- [ ] **Step 5: Run tests**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_cafe_waitlist.py -v
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/repositories/waitlist_repository.py backend/app/api/v1/waitlist.py backend/app/api/v1/router.py backend/tests/test_cafe_waitlist.py
git commit -m "feat(waitlist): add join/leave/count endpoints for lead listings"
```

---

## Task 5: Expose `isLeadListing` and `waitlistCount` on café responses

**Files:**
- Modify: `backend/app/repositories/cafe_repository.py`
- Modify: `backend/app/schemas/cafe.py`
- Test: `backend/tests/test_lead_listings.py`

**Interfaces:**
- Consumes: `WaitlistRepository.counts_for` (Task 4)
- Produces: `isLeadListing: bool` and `waitlistCount: int` on both the list item and the detail payload

- [ ] **Step 1: Write the failing test**

```python
async def test_list_response_includes_lead_fields(db_session, async_client):
    cafe = await _lead_cafe_named(db_session, "Lead Fields Cafe")
    await async_client.post(f"/api/v1/cafes/{cafe.id}/waitlist", json={"sessionId": "x1"})

    resp = await async_client.get("/api/v1/cafes", params={"limit": 100})
    item = next(c for c in resp.json()["items"] if c["name"] == "Lead Fields Cafe")
    assert item["isLeadListing"] is True
    assert item["waitlistCount"] == 1
```

Add `_lead_cafe_named(db_session, name)` as a small helper in the same file (same body as `_lead_cafe`, parameterised on name).

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_lead_listings.py::test_list_response_includes_lead_fields -v
```
Expected: FAIL — `KeyError: 'isLeadListing'`.

- [ ] **Step 3: Implement**

In `cafe_repository.py`, the search method already batch-loads tiers by `cafe_ids` after pagination (~line 145). Add a single `counts_for(cafe_ids)` call in the same place and include both fields in the per-café dict it builds (~line 191, where `verification_status` and `is_active` are already mapped).

Add both fields to the response schema in `app/schemas/cafe.py`, matching the existing `to_camel` alias generator.

- [ ] **Step 4: Run tests**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/ -k "lead or waitlist" -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/repositories/cafe_repository.py backend/app/schemas/cafe.py backend/tests/test_lead_listings.py
git commit -m "feat(cafes): expose isLeadListing and waitlistCount on café responses"
```

---

## Task 6: Owner demand summary

**Files:**
- Modify: `backend/app/api/v1/owner.py`
- Test: `backend/tests/test_lead_listings.py`

**Interfaces:**
- Produces: `GET /api/v1/owner/cafes/{cafe_id}/demand` → `{ uniqueViews30d: int, waitlistCount: int }`

- [ ] **Step 1: Write the failing test**

```python
async def test_demand_summary_counts_unique_sessions(db_session, async_client):
    """Two views from one session count once — an inflated number is useless
    as an owner pitch."""
    from app.models.analytics_event import AnalyticsEvent
    cafe = await _lead_cafe_named(db_session, "Demand Cafe")
    owner = (await db_session.get(Cafe, cafe.id)).owner_id
    for sess in ["s1", "s1", "s2"]:
        db_session.add(AnalyticsEvent(
            id=uuid.uuid4(), session_id=sess, user_id=None,
            event_type="venue_viewed", cafe_id=cafe.id, event_metadata={},
        ))
    await db_session.commit()

    owner_user = await db_session.get(User, owner)
    resp = await async_client.get(f"/api/v1/owner/cafes/{cafe.id}/demand",
                                  headers=auth_headers(owner_user))
    assert resp.status_code == 200
    assert resp.json()["uniqueViews30d"] == 2
```

Import `User` from `app.models.user` at the top of the test file.

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_lead_listings.py::test_demand_summary_counts_unique_sessions -v
```

- [ ] **Step 3: Implement**

```python
    stmt = select(func.count(func.distinct(AnalyticsEvent.session_id))).where(
        AnalyticsEvent.cafe_id == cafe_id,
        AnalyticsEvent.event_type == "venue_viewed",
        AnalyticsEvent.created_at > datetime.now(timezone.utc) - timedelta(days=30),
    )
```

Guard the route with the existing owner-ownership dependency used by the other routes in `owner.py` — an owner must only see their own café's numbers. Admins may also read it if the file already has an admin bypass; do not invent one.

- [ ] **Step 4: Run tests + confirm the index is used**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_lead_listings.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/owner.py backend/tests/test_lead_listings.py
git commit -m "feat(owner): add per-café demand summary from existing venue_viewed events"
```

---

## Task 7: Password-gated email change

> Run `/security-review` after this task. It changes how an account's login identity is reassigned, on accounts that hold payout bank details.

**Files:**
- Modify: `backend/app/schemas/user.py:68-78`
- Modify: the handler for `UserUpdateRequest` (find it — likely `app/api/v1/auth.py` or `app/services/user`-adjacent)
- Test: `backend/tests/test_email_change.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_email_change.py
import uuid
from app.models.user import UserRole
from tests.conftest import create_test_user, auth_headers


async def test_email_change_requires_current_password(db_session, async_client):
    user = await create_test_user(db_session, email="old@khel-o.com", password="rightpass1")
    await db_session.commit()
    resp = await async_client.patch("/api/v1/users/me", headers=auth_headers(user),
                                    json={"email": "new@real.com"})
    assert resp.status_code == 400


async def test_email_change_rejects_wrong_password(db_session, async_client):
    user = await create_test_user(db_session, email="old2@khel-o.com", password="rightpass1")
    await db_session.commit()
    resp = await async_client.patch("/api/v1/users/me", headers=auth_headers(user),
                                    json={"email": "new2@real.com", "currentPassword": "wrong"})
    assert resp.status_code in (400, 401, 403)


async def test_email_change_succeeds_with_password(db_session, async_client):
    user = await create_test_user(db_session, email="old3@khel-o.com", password="rightpass1")
    await db_session.commit()
    resp = await async_client.patch("/api/v1/users/me", headers=auth_headers(user),
                                    json={"email": "new3@real.com", "currentPassword": "rightpass1"})
    assert resp.status_code == 200
    await db_session.refresh(user)
    assert user.email == "new3@real.com"


async def test_email_change_rejects_duplicate(db_session, async_client):
    await create_test_user(db_session, email="taken@real.com")
    user = await create_test_user(db_session, email="old4@khel-o.com", password="rightpass1")
    await db_session.commit()
    resp = await async_client.patch("/api/v1/users/me", headers=auth_headers(user),
                                    json={"email": "taken@real.com", "currentPassword": "rightpass1"})
    assert resp.status_code == 409
```

Correct the route path in all four tests to the project's actual profile-update route before running — find it with `grep -rn "UserUpdateRequest" backend/app/api/`.

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_email_change.py -v
```

- [ ] **Step 3: Extend the schema**

```python
class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    phone_number: Optional[str] = Field(None, max_length=20)
    avatar_url: Optional[str] = Field(None, max_length=500)
    # Email is the login identity. There is no email-verification system in
    # this codebase, and the seeded @khel-o.com addresses do not exist — so
    # forgot-password cannot recover these accounts and this IS the recovery
    # path. The password gate is what stops a leaked session from silently
    # reassigning an account that holds payout bank details.
    email: Optional[EmailStr] = None
    current_password: Optional[str] = None
```

- [ ] **Step 4: Implement the handler rules**

- `email` present and `current_password` absent → 400
- password does not verify (`app.core.security.verify_password`) → 400
- new email already in `users.email` → 409
- otherwise lowercase/strip it and save, matching `create_test_user`'s normalisation

- [ ] **Step 5: Run tests**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_email_change.py -v
```

- [ ] **Step 6: Commit, then run `/security-review`**

```bash
git add backend/app/schemas/user.py backend/tests/test_email_change.py
git commit -m "feat(auth): allow password-gated email change for café owners"
```

---

## Task 8: Frontend types + card shadow

**Files:**
- Modify: `frontend/src/globals.css` (lines ~41-42)
- Modify: `frontend/src/types/cafe.ts`
- Create: `frontend/src/lib/api/waitlist.ts`

- [ ] **Step 1: Change the shadow token**

Replace exactly:

```css
--shadow-card: 0 4px 6px -1px rgba(0, 0, 0, 0.06),
  0 2px 4px -1px rgba(0, 0, 0, 0.04);
```

with:

```css
/* Tinted toward --surface (#F1EFEA): a pure-black shadow on warm cream reads
   ashy, and since --card is #FFFFFF on that ground the shadow is doing most
   of the work of separating card from page. Geometry unchanged. */
--shadow-card: 0 4px 6px -1px rgba(72, 54, 42, 0.09),
  0 2px 4px -1px rgba(72, 54, 42, 0.06);
```

**Change nothing else in this file.**

- [ ] **Step 2: Extend the types**

In `frontend/src/types/cafe.ts`, add to `CafeListItem` and to `Cafe`:

```ts
  isLeadListing: boolean;
  /** True count from the API. The >=5 display threshold is applied at render. */
  waitlistCount?: number;
```

- [ ] **Step 3: Add the API client**

```ts
// frontend/src/lib/api/waitlist.ts
import { apiClient } from './client';   // match the import used by lib/api/cafes.ts

export interface WaitlistStatus {
  count: number;
  joined: boolean;
}

export async function getWaitlistStatus(cafeId: string): Promise<WaitlistStatus> {
  const { data } = await apiClient.get(`/cafes/${cafeId}/waitlist/count`);
  return data;
}

export async function joinWaitlist(
  cafeId: string, sessionId: string, contact?: string,
): Promise<void> {
  await apiClient.post(`/cafes/${cafeId}/waitlist`, { sessionId, contact });
}

export async function leaveWaitlist(cafeId: string, sessionId: string): Promise<void> {
  await apiClient.delete(`/cafes/${cafeId}/waitlist`, { data: { sessionId } });
}
```

Open `frontend/src/lib/api/cafes.ts` first and copy its exact import path and client usage — do not assume `apiClient` is the right symbol.

- [ ] **Step 4: Verify the build**

```bash
cd frontend && npm run lint && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/globals.css frontend/src/types/cafe.ts frontend/src/lib/api/waitlist.ts
git commit -m "feat(ui): warm card shadow, lead-listing types, waitlist client"
```

---

## Task 9: Rework `CafeCard`

**Files:**
- Modify: `frontend/src/components/customer/CafeCard.tsx`

> **No unit-test runner exists in this project** (Playwright only). Verification here is `npm run build`, the Task 12 e2e spec, and a screenshot. Do not invent a jest setup.

- [ ] **Step 1: Photo ratio and cap**

Replace the `CardImage` props:

```tsx
<CardImage
  aspectClass="aspect-[2/1] sm:aspect-[16/9]"
  className="relative w-full flex-shrink-0"
>
```

`max-h-32 sm:max-h-36` is deleted. **Keep `w-full` and `flex-shrink-0`** — the existing comment documents a real mobile-Safari aspect-ratio bug and both are load-bearing.

- [ ] **Step 2: Remove the grid carousel**

Delete the `photoIndex` state, the `useEffect` interval, and the dot-indicator block. Render `photosList[0]` only. 22 cards × up to 7 photos is 22 concurrent timers with no `prefers-reduced-motion` guard; photos stay on the detail page.

- [ ] **Step 3: Title type and clamp**

```tsx
<h3 className="font-heading text-h3 text-text-primary group-hover:text-primary transition-colors line-clamp-2 leading-tight">
  {cafe.name}
</h3>
```

`text-h3` is the existing token for card titles (1rem/600). `truncate` and the layered `font-bold` are removed — real names like "League of Extraordinary Gamers" clip on one line.

- [ ] **Step 4: Branch the card body on `isLeadListing`**

```tsx
{cafe.isLeadListing ? (
  <>
    <div className="cc-line flex items-center gap-1 text-caption text-text-secondary min-w-0">
      <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
      <span className="truncate">{cafe.city}</span>
    </div>
    <div className="flex items-center justify-between gap-2">
      <span className="text-caption text-text-secondary">
        {platformSummary ?? 'Hardware coming soon'}
      </span>
      {(cafe.waitlistCount ?? 0) >= 5 && (
        <span className="text-caption font-semibold text-text-secondary flex-shrink-0">
          {cafe.waitlistCount} waiting
        </span>
      )}
    </div>
  </>
) : (
  /* existing rating + location + price rows, unchanged */
)}
```

- [ ] **Step 5: Badge**

For `isLeadListing`, the top-right pill renders `Booking soon` and the open/closed computation is skipped entirely. Non-lead cafés keep today's `isOpenNow` badge.

- [ ] **Step 6: Build**

```bash
cd frontend && npm run lint && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/customer/CafeCard.tsx
git commit -m "feat(ui): 2:1 mobile photo, h3 clamped title, lead-listing card content"
```

---

## Task 10: Explore page — city tabs and facet availability

**Files:**
- Modify: `frontend/src/components/customer/ExploreClient.tsx`

- [ ] **Step 1: City tabs**

Replace the `showCityDropdown` panel with inline tabs. Derive the city list by intersecting `SUPPORTED_CITIES` with cities present in the current result set, plus "All Cities". Keep `SUPPORTED_CITIES` as the source of truth; keep the "Use exact location" action.

- [ ] **Step 2: Facet availability**

Before rendering `filterChipsRow`, compute from the loaded `cafes` array:

```tsx
const facets = {
  pc: cafes.some((c) => hasPcTier(c.tierNames, c.platforms, c.platformsComplete)),
  ps5: cafes.some((c) => hasPlatformTier('playstation', c.tierNames, c.platforms, c.platformsComplete)),
  xbox: cafes.some((c) => hasPlatformTier('xbox', c.tierNames, c.platforms, c.platformsComplete)),
  openNow: cafes.some((c) => c.openingTime != null && c.closingTime != null),
};
```

Render each chip only when its facet is `true`. A filter that can only ever return zero should not be on screen.

- [ ] **Step 3: Same rule in the filter sheet**

Hide the price slider when no café in the set has a `startingPrice`, and hide amenity buckets with no matching café.

- [ ] **Step 4: Build**

```bash
cd frontend && npm run lint && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/customer/ExploreClient.tsx
git commit -m "feat(explore): city tabs and hide filters no café can satisfy"
```

---

## Task 11: Café detail — notify-me panel

**Files:**
- Modify: `frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx`

- [ ] **Step 1: Replace the booking panel for lead listings**

```tsx
{cafe.isLeadListing ? (
  <section className="rounded-2xl bg-card border border-border/80 p-5 flex flex-col gap-3 shadow-card">
    <h2 className="font-heading text-h3 text-text-primary">Booking soon</h2>
    <p className="text-body text-text-secondary">
      We&rsquo;re onboarding this café to KHEL-O right now. Want to know the moment booking opens?
    </p>
    <button
      onClick={handleNotifyMe}
      disabled={isJoining}
      className="min-h-btn rounded-xl bg-primary text-white font-heading text-btn font-semibold px-5 hover:bg-primary-dark transition-colors disabled:opacity-60"
    >
      {joined ? '✓ We\u2019ll let you know' : '🔔 Notify me'}
    </button>
    {waitlistCount >= 5 && (
      <p className="text-caption text-text-secondary">{waitlistCount} people waiting</p>
    )}
  </section>
) : (
  /* existing booking panel, unchanged */
)}
```

- [ ] **Step 2: Load the initial state**

The panel needs `joined` and `waitlistCount` before it can render. Fetch both on mount with
TanStack Query, matching the pattern already used in this file:

```tsx
const { data: waitlist } = useQuery({
  queryKey: ['waitlist', cafeId],
  queryFn: () => getWaitlistStatus(cafeId),
  enabled: cafe.isLeadListing,
  staleTime: 30_000,
});
const joined = waitlist?.joined ?? false;
const waitlistCount = waitlist?.count ?? 0;
```

Invalidate `['waitlist', cafeId]` after a join or leave so the count and button state refresh.

- [ ] **Step 3: Wire the handler**

- Signed in → `joinWaitlist(cafeId, sessionId)` directly.
- Signed out → reveal a phone/email input first, then send it as `contact`.
- `joined === true` → the button becomes an undo calling `leaveWaitlist`.
- Reuse the **same** `sessionId` the analytics client already sends (see `frontend/src/lib/api/analyticsEvents.ts`). Do not mint a second session id.

- [ ] **Step 4: No directions or call button on lead listings**

Deliberate: those route the customer past KHEL-O to the venue.

- [ ] **Step 5: Leave `venue_viewed` firing unchanged** — it now feeds Task 6.

- [ ] **Step 6: Build**

```bash
cd frontend && npm run lint && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/\(customer\)/cafe/\[id\]/CafeDetailClient.tsx
git commit -m "feat(cafe): notify-me waitlist panel for lead listings"
```

---

## Task 12: End-to-end spec

**Files:**
- Create: `frontend/e2e/lead_listings.spec.ts`

- [ ] **Step 1: Write the spec**

Follow the setup conventions in `frontend/e2e/customer_flow.spec.ts` (auth helper in `e2e/auth.ts`). Cover:

1. A lead café appears in the explore grid with a `Booking soon` badge.
2. Its card shows no rating and no price.
3. Opening it shows the notify-me panel and **no** slot grid.
4. Clicking "Notify me" twice leaves the count unchanged.
5. A café with fewer than 5 waiting shows the button but no count.

- [ ] **Step 2: Run**

```bash
cd frontend && npx playwright test e2e/lead_listings.spec.ts
```

- [ ] **Step 3: Screenshot the grid**

Use `/run` to launch the app and look at the real grid. Judge by eye: the 2:1 mobile crop on a portrait source photo, and a long café name wrapping to two lines. Assertions cannot settle this.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/lead_listings.spec.ts
git commit -m "test(e2e): cover lead-listing card, detail panel and waitlist"
```

---

## Task 13: Research the 22 cafés — HUMAN SUPERVISED

> **STOP. Do not auto-approve this task.**
>
> This is the one task where a plausible-looking invention is undetectable downstream and gets published about a real business. The entire spec rests on *nothing is guessed*.
>
> **Every confirmed field must carry a source URL as a code comment beside it.** No URL means the field is `unknown`, not "probably". Leaving a field unknown is a success, not a gap.
>
> Hand the completed data file to the user for spot-checking **before** Task 15 runs.

**Files:**
- Create: `backend/scripts/data/real_cafes.py` — the researched dataset, no DB writes

- [ ] **Step 1: Extract the zip**

```bash
mkdir -p /tmp/cafes && unzip -o -q "c:/Users/ADMIN/Desktop/all cafes .zip" -d /tmp/cafes
```

- [ ] **Step 2: Build the skeleton from the folders**

One entry per café folder: `slug`, `name`, `address_line1`, `city`, `state`, `pincode` (parsed from the `.txt`), `photo_dir`. Apply the §4.1 normalisation rules — `banglore` → `Bengaluru`/`Karnataka`.

- [ ] **Step 3: Research each café**

Web-search each name + address for: opening hours, phone, price per hour, station counts, platform mix.

```python
    {
        "slug": "1vx.indiranagar",
        "name": "1vX Gaming Cafe",
        "address_line1": "2nd Floor, NR Plaza, 39/7, 7th Main Rd, Motappapalya, Indiranagar",
        "city": "Bengaluru", "state": "Karnataka", "pincode": "560038",
        "phone_number": "0000000000",      # unconfirmed
        "opening_time": None,               # unconfirmed — no default, see spec §4.2
        "closing_time": None,
        "tiers": [],                        # no confirmed hardware -> zero tiers
        # sources: <url>   <- REQUIRED for every non-None value above
    },
```

- [ ] **Step 4: Hand off for spot-check**

Print a table of every café and which fields are `confirmed` vs `unknown`. Stop and wait for the user.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/data/real_cafes.py
git commit -m "data: researched details for 22 real cafés with sources"
```

---

## Task 14: Photo ingest

**Files:**
- Create: `backend/scripts/photo_ingest.py`
- Test: `backend/tests/test_photo_ingest.py`

**Interfaces:**
- Produces: `select_cover(paths: list[str]) -> str`, `make_cover_derivative(path, out_path) -> str`, `upload_cafe_photos(cafe_id, photo_dir) -> list[str]`

- [ ] **Step 1: Write the failing test for cover selection**

```python
# backend/tests/test_photo_ingest.py
from PIL import Image
from scripts.photo_ingest import select_cover


def _img(tmp_path, name, w, h):
    p = tmp_path / name
    Image.new("RGB", (w, h), "black").save(p)
    return str(p)


def test_select_cover_prefers_landscape(tmp_path):
    portrait = _img(tmp_path, "a.png", 481, 803)
    landscape = _img(tmp_path, "b.png", 1385, 663)
    assert select_cover([portrait, landscape]) == landscape


def test_select_cover_falls_back_to_highest_resolution(tmp_path):
    small = _img(tmp_path, "a.png", 476, 806)
    big = _img(tmp_path, "b.png", 900, 1400)
    assert select_cover([small, big]) == big
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_photo_ingest.py -v
```

- [ ] **Step 3: Implement**

`select_cover`: prefer the widest photo with ratio ≥ 1.4; if none qualifies, return the highest pixel-count photo. `make_cover_derivative`: centre-crop to 16:9 and save JPEG. `upload_cafe_photos`: cover first, then the rest in original form; upload through the boto3 client from `storage_service._get_client()` and return `build_public_url(key)` for each.

- [ ] **Step 4: Run tests**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_photo_ingest.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/photo_ingest.py backend/tests/test_photo_ingest.py
git commit -m "feat(scripts): café cover-photo selection and S3 ingest"
```

---

## Task 15: Seed the 22 cafés

**Files:**
- Create: `backend/scripts/seed_real_cafes.py`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `scripts/data/real_cafes.py` (Task 13), `scripts/photo_ingest.upload_cafe_photos` (Task 14)

- [ ] **Step 1: Gitignore the credentials output first**

```bash
echo "backend/scripts/out/" >> .gitignore
git add .gitignore && git commit -m "chore: gitignore seeded credential output"
```

Do this **before** the first run. These are live passwords for accounts holding payout bank fields.

- [ ] **Step 2: Write the script**

Model it on `backend/scripts/seed_lead_cafes.py` — same structure, same `generate_password()`. Per café create the `User` (role `CAFE_OWNER`, email `<slug>@khel-o.com`), the `UserRoleMapping`, and the `Cafe` with `verification_status=VERIFIED`, `is_active=True`, `is_lead_listing=True`. Create `HardwareTier` rows **only** where Task 13 confirmed platform *and* price. Skip cafés whose email already exists.

Write credentials to `backend/scripts/out/real_cafe_credentials.csv` and print them once.

- [ ] **Step 3: Dry run against the local DB**

```bash
cd backend && .venv/Scripts/python.exe -m scripts.seed_real_cafes
```

- [ ] **Step 4: Verify**

```bash
cd backend && .venv/Scripts/python.exe -m scripts.check_cafes
```
Expected: 22 new cafés, each with `is_lead_listing=True`, photos populated, and tiers only where confirmed.

- [ ] **Step 5: Commit the script only**

```bash
git add backend/scripts/seed_real_cafes.py
git commit -m "feat(scripts): seed 22 researched cafés as lead listings"
```

Confirm `git status` shows no CSV before committing.

---

## Task 16: Remove the fabricated tiers

**Files:**
- Create: `backend/scripts/remove_fabricated_tiers.py`

The 6 cafés from `seed_lead_cafes.py` each carry a 10-seat PC tier at ₹80/hr invented by `bootstrap_lead_cafe_tiers.py`. That price is currently shown to customers and no venue agreed to it.

- [ ] **Step 1: Write the script**

For each café whose email matches the 6 in `bootstrap_lead_cafe_tiers.EMAILS`, delete `HardwareTier` rows where `price_per_hour == 80.00` and `total_seats == 10` and no booking references them. Print each deletion. Refuse to delete a tier with bookings attached and report it instead.

- [ ] **Step 2: Set the flag on those 6**

Confirm the Task 2 migration backfilled `is_lead_listing=True` for them; if the email pattern missed any, set it here explicitly.

- [ ] **Step 3: Run and verify**

```bash
cd backend && .venv/Scripts/python.exe -m scripts.remove_fabricated_tiers
cd backend && .venv/Scripts/python.exe -m scripts.check_cafes
```

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/remove_fabricated_tiers.py
git commit -m "fix(data): remove fabricated 80/hr tiers from lead cafés"
```

---

## Task 17: First-login claim flow

**Files:**
- Modify: `frontend/src/app/(owner)/owner/dashboard/` entry point (find the layout/guard)
- Modify: `backend/app/api/v1/owner.py` — a claim endpoint that flips `is_lead_listing` to `False`

- [ ] **Step 1: Detect an unclaimed owner**

On owner dashboard load, when the signed-in user's email ends `@khel-o.com`, render a blocking claim step instead of the dashboard.

- [ ] **Step 2: The claim form**

Collect a real email and a new password. Submit via the Task 7 endpoint (email + `currentPassword`), then the password change through the existing change-password route.

- [ ] **Step 3: Flip the flag**

On successful claim, `POST /api/v1/owner/cafes/{cafe_id}/claim` sets `is_lead_listing = False`. The café becomes bookable from that moment.

- [ ] **Step 4: Test**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/ -k "claim or lead" -v
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(owner): first-login claim flow flips lead listing to bookable"
```

---

## Task 18: Full verification

Use `superpowers:verification-before-completion`. Run each command and paste real output; do not summarise.

- [ ] **Step 1: Backend suite**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/ -v
```

- [ ] **Step 2: Frontend build + lint**

```bash
cd frontend && npm run lint && npm run build
```

- [ ] **Step 3: E2E**

```bash
cd frontend && npx playwright test
```

- [ ] **Step 4: Walk the spec's acceptance criteria**

Check all 11 in `docs/superpowers/specs/2026-09-10-explore-real-cafes-design.md` §9 one by one. Criteria 4 and 5 are visual — screenshot `mega gamerz` (481×803), `clash of console` (476×806) and `League of Extraordinary Gamers`.

- [ ] **Step 5: `/code-review high`, then `superpowers:finishing-a-development-branch`**

---

## Notes for the executor

- **The palette is not yours to change.** Only `--shadow-card` moves. If something looks wrong in light mode, report it — do not fix it by adding a colour.
- **`unknown` is a valid outcome.** A café with no hours, no price and no hardware is a correct result, not an incomplete one.
- **Never add a placeholder tier to make a café appear.** If a café is invisible, find the real filter (Task 1).
- **Credentials never enter git, docs, or memory.**
- If Task 1 fails, stop and report rather than working around it — it invalidates Tasks 14–16.
