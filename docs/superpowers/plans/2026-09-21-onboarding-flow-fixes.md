# Owner Onboarding Flow Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Step 1 location search (State → City/Town/Locality → PIN), add real backend PIN validation, fix Step 5's gaming-config messaging for physical-only cafés, wire real photo/menu upload into onboarding, make admin review show everything an owner submitted, and make Step 6 a real, editable review screen — all by reusing existing infrastructure (the `locations` table, the S3 presign endpoints, `AdminCafeDetailResponse`, the flat `step` state), with zero new geo/maps dependency and zero new architecture.

**Architecture:** No new subsystems. `locations` table gets seeded (still flat `name/state/district/pincode`, no new "type" column — a locality is just a row like any other). Onboarding's draft-save already creates a real `Cafe` row (`verification_status=DRAFT`) on the first "Next" click — the plan captures the `cafeId` it already returns and reuses the *existing* cafe-scoped photo presign endpoints during onboarding instead of building a separate draft-upload path. Admin already receives the full `AdminCafeDetailResponse` — most admin gaps are the modal simply not rendering fields it already has. Step 6 already reads live `formData` — "Edit → Step N" is just `setStep(N)`.

**Tech Stack:** Next.js/React (frontend), FastAPI/SQLAlchemy/Pydantic (backend, async), Postgres, Playwright (frontend e2e), pytest (backend).

**Spec:** This plan implements the user's onboarding-flow-fix request from 2026-09-21 (chat spec, not a separate doc) plus the audit findings below. The spec's own text is the requirements source; this plan is the audit + implementation of it.

## Audit Findings (context every task assumes)

- `frontend/src/app/(owner)/owner/onboarding/page.tsx` (~1320 lines) is the entire onboarding wizard, steps 1–6, single `useState<OnboardingState>` (`formData`, line 114) and single `useState<number>` (`step`, line 113).
- **Location:** No State-first step exists. `LocationSearchInput` (`frontend/src/components/ui/LocationSearchInput.tsx`) is a free-text city/town search with no state scoping wired in, even though the backend already supports a `state` query param (`backend/app/api/v1/locations.py:60,69-70`). The `locations` table (`backend/app/models/location.py`, migration `041_add_locations.py`) is flat (`id, name, name_norm, state, district, pincode`) and starts **empty** — there is no seed script anywhere. "Secunderabad"/"Nampally" fail because no row exists for them, not because of a city-vs-locality filter (there is no such filter — any row matches). Fix = seed data + state-scoping wiring, not a new schema.
- **PIN:** Frontend already validates `/^\d{6}$/` and preserves the value on failure (`page.tsx:253`). Backend has **no validation at all** — `OnboardingSubmitRequest.pincode` (`backend/app/api/v1/owner.py:136`) is `Field(..., max_length=10)` with no regex/digit check, and `app/constants.py` has `validate_city`/`validate_state` but no `validate_pincode`.
- **Phone:** Audited — **not a bug**. `Cafe.phone_number` (`backend/app/models/cafe.py:38`) is a distinct column from `User.phone_number`. `submit_onboarding_application` always writes Business Verification phone into `cafe.phone_number` only; it reads `current_user.phone_number` only as a fallback default, never assigns to it. No fix needed; no task in this plan for it.
- **Step 5:** Activities are already properly typed (`hardwareTiers[].tierType: 'activity' | gaming`, `.platform`), and the gaming-config block is already filtered to `relevantGamingPlatforms` (`page.tsx:600-604,1108`). The real bug is the message shown when that list is empty (`page.tsx:1099-1106`) — it nudges a physical-only owner ("Snooker/Pool/Air Hockey only") to go add gaming hardware they don't have.
- **Photos:** `formData.photos` defaults to a hardcoded Unsplash stock-photo URL (`page.tsx:102`) and there is no `menuPhotos` field in `OnboardingState` at all. Step 5's photo/menu sections (`page.tsx:1173-1210`) are static text explaining uploads happen "after the café is created" / "after approval" — there is genuinely no upload UI in onboarding. However, real cafe-scoped S3 presign infrastructure already exists and works (`POST /owner/cafes/{cafe_id}/photos/presign` at `owner.py:2460`, `POST /owner/cafes/{cafe_id}/menu-photos/presign` at `owner.py:2513`, backed by `app.services.storage_service.create_presigned_upload`), gated only by `require_cafe_ownership` (`backend/app/api/deps.py:109` — ownership only, **no** verification-status check). Crucially, `save_onboarding_draft` (`owner.py:671-718`) **already creates a real `Cafe` row** (`verification_status=VerificationStatus.DRAFT`) the first time the owner clicks "Next" past Step 1, and already returns `{"cafeId": str(cafe.id)}` — the frontend just discards it today. So a real `cafe_id` exists from early in onboarding; the presign endpoints can be reused as-is. `OnboardingSubmitRequest` also has no `menu_photos` field, so even once uploaded, menu photos can't reach `submit_onboarding_application` yet.
- **Admin:** `AdminCafeDetailResponse` (`backend/app/services/cafe_service.py:205-219`, `backend/app/schemas/admin.py:40-60`) is **not** filtered — it already includes PAN/GSTIN/legal doc, bank/UPI (masked), tiers with pricing/seats/platform/activityKind, `photos`, `menu_photos`, `supported_games`, house rules, social links, owner. The verification-queue modal (`frontend/src/app/(admin)/admin/verification-queue/page.tsx:388-507`) just never renders `state`, `googleMapsUrl`, `description`, `openingTime`/`closingTime`, even though they're present on `selectedCafe`. The one genuine backend gap: individual-vs-pooled tracking. `individual_units` (submit-time flag, `owner.py:122-124`) causes `HardwareUnit` child rows to be synced per seat (`hardware_tier_service.py:118-121`, `unit_repo.sync_units_to_quantity`) but that signal is never read back onto `HardwareTierResponse` — it needs a computed field, not a new column (the data already exists as "does this tier have `HardwareUnit` rows").
- **Step 6:** Exists ("Policies & Review", `page.tsx:1214-1282`) but its "Submission Summary" shows only 5 fields (name, city+state, resource count, game count, UPI). No per-section Edit buttons exist anywhere in the file. The step-state architecture already supports jump-to-step trivially — `step` is a plain `useState<number>`, `setStep(1..6)` works directly, and `formData` is one shared object read live (no snapshot/staleness risk).
- **Adjacent finding, explicitly out of scope — flag only, do not fix here:** `frontend/src/constants/cities.ts` has a *second*, older, hardcoded `CITIES_BY_STATE`/`SUPPORTED_CITIES` list still used by the customer-facing Explore city filter (`frontend/src/components/customer/ExploreClient.tsx:14,48,338,554`). A café onboarded with a locality name (e.g. "Nampally") that isn't in that static list will still show under "All Cities" on Explore but won't be selectable via the specific city filter — this is pre-existing, documented behavior (`cities.ts:1-7` comment), not something this plan touches, since the spec scopes this work to onboarding + admin review, not customer discovery. Reported to the user as a known consequence, not silently left as a surprise.

## Global Constraints

- Do NOT add a new geographic hierarchy, "locality" type/table, or any Google Maps/Places dependency. Reuse the existing flat `locations` table exactly as shaped.
- Do NOT build a new/parallel photo-upload system. Reuse the existing cafe-scoped S3 presign endpoints.
- Do NOT touch `frontend/src/constants/cities.ts` / `ExploreClient.tsx` (customer discovery) — out of scope, flagged above only.
- Do NOT change `Cafe.phone_number` / `User.phone_number` semantics — audited as already correct.
- Every backend validation change needs a matching pytest; every frontend behavior change needs a Playwright test or is manually verified and noted as such.
- Preserve the existing manually-created-location path (`POST /locations` get-or-create, `locations.py:80-128`) — seeding must insert through the same table/shape and respect the `(name_norm, state)` unique constraint so it can't collide with owner-created rows.

