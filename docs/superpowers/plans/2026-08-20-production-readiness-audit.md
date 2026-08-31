# KHEL-O Production Readiness & Security Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the real authorization gaps, fix booking/check-in time correctness, make unauthenticated actions degrade gracefully, and land the P2 UX work — with every fix verified by direct API calls, not UI clicks.

**Architecture:** FastAPI + SQLAlchemy async + Postgres backend; Next.js 14 App Router + Zustand + TanStack Query frontend. Authorization is enforced server-side via FastAPI dependencies (`app/api/deps.py`) that read the `user_roles` mapping table — the sole source of truth. The frontend's `activeRole` is a **view-mode preference only** and must never be treated as a permission.

**Tech Stack:** FastAPI, SQLAlchemy 2.x async, Postgres 15, Alembic-style manual ALTER migrations in `main.py:init_db()`, pytest/pytest-asyncio, Next.js 14, Zustand, TanStack Query, Tailwind, Razorpay, AWS S3 (`khelo-cafe-photos-prod`, ap-south-1).

**Spec:** This document (derived from the user's 2026-08-20 audit brief + live findings below).

---

## PRE-WORK DIAGNOSIS (already completed — do not redo)

This section is the evidence base. Every claim here was verified against **live production** on 2026-08-20, not inferred from reading code.

### 1. Authentication architecture
JWT bearer tokens (HS256, `python-jose`), issued in `app/services/auth_service.py`. Access token ~15 min (`ACCESS_TOKEN_EXPIRE_MINUTES`), refresh 30 days. `oauth2_scheme` + `get_current_user` in `app/api/deps.py`. `get_current_active_user` re-reads the user from the DB on every request, so deactivation takes effect mid-session.

### 2–4. Role model, storage, assignment
Two fields exist and must not be confused:
- `users.role` — a **legacy single "primary" column**. Still read in a few services (`booking_service.py:220,327`, `cafe_service.py:53`). Not the authorization source of truth.
- `user_roles` table (`UserRoleMapping`) — **the real source of truth**, read by `get_user_roles()` (`deps.py:19`).

Roles are granted only in these places (all audited):
`admin.py:165,179` (admin approving a café → grants gamer+cafe_owner), `cafes.py:155,169` and `owner.py:406,420` (café creation → grants gamer+cafe_owner), `main.py:91-133` (demo seeding), `user_repository.py:90,133,158`.
**No code path anywhere grants `admin` except the admin-only `PATCH /admin/users/{user_id}/role` endpoint.** `update_role()`'s role hierarchy (`user_repository.py:175-190`) only ever raises the legacy `users.role` column and calls `grant_role()` with the *requested* role — it cannot synthesize admin.

### 5. Role switching
`POST /auth/switch-role` → `auth_service.switch_active_role()` (line 262). It loads the user's real rows from `user_roles` and **rejects any target role the account does not hold** (`ROLE_NOT_GRANTED`), with one deliberate exception: `cafe_owner` is auto-granted if the user owns a VERIFIED café.

### 6–7. Admin & owner authorization
`require_admin` (`deps.py:100`) checks `"admin" in get_user_roles(...)`. `require_cafe_ownership` (`deps.py:109`) checks role **and** `cafe.owner_id == current_user.id`, and rejects SUSPENDED cafés.

### 🔍 P0 FINDING — the reported escalation is NOT reproducible on the backend

Live production DB (`user_roles`) at time of audit:

```
owner@example.com                  | cafe_owner,gamer
uzair@gmail.com                    | gamer,admin,cafe_owner     <-- your own account
arpiii0318@gmail.com               | gamer
(all other accounts)               | gamer
```

**No café-owner account holds `admin`.** Direct API probes as `owner@example.com`:

```
POST /auth/switch-role {"targetRole":"admin"}  -> ROLE_NOT_GRANTED  (rejected)
GET  /admin/analytics                          -> HTTP 403
GET  /admin/cafes/pending                      -> HTTP 403
```

All 31 endpoints in `admin.py` were enumerated programmatically; **every one is behind `require_admin`.**

**Most likely explanation of what you saw:** the account you tested with was `uzair@gmail.com`, which legitimately holds `admin` (seeded that way). Its switcher cycles gamer → cafe_owner → admin, which looks identical to "an owner gained admin."

### 🔴 P0 REAL FINDING — client-forgeable `activeRole` (defense-in-depth gap)

`authStore.ts:133` hydrates `activeRole` straight from `localStorage` **with no validation against `user.roles`**:

```ts
const savedActiveRole = (localStorage.getItem('activeRole') as UserActiveRole) || 'gamer';
```

`AuthGuard.tsx:45,64` gates routes on that value. So any logged-in user can run
`localStorage.setItem('activeRole','admin')`, reload, and **render the /admin shell**.
All data inside 403s, so no platform data leaks and no admin action succeeds — but this is exactly the "frontend is not the security boundary" violation, and it must be closed. **This is the P0 fix.**

### 8–11. Timezones (root cause of the booking bug)
Booking times are stored as **naive IST wall-clock** values: `bookings.session_date` (DATE) + `start_time`/`end_time` (TIME), no offset. Postgres container runs UTC; the backend process runs UTC (`datetime.now(timezone.utc)`); the browser runs the user's local zone (IST). `owner_service.py` defines `IST = timezone(timedelta(hours=5,minutes=30))` and correctly reinterprets those wall-clock values as IST. **`booking_service.py` does not** — this is the 30-minute-lead-time bug and it is a real correctness defect independent of the midnight rollover.

### 12. Check-in validation
`owner_service.checkin_booking()` validates ownership, café scope, duplicate scans (row-locked, idempotent), and status ∈ {CONFIRMED} — but performs **no time-window check at all**. A booking for tomorrow can be checked in today. Confirmed by reading the code path; matches your report exactly.

### 13. Google Maps
`GoogleLocationPicker.tsx:85` uses `google.maps.places.Autocomplete`. Verified live against the key:
- Maps JavaScript API → loads
- Places API → `REQUEST_DENIED` ("not authorized")
- Geocoding API → `REQUEST_DENIED`
- Browser console → `BillingNotEnabledMapError`

**These are Google Cloud Console settings, not code.** No code change can fix them.

### 14. Café media
`cafes.photos` is a JSON array of URLs. Presigned-PUT direct-to-S3 upload is live and verified end-to-end (`storage_service.py`, `owner.py` presign/delete endpoints, `EditCafeModal.tsx`). Bucket private + public-read policy + CORS for `https://khel-o.online`. **Owner media management already exists** at Owner → Café Settings → Edit Profile → Amenities & Photos (upload, delete, reorder, cover). Videos are **not** supported. Authorization uses `require_cafe_ownership`, so Owner A → Café B is already denied.

### 15–16. Protected routes
Frontend: `AuthGuard` + `layout.tsx` `isPublicPath()` (`/`, `/cafe/*`, `/bookings/new` are public). Backend: FastAPI dependencies per route.

## Global Constraints

- **The backend is the only security boundary.** Never add a frontend check as a substitute for a server check.
- `user_roles` is the sole authorization source of truth. Do not read `users.role` for authorization in new code.
- `admin` must never be self-grantable, and must never appear as a user-selectable role in any UI.
- All booking/session time math is **IST wall-clock** (`Asia/Kolkata`, UTC+05:30). Use the shared `IST` constant; never compare a naive wall-clock value against `datetime.now(timezone.utc)`.
- Server time is authoritative for all validation. Client clocks are untrusted input.
- Do not add `touchstart`/`touchend` handlers alongside `onClick` — risks double-firing payments.
- Every backend fix requires a pytest test. Run the full suite (`python -m pytest tests/ -q`, currently 73 passing) before each commit.
- Verify with direct API calls (`curl`), not UI clicks.
- Prune Docker build cache after each production rebuild; never run `docker system prune` or anything with `--volumes`.

---

# P0 — LAUNCH BLOCKERS

### Task 1: Make `activeRole` unforgeable on the client

**Files:**
- Modify: `frontend/src/store/authStore.ts:133` (hydrate), `:195` (storage event)
- Modify: `frontend/src/components/layout/AuthGuard.tsx:45,64`
- Test: `frontend/src/store/__tests__/authStore.roles.test.ts` (create)

**Interfaces:**
- Produces: `sanitizeActiveRole(saved: string | null, roles: string[] | undefined): UserActiveRole`

- [ ] **Step 1: Write the failing test**

```ts
import { sanitizeActiveRole } from '@/store/authStore';

describe('sanitizeActiveRole', () => {
  it('rejects a forged role the account does not hold', () => {
    expect(sanitizeActiveRole('admin', ['gamer', 'cafe_owner'])).toBe('gamer');
  });
  it('keeps a role the account does hold', () => {
    expect(sanitizeActiveRole('cafe_owner', ['gamer', 'cafe_owner'])).toBe('cafe_owner');
  });
  it('falls back to gamer when roles are unknown', () => {
    expect(sanitizeActiveRole('admin', undefined)).toBe('gamer');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx jest src/store/__tests__/authStore.roles.test.ts`
Expected: FAIL — `sanitizeActiveRole is not a function`.
(If no jest config exists, add one or convert this to a `tsx`-runnable script — do not skip the test.)

- [ ] **Step 3: Implement and export the guard**

```ts
// activeRole is a VIEW-MODE preference persisted in localStorage, which the user
// can edit freely. It is never a permission. Any value not backed by the roles
// the server returned is discarded — otherwise setting
// localStorage.activeRole='admin' would render the admin shell.
export function sanitizeActiveRole(
  saved: string | null,
  roles: string[] | undefined,
): UserActiveRole {
  const allowed = new Set(roles ?? []);
  if (saved && saved !== 'admin' && allowed.has(saved)) return saved as UserActiveRole;
  if (saved === 'admin' && allowed.has('admin')) return 'admin';
  return 'gamer';
}
```

- [ ] **Step 4: Use it at every point `activeRole` enters state**

At `authStore.ts:133` and `:195`, replace the raw `localStorage.getItem('activeRole')` read with
`sanitizeActiveRole(localStorage.getItem('activeRole'), cachedUser?.roles)`.
In `AuthGuard.tsx`, additionally require the active role to be present in `user.roles` before rendering:

```ts
const effectiveRole = sanitizeActiveRole(activeRole, user?.roles);
if (!allowedRoles.includes(effectiveRole as UserRole)) { /* redirect as today */ }
```

- [ ] **Step 5: Run the test and the type/lint gates**

Run: `npx jest src/store/__tests__/authStore.roles.test.ts && npx tsc --noEmit && npx next lint`
Expected: test PASSES; tsc clean; lint shows only the two known pre-existing warnings.

- [ ] **Step 6: Verify the forgery is dead, in a real browser**

In DevTools on a logged-in **owner** account:
```js
localStorage.setItem('activeRole','admin'); location.reload();
```
Expected: redirected away from `/admin`; admin shell never renders.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/store/authStore.ts frontend/src/components/layout/AuthGuard.tsx frontend/src/store/__tests__/authStore.roles.test.ts
git commit -m "fix(security): validate persisted activeRole against server-issued roles"
```

---

### Task 2: Regression-lock the server-side authorization boundary

**Files:**
- Test: `backend/tests/test_privilege_escalation.py` (create)

**Interfaces:**
- Consumes: existing `client`, `owner_token`, `gamer_token`, `admin_token` fixtures from `backend/tests/conftest.py`. Read that file first and reuse its fixture names verbatim.

- [ ] **Step 1: Write the escalation test suite**

```python
import pytest

ADMIN_ROUTES = [
    ("get", "/api/v1/admin/analytics"),
    ("get", "/api/v1/admin/cafes/pending"),
    ("get", "/api/v1/admin/users"),
    ("get", "/api/v1/admin/audit-log"),
]

@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
async def test_owner_cannot_reach_admin_routes(client, owner_token, method, path):
    res = await getattr(client, method)(path, headers={"Authorization": f"Bearer {owner_token}"})
    assert res.status_code == 403

@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
async def test_gamer_cannot_reach_admin_routes(client, gamer_token, method, path):
    res = await getattr(client, method)(path, headers={"Authorization": f"Bearer {gamer_token}"})
    assert res.status_code == 403

async def test_owner_cannot_switch_to_admin(client, owner_token):
    res = await client.post(
        "/api/v1/auth/switch-role",
        json={"targetRole": "admin"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "ROLE_NOT_GRANTED"

async def test_forged_jwt_role_claim_is_ignored(client, owner_token, admin_token):
    """A token whose 'role'/'roles' claims say admin must still be denied:
    authorization reads user_roles from the DB, never the JWT body."""
    import jwt as pyjwt
    from app.config import settings
    payload = pyjwt.decode(owner_token, settings.SECRET_KEY, algorithms=["HS256"])
    payload["role"] = "admin"
    payload["roles"] = ["gamer", "cafe_owner", "admin"]
    payload["active_role"] = "admin"
    forged = pyjwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
    res = await client.get("/api/v1/admin/analytics", headers={"Authorization": f"Bearer {forged}"})
    assert res.status_code == 403

async def test_owner_cannot_manage_another_owners_cafe(client, owner_token, other_cafe_id):
    res = await client.patch(
        f"/api/v1/owner/cafes/{other_cafe_id}/details",
        json={"name": "hijacked"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert res.status_code == 403
```

- [ ] **Step 2: Run it**

Run: `cd backend && python -m pytest tests/test_privilege_escalation.py -v`
Expected: all PASS (they encode behavior the backend already has). **If `test_forged_jwt_role_claim_is_ignored` fails, stop — that is a genuine live vulnerability; fix `deps.py` to read roles only from `user_roles` before continuing.**

- [ ] **Step 3: Run the full suite**

Run: `python -m pytest tests/ -q`
Expected: 73 prior tests + the new ones, all passing.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_privilege_escalation.py
git commit -m "test(security): lock privilege-escalation boundaries for owner/gamer/admin"
```

---

### Task 3: Remove `admin` from the user-selectable role cycle

**Files:**
- Modify: `frontend/src/components/layout/RoleSwitcher.tsx:52-55`

- [ ] **Step 1: Restrict the cycle and relabel**

`admin` must not be reachable by cycling. Admins reach the panel by an explicit, separate entry point.

```ts
// Admin is deliberately NOT in the cycle: it is not a "mode" a user toggles
// into. Accounts that hold it get an explicit, separate Admin entry point.
const cycleOrder: UserActiveRole[] = ['gamer', 'cafe_owner', 'staff'];
const ownedInOrder = cycleOrder.filter((r) => availableRoles.includes(r));
```

Then render a separate `<Link href="/admin">Admin Panel</Link>` chip, shown only when `availableRoles.includes('admin')`.

- [ ] **Step 2: Verify gates**

Run: `npx tsc --noEmit && npx next lint && npx next build`
Expected: all clean.

- [ ] **Step 3: Verify in browser** — owner account shows Gamer/Owner cycle and **no** Admin chip; `uzair@gmail.com` still sees the Admin chip and can reach `/admin`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/RoleSwitcher.tsx
git commit -m "fix(ui): admin is not a cyclable mode; explicit entry point instead"
```

---

# P1 — CRITICAL FUNCTIONALITY

### Task 4: Fix booking lead-time validation across midnight (IST)

**Files:**
- Modify: `backend/app/services/booking_service.py` (the `MIN_LEAD` / start-time check near line 124)
- Test: `backend/tests/test_booking_time_validation.py` (create)

**Interfaces:**
- Produces: `app/core/time.py` → `IST`, `now_ist() -> datetime`, `session_start_ist(session_date, start_time) -> datetime`

- [ ] **Step 1: Write the failing tests (the exact matrix you specified)**

```python
from datetime import date, time, timedelta
from app.core.time import IST, session_start_ist
from app.services.booking_service import validate_lead_time
from app.core.exceptions import ValidationException
import pytest, datetime as dt

D0 = date(2026, 8, 20)   # "today"
D1 = date(2026, 8, 21)   # next day

def at(h, m):  # a fixed "now" in IST
    return dt.datetime(2026, 8, 20, h, m, tzinfo=IST)

@pytest.mark.parametrize("now,sd,st,ok", [
    (at(23, 0),  D0, time(23, 30), True),   # 30 min ahead, same day
    (at(23, 0),  D1, time(0, 0),   True),   # 60 min ahead, crosses midnight
    (at(23, 0),  D1, time(0, 30),  True),   # 90 min ahead, crosses midnight
    (at(23, 45), D1, time(0, 0),   False),  # 15 min ahead -> too soon
    (at(23, 45), D1, time(0, 15),  True),   # 30 min ahead exactly
    (at(23, 59), D1, time(0, 30),  True),   # 31 min ahead, crosses midnight
    (at(10, 0),  D0, time(10, 10), False),  # 10 min ahead -> too soon
])
def test_lead_time_matrix(now, sd, st, ok):
    if ok:
        validate_lead_time(sd, st, now=now)          # must not raise
    else:
        with pytest.raises(ValidationException):
            validate_lead_time(sd, st, now=now)

def test_start_is_interpreted_as_ist_not_utc():
    """23:00 IST on 20 Aug and 00:00 IST on 21 Aug are 60 minutes apart."""
    a = session_start_ist(D0, time(23, 0))
    b = session_start_ist(D1, time(0, 0))
    assert (b - a) == timedelta(minutes=60)
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && python -m pytest tests/test_booking_time_validation.py -v`
Expected: FAIL — `app.core.time` does not exist / `validate_lead_time` not defined.

- [ ] **Step 3: Add the shared time module**

```python
# backend/app/core/time.py
"""KHEL-O is India-only. session_date + start_time/end_time are stored as
naive IST wall-clock values. Comparing them against datetime.now(timezone.utc)
without attaching IST makes every session look 5h30m off — the actual cause of
'must be at least 30 minutes in the future' rejecting a valid midnight slot."""
from datetime import datetime, date, time, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))

def now_ist() -> datetime:
    return datetime.now(IST)

def session_start_ist(session_date: date, start_time: time) -> datetime:
    return datetime.combine(session_date, start_time).replace(tzinfo=IST)
```

- [ ] **Step 4: Implement the validator and call it from booking creation**

```python
MIN_LEAD_MINUTES = 30

def validate_lead_time(session_date, start_time, now: datetime | None = None) -> None:
    """Server time is authoritative — the client clock is untrusted."""
    current = now or now_ist()
    start = session_start_ist(session_date, start_time)
    if start - current < timedelta(minutes=MIN_LEAD_MINUTES):
        raise ValidationException(
            message=f"Booking start time must be at least {MIN_LEAD_MINUTES} minutes in the future",
            error_code="START_TIME_TOO_SOON",
        )
```

Replace the existing inline lead-time check in `booking_service.py` with a call to `validate_lead_time(payload.session_date, payload.start_time)`. Because `session_date` is carried explicitly, a 00:00 slot on the next day is correctly 60 minutes ahead of 23:00 — the old code compared times-of-day only, so `00:00 < 23:00` read as the past.

- [ ] **Step 5: Run tests**

Run: `python -m pytest tests/test_booking_time_validation.py -v && python -m pytest tests/ -q`
Expected: new matrix PASSES; full suite still green.

- [ ] **Step 6: Verify live against production after deploy**

```bash
# ~23:00 IST, book 00:00 next day — must be accepted (HTTP 2xx), not START_TIME_TOO_SOON
curl -s -X POST $API/bookings -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"cafeId":"...","hardwareTierId":"...","sessionDate":"2026-08-21","startTime":"00:00","durationHours":1.5,"seatsCount":1}'
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/core/time.py backend/app/services/booking_service.py backend/tests/test_booking_time_validation.py
git commit -m "fix(booking): interpret session times as IST so midnight-crossing slots validate correctly"
```

---

### Task 5: Enforce a server-side check-in window

**Files:**
- Modify: `backend/app/services/owner_service.py` (`checkin_booking`, ~line 215)
- Test: `backend/tests/test_checkin_window.py` (create)

**Business rule (derived from existing code, not invented):** `auto_transition_booking` already treats a session as live between `session_start` and `session_end`. Check-in is therefore allowed from **15 minutes before `session_start`** until `session_end`. 15 min matches the existing early-arrival grace and the 30-min booking lead time.

- [ ] **Step 1: Write the failing tests**

```python
import pytest
from datetime import timedelta
from app.core.time import IST, session_start_ist
from app.core.exceptions import ValidationException

async def test_cannot_checkin_before_window(owner_service, tomorrow_booking):
    with pytest.raises(ValidationException) as e:
        await owner_service.checkin_booking(tomorrow_booking.id, owner_user)
    assert e.value.error_code == "CHECKIN_TOO_EARLY"

async def test_can_checkin_15_min_before_start(owner_service, booking_starting_in_10_min):
    res = await owner_service.checkin_booking(booking_starting_in_10_min.id, owner_user)
    assert res.status == "checked_in"

async def test_cannot_checkin_after_session_ended(owner_service, yesterday_booking):
    with pytest.raises(ValidationException) as e:
        await owner_service.checkin_booking(yesterday_booking.id, owner_user)
    assert e.value.error_code == "CHECKIN_WINDOW_CLOSED"

async def test_cancelled_booking_cannot_checkin(owner_service, cancelled_booking):
    with pytest.raises(ValidationException):
        await owner_service.checkin_booking(cancelled_booking.id, owner_user)
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && python -m pytest tests/test_checkin_window.py -v`
Expected: FAIL — early check-in currently succeeds.

- [ ] **Step 3: Implement the window check**

Insert into `checkin_booking` **after** the existing ownership/café/status checks and **after** the idempotent already-CHECKED_IN early return (so a duplicate scan of a live session still returns cleanly):

```python
from app.core.time import now_ist, session_start_ist

CHECKIN_EARLY_GRACE_MINUTES = 15

start = session_start_ist(booking.session_date, booking.start_time)
end = session_start_ist(booking.session_date, booking.end_time)
if end <= start:                      # overnight session (e.g. 23:00 -> 01:00)
    end += timedelta(days=1)

current = now_ist()
if current < start - timedelta(minutes=CHECKIN_EARLY_GRACE_MINUTES):
    raise ValidationException(
        message=f"This session starts at {start.strftime('%d %b, %I:%M %p')}. "
                f"Check-in opens {CHECKIN_EARLY_GRACE_MINUTES} minutes before.",
        error_code="CHECKIN_TOO_EARLY",
    )
if current > end:
    raise ValidationException(
        message="This session has already ended.",
        error_code="CHECKIN_WINDOW_CLOSED",
    )
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_checkin_window.py -v && python -m pytest tests/ -q`
Expected: all PASS.

- [ ] **Step 5: Surface the message in the scanner UI**

In `frontend/src/app/(owner)/owner/scanner/page.tsx`, render the backend's `error.message` for `CHECKIN_TOO_EARLY` / `CHECKIN_WINDOW_CLOSED` in the existing failure banner. Do **not** add a frontend-side time check — the backend is the boundary; the UI only explains it.

- [ ] **Step 6: Verify live via API, not the UI**

```bash
# A booking dated tomorrow must be refused today:
curl -s -X POST $API/owner/bookings/$FUTURE_BOOKING_ID/checkin -H "Authorization: Bearer $OWNER_TOK"
# expect: CHECKIN_TOO_EARLY
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/owner_service.py backend/tests/test_checkin_window.py "frontend/src/app/(owner)/owner/scanner/page.tsx"
git commit -m "fix(checkin): reject check-in outside the session window server-side"
```

---

### Task 6: Replace the generic error with a real "Login required" prompt

**Files:**
- Create: `frontend/src/components/auth/LoginRequiredDialog.tsx`
- Modify: `frontend/src/app/(customer)/bookings/new/page.tsx:302-306`

**Interfaces:**
- Produces: `<LoginRequiredDialog isOpen onCancel onLogin title description />`

**Note:** the black screen itself was already root-caused and fixed (stale JS chunk after deploy → `ChunkLoadError`, now auto-recovered in `global-error.tsx`). This task fixes the *underlying UX*: an unauthenticated `Continue to Payment` currently hard-redirects with no explanation.

- [ ] **Step 1: Build the dialog** using the existing `Modal` + `Button` primitives from `@/components/ui` — copy: **"Login required"** / *"Please log in to continue with your booking. We'll bring you right back to this slot."* Buttons: **Log in** (primary), **Cancel** (ghost).

- [ ] **Step 2: Replace the silent redirect**

```ts
if (!isAuthenticated) {
  setShowLoginPrompt(true);   // instead of router.push(...) with no explanation
  return;
}
```

On **Log in**, push `/login?redirect=${encodeURIComponent(`${pathname}?${searchParams.toString()}`)}` — the URL already mirrors date/tier/time/seats, so intent is preserved (this round-trip already exists and works).

- [ ] **Step 3: Audit every other protected action** for the same pattern:
`frontend/src/app/(customer)/cafe/[id]/page.tsx` (review submit, share), `rewards/page.tsx` (claim voucher). Each must show the dialog rather than redirecting silently or throwing.

- [ ] **Step 4: Verify gates**

Run: `npx tsc --noEmit && npx next lint && npx next build`

- [ ] **Step 5: Verify in a logged-out browser** — Continue to Payment shows the dialog; logging in returns to the *same* slot with date/tier/time/seats intact.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/auth/LoginRequiredDialog.tsx "frontend/src/app/(customer)/bookings/new/page.tsx"
git commit -m "feat(auth): explain login requirement instead of silently redirecting"
```

---

### Task 7: Diagnose the iPhone double-tap properly (do not guess again)

**Files:**
- Create: `frontend/src/app/debug/tap/page.tsx` (temporary diagnostic route)
- Then modify whichever file the evidence implicates.

**Why a diagnostic first:** this bug has now been misdiagnosed **three times** (nav z-index → Framer Motion `whileTap` → missing `touch-action`). `touch-action: manipulation` is deployed and it still reproduces on Chrome **and** Brave on iOS — which rules out a Safari-only 300ms delay, because all iOS browsers share WKWebView. Stop patching; instrument.

- [ ] **Step 1: Build the instrumented page**

Render a button styled exactly like the real CTA (same classes, same sticky container, same `z-overlay`) and log **every** event with timestamps:

```tsx
const log = (e: string) => setEvents((p) => [...p, `${e} @${Date.now() % 100000}`]);
<button
  onPointerDown={() => log('pointerdown')} onPointerUp={() => log('pointerup')}
  onTouchStart={() => log('touchstart')} onTouchEnd={() => log('touchend')}
  onClick={() => log('CLICK')}
>Test CTA</button>
```

Also render `document.elementFromPoint(x, y)` for the button's own centre — this is what catches an invisible overlay stealing tap #1.

- [ ] **Step 2: Deploy and test on the real iPhone** (Chrome + Brave + Safari). Record which events fire on tap #1.

- [ ] **Step 3: Read the evidence — the fix follows from which pattern appears**

| Observed on tap #1 | Root cause | Fix |
|---|---|---|
| No events at all | An overlay is eating it | Fix the overlay found via `elementFromPoint`; add `pointer-events:none` to decorative layers |
| `pointerdown` + `pointerup`, no `CLICK` | Element moved/re-rendered mid-gesture | Stop the 3s `refetchInterval` re-render from remounting the CTA subtree |
| All events fire but handler no-ops | State guard (`isProcessing`/hydration) | Fix the guard |
| `CLICK` fires but nothing happens | Async handler swallowing an error | Surface the error |

- [ ] **Step 4: Apply exactly one fix** matching the evidence. Do **not** add `onTouchStart` alongside `onClick` — that double-fires payments.

- [ ] **Step 5: Re-verify on the real device** — one tap, one action, on all three browsers.

- [ ] **Step 6: Delete the diagnostic route and commit**

```bash
git rm -r frontend/src/app/debug
git commit -m "fix(mobile): <root cause from evidence> — single tap now fires once"
```

---

# P2 — IMPORTANT UX

### Task 8: Google Maps — configuration is the blocker, not code

**This task requires Google Cloud Console access and cannot be completed from the codebase.**

- [ ] **Step 1: Confirm the current failure** (already verified 2026-08-20, re-confirm before changing code):

```bash
curl -s "https://maps.googleapis.com/maps/api/place/autocomplete/json?input=Bengaluru&key=$KEY" | head -c 300
curl -s "https://maps.googleapis.com/maps/api/geocode/json?address=Bengaluru&key=$KEY" | head -c 300
```
Both currently return `REQUEST_DENIED`; the browser also reports `BillingNotEnabledMapError`.

- [ ] **Step 2: Owner action in Google Cloud Console** (hand these steps to the key's owner):
  1. **Billing → link a billing account** to the project (this alone fixes `BillingNotEnabledMapError`).
  2. **APIs & Services → Enable**: Maps JavaScript API, **Places API**, **Geocoding API**.
  3. **Credentials → the key → API restrictions**: allow exactly those three.
  4. **Application restrictions → HTTP referrers**: `https://khel-o.online/*` and `http://localhost:3000/*`.

- [ ] **Step 3: Re-run Step 1.** Expected `"status": "OK"`. **Do not proceed to Task 9 until this passes** — autocomplete cannot work without it.

- [ ] **Step 4: Only then, verify autocomplete in the browser** on the café Location tab.

---

### Task 9: Structured location capture via Places (blocked on Task 8)

**Files:**
- Modify: `frontend/src/components/maps/GoogleLocationPicker.tsx:85`
- Modify: `frontend/src/components/owner/EditCafeModal.tsx` (Location tab)

- [ ] **Step 1: Extract structured fields from the Place result** instead of only lat/lng — map `address_components` to `city` (`locality`), `state` (`administrative_area_level_1`), `pincode` (`postal_code`), `country`, plus `formatted_address` and `geometry.location`.

- [ ] **Step 2: Auto-populate** the city/state/pincode/address inputs from the selection so the owner never retypes them; keep them editable for corrections.

- [ ] **Step 3: Handle failure paths** — no results, API error, offline: fall back to the existing manual fields with an inline notice. Never leave the form unusable.

- [ ] **Step 4: Verify gates + browser**, then commit.

```bash
git commit -m "feat(location): populate city/state/pincode/coords from Places selection"
```

---

### Task 10: Split the new-user landing from owner onboarding

**Files:**
- Modify: `frontend/src/app/(customer)/page.tsx`, `frontend/src/app/(customer)/partner/page.tsx`

**Finding:** the customer home already leads with café discovery, and Profile carries a single "Own a Gaming Café? → Become Partner" card. The reported "app immediately asks for business info" comes from `/owner/onboarding` being reachable **before** the user understands the product.

- [ ] **Step 1: Gate the owner path behind an explanatory `/partner` page** — what KHEL-O does for café owners, what's required, how long approval takes — with a single **Become a Partner** CTA into onboarding. No business fields on this page.
- [ ] **Step 2: Ensure a brand-new gamer never sees owner prompts** in the primary flow (Explore → Café → Slots → Book → login only at payment).
- [ ] **Step 3: Verify** as a fresh logged-out user, then commit.

---

### Task 11: Progressive café onboarding

**Files:**
- Modify: `frontend/src/app/(owner)/owner/onboarding/page.tsx`
- Modify: `backend/app/api/v1/owner.py` (accept partial drafts)

**Note:** `cafes.draft_data` (JSON) already exists and is unused — use it to persist partial progress rather than adding a column.

- [ ] **Step 1: Split the single form into the six stages** from the brief (Account → Basics → Location → Profile/media → Operations → Verification), one screen at a time, with a progress indicator.
- [ ] **Step 2: Require only Stages 1–3 to create a listing in `draft` status**; Stages 4–6 become resumable tasks on the dashboard.
- [ ] **Step 3: Add a one-line "why we ask"** under each sensitive field (PAN, GSTIN, bank).
- [ ] **Step 4: Persist partial state to `draft_data`** so a half-finished owner can resume.
- [ ] **Step 5: Verify gates + a full onboarding run**, then commit.

---

### Task 12: Café media — verify, then close the real gaps

**Finding:** photo management (upload/delete/reorder/cover, presigned S3, per-café authorization) **already exists and was verified live**. Do not rebuild it. Only these gaps are real:

- [ ] **Step 1: Add a dedicated "Media" section** in Owner → Café Settings so media isn't buried inside "Amenities & Photos".
- [ ] **Step 2: Decide on video** — S3 already accepts only `image/jpeg|png|webp` (`storage_service.py:ALLOWED_CONTENT_TYPES`). Video needs a size/duration policy and a player; if in scope, extend `ALLOWED_CONTENT_TYPES` + the `<img>` renderer, otherwise state explicitly that video is out of scope for launch.
- [ ] **Step 3: Add the authorization regression test** (Owner A → Café B media = 403) to `test_privilege_escalation.py`.
- [ ] **Step 4: Verify + commit.**

---

# P3 — POLISH

### Task 13: Role-switching terminology
- [ ] Relabel the cycle chip to name the destination ("Switch to Owner Portal"), never implying a user can acquire a role by clicking.
- [ ] On the Profile page, present **"Become a Café Owner"** as an *application*, visibly distinct from switching between modes the account already holds.
- [ ] Verify + commit.

### Task 14: Error messages & loading states
- [ ] Replace remaining generic failure copy with the backend's `error.message` where one exists.
- [ ] Add loading/disabled states to any action that fires a network call without feedback.
- [ ] Verify + commit.

### Task 15: Deploy and verify the whole matrix on production
- [ ] Deploy: `git pull && docker compose -f docker-compose.prod.yml build backend frontend && ... up -d backend frontend`, then `docker builder prune -af && docker image prune -f`. **Never** `docker system prune` or `--volumes`.
- [ ] Re-run the P0 API probes against production and confirm: owner→admin API = 403, owner→switch-role admin = `ROLE_NOT_GRANTED`, forged `localStorage.activeRole` = no admin shell.
- [ ] Re-run the booking midnight matrix against production.
- [ ] Re-run the check-in matrix (future / active / ended / cancelled / wrong café / wrong customer) against production.
- [ ] Re-test single-tap on a real iPhone in Chrome, Brave and Safari.
- [ ] Report exactly what changed and what was verified — with command output, not claims.

---

## Verification Ledger — fill in with real evidence before declaring done

| Check | Command / method | Expected | Result |
|---|---|---|---|
| Owner → admin API | `curl /admin/analytics` as owner | 403 | ✅ verified 2026-08-20 |
| Owner → switch-role admin | `curl /auth/switch-role` | ROLE_NOT_GRANTED | ✅ verified 2026-08-20 |
| All admin routes guarded | enumerate `admin.py` | 31/31 `require_admin` | ✅ verified 2026-08-20 |
| No owner holds admin | `select … from user_roles` | none | ✅ verified 2026-08-20 |
| Forged `activeRole` | DevTools + reload | admin shell must not render | ☐ after Task 1 |
| Forged JWT role claim | `test_forged_jwt_role_claim_is_ignored` | 403 | ☐ after Task 2 |
| 23:00 → 00:00 booking | live POST /bookings | accepted | ☐ after Task 4 |
| Future check-in | live POST checkin | CHECKIN_TOO_EARLY | ☐ after Task 5 |
| Single tap, 3 iOS browsers | real device | one tap = one action | ☐ after Task 7 |
| Places autocomplete | `curl` autocomplete | status OK | ☐ blocked on Task 8 |