---

## Task 1: Backend — PIN code validation

**Files:**
- Modify: `backend/app/constants.py` (add `validate_pincode`, near `validate_city` at line 5)
- Modify: `backend/app/api/v1/owner.py` (`OnboardingSubmitRequest.pincode` field validator, near line 136-148)
- Test: `backend/tests/test_owner_onboarding.py` (create if it doesn't already cover this; otherwise add to existing onboarding submit test file — check `backend/tests/` for the right existing file first with `grep -rl "submit_onboarding\|/onboarding/submit" backend/tests/`)

**Interfaces:**
- Produces: `validate_pincode(pincode: str) -> str` in `app/constants.py`, raising `ValueError` on anything that isn't exactly 6 digits.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_owner_onboarding.py (add to whichever file already builds
# a valid OnboardingSubmitRequest payload for /owner/onboarding/submit — reuse
# that fixture/helper rather than duplicating the whole payload here)

import pytest

@pytest.mark.parametrize("bad_pincode", ["12345", "1234567", "ABCDEF", "560 01", "56000!", ""])
async def test_submit_onboarding_rejects_invalid_pincode(
    async_client, owner_auth_headers, valid_onboarding_payload, bad_pincode
):
    payload = {**valid_onboarding_payload, "pincode": bad_pincode}
    resp = await async_client.post("/owner/onboarding/submit", json=payload, headers=owner_auth_headers)
    assert resp.status_code == 422


async def test_submit_onboarding_accepts_valid_6_digit_pincode(
    async_client, owner_auth_headers, valid_onboarding_payload
):
    payload = {**valid_onboarding_payload, "pincode": "560001"}
    resp = await async_client.post("/owner/onboarding/submit", json=payload, headers=owner_auth_headers)
    assert resp.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_owner_onboarding.py -k invalid_pincode -v`
Expected: FAIL — invalid pincodes currently return 200, not 422 (no backend validation exists yet).

- [ ] **Step 3: Add `validate_pincode` to constants.py**

```python
# backend/app/constants.py, placed right after validate_city (line ~11)

def validate_pincode(pincode: str) -> str:
    """Reject anything that isn't exactly 6 numeric digits. Use as a Pydantic
    field_validator on any schema field that sets Cafe.pincode."""
    cleaned = pincode.strip()
    if not re.match(r"^\d{6}$", cleaned):
        raise ValueError("Pincode must be exactly 6 digits.")
    return cleaned
```

Check `app/constants.py`'s top-of-file imports — add `import re` there if it isn't already imported (`validate_google_maps_url` in the same file likely already uses `re`; reuse that import, don't add a duplicate).

- [ ] **Step 4: Wire it into `OnboardingSubmitRequest`**

In `backend/app/api/v1/owner.py`, add `validate_pincode` to the existing import line (`from app.constants import validate_city, validate_google_maps_url, PHOTO_CATEGORIES` → add `validate_pincode`), then add a validator next to `_validate_city` (~line 145-148):

```python
    @field_validator("pincode")
    @classmethod
    def _validate_pincode(cls, v: str) -> str:
        return validate_pincode(v)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_owner_onboarding.py -k pincode -v`
Expected: PASS — all 6 invalid cases 422, valid case 200.

- [ ] **Step 6: Commit**

```bash
git add backend/app/constants.py backend/app/api/v1/owner.py backend/tests/test_owner_onboarding.py
git commit -m "fix: enforce 6-digit numeric pincode on onboarding submit"
```

---

## Task 2: Backend — seed common cities/towns/localities into `locations`

**Files:**
- Create: `backend/scripts/seed_locations.py`
- Create: `backend/scripts/data/locations_seed.json`
- Test: `backend/tests/test_seed_locations.py`

**Interfaces:**
- Produces: a standalone script `python -m backend.scripts.seed_locations` (or `python backend/scripts/seed_locations.py`, matching whatever convention other scripts in `backend/scripts/` already use — check `backend/scripts/*.py` for the existing DB-session bootstrap pattern and copy it exactly rather than inventing a new one) that inserts every entry from `locations_seed.json` using the exact same get-or-create shape as `POST /locations` (`locations.py:80-128`): normalize via `normalize_location_name`, dedupe on `(name_norm, state)`, skip rows that already exist.

This is a **bounded, curated seed** — state capitals + major metros for all 36 states/UTs (reuse the names already in `frontend/src/constants/cities.ts`'s `CITIES_BY_STATE` as the base list, since that's already a vetted "real Indian city" list in this codebase) **plus** a short list of well-known localities/twin-cities that are not independent cities, so search actually finds them: at minimum `Secunderabad` (Telangana, twin city of Hyderabad), `Nampally` (Telangana, locality within Hyderabad), `Gachibowli`, `Kukatpally`, `Madhapur` (Telangana, Hyderabad localities), `New Town` (West Bengal, Kolkata locality), `Andheri`, `Bandra`, `Powai` (Maharashtra, Mumbai localities), `Koramangala`, `Indiranagar`, `Whitefield` (Karnataka, Bengaluru localities), `Gomti Nagar` (Uttar Pradesh, Lucknow locality), `Salt Lake` (West Bengal, Kolkata locality). This is not "arbitrary hardcoded cities" — it's directly the missing data the spec calls out (Secunderabad, Nampally) plus the same class of well-known locality the spec says must work, kept small and reviewable rather than an exhaustive geo import.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_seed_locations.py
import pytest
from sqlalchemy import select
from app.models.location import Location
from backend.scripts.seed_locations import seed_locations, load_seed_data

async def test_seed_locations_inserts_expected_rows(db_session):
    data = load_seed_data()
    await seed_locations(db_session, data)

    stmt = select(Location).where(Location.name_norm == "secunderabad")
    res = await db_session.execute(stmt)
    row = res.scalars().first()
    assert row is not None
    assert row.state == "Telangana"

    stmt = select(Location).where(Location.name_norm == "nampally")
    res = await db_session.execute(stmt)
    row = res.scalars().first()
    assert row is not None
    assert row.state == "Telangana"


async def test_seed_locations_is_idempotent(db_session):
    data = load_seed_data()
    await seed_locations(db_session, data)
    count_stmt = select(Location)
    first_count = len((await db_session.execute(count_stmt)).scalars().all())

    await seed_locations(db_session, data)  # run again
    second_count = len((await db_session.execute(count_stmt)).scalars().all())

    assert first_count == second_count  # no duplicates
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_seed_locations.py -v`
Expected: FAIL — `backend.scripts.seed_locations` doesn't exist yet (ImportError).

- [ ] **Step 3: Write `locations_seed.json`**

```json
[
  {"name": "Mumbai", "state": "Maharashtra"},
  {"name": "Pune", "state": "Maharashtra"},
  {"name": "Nagpur", "state": "Maharashtra"},
  {"name": "Thane", "state": "Maharashtra"},
  {"name": "Andheri", "state": "Maharashtra"},
  {"name": "Bandra", "state": "Maharashtra"},
  {"name": "Powai", "state": "Maharashtra"},
  {"name": "Bengaluru", "state": "Karnataka"},
  {"name": "Mysuru", "state": "Karnataka"},
  {"name": "Koramangala", "state": "Karnataka"},
  {"name": "Indiranagar", "state": "Karnataka"},
  {"name": "Whitefield", "state": "Karnataka"},
  {"name": "Hyderabad", "state": "Telangana"},
  {"name": "Secunderabad", "state": "Telangana"},
  {"name": "Nampally", "state": "Telangana"},
  {"name": "Gachibowli", "state": "Telangana"},
  {"name": "Kukatpally", "state": "Telangana"},
  {"name": "Madhapur", "state": "Telangana"},
  {"name": "Warangal", "state": "Telangana"},
  {"name": "Chennai", "state": "Tamil Nadu"},
  {"name": "Coimbatore", "state": "Tamil Nadu"},
  {"name": "Madurai", "state": "Tamil Nadu"},
  {"name": "Kolkata", "state": "West Bengal"},
  {"name": "Howrah", "state": "West Bengal"},
  {"name": "Salt Lake", "state": "West Bengal"},
  {"name": "New Town", "state": "West Bengal"},
  {"name": "Delhi", "state": "Delhi"},
  {"name": "Gurugram", "state": "Haryana"},
  {"name": "Faridabad", "state": "Haryana"},
  {"name": "Noida", "state": "Uttar Pradesh"},
  {"name": "Ghaziabad", "state": "Uttar Pradesh"},
  {"name": "Lucknow", "state": "Uttar Pradesh"},
  {"name": "Gomti Nagar", "state": "Uttar Pradesh"},
  {"name": "Kanpur", "state": "Uttar Pradesh"},
  {"name": "Agra", "state": "Uttar Pradesh"},
  {"name": "Varanasi", "state": "Uttar Pradesh"},
  {"name": "Ahmedabad", "state": "Gujarat"},
  {"name": "Surat", "state": "Gujarat"},
  {"name": "Vadodara", "state": "Gujarat"},
  {"name": "Jaipur", "state": "Rajasthan"},
  {"name": "Jodhpur", "state": "Rajasthan"},
  {"name": "Udaipur", "state": "Rajasthan"},
  {"name": "Bhopal", "state": "Madhya Pradesh"},
  {"name": "Indore", "state": "Madhya Pradesh"},
  {"name": "Chandigarh", "state": "Chandigarh"},
  {"name": "Ludhiana", "state": "Punjab"},
  {"name": "Amritsar", "state": "Punjab"},
  {"name": "Patna", "state": "Bihar"},
  {"name": "Ranchi", "state": "Jharkhand"},
  {"name": "Bhubaneswar", "state": "Odisha"},
  {"name": "Guwahati", "state": "Assam"},
  {"name": "Kochi", "state": "Kerala"},
  {"name": "Thiruvananthapuram", "state": "Kerala"},
  {"name": "Raipur", "state": "Chhattisgarh"},
  {"name": "Dehradun", "state": "Uttarakhand"},
  {"name": "Shimla", "state": "Himachal Pradesh"},
  {"name": "Srinagar", "state": "Jammu and Kashmir"},
  {"name": "Jammu", "state": "Jammu and Kashmir"},
  {"name": "Panaji", "state": "Goa"}
]
```

(Every `state` value here must be one of the exact 36 strings `app.constants._INDIAN_STATES_LOWER`/`validate_state` accepts — copy from `frontend/src/constants/states.ts`'s `INDIAN_STATES` list, which already mirrors it, to avoid typos causing a `validate_state` rejection at seed time.)

- [ ] **Step 4: Write `seed_locations.py`**

```python
# backend/scripts/seed_locations.py
import asyncio
import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.location import Location, normalize_location_name
from app.constants import validate_state

SEED_FILE = Path(__file__).parent / "data" / "locations_seed.json"


def load_seed_data() -> list[dict]:
    with open(SEED_FILE, encoding="utf-8") as f:
        return json.load(f)


async def seed_locations(db: AsyncSession, entries: list[dict]) -> int:
    """Insert each entry using the same get-or-create shape as POST
    /locations (see app/api/v1/locations.py) — skips anything that already
    exists on (name_norm, state), so this is safe to re-run and safe to run
    against a table that already has owner-created rows."""
    inserted = 0
    for entry in entries:
        name = entry["name"].strip()
        state = validate_state(entry["state"])
        name_norm = normalize_location_name(name)

        stmt = select(Location).where(Location.name_norm == name_norm, Location.state == state)
        existing = (await db.execute(stmt)).scalars().first()
        if existing:
            continue

        db.add(Location(name=name, name_norm=name_norm, state=state, district=entry.get("district")))
        inserted += 1

    await db.commit()
    return inserted


async def main():
    # Match whatever session-bootstrap pattern the other scripts in
    # backend/scripts/ already use (check e.g. backend/scripts/*.py for the
    # existing `async_session_maker`/engine setup) instead of duplicating it
    # here — swap this import for that project's actual helper.
    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        count = await seed_locations(db, load_seed_data())
        print(f"Seeded {count} new locations.")


if __name__ == "__main__":
    asyncio.run(main())
```

Check `backend/app/database.py` for the actual session-factory name before finalizing this import (it may be `AsyncSessionLocal`, `async_session_maker`, or similar) — match the existing convention exactly.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_seed_locations.py -v`
Expected: PASS.

- [ ] **Step 6: Run the seed script against the real dev/staging DB**

Run: `cd backend && python scripts/seed_locations.py`
Expected output: `Seeded N new locations.` — confirm via `psql`/DB client that a search for "Secunderabad" and "Nampally" now returns rows.

- [ ] **Step 7: Commit**

```bash
git add backend/scripts/seed_locations.py backend/scripts/data/locations_seed.json backend/tests/test_seed_locations.py
git commit -m "feat: seed common Indian cities, towns and localities into the locations table"
```

---

## Task 3: Frontend — State-first location flow (State → City/Town/Locality → PIN)

**Files:**
- Modify: `frontend/src/components/ui/LocationSearchInput.tsx`
- Modify: `frontend/src/app/(owner)/owner/onboarding/page.tsx` (Step 1 JSX, ~line 690-762, and `OnboardingState`/`INITIAL_STATE`)
- Test: `frontend/e2e/onboarding-location.spec.ts` (new) or add to whatever existing onboarding Playwright spec covers Step 1 (`grep -rl "onboarding" frontend/e2e/` first)

**Interfaces:**
- Consumes: `searchLocations(query, state?)` from `frontend/src/lib/api/locations.ts` — check its current signature; Task 3 requires it to accept an optional second `state` argument that appends `?state=` to the request (the backend endpoint already supports this param, per `locations.py:60`).
- Produces: `LocationSearchInput` gains a required `state: string` prop (the already-chosen state) and no longer renders its own state `<select>` for search scoping — state selection moves one level up, to a new dedicated control the wizard renders before `LocationSearchInput`.

- [ ] **Step 1: Add a `state` field lock and a State selector to Step 1's JSX**

In `frontend/src/app/(owner)/owner/onboarding/page.tsx`, immediately before the existing `<LocationSearchInput .../>` block (~line 729), add:

```tsx
<div className="flex flex-col gap-1.5">
  <label className="text-h4 text-text-primary">State / UT *</label>
  {formData.state ? (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
      <span className="text-body text-text-primary">{formData.state}</span>
      {!formData.locationId && (
        <button
          type="button"
          onClick={() => updateField('state', '')}
          className="text-caption font-semibold text-primary"
        >
          Change
        </button>
      )}
    </div>
  ) : (
    <select
      value=""
      onChange={(e) => {
        updateField('state', e.target.value);
        clearStep1Error('state');
      }}
      className="h-11 w-full rounded-xl border border-border bg-card px-3 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
    >
      <option value="" disabled>Select your State / UT</option>
      {INDIAN_STATES.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  )}
  {step1Errors.state && <p className="text-caption text-error" role="alert">{step1Errors.state}</p>}
</div>
```

Note the `!formData.locationId` guard on the "Change" button — this is the spec's "state should NOT be selectable again after selecting it as part of the city flow" requirement: once a city/town/locality is chosen (`locationId` set), state becomes locked. Changing state before a city is picked stays allowed (so an owner can correct a mis-click), but changing it after would silently orphan the already-chosen city, which is why it's blocked. Add `import { INDIAN_STATES } from '@/constants/states';` to this file's imports if not already present.

- [ ] **Step 2: Gate `LocationSearchInput` on state being chosen and pass it through**

Replace the existing `<LocationSearchInput>` block (~line 729-748) with:

```tsx
{formData.state && (
  <LocationSearchInput
    label="City / Town / Locality *"
    state={formData.state}
    value={
      formData.locationId
        ? { id: formData.locationId, name: formData.city, state: formData.state, district: null, pincode: formData.pincode || null }
        : null
    }
    onChange={(loc: SelectedLocation) => {
      setFormData((prev) => ({
        ...prev,
        locationId: loc.id,
        city: loc.name,
        pincode: loc.pincode || prev.pincode,
      }));
      clearStep1Error('city');
    }}
    onClear={() => setFormData((prev) => ({ ...prev, locationId: null, city: '' }))}
    error={step1Errors.city}
  />
)}
```

Note `state` is no longer overwritten from `loc.state` here — the state was already locked in Step 1, and `LocationSearchInput` now only searches within it (Step 3 below), so `loc.state` is always redundant with `formData.state`.

- [ ] **Step 3: Scope `LocationSearchInput`'s search and creation to the passed-in state**

In `frontend/src/components/ui/LocationSearchInput.tsx`:

```tsx
interface LocationSearchInputProps {
  value: SelectedLocation | null;
  onChange: (location: SelectedLocation) => void;
  onClear?: () => void;
  state: string;
  error?: string;
  label?: string;
}

export function LocationSearchInput({ value, onChange, onClear, state, error, label = 'City / Town' }: LocationSearchInputProps) {
```

Remove the `newState`/`INDIAN_STATES` state-picker block entirely (lines ~29, 63-66, 156-170) — state is now a required prop, so "Add a new place" no longer needs its own state dropdown, it just uses `state`. Update the search effect and `handleCreate`:

```tsx
  useEffect(() => {
    if (!isOpen || query.trim().length < 1) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await searchLocations(query.trim(), state);
        setResults(res);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen, state]);
```

```tsx
  const handleCreate = async () => {
    try {
      const loc = await createLocation({ name: query.trim(), state });
      selectLocation(loc);
    } catch (e: any) {
      setAddError(e?.message || "Couldn't add this location.");
    }
  };
```

And change the "Change" button's `onClick` (in the `value && !isOpen` branch, ~line 92-101) to also call `onClear?.()` so the parent's `locationId` gets cleared (re-enabling the state "Change" button per Step 1 above):

```tsx
          <button
            type="button"
            onClick={() => {
              onClear?.();
              setIsOpen(true);
              setQuery('');
            }}
            className="text-caption font-semibold text-primary"
          >
            Change
          </button>
```

- [ ] **Step 4: Show popular cities for the chosen state before typing**

In the same component, when `isOpen && query.trim().length === 0`, show up to 8 results from an unscoped call to the backend using an empty-ish query — but `search_locations` requires `min_length=1` on `q`, so instead add a tiny "popular" prefetch: on `state` change, fire one `searchLocations('', state)`-shaped request isn't possible given that constraint, so instead reuse the seeded data by searching each state's own name is wrong too. Simplest correct approach: extend the results dropdown to run when `query.trim().length === 0` too, using a fixed one-character-per-vowel trick is fragile — **do it server-side instead**: add a `popular: bool = Query(False)` branch is unnecessary complexity for what's a UX nicety. Given the `locations` table is now seeded with state capitals/major metros first (Task 2), the pragmatic, infra-reuse-only approach is: on focus (before any typing), call `searchLocations(state, state)` — i.e. search using the state name itself as the query — **no**, that won't match city names either.

  Resolve this by relaxing the backend's `min_length=1` no further and instead adding one new trivial parameter: `q: Optional[str] = Query(None, ...)` allowing an empty/omitted `q` when `state` is provided, in which case return up to `limit` rows ordered by name for that state (already-seeded major cities sort first alphabetically only incidentally — acceptable for a first cut; do not build ranking/popularity infrastructure, that's exactly the "giant system" the spec forbids). Change in `backend/app/api/v1/locations.py`:

```python
@router.get("/search", status_code=200)
async def search_locations(
    q: Optional[str] = Query(None, max_length=100),
    state: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=25),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    term = normalize_location_name(q) if q else ""
    if not term and not state:
        return {"success": True, "data": []}
    stmt = select(Location)
    if term:
        stmt = stmt.where(func.lower(Location.name_norm).like(f"%{term}%"))
    if state:
        stmt = stmt.where(func.lower(Location.state) == state.strip().lower())
    stmt = stmt.order_by(
        func.lower(Location.name_norm).like(f"{term}%").desc() if term else Location.name,
        Location.name,
    ).limit(limit)
    res = await db.execute(stmt)
    results = [LocationResponse.model_validate(loc).model_dump(by_alias=True) for loc in res.scalars().all()]
    return {"success": True, "data": results}
```

And in `frontend/src/lib/api/locations.ts`, update `searchLocations` to accept `state` and allow an empty `query`:

```ts
export async function searchLocations(query: string, state?: string): Promise<LocationResult[]> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (state) params.set('state', state);
  const res = await apiClient.get(`/locations/search?${params.toString()}`);
  return res.data.data;
}
```

(Match this file's actual existing `apiClient`/error-handling pattern — read it before editing rather than assuming the shape above is exact.)

Then in `LocationSearchInput.tsx`, trigger a popular-cities load on `onFocus` when `query` is empty:

```tsx
        onFocus={async () => {
          setIsOpen(true);
          if (query.trim().length === 0 && results.length === 0) {
            setIsSearching(true);
            try {
              setResults(await searchLocations('', state));
            } catch {
              setResults([]);
            } finally {
              setIsSearching(false);
            }
          }
        }}
```

And relax the results-dropdown's render guard from `query.trim().length > 0` to `true` (so it can show while `query` is still empty, immediately after focus) at the `{isOpen && query.trim().length > 0 && (` line — change to `{isOpen && (`.

- [ ] **Step 5: Manual verification (no automated test for live search relevance)**

Run the dev server, open onboarding Step 1, pick "Telangana", confirm popular cities appear on focus before typing, type "Secundera" and confirm "Secunderabad, Telangana" appears, type "Nampally" and confirm it appears, select it, confirm the State "Change" button is now hidden, click "Change" on the city field and confirm State becomes editable again.

- [ ] **Step 6: Playwright test for the state-lock behavior**

```ts
// frontend/e2e/onboarding-location.spec.ts
import { test, expect } from '@playwright/test';
import { loginAsOwnerWithoutCafe } from './helpers/auth'; // reuse whatever existing helper other onboarding specs use — check frontend/e2e/*.ts first

test('state becomes locked after selecting a city, and unlocks on Change', async ({ page }) => {
  await loginAsOwnerWithoutCafe(page);
  await page.goto('/owner/onboarding');

  await page.selectOption('select:near(:text("State / UT"))', 'Telangana');
  await page.getByPlaceholder(/search for your city/i).fill('Secunderabad');
  await page.getByText('Secunderabad, Telangana').click();

  await expect(page.getByText('Telangana').locator('..').getByText('Change')).toHaveCount(0);

  await page.getByRole('button', { name: 'Change' }).click(); // the city-field Change button
  await expect(page.getByText('Change')).toBeVisible(); // state's Change button now shown
});
```

(Adjust selectors to match this codebase's actual test-id conventions — check other specs in `frontend/e2e/` for the pattern used and mirror it rather than guessing generic text selectors if `data-testid` is the norm.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ui/LocationSearchInput.tsx frontend/src/app/\(owner\)/owner/onboarding/page.tsx frontend/src/lib/api/locations.ts backend/app/api/v1/locations.py frontend/e2e/onboarding-location.spec.ts
git commit -m "feat: state-first location flow with state-scoped, lockable city/town/locality search"
```

---

## Task 4: Backend — PIN/location consistency check (best-effort, using existing data)

**Files:**
- Modify: `backend/app/api/v1/owner.py` (`OnboardingSubmitRequest`, add a model-level validator)

**Interfaces:**
- Consumes: `OnboardingSubmitRequest.location_id` (already exists, line 137) and `.pincode`.

- [ ] **Step 1: Write the failing test**

```python
async def test_submit_onboarding_rejects_pincode_state_mismatch(
    async_client, owner_auth_headers, valid_onboarding_payload, db_session
):
    from app.models.location import Location
    loc = Location(name="Secunderabad", name_norm="secunderabad", state="Telangana", pincode="500003")
    db_session.add(loc)
    await db_session.commit()
    await db_session.refresh(loc)

    payload = {**valid_onboarding_payload, "locationId": loc.id, "pincode": "110001"}  # Delhi pincode, wrong for Secunderabad
    resp = await async_client.post("/owner/onboarding/submit", json=payload, headers=owner_auth_headers)
    assert resp.status_code == 422


async def test_submit_onboarding_allows_pincode_when_location_has_none_on_file(
    async_client, owner_auth_headers, valid_onboarding_payload, db_session
):
    from app.models.location import Location
    loc = Location(name="Some New Town", name_norm="some new town", state="Karnataka", pincode=None)
    db_session.add(loc)
    await db_session.commit()
    await db_session.refresh(loc)

    payload = {**valid_onboarding_payload, "locationId": loc.id, "pincode": "560001"}
    resp = await async_client.post("/owner/onboarding/submit", json=payload, headers=owner_auth_headers)
    assert resp.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_owner_onboarding.py -k pincode_state_mismatch -v`
Expected: FAIL (no such check exists yet — first test currently returns 200).

- [ ] **Step 3: Implement the check in `submit_onboarding_application`**

This can't be a pure Pydantic field_validator since it needs a DB lookup — add it inside the handler itself, right after `payload` validation and before the cafe create/update logic (~just after line 738, before the `if not cafe:`/`else:` branch at ~line 795). Find the exact insertion point by reading `owner.py:737-800` first, then add:

```python
    if payload.location_id is not None:
        loc_stmt = select(Location).where(Location.id == payload.location_id)
        location = (await db.execute(loc_stmt)).scalars().first()
        if location and location.pincode and location.pincode != payload.pincode:
            raise BadRequestException(
                f"Pincode {payload.pincode} doesn't match {location.name}'s pincode on file "
                f"({location.pincode}). Please double-check your pincode.",
                error_code="PINCODE_MISMATCH",
            )
```

(`Location` must already be imported in `owner.py` — check the top-of-file imports; add `from app.models.location import Location` if it's missing. `BadRequestException` — confirm its exact import path from an existing usage elsewhere in this same file.)

Note the deliberate `location.pincode and ...` guard: most `Location` rows don't have a pincode on file (it's optional, per the audit), so this only rejects a *known* mismatch — it never blocks submission just because the location's pincode field is empty, per the audit's finding that full consistency-checking is only possible for records that carry one.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_owner_onboarding.py -k pincode -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/owner.py backend/tests/test_owner_onboarding.py
git commit -m "feat: reject onboarding submissions whose pincode contradicts the selected location's pincode on file"
```

---

## Task 5: Frontend — fix Step 5's gaming-config nudge for physical-only cafés

**Files:**
- Modify: `frontend/src/app/(owner)/owner/onboarding/page.tsx` (~line 1098-1106)

- [ ] **Step 1: Replace the confusing nudge with activity-aware messaging**

Replace the block at `page.tsx:1099-1106`:

```tsx
{relevantGamingPlatforms.length === 0 && (
  <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5">
    <Gamepad2 className="h-4 w-4 flex-shrink-0 text-text-secondary mt-0.5" />
    <p className="text-caption text-text-secondary">
      You haven&apos;t configured any gaming platforms in the previous step — add a
      PC, PlayStation, Xbox, or Nintendo resource there to list the games you support.
    </p>
  </div>
)}
```

with:

```tsx
{relevantGamingPlatforms.length === 0 && (
  formData.hardwareTiers.some((t) => t.tierType === 'activity') ? (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5">
      <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500 mt-0.5" />
      <p className="text-caption text-text-secondary">
        You&apos;ve set up {formData.hardwareTiers.filter((t) => t.tierType === 'activity').length}{' '}
        physical {formData.hardwareTiers.filter((t) => t.tierType === 'activity').length === 1 ? 'activity' : 'activities'}{' '}
        (see Step 4). No gaming platform configuration is needed for a physical-activity café — add photos below.
      </p>
    </div>
  ) : (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5">
      <Gamepad2 className="h-4 w-4 flex-shrink-0 text-text-secondary mt-0.5" />
      <p className="text-caption text-text-secondary">
        You haven&apos;t configured any gaming platforms in the previous step — add a
        PC, PlayStation, Xbox, or Nintendo resource there to list the games you support.
      </p>
    </div>
  )
)}
```

Also update the static step heading (~line 1091-1095) to stop unconditionally saying "Games Supported":

```tsx
<h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
  <Gamepad2 className="h-5 w-5 text-emerald-500" />
  <span>5. {relevantGamingPlatforms.length > 0 ? 'Games Supported & Photo Gallery' : 'Photo Gallery'}</span>
</h2>
```

- [ ] **Step 2: Manual verification**

In the onboarding dev flow, configure only an "Activity" tier (e.g. Snooker) in Step 4, advance to Step 5, confirm the physical-activity confirmation message shows instead of the gaming nudge, and the heading no longer says "Games Supported". Then go back, add a PC resource, confirm the gaming platform config block reappears and the heading reverts.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(owner\)/owner/onboarding/page.tsx
git commit -m "fix: stop nudging physical-only cafes to configure gaming platforms in Step 5"
```

---

## Task 6: Backend — capture `cafeId` from draft save/load, add `menu_photos` to submit schema

**Files:**
- Modify: `backend/app/api/v1/owner.py` (`get_onboarding_draft` ~line 602-669, `save_onboarding_draft` response ~line 712-718 — already returns `cafeId`, no change needed there; `OnboardingSubmitRequest` ~line 186; `submit_onboarding_application` photo-writing logic — locate via `grep -n "cafe.photos" backend/app/api/v1/owner.py`)

**Interfaces:**
- Produces: `GET /owner/onboarding/draft` response gains top-level `"cafeId": str(cafe.id) | None`. `OnboardingSubmitRequest` gains `menu_photos: List[Union[str, Dict[str, str]]] = Field(default_factory=list)`.

- [ ] **Step 1: Write the failing test**

```python
async def test_get_onboarding_draft_returns_cafe_id_once_a_draft_exists(
    async_client, owner_auth_headers
):
    save_resp = await async_client.post(
        "/owner/onboarding/draft",
        json={"step": 2, "draftData": {"name": "Test Cafe"}},
        headers=owner_auth_headers,
    )
    cafe_id = save_resp.json()["data"]["cafeId"]

    get_resp = await async_client.get("/owner/onboarding/draft", headers=owner_auth_headers)
    assert get_resp.json()["data"]["cafeId"] == cafe_id


async def test_submit_onboarding_persists_menu_photos(
    async_client, owner_auth_headers, valid_onboarding_payload
):
    payload = {**valid_onboarding_payload, "menuPhotos": ["https://example-bucket.s3.amazonaws.com/menu1.jpg"]}
    resp = await async_client.post("/owner/onboarding/submit", json=payload, headers=owner_auth_headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["menuPhotos"] == ["https://example-bucket.s3.amazonaws.com/menu1.jpg"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_owner_onboarding.py -k "cafe_id_once_a_draft or persists_menu_photos" -v`
Expected: FAIL — `cafeId` missing from GET draft response; `menuPhotos` rejected or silently dropped by `OnboardingSubmitRequest` (extra fields likely ignored, not erroring, since Pydantic default is to ignore unknowns — confirm this is the actual current behavior when running the test, and adjust the assertion if it 422s instead).

- [ ] **Step 3: Add `cafeId` to `get_onboarding_draft`'s three return points**

In `backend/app/api/v1/owner.py`, `get_onboarding_draft` (line 602-669) has three `return` statements (line 612, 620, 669). Change each to include `cafeId`:

```python
    if not cafe:
        return {"success": True, "data": {"draft": {}, "cafeId": None}}
```
```python
    if cafe.verification_status == VerificationStatus.DRAFT:
        return {"success": True, "data": {"draft": {}, "cafeId": str(cafe.id)}}
```
```python
    if cafe.draft_data:
        return {"success": True, "data": {"draft": cafe.draft_data, "cafeId": str(cafe.id)}}
```
and the final snapshot return (line 669):
```python
    return {"success": True, "data": {"draft": snapshot, "cafeId": str(cafe.id)}}
```

- [ ] **Step 4: Add `menu_photos` to `OnboardingSubmitRequest` and persist it**

Add next to the existing `photos` field (line 186):

```python
    menu_photos: List[Union[str, Dict[str, str]]] = Field(default_factory=list)
```

Find where `submit_onboarding_application` writes `cafe.photos = _normalize_photos(payload.photos)` (search `grep -n "cafe.photos = " backend/app/api/v1/owner.py`) and add the parallel line immediately after it in both the create and update branches:

```python
    cafe.menu_photos = _normalize_menu_photos(payload.menu_photos)
```

Add `_normalize_menu_photos` right next to `_normalize_photos` (~line 720-734) — menu photos are a flat URL list per `Cafe.menu_photos`'s existing shape (confirmed by the `menu-photos/presign` endpoint's comment: "menu_photos is already its own semantic category and doesn't get a category field", `owner.py:2440-2442`):

```python
def _normalize_menu_photos(value):
    if not value:
        return []
    return [p if isinstance(p, str) else p.get("url", "") for p in value]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_owner_onboarding.py -k "cafe_id_once_a_draft or persists_menu_photos" -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/owner.py backend/tests/test_owner_onboarding.py
git commit -m "feat: expose draft cafeId to the frontend and accept menu_photos on onboarding submit"
```

---

## Task 7: Frontend — real photo/menu photo upload during onboarding Step 5

**Files:**
- Modify: `frontend/src/app/(owner)/owner/onboarding/page.tsx` (`OnboardingState`, draft-load effect ~line 130-168, Step 5 JSX ~line 1173-1210)
- Check/reuse: whatever upload helper the post-approval "Café Settings → Amenities & Photos" flow already uses for these exact presign endpoints (`grep -rl "photos/presign" frontend/src` to find it) — reuse that function rather than writing a second S3-upload implementation.

**Interfaces:**
- Consumes: `GET /owner/onboarding/draft`'s new `cafeId` (Task 6), existing `POST /owner/cafes/{cafeId}/photos/presign` and `POST /owner/cafes/{cafeId}/menu-photos/presign`.
- Produces: `OnboardingState.cafeId: string | null` and `OnboardingState.menuPhotos: string[]`.

- [ ] **Step 1: Add `cafeId` and `menuPhotos` to onboarding state**

In `OnboardingState` (line 33-69) add:
```ts
  cafeId: string | null;
  menuPhotos: string[];
```
In `INITIAL_STATE` (line 71+) add:
```ts
  cafeId: null,
  menuPhotos: [],
```
Change the default `photos` value (line 102) from the hardcoded Unsplash placeholder to an empty array:
```ts
  photos: [],
```

- [ ] **Step 2: Capture `cafeId` from the draft-load effect and from `handleNext`'s draft save**

In the `loadDraft` effect (~line 133-168), the response now includes `res.cafeId` (Task 6) — add:
```ts
        if (isMounted && res.cafeId) {
          setFormData((prev) => ({ ...prev, cafeId: res.cafeId }));
        }
```
right after the existing `if (isMounted && res.draft ...)` block. In `handleNext` (~line 384), capture the save response too — change:
```ts
      await saveOnboardingDraft(nextStep, draftSafeFields);
```
to:
```ts
      const saveRes = await saveOnboardingDraft(nextStep, draftSafeFields);
      if (saveRes?.cafeId) {
        setFormData((prev) => ({ ...prev, cafeId: saveRes.cafeId }));
      }
```
(Confirm `saveOnboardingDraft`'s return type in `frontend/src/lib/api/owner.ts` actually surfaces `cafeId` from the response envelope — adjust the destructuring to match its real shape rather than assuming.)

- [ ] **Step 3: Build the upload UI for Step 5, reusing the existing presign+S3 helper**

Replace the static "Venue Photos" block (`page.tsx:1179-1194`) with a real uploader. First identify the existing helper (Step 1 above told you to find it) — assume it exposes something shaped like `uploadCafePhoto(cafeId: string, file: File, category: string): Promise<string>` (a thin wrapper: call presign, PUT the file to the returned URL, return the final public URL) since that's the natural shape given the presign endpoints. Read that helper's actual signature before writing this step's code and adjust the call accordingly — do not invent a second implementation of the S3 PUT logic.

```tsx
<div className="flex flex-col gap-2">
  <label className="text-caption font-semibold text-text-primary">Venue Photos</label>
  {!formData.cafeId ? (
    <p className="text-caption text-text-secondary">Saving your progress — photo upload will be available in a moment.</p>
  ) : (
    <>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          for (const file of files) {
            try {
              const url = await uploadCafePhoto(formData.cafeId!, file, 'exterior');
              setFormData((prev) => ({ ...prev, photos: [...prev.photos, url] }));
            } catch {
              setError('One of your photos failed to upload. Please try again.');
            }
          }
          e.target.value = '';
        }}
        className="text-caption text-text-secondary"
      />
      <div className="grid grid-cols-4 gap-2">
        {formData.photos.map((url) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={url} src={url} alt="Venue photo" className="aspect-square rounded-lg object-cover border border-border" />
        ))}
      </div>
    </>
  )}
</div>
```

Replace the static "Menu" block (`page.tsx:1196-1210`) the same way, calling the menu-photo presign endpoint and writing to `formData.menuPhotos` instead of `formData.photos`:

```tsx
<div className="flex flex-col gap-2">
  <label className="text-caption font-semibold text-text-primary">Menu Photos (Optional)</label>
  {!formData.cafeId ? (
    <p className="text-caption text-text-secondary">Saving your progress — photo upload will be available in a moment.</p>
  ) : (
    <>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          for (const file of files) {
            try {
              const url = await uploadCafeMenuPhoto(formData.cafeId!, file);
              setFormData((prev) => ({ ...prev, menuPhotos: [...prev.menuPhotos, url] }));
            } catch {
              setError('One of your menu photos failed to upload. Please try again.');
            }
          }
          e.target.value = '';
        }}
        className="text-caption text-text-secondary"
      />
      <div className="grid grid-cols-4 gap-2">
        {formData.menuPhotos.map((url) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={url} src={url} alt="Menu photo" className="aspect-square rounded-lg object-cover border border-border" />
        ))}
      </div>
    </>
  )}
</div>
```

(`uploadCafeMenuPhoto` should be the menu-photo counterpart living next to whatever `uploadCafePhoto` helper you found in Step 1 — if only a photo-uploader exists today and the menu one needs writing, mirror it exactly, pointing at `/owner/cafes/{cafeId}/menu-photos/presign` instead of `/owner/cafes/{cafeId}/photos/presign`.)

- [ ] **Step 4: Include `menuPhotos` in the final submit payload**

In the `handleSubmit` transform (`grep -n "photos:" frontend/src/app/\(owner\)/owner/onboarding/page.tsx` to find the submit payload construction, near line 425-500), add:
```ts
      menuPhotos: formData.menuPhotos,
```
alongside the existing `photos: formData.photos,` line.

- [ ] **Step 5: Manual verification**

Run the dev server (`npm run dev` in `frontend/`), start onboarding as a fresh owner, advance past Step 1 (confirm a `cafeId` gets set — check via React devtools or a temporary console.log), reach Step 5, upload a real image file for Venue Photos, confirm it appears as a thumbnail and that `GET /owner/onboarding/draft` afterward shows it persisted, submit the application, and confirm the admin verification-queue modal (Task 9) shows the uploaded photo.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\(owner\)/owner/onboarding/page.tsx
git commit -m "feat: real venue and menu photo upload during onboarding, reusing existing cafe-scoped S3 presign endpoints"
```

---

## Task 8: Backend — surface individual-vs-pooled tracking on hardware tier responses

**Files:**
- Modify: `backend/app/schemas/hardware_tier.py` (`HardwareTierResponse`, ~line 89)
- Modify: `backend/app/services/cafe_service.py` (wherever `HardwareTierResponse` gets built for `AdminCafeDetailResponse` — locate via `grep -n "HardwareTierResponse" backend/app/services/cafe_service.py`)
- Check: `backend/app/repositories/` for a `HardwareUnitRepository`/`unit_repo` (referenced in `hardware_tier_service.py:118`) to find the right query for "does this tier have units"

**Interfaces:**
- Produces: `HardwareTierResponse.tracking_mode: Literal['individual', 'pooled']` (computed, not a new DB column).

- [ ] **Step 1: Write the failing test**

```python
async def test_admin_pending_cafe_shows_individual_tracking_mode(
    async_client, admin_auth_headers, cafe_with_individually_tracked_activity_tier
):
    resp = await async_client.get("/admin/cafes/pending", headers=admin_auth_headers)
    tiers = resp.json()["data"]["items"][0]["tiers"]
    matching = next(t for t in tiers if t["id"] == str(cafe_with_individually_tracked_activity_tier.tier_id))
    assert matching["trackingMode"] == "individual"


async def test_admin_pending_cafe_shows_pooled_tracking_mode_by_default(
    async_client, admin_auth_headers, cafe_with_pooled_gaming_tier
):
    resp = await async_client.get("/admin/cafes/pending", headers=admin_auth_headers)
    tiers = resp.json()["data"]["items"][0]["tiers"]
    matching = next(t for t in tiers if t["id"] == str(cafe_with_pooled_gaming_tier.tier_id))
    assert matching["trackingMode"] == "pooled"
```

(These two fixtures need creating — model them on whatever fixture already builds a `HardwareTier` + `Cafe` for existing admin tests; check `backend/tests/conftest.py` and existing `test_admin_*.py` files for the pattern before writing new ones from scratch.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/ -k tracking_mode -v`
Expected: FAIL — `trackingMode` key doesn't exist in the response yet.

- [ ] **Step 3: Find how `unit_repo` queries units for a tier**

Read `backend/app/repositories/` for the `HardwareUnit` repository (referenced as `self.unit_repo` in `hardware_tier_service.py`) and find its query method (likely something like `get_by_tier_id(tier_id)` or `count_by_tier_id(tier_id)`) — use that exact method rather than writing a new raw query.

- [ ] **Step 4: Add `tracking_mode` as a computed field on `HardwareTierResponse`**

```python
# backend/app/schemas/hardware_tier.py, in HardwareTierResponse
    tracking_mode: str = "pooled"  # set explicitly by the service layer that builds this response (see cafe_service.py); pydantic default here only covers paths that don't set it explicitly
```

- [ ] **Step 5: Set it when building `AdminCafeDetailResponse`'s tiers**

In `backend/app/services/cafe_service.py`, wherever tiers get converted to `HardwareTierResponse` for the admin response, add a lookup: for each tier, query whether any `HardwareUnit` rows exist for `tier.id` (via the repo method found in Step 3) and set `tracking_mode = "individual" if units else "pooled"`. Batch this as one query for all tiers on the cafe rather than N+1 queries per tier — check whether the unit repo already has a "get all units for these tier ids" method; if not, add one there (`get_by_tier_ids(tier_ids: list[UUID]) -> dict[UUID, list]`) rather than looping individual queries.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && pytest tests/ -k tracking_mode -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/hardware_tier.py backend/app/services/cafe_service.py backend/tests/
git commit -m "feat: expose individual-vs-pooled tracking mode on admin hardware tier responses"
```

---

## Task 9: Frontend — admin review shows every submitted field

**Files:**
- Modify: `frontend/src/app/(admin)/admin/verification-queue/page.tsx` (modal JSX, ~line 388-507)

- [ ] **Step 1: Add State, Maps link, Description, Hours to the "Business Identity" card**

Replace the "Business Identity" block (~line 389-397):

```tsx
          <div className="p-3 rounded-xl bg-surface-hover">
            <h4 className="font-semibold text-caption mb-2">Business Identity</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-text-tertiary">Address:</span> {selectedCafe?.addressLine1}{selectedCafe?.addressLine2 ? `, ${selectedCafe.addressLine2}` : ''}, {selectedCafe?.city}</div>
              <div><span className="text-text-tertiary">State:</span> {selectedCafe?.state}</div>
              <div><span className="text-text-tertiary">Pincode:</span> {selectedCafe?.pincode}</div>
              <div><span className="text-text-tertiary">Phone:</span> {selectedCafe?.phoneNumber}</div>
              <div><span className="text-text-tertiary">Email:</span> {selectedCafe?.email || 'Not provided'}</div>
              <div><span className="text-text-tertiary">Hours:</span> {selectedCafe?.openingTime || '—'} – {selectedCafe?.closingTime || '—'}</div>
              <div className="col-span-2">
                <span className="text-text-tertiary">Maps Link:</span>{' '}
                {selectedCafe?.googleMapsUrl ? (
                  <a href={selectedCafe.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">Open in Maps</a>
                ) : 'Not provided'}
              </div>
              {selectedCafe?.description && (
                <div className="col-span-2">
                  <span className="text-text-tertiary">Description:</span> {selectedCafe.description}
                </div>
              )}
            </div>
          </div>
```

- [ ] **Step 2: Show tracking mode and quantities in "Resources & Pricing"**

In the tiers `.map` (~line 427-440), add tracking mode and split seat counts more explicitly:

```tsx
                {selectedCafe.tiers.map((tier) => (
                  <div key={tier.id} className="flex justify-between">
                    <span>
                      {tier.name}
                      {tier.tierType === 'activity' && tier.activityKind ? ` (${tier.activityKind})` : ''}
                      {tier.trackingMode === 'individual' ? ' · Individually tracked' : ' · Pooled'}
                    </span>
                    <span className="text-text-tertiary">
                      {tier.platform
                        ? `${PLATFORMS.find((p) => p.value === tier.platform)?.label ?? tier.platform} · `
                        : ''}
                      ₹{tier.pricePerHour}/hr · {tier.appBookableSeats}/{tier.totalSeats} bookable seats
                    </span>
                  </div>
                ))}
```

(Confirm `tier.appBookableSeats`/`tier.totalSeats` are the actual camelCase field names surfaced on the frontend `AdminCafe`/tier type — check `frontend/src/types/cafe.ts` before finalizing; adjust names to match if different.)

- [ ] **Step 3: Manual verification**

Submit a test onboarding application with a known state, maps link, description, and opening/closing hours, then open it in `/admin/verification-queue` and confirm every new field renders with the correct value.

- [ ] **Step 4: Playwright test**

```ts
// frontend/e2e/admin_verification_queue_full_details.spec.ts — check if a spec
// already covers this modal (grep -rl "Application Details" frontend/e2e/)
// and add to it instead of creating a new file if one exists.
import { test, expect } from '@playwright/test';

test('admin application details modal shows state, maps link, description and hours', async ({ page }) => {
  // ... reuse existing login-as-admin + open-a-pending-application setup from
  // the existing verification-queue spec (frontend/e2e/admin_approval.spec.ts
  // per the test-results directory listing) ...
  await expect(page.getByText('State:')).toBeVisible();
  await expect(page.getByText('Maps Link:')).toBeVisible();
  await expect(page.getByText('Hours:')).toBeVisible();
});
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(admin\)/admin/verification-queue/page.tsx frontend/e2e/
git commit -m "feat: show state, maps link, description, hours and tracking mode in admin application review"
```

---

## Task 10: Frontend — complete Step 6 review + per-section Edit actions

**Files:**
- Modify: `frontend/src/app/(owner)/owner/onboarding/page.tsx` (Step 6 JSX, ~line 1214-1282)

- [ ] **Step 1: Replace the 5-field summary with a complete, sectioned review**

Replace the "Submission Summary" block (`page.tsx:1231-1255`) with sectioned cards, each carrying its own Edit button that calls `setStep(n)`:

```tsx
<div className="flex flex-col gap-4">
  <ReviewSection title="Location" onEdit={() => setStep(1)}>
    <ReviewRow label="Venue Name" value={formData.name} />
    <ReviewRow label="Address" value={`${formData.addressLine1}${formData.addressLine2 ? ', ' + formData.addressLine2 : ''}`} />
    <ReviewRow label="City / Town" value={formData.city} />
    <ReviewRow label="State" value={formData.state} />
    <ReviewRow label="Pincode" value={formData.pincode} />
    <ReviewRow label="Maps Link" value={formData.googleMapsUrl || 'Not provided'} />
  </ReviewSection>

  <ReviewSection title="Business Verification" onEdit={() => setStep(2)}>
    <ReviewRow label="Business Phone" value={formData.phoneNumber} />
    <ReviewRow label="Email" value={formData.email || 'Not provided'} />
    <ReviewRow label="Business PAN" value={formData.businessPan || 'Not provided'} />
    <ReviewRow label="GSTIN" value={formData.hasGst ? (formData.gstin || 'Not provided') : 'Not registered'} />
    <ReviewRow label="Legal Document" value={formData.legalDocumentUrl ? 'Uploaded' : 'Not provided'} />
  </ReviewSection>

  <ReviewSection title="Resources / Activities" onEdit={() => setStep(4)}>
    <ReviewRow label="Hours" value={`${formData.openingTime} – ${formData.closingTime}`} />
    {formData.hardwareTiers.map((t, i) => (
      <ReviewRow
        key={i}
        label={t.tierType === 'activity' ? (t.activityKind || 'Activity') : (PLATFORMS.find((p) => p.value === t.platform)?.label || t.platform || 'Resource')}
        value={`${t.model || t.tierType} · ${t.totalSeats} seats · ₹${t.pricePerHour}/hr`}
      />
    ))}
  </ReviewSection>

  <ReviewSection title="Games / Photos" onEdit={() => setStep(5)}>
    <ReviewRow
      label="Games"
      value={`${Object.values(formData.supportedGames).reduce((sum, list) => sum + list.length, 0)} games across ${Object.keys(formData.supportedGames).filter((k) => formData.supportedGames[k].length > 0).length} platforms`}
    />
    <ReviewRow label="Venue Photos" value={`${formData.photos.length} uploaded`} />
    <ReviewRow label="Menu Photos" value={`${formData.menuPhotos.length} uploaded`} />
  </ReviewSection>

  <ReviewSection title="Payout" onEdit={() => setStep(3)}>
    <ReviewRow label="Payout UPI ID" value={formData.upiVpa || 'Not Provided'} />
  </ReviewSection>
</div>
```

(Adjust the `setStep(3)` for Payout to whichever step number actually hosts the payout/UPI fields in this wizard — the audit didn't confirm which of Steps 2-4 that is; check the existing `step === N` blocks for where `upiVpa` is edited before finalizing this number.)

- [ ] **Step 2: Add the small `ReviewSection`/`ReviewRow` helper components**

Add near the top of the file, alongside other small local components (or as new small local functions right above the default export if that's this file's convention — check first):

```tsx
function ReviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 bg-surface p-4 rounded-2xl border border-border">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h4 className="font-heading text-h4 text-text-primary">{title}</h4>
        <button type="button" onClick={onEdit} className="text-caption font-semibold text-primary hover:underline">
          Edit
        </button>
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-body">
      <span className="text-text-secondary">{label}:</span>
      <span className="font-semibold text-text-primary text-right">{value}</span>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

Fill out onboarding through Step 5, reach Step 6, confirm every section shows real values (not blank/"undefined"), click "Edit" on Location, confirm it jumps to Step 1 with the previously-entered address/city/state/pincode still filled in, change the pincode, click Next repeatedly back to Step 6, confirm the new pincode now shows in the Location section.

- [ ] **Step 4: Playwright test**

```ts
// frontend/e2e/onboarding-review-edit.spec.ts
import { test, expect } from '@playwright/test';
import { loginAsOwnerWithoutCafe, fillOnboardingThroughStep5 } from './helpers/onboarding'; // create/reuse a shared fixture that fills Steps 1-5 with valid data, if one doesn't already exist — check frontend/e2e/ first

test('Step 6 Edit buttons jump to the right step and reflect updates on return', async ({ page }) => {
  await loginAsOwnerWithoutCafe(page);
  await page.goto('/owner/onboarding');
  await fillOnboardingThroughStep5(page);

  await expect(page.getByText('Location').locator('..').getByRole('button', { name: 'Edit' })).toBeVisible();
  await page.getByText('Location').locator('..').getByRole('button', { name: 'Edit' }).click();

  await expect(page.getByText('1. Location')).toBeVisible(); // back on Step 1
  await page.getByPlaceholder('560001').fill('500003');
  // click Next four times back to Step 6 (or use a "review" shortcut if the wizard has one)
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'Next' }).click();
  }
  await expect(page.getByText('500003')).toBeVisible();
});
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(owner\)/owner/onboarding/page.tsx frontend/e2e/onboarding-review-edit.spec.ts
git commit -m "feat: complete Step 6 review with per-section Edit actions back to the relevant step"
```

---

## Self-Review Notes

- **Spec coverage:** Location/state-lock → Task 3. City/town/locality search + Secunderabad/Nampally → Task 2. PIN frontend already correct; backend → Task 1; consistency → Task 4. Phone → audited, no task (correctly, per audit). Step 5 conditional UX → Task 5. Photo/menu upload end-to-end → Tasks 6-7. Admin visibility (all fields, photos, tracking mode) → Tasks 8-9. Step 6 full review + Edit → Task 10.
- **Reuse check:** No new DB tables. No new upload system (reused existing presign endpoints). No new geo dependency (extended the existing flat `locations` table with a bounded seed list). Admin backend already returns full data — only the modal and one computed field changed.
- **Risk flagged, not fixed:** `CITIES_BY_STATE`/`SUPPORTED_CITIES` duality with the new locality-friendly `locations` table (see Audit Findings) — explicitly out of scope, report to user as a known follow-up.
