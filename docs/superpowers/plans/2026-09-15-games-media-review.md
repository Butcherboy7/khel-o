# Platform-Scoped Games & Media Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make games platform-scoped (derived from the resource tiers an owner actually configures) and give admins real visibility into photos/menu/games/pricing during café review, plus a changes-requested loop so a rejected owner can fix one thing and resubmit instead of starting over.

**Architecture:** Two roughly-independent slices sharing one onboarding wizard: Part A reshapes `Cafe.supported_games` from a flat list into a platform-keyed dict and scopes the wizard's game pickers to the platforms the owner actually configured. Part B categorizes `Cafe.photos`, adds a `CHANGES_REQUESTED` verification status, fixes two latent bugs that the new resubmit flow would otherwise trigger (duplicate hardware tiers on re-submit, and a dead `draftData.hardwareTiers` read in the admin modal), and builds the owner- and admin-side UI for the new status. Part A ships and is testable on its own; Part B's admin "Games" section depends on Part A's dict shape, so Part A must land first.

**Tech Stack:** FastAPI + SQLAlchemy (async) + Alembic + SQLite/Postgres on the backend; Next.js + React + TanStack Query on the frontend.

**Spec:** `docs/superpowers/specs/2026-09-15-games-media-review-design.md`

## Global Constraints

- Backend field names are `snake_case`; all Pydantic request/response models here use `alias_generator=to_camel` (existing repo convention) so the wire format is `camelCase` — match this in every new/modified schema.
- `Platform` values are exactly `'pc' | 'playstation' | 'xbox' | 'nintendo' | 'other'` (`frontend/src/constants/platforms.ts`, mirrored by `backend/app/models/hardware_tier.py::PlatformType`). Do not invent new platform values.
- Existing café/hardware-tier/photo rows in the dev DB are test data — migrations may backfill with a reasonable default rather than preserving exact historical semantics (confirmed with product owner, see spec §Scope decisions).
- Every new Alembic migration that touches a Postgres-only construct (`ALTER TYPE ... ADD VALUE`) must guard it with `if op.get_bind().dialect.name == 'postgresql':` — SQLite has no enum type and the bare statement is a syntax error there (see migrations 022 and 028 for the existing pattern).
- Full backend pytest suite must stay green (426 passing baseline going into this work).

---

## Part A — Platform-scoped games

### Task 1: Backend — `supported_games` becomes a platform-keyed dict

**Files:**
- Modify: `backend/app/models/cafe.py:56`
- Modify: `backend/app/schemas/cafe.py:45`
- Modify: `backend/app/api/v1/owner.py:142` (`OnboardingSubmitRequest.supported_games`)
- Test: `backend/tests/test_platform_onboarding_submit.py`

**Interfaces:**
- Produces: `Cafe.supported_games: dict[str, list[str]]`, e.g. `{"pc": ["Valorant"], "playstation": ["FC 24"]}`. Every later task that reads or writes this column uses this shape.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_platform_onboarding_submit.py`:

```python
@pytest.mark.asyncio
async def test_onboarding_submit_stores_platform_scoped_games():
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_games_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Games Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "name": "Onboard Games Cafe",
            "addressLine1": "1 Games St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000030",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "supportedGames": {"pc": ["Valorant", "My LAN Game"], "playstation": ["EA Sports FC 24"]},
            "hardwareTiers": [
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 6, "appBookableSeats": 2, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post("/api/v1/owner/onboarding/submit", json=payload, headers=headers)
            assert res.status_code == 200
            cafe_id = res.json()["data"]["cafeId"]

        cafe = await db.get(Cafe, uuid.UUID(cafe_id))
        assert cafe.supported_games == {"pc": ["Valorant", "My LAN Game"], "playstation": ["EA Sports FC 24"]}
```

Add `from app.models.cafe import Cafe` to the file's imports if not already present.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_platform_onboarding_submit.py::test_onboarding_submit_stores_platform_scoped_games -v`
Expected: FAIL — `supportedGames` is currently validated as `List[str]`, so a dict payload fails Pydantic validation (422) instead of storing.

- [ ] **Step 3: Change the type in three places**

`backend/app/models/cafe.py:56` — change the default from `list` to `dict` (the column stays `JSON`, no migration needed for the column type itself; a data migration for existing rows is Task 2):

```python
    supported_games: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
```

`backend/app/schemas/cafe.py:45` (`CafeBase.supported_games`):

```python
    supported_games: Dict[str, List[str]] = Field(default_factory=dict)
```

`backend/app/api/v1/owner.py:142` (`OnboardingSubmitRequest.supported_games`):

```python
    supported_games: Dict[str, List[str]] = Field(default_factory=dict)
```

No change is needed at `owner.py:659` / `owner.py:689` (`supported_games=payload.supported_games` / `cafe.supported_games = payload.supported_games`) — both already pass the value straight through, so they work unchanged once the schema's declared type matches.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_platform_onboarding_submit.py::test_onboarding_submit_stores_platform_scoped_games -v`
Expected: PASS

- [ ] **Step 5: Do NOT run the full backend suite yet**

This task's schema change makes `Dict[str, List[str]]` the only shape `CafeBase`/`OnboardingSubmitRequest` accept, but any café row already in the dev DB from earlier real onboarding submissions this session still holds the old flat-list shape until Task 2's migration backfills it. Running the full suite now risks a spurious failure on any existing test or fixture that reads one of those rows through a `CafeResponse`-derived schema. Run only the scoped test from Step 4 as this task's completion evidence; the full-suite gate for this change moves to the end of Task 2.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/cafe.py backend/app/schemas/cafe.py backend/app/api/v1/owner.py backend/tests/test_platform_onboarding_submit.py
git commit -m "feat(games): store supported_games as a platform-keyed dict"
```

---

### Task 2: Backend — migration to backfill existing flat game lists

**Files:**
- Create: `backend/migrations/versions/031_platform_scoped_games.py`
- Test: `backend/tests/test_migration_031_games_backfill.py`

**Interfaces:**
- Consumes: nothing from other tasks (runs against whatever rows already exist).
- Produces: every existing `cafes.supported_games` row that was a flat JSON list becomes `{"pc": [...that list...]}`; rows already in dict form (from Task 1 onward) are left untouched.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_migration_031_games_backfill.py`. Migration version files are numeric-prefixed and not directly importable as a normal package, so load it dynamically by path (same technique Task 6 reuses for migration 032):

```python
import pytest
import importlib.util
import pathlib


def _load_migration_031():
    spec = importlib.util.spec_from_file_location(
        "migration_031",
        pathlib.Path(__file__).resolve().parents[1] / "migrations" / "versions" / "031_platform_scoped_games.py",
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_flat_games_list_backfilled_to_pc_dict():
    """Simulates a pre-migration row (flat list) and confirms the migration's
    backfill logic, exercised directly, produces the platform-keyed shape."""
    m = _load_migration_031()

    assert m._backfill_row(["Valorant", "GTA V"]) == {"pc": ["Valorant", "GTA V"]}
    assert m._backfill_row({"pc": ["Valorant"]}) == {"pc": ["Valorant"]}
    assert m._backfill_row([]) == {}
    assert m._backfill_row(None) == {}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_migration_031_games_backfill.py -v`
Expected: FAIL — `migrations.versions.platform_scoped_games_031` doesn't exist yet.

- [ ] **Step 3: Write the migration**

Check the current head first: `cd backend && alembic current` (this session's earlier DB reconciliation work left it at `030`). Create `backend/migrations/versions/031_platform_scoped_games.py`:

```python
"""backfill supported_games flat lists into platform-keyed dicts

Revision ID: 031
Revises: 030
Create Date: 2026-09-15
"""
from alembic import op
import sqlalchemy as sa
import json

revision = '031'
down_revision = '030'
branch_labels = None
depends_on = None

cafes_table = sa.table(
    'cafes',
    sa.column('id', sa.Uuid()),
    sa.column('supported_games', sa.JSON()),
)


def _backfill_row(value):
    """A flat list (the only shape that existed before this migration) is
    assumed to be PC titles — that was the only platform the old preset list
    (`PRESET_GAMES` in onboarding/page.tsx) ever offered. A dict is already
    in the new shape and passes through untouched. Anything falsy becomes {}."""
    if isinstance(value, dict):
        return value
    if isinstance(value, list) and value:
        return {"pc": value}
    return {}


def upgrade():
    bind = op.get_bind()
    rows = bind.execute(sa.select(cafes_table.c.id, cafes_table.c.supported_games)).fetchall()
    for row in rows:
        raw = row.supported_games
        if isinstance(raw, str):
            raw = json.loads(raw) if raw else []
        backfilled = _backfill_row(raw)
        if backfilled != raw:
            bind.execute(
                cafes_table.update()
                .where(cafes_table.c.id == row.id)
                .values(supported_games=backfilled)
            )


def downgrade():
    # Flattening a dict back into a single list would silently merge distinct
    # platforms' game lists together and lose which games belonged to which
    # platform — a lossy, one-way transform we don't want to auto-reverse.
    # Test data (see spec), so a no-op downgrade is an acceptable trade-off.
    pass
```

`_backfill_row` is already a top-level function in the migration file, so the test's dynamic import (Step 1) can reach it with no further changes on the migration side.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_migration_031_games_backfill.py -v`
Expected: PASS

- [ ] **Step 5: Apply the migration to the local dev DB and verify**

Run: `cd backend && alembic upgrade head`
Expected: `alembic current` now reports `031 (head)`. Spot-check: run `sqlite3 khel_o.db "SELECT supported_games FROM cafes LIMIT 5;"` and confirm every non-empty value is now a JSON object (`{...}`), not a JSON array (`[...]`).

- [ ] **Step 5b: Now run the full backend suite (deferred from Task 1)**

Run: `cd backend && python -m pytest -q`
Expected: PASS (426+ tests). This is the safety gate Task 1 deliberately deferred — the schema (Task 1) and the data (this task) are now both in the new shape, so no row can mismatch what `CafeBase`/`OnboardingSubmitRequest` expect.

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/versions/031_platform_scoped_games.py backend/tests/test_migration_031_games_backfill.py
git commit -m "feat(games): migrate 031 backfills flat game lists into platform-keyed dicts"
```

---

### Task 3: Frontend — per-platform preset game libraries

**Files:**
- Create: `frontend/src/constants/games.ts`

**Interfaces:**
- Produces: `PRESET_GAMES_BY_PLATFORM: Record<Exclude<Platform, 'other'>, string[]>`, consumed by Task 4 and the games-rendering part of Task 5.

- [ ] **Step 1: Create the constants file**

```ts
// Per-platform preset game libraries shown as toggle chips in the onboarding
// wizard's Games step (see PlatformTierConfigurator for the matching
// per-platform resource-tier pattern this mirrors). 'other' has no fixed
// picklist — those venues only get the custom-game text entry.
import type { Platform } from './platforms';

export const PRESET_GAMES_BY_PLATFORM: Record<Exclude<Platform, 'other'>, string[]> = {
  pc: [
    'Valorant',
    'Counter-Strike 2',
    'GTA V Online',
    'EA Sports FC 24',
    'Dota 2',
    'Apex Legends',
    'Fortnite',
    'Call of Duty: Warzone',
    'League of Legends',
    'Overwatch 2',
    'Tekken 8',
    'Rocket League',
  ],
  playstation: [
    'EA Sports FC 24',
    'God of War Ragnarök',
    "Marvel's Spider-Man 2",
    'Gran Turismo 7',
    'Tekken 8',
    'Mortal Kombat 1',
    'NBA 2K24',
    'Call of Duty: Modern Warfare III',
    'Elden Ring',
    'Street Fighter 6',
  ],
  xbox: [
    'EA Sports FC 24',
    'Forza Motorsport',
    'Halo Infinite',
    'Gears 5',
    'Call of Duty: Modern Warfare III',
    'Tekken 8',
    'NBA 2K24',
    'Elden Ring',
    'Sea of Thieves',
    'Street Fighter 6',
  ],
  nintendo: [
    'Mario Kart 8 Deluxe',
    'Super Smash Bros. Ultimate',
    'The Legend of Zelda: Tears of the Kingdom',
    'Splatoon 3',
    'Animal Crossing: New Horizons',
    'Mario Party Superstars',
  ],
};
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/constants/games.ts
git commit -m "feat(games): add per-platform preset game libraries"
```

---

### Task 4: Frontend — onboarding wizard's Games step becomes platform-scoped

**Files:**
- Modify: `frontend/src/app/(owner)/owner/onboarding/page.tsx`

**Interfaces:**
- Consumes: `PRESET_GAMES_BY_PLATFORM` from Task 3; `PLATFORMS`/`Platform` from `@/constants/platforms` (already imported in this file).
- Produces: `OnboardingState.supportedGames: Record<string, string[]>` — consumed by Task 5's submit payload (already generic) and by the customer detail page (Task 5b) only via the backend round-trip, not directly.

- [ ] **Step 1: Change the state shape**

At `page.tsx:75`, change:
```ts
  supportedGames: string[];
```
to:
```ts
  supportedGames: Record<string, string[]>;
```

At `page.tsx:112`, change:
```ts
  supportedGames: ['Valorant', 'Counter-Strike 2', 'GTA V Online', 'EA Sports FC 24'],
```
to:
```ts
  supportedGames: {},
```
(No platform is chosen yet at wizard start, so there is nothing to pre-select — the old flat default was PC-only and no longer makes sense once games are scoped per platform.)

- [ ] **Step 2: Replace the flat `PRESET_GAMES` constant and per-game handlers**

Remove the `PRESET_GAMES` array (`page.tsx:32-44`) and the `import { PRESET_GAMES_BY_PLATFORM } from '@/constants/games';` — add that import alongside the existing `import { PLATFORMS, PLATFORM_MODELS } from '@/constants/platforms';` line near the top of the file.

Replace `addCustomGame` (`page.tsx:173-180`), which currently writes into a flat array, with a per-platform version:

```ts
  const addCustomGame = (platform: string) => {
    const name = customGameInput[platform]?.trim();
    if (!name) return;
    const existing = formData.supportedGames[platform] || [];
    if (existing.includes(name)) {
      setCustomGameInput((prev) => ({ ...prev, [platform]: '' }));
      return;
    }
    updateField('supportedGames', { ...formData.supportedGames, [platform]: [...existing, name] });
    setCustomGameInput((prev) => ({ ...prev, [platform]: '' }));
  };

  const toggleGame = (platform: string, game: string) => {
    const existing = formData.supportedGames[platform] || [];
    const updated = existing.includes(game) ? existing.filter((g) => g !== game) : [...existing, game];
    updateField('supportedGames', { ...formData.supportedGames, [platform]: updated });
  };

  const removeGame = (platform: string, game: string) => {
    const existing = formData.supportedGames[platform] || [];
    updateField('supportedGames', { ...formData.supportedGames, [platform]: existing.filter((g) => g !== game) });
  };
```

Change the `customGameInput` state declaration at `page.tsx:131` from a single string to a per-platform map:
```ts
  const [customGameInput, setCustomGameInput] = useState<Record<string, string>>({});
```

- [ ] **Step 3: Derive which platforms are relevant and render per-platform sections**

Just above the `return (` of the component (or inline where Step 5's JSX begins), add a derived value:

```ts
  const relevantGamingPlatforms = Array.from(
    new Set(
      formData.hardwareTiers
        .filter((t) => t.tierType !== 'activity' && t.platform)
        .map((t) => t.platform)
    )
  ) as Exclude<Platform, never>[];
```

(`Platform` is already imported via `import type { TierConfig } from '@/types/tier';` and `PLATFORM_MODELS` — add `import type { Platform } from '@/constants/platforms';` if not already present as a type-only import; the file already imports `PLATFORM_MODELS` as a value from the same module.)

Replace the whole "Pre-Installed Games" block at `page.tsx:885-946` with:

```tsx
                <div className="flex flex-col gap-5">
                  {relevantGamingPlatforms.length === 0 && (
                    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5">
                      <Gamepad2 className="h-4 w-4 flex-shrink-0 text-text-secondary mt-0.5" />
                      <p className="text-caption text-text-secondary">
                        You haven&apos;t configured any gaming platforms in the previous step — add a
                        PC, PlayStation, Xbox, or Nintendo resource there to list the games you support.
                      </p>
                    </div>
                  )}
                  {relevantGamingPlatforms.map((platform) => {
                    const platformLabel = PLATFORMS.find((p) => p.value === platform)?.label || platform;
                    const presets = platform === 'other' ? [] : PRESET_GAMES_BY_PLATFORM[platform];
                    const selected = formData.supportedGames[platform] || [];
                    return (
                      <div key={platform} className="flex flex-col gap-2">
                        <label className="text-caption font-semibold text-text-primary">
                          {platformLabel} — Pre-Installed Games
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {presets.map((game) => {
                            const isSelected = selected.includes(game);
                            return (
                              <button
                                key={game}
                                type="button"
                                onClick={() => toggleGame(platform, game)}
                                className={`p-2.5 rounded-xl text-caption font-semibold flex items-center justify-between border transition-all ${
                                  isSelected
                                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600'
                                    : 'bg-surface border-border text-text-secondary hover:bg-border/40'
                                }`}
                              >
                                <span>{game}</span>
                                {isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                              </button>
                            );
                          })}
                          {selected
                            .filter((game) => !presets.includes(game))
                            .map((game) => (
                              <button
                                key={game}
                                type="button"
                                onClick={() => removeGame(platform, game)}
                                className="p-2.5 rounded-xl text-caption font-semibold flex items-center justify-between border bg-emerald-500/10 border-emerald-500 text-emerald-600 transition-all"
                              >
                                <span>{game}</span>
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              </button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Not listed? Type a game name and add it"
                            value={customGameInput[platform] || ''}
                            onChange={(e) =>
                              setCustomGameInput((prev) => ({ ...prev, [platform]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addCustomGame(platform);
                              }
                            }}
                          />
                          <Button type="button" variant="secondary" onClick={() => addCustomGame(platform)}>
                            Add
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
```

- [ ] **Step 4: Fix the submission-summary count**

At `page.tsx:1022`, change:
```tsx
                    <span className="font-semibold text-text-primary">{formData.supportedGames.length} Games</span>
```
to:
```tsx
                    <span className="font-semibold text-text-primary">
                      {Object.values(formData.supportedGames).reduce((sum, list) => sum + list.length, 0)} Games
                    </span>
```

- [ ] **Step 5: Manually verify in the browser**

Start both dev servers (`cd backend && uvicorn app.main:app --reload` and `cd frontend && npm run dev`), log in as a test owner, and walk the wizard: configure a PC tier and a PlayStation tier in Step 4, confirm Step 5 shows two separate game sections (only PC and PlayStation — not Xbox/Nintendo), toggle a couple of presets in each, add one custom game to each, submit, and confirm no 422 error. This environment has no connected browser automation tool — do this by hand and report what you saw (per this session's earlier finding, Chrome extension automation isn't available here).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\(owner\)/owner/onboarding/page.tsx
git commit -m "feat(games): scope the onboarding Games step to configured platforms"
```

---

### Task 5: Frontend — customer café detail page renders games grouped by platform

**Files:**
- Modify: `frontend/src/types/cafe.ts:59`
- Modify: `frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx:596-610` (exact end line may shift slightly; locate the "Games" `<section>`)

**Interfaces:**
- Consumes: `PRESET_GAMES_BY_PLATFORM` not needed here — this reads whatever the backend returns for `cafe.supportedGames`, now `Record<string, string[]>`.

- [ ] **Step 1: Update the type**

At `frontend/src/types/cafe.ts:59`, change:
```ts
  supportedGames?: string[];
```
to:
```ts
  supportedGames?: Record<string, string[]>;
```

- [ ] **Step 2: Update the render**

Read `frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx` around line 596-612 first to get exact current indentation, then replace the flat-list block:

```tsx
      {/* Games */}
      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-h2 text-text-primary">Games available</h2>
        {cafe.supportedGames && Object.keys(cafe.supportedGames).length > 0 ? (
          <div className="flex flex-col gap-4">
            {Object.entries(cafe.supportedGames)
              .filter(([, games]) => games.length > 0)
              .map(([platform, games]) => (
                <div key={platform} className="flex flex-col gap-2">
                  <h3 className="text-caption font-semibold text-text-secondary uppercase tracking-wide">
                    {PLATFORMS.find((p) => p.value === platform)?.label || platform}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {games.map((game) => (
                      <div
                        key={game}
                        className="p-3.5 rounded-2xl bg-card border border-border/80 flex items-center gap-2.5 font-medium text-body text-text-primary"
                      >
                        {game}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-caption text-text-secondary">No games listed yet.</p>
        )}
      </section>
```

Add `import { PLATFORMS } from '@/constants/platforms';` to this file's imports if not already present. Check the original block's closing (what came after `{cafe.supportedGames.map((game) => (` — likely a closing `<div>` for an inner chip and an `) : (` fallback branch) to preserve whatever "no games" fallback text already existed there; adapt rather than guess if the original differs from what's assumed above.

- [ ] **Step 3: Verify it type-checks and manually spot-check**

Run: `cd frontend && npx tsc --noEmit`
Then load a café detail page for a café onboarded via Task 4's flow and confirm games render grouped under platform headings.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/cafe.ts "frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx"
git commit -m "feat(games): render supported games grouped by platform on café detail page"
```

---

## Part B — Media categories, admin review, and changes-requested

### Task 6: Backend — `CHANGES_REQUESTED` status + photo category backfill migration

**Files:**
- Modify: `backend/app/models/cafe.py:10-15` (`VerificationStatus` enum)
- Create: `backend/migrations/versions/032_changes_requested_and_photo_categories.py`
- Test: `backend/tests/test_migration_032_changes_requested.py`

**Interfaces:**
- Produces: `VerificationStatus.CHANGES_REQUESTED = "changes_requested"`, consumed by Task 8 (owner status UI), Task 9 (admin action), and Task 12/13 (resubmit flow). Also produces: every existing `cafes.photos` row that was a flat URL list becomes `[{"url": ..., "category": "exterior"}, ...]`.

- [ ] **Step 1: Add the enum value**

`backend/app/models/cafe.py:10-15`:

```python
class VerificationStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"
    SUSPENDED = "suspended"
    CHANGES_REQUESTED = "changes_requested"
```

- [ ] **Step 2: Write the failing migration test**

Create `backend/tests/test_migration_032_changes_requested.py`:

```python
import pytest
import importlib.util
import pathlib


def _load_migration_032():
    spec = importlib.util.spec_from_file_location(
        "migration_032",
        pathlib.Path(__file__).resolve().parents[1] / "migrations" / "versions" / "032_changes_requested_and_photo_categories.py",
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_photo_backfill_wraps_flat_urls_as_exterior():
    m = _load_migration_032()
    assert m._backfill_photos(["https://x/a.jpg", "https://x/b.jpg"]) == [
        {"url": "https://x/a.jpg", "category": "exterior"},
        {"url": "https://x/b.jpg", "category": "exterior"},
    ]
    assert m._backfill_photos([{"url": "https://x/a.jpg", "category": "seating"}]) == [
        {"url": "https://x/a.jpg", "category": "seating"}
    ]
    assert m._backfill_photos([]) == []
    assert m._backfill_photos(None) == []
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_migration_032_changes_requested.py -v`
Expected: FAIL — migration file doesn't exist yet.

- [ ] **Step 4: Write the migration**

Create `backend/migrations/versions/032_changes_requested_and_photo_categories.py`:

```python
"""add changes_requested verification status; backfill flat photo URLs into
categorized {url, category} objects

Revision ID: 032
Revises: 031
Create Date: 2026-09-15
"""
from alembic import op
import sqlalchemy as sa
import json

revision = '032'
down_revision = '031'
branch_labels = None
depends_on = None

cafes_table = sa.table(
    'cafes',
    sa.column('id', sa.Uuid()),
    sa.column('photos', sa.JSON()),
)


def _backfill_photos(value):
    """A flat list of URL strings (the only shape that existed before this
    migration) has no recorded category, so every entry defaults to
    'exterior' — a reasonable guess for test data (see spec), not a claim of
    accuracy. A list already made of {url, category} objects passes through
    unchanged."""
    if not value:
        return []
    if isinstance(value[0], dict):
        return value
    return [{"url": url, "category": "exterior"} for url in value]


def upgrade():
    # SQLite has no enum type — nothing to alter there for CHANGES_REQUESTED.
    if op.get_bind().dialect.name == 'postgresql':
        op.execute("ALTER TYPE verificationstatus ADD VALUE IF NOT EXISTS 'changes_requested'")

    bind = op.get_bind()
    rows = bind.execute(sa.select(cafes_table.c.id, cafes_table.c.photos)).fetchall()
    for row in rows:
        raw = row.photos
        if isinstance(raw, str):
            raw = json.loads(raw) if raw else []
        backfilled = _backfill_photos(raw)
        if backfilled != raw:
            bind.execute(
                cafes_table.update()
                .where(cafes_table.c.id == row.id)
                .values(photos=backfilled)
            )


def downgrade():
    # Postgres cannot drop an enum value (matches this repo's convention of
    # not reversing enum additions — see migrations 022, 028). Flattening
    # categorized photos back to bare URLs is lossy and unnecessary for the
    # same reason as migration 031's downgrade. No-op.
    pass
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_migration_032_changes_requested.py -v`
Expected: PASS

- [ ] **Step 6: Apply to the local dev DB**

Run: `cd backend && alembic upgrade head`
Expected: `alembic current` reports `032 (head)`. Spot-check: `sqlite3 khel_o.db "SELECT photos FROM cafes LIMIT 5;"` — every non-empty value should now be a JSON array of objects with `url`/`category` keys.

Do NOT run the full backend pytest suite as part of this task. `CafeBase.photos` still declares `List[str]` until Task 7 lands — the DB now holds `{url, category}` objects for any café with existing photos, so a full-suite run in this gap would spuriously fail wherever a `CafeResponse`-derived schema serializes one of those rows. Task 7's own Step 7 is the deferred full-suite gate for this change; dispatch Task 7 immediately next, with no other DB-touching task in between.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/cafe.py backend/migrations/versions/032_changes_requested_and_photo_categories.py backend/tests/test_migration_032_changes_requested.py
git commit -m "feat(review): add CHANGES_REQUESTED status; migrate 032 backfills categorized photos"
```

---

### Task 7: Backend — photo categories in schemas, presign, and update endpoints

**Files:**
- Modify: `backend/app/constants.py` (add `PHOTO_CATEGORIES`)
- Modify: `backend/app/schemas/cafe.py:46` (`CafeBase.photos`)
- Modify: `backend/app/api/v1/owner.py` (photos presign request, `CafeDetailsUpdate.photos`, photo delete)
- Test: `backend/tests/test_owner_photo_categories.py`

**Interfaces:**
- Consumes: `VerificationStatus` unaffected; this task only touches the `photos` shape.
- Produces: `POST /owner/cafes/{id}/photos/presign` now requires `category` in its body; `PATCH /owner/cafes/{id}` accepts `photos: [{url, category}]`. Consumed by Task 11 (owner gallery UI).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_owner_photo_categories.py`:

```python
import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.models.cafe import Cafe, VerificationStatus
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal


async def _make_owner_with_cafe(db):
    owner = User(
        id=uuid.uuid4(),
        email=f"photo_owner_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=get_password_hash("password123"),
        full_name="Photo Owner",
        role=UserRole.CAFE_OWNER,
        is_active=True,
    )
    db.add(owner)
    await db.flush()
    cafe = Cafe(
        id=uuid.uuid4(),
        owner_id=owner.id,
        name="Photo Test Cafe",
        address_line1="1 Photo St",
        city="Hyderabad",
        state="Telangana",
        pincode="500001",
        phone_number="+919000000040",
        verification_status=VerificationStatus.PENDING,
        is_active=True,
    )
    db.add(cafe)
    await db.commit()
    token = create_access_token(subject=str(owner.id), role=owner.role.value)
    return cafe, {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_photo_presign_requires_valid_category():
    async with AsyncSessionLocal() as db:
        cafe, headers = await _make_owner_with_cafe(db)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            bad = await client.post(
                f"/api/v1/owner/cafes/{cafe.id}/photos/presign",
                json={"contentType": "image/jpeg", "category": "not_a_real_category"},
                headers=headers,
            )
            assert bad.status_code == 422

            good = await client.post(
                f"/api/v1/owner/cafes/{cafe.id}/photos/presign",
                json={"contentType": "image/jpeg", "category": "play_area"},
                headers=headers,
            )
            assert good.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_owner_photo_categories.py -v`
Expected: FAIL — presign currently has no `category` field, so the "bad category" request returns 200 instead of 422.

- [ ] **Step 3: Add the category constant**

Append to `backend/app/constants.py`:

```python
PHOTO_CATEGORIES = ["exterior", "entrance", "play_area", "seating", "equipment", "ambience"]
```

- [ ] **Step 4: Update `CafeBase.photos`**

`backend/app/schemas/cafe.py:46`:

```python
    photos: List[Dict[str, str]] = Field(default_factory=list)
```

(Kept as `Dict[str, str]` rather than a stricter typed sub-model since this base is shared by both request and response paths across several files; category validation happens at the write boundary in Task 7's presign/update endpoints, not here — matches how `social_links: Dict[str, str]` is already handled loosely in this same file.)

- [ ] **Step 5: Add category validation to the presign and update endpoints**

`backend/app/api/v1/owner.py:2347-2350` currently defines the presign request model as:

```python
class PhotoPresignRequest(BaseModel):
    content_type: str = Field(..., min_length=1)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
```

Add a validated `category` field to it:

```python
class PhotoPresignRequest(BaseModel):
    content_type: str = Field(..., min_length=1)
    category: str

    @field_validator("category")
    @classmethod
    def _validate_category(cls, v: str) -> str:
        if v not in PHOTO_CATEGORIES:
            raise ValueError(f"category must be one of {PHOTO_CATEGORIES}")
        return v

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
```

Add `from app.constants import PHOTO_CATEGORIES` to this file's imports.

No change is needed to `presign_cafe_photo_upload` (`owner.py:2359-2376`) itself or to `create_presigned_upload` in `backend/app/services/storage_service.py:49` — the category is never part of the S3 key or the presigned URL; it only travels with the photo object once the frontend calls `PATCH /cafes/{cafe_id}` with `{url, category}` after the upload completes (Task 11). The presign endpoint's only job here is to reject an invalid category before the client wastes an upload on it — validation happens automatically via the new field, no handler code changes required.

For the `PATCH /cafes/{cafe_id}` details-update endpoint, `CafeDetailsUpdate.photos` (`owner.py:2008`) is currently:

```python
    photos: Optional[List[str]] = None
```

Change it to:

```python
    photos: Optional[List[Dict[str, str]]] = None
```

and add validation in the handler where `payload.photos` is assigned (`owner.py:2311-2314`):

```python
    if payload.photos is not None:
        if len(payload.photos) > settings.CAFE_PHOTO_MAX_COUNT:
            raise BadRequestException(f"A café can have at most {settings.CAFE_PHOTO_MAX_COUNT} photos")
        for p in payload.photos:
            if not isinstance(p, dict) or "url" not in p or p.get("category") not in PHOTO_CATEGORIES:
                raise BadRequestException("Each photo must include a url and a valid category")
        cafe.photos = payload.photos
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_owner_photo_categories.py -v`
Expected: PASS

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && python -m pytest -q`
Expected: PASS — check specifically for any test that posts to the photos-presign endpoint without a `category` field (search `tests/` for `photos/presign`); update any such test to include `"category": "exterior"` in its payload.

- [ ] **Step 8: Commit**

```bash
git add backend/app/constants.py backend/app/schemas/cafe.py backend/app/api/v1/owner.py backend/tests/test_owner_photo_categories.py
git commit -m "feat(media): require a category on café photo uploads"
```

---

### Task 8: Backend — fix duplicate hardware tiers on re-submit

**Files:**
- Modify: `backend/app/repositories/hardware_tier_repository.py`
- Modify: `backend/app/api/v1/owner.py:717-757` (onboarding submit handler's tier-creation block)
- Test: `backend/tests/test_platform_onboarding_submit.py`

**Interfaces:**
- Produces: `HardwareTierRepository.deactivate_all_for_cafe(cafe_id: UUID) -> None`, called by the onboarding submit handler before creating new tiers on any re-submission (draft resume, and — after Task 12/13 — a changes-requested resubmit). Without this fix, Task 12/13's resubmit flow would double a café's hardware tier count (and its total capacity) on every edit-and-resubmit cycle.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_platform_onboarding_submit.py`:

```python
@pytest.mark.asyncio
async def test_resubmitting_onboarding_replaces_hardware_tiers_not_duplicates():
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_resubmit_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Resubmit Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        base_payload = {
            "name": "Onboard Resubmit Cafe",
            "addressLine1": "1 Resubmit St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000050",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "hardwareTiers": [
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 6, "appBookableSeats": 2, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            first = await client.post("/api/v1/owner/onboarding/submit", json=base_payload, headers=headers)
            assert first.status_code == 200
            cafe_id = uuid.UUID(first.json()["data"]["cafeId"])

            second_payload = dict(base_payload)
            second_payload["hardwareTiers"] = [
                {"platform": "pc", "model": "RTX 4090", "totalSeats": 8, "appBookableSeats": 3, "hourlyRate": 150},
            ]
            second = await client.post("/api/v1/owner/onboarding/submit", json=second_payload, headers=headers)
            assert second.status_code == 200

        stmt = select(HardwareTier).where(HardwareTier.cafe_id == cafe_id, HardwareTier.is_active == True)
        result = await db.execute(stmt)
        active_tiers = result.scalars().all()
        assert len(active_tiers) == 1
        assert active_tiers[0].model == "RTX 4090"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_platform_onboarding_submit.py::test_resubmitting_onboarding_replaces_hardware_tiers_not_duplicates -v`
Expected: FAIL — `len(active_tiers) == 2` (both the RTX 4070 and RTX 4090 tiers exist and are active).

- [ ] **Step 3: Add the repository method**

Add to `backend/app/repositories/hardware_tier_repository.py` (inside `HardwareTierRepository`, near `deactivate`):

```python
    async def deactivate_all_for_cafe(self, cafe_id: UUID) -> None:
        from sqlalchemy import update
        await self.db.execute(
            update(HardwareTier)
            .where(HardwareTier.cafe_id == cafe_id, HardwareTier.is_active == True)
            .values(is_active=False)
        )
        await self.db.commit()
```

- [ ] **Step 4: Call it in the submit handler before creating new tiers**

In `backend/app/api/v1/owner.py`, the tier-creation block currently reads (around what was line 717-720 before this session's earlier edits shifted numbers — re-locate by searching for `# Create Hardware Tiers if provided`):

```python
    if payload.hardware_tiers:
        tier_repo = HardwareTierRepository(db)
        for tier_item in payload.hardware_tiers:
```

Change to:

```python
    if payload.hardware_tiers:
        tier_repo = HardwareTierRepository(db)
        await tier_repo.deactivate_all_for_cafe(cafe.id)
        for tier_item in payload.hardware_tiers:
```

This runs on every submission (both the first-time create branch and any later resubmission) — on a first submission there are no existing active tiers yet, so the deactivate call is a no-op there and only matters from the second submission onward.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_platform_onboarding_submit.py -v`
Expected: PASS, including the two pre-existing tests in this file (confirms the no-op-on-first-submit behavior didn't break them).

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && python -m pytest -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/repositories/hardware_tier_repository.py backend/app/api/v1/owner.py backend/tests/test_platform_onboarding_submit.py
git commit -m "fix(onboarding): deactivate existing hardware tiers before re-submit creates new ones"
```

---

### Task 9: Backend — `GET /onboarding/draft` synthesizes a snapshot for already-submitted cafés

**Files:**
- Modify: `backend/app/api/v1/owner.py` (`get_onboarding_draft` handler, ~line 530-545 before this session's edits)
- Test: `backend/tests/test_onboarding_draft_snapshot.py`

**Interfaces:**
- Consumes: `Cafe` row + `HardwareTierRepository.get_by_cafe_id` (Task 8's repository, unchanged method).
- Produces: `GET /onboarding/draft` returns a full `OnboardingState`-shaped `draft` object (camelCase keys) for any café whose `draft_data` is empty but which already has a submitted `Cafe` row — not just `{}`. Consumed by Task 13 (owner re-enters the wizard from a `changes_requested` café).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_onboarding_draft_snapshot.py`:

```python
import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.core.security import create_access_token, get_password_hash
from app.database import AsyncSessionLocal


@pytest.mark.asyncio
async def test_draft_endpoint_synthesizes_snapshot_after_full_submit():
    async with AsyncSessionLocal() as db:
        gamer = User(
            id=uuid.uuid4(),
            email=f"onboard_snapshot_{uuid.uuid4().hex[:6]}@test.com",
            password_hash=get_password_hash("password123"),
            full_name="Onboard Snapshot Test",
            role=UserRole.GAMER,
            is_active=True
        )
        db.add(gamer)
        await db.commit()

        token = create_access_token(subject=str(gamer.id), role=gamer.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        submit_payload = {
            "name": "Onboard Snapshot Cafe",
            "addressLine1": "1 Snapshot St",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001",
            "phoneNumber": "+919000000060",
            "openingTime": "09:00:00",
            "closingTime": "21:00:00",
            "upiVpa": "testowner@okhdfcbank",
            "confirmUpiVpa": "testowner@okhdfcbank",
            "supportedGames": {"pc": ["Valorant"]},
            "hardwareTiers": [
                {"platform": "pc", "model": "RTX 4070", "totalSeats": 6, "appBookableSeats": 2, "hourlyRate": 120},
            ],
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            submit_res = await client.post("/api/v1/owner/onboarding/submit", json=submit_payload, headers=headers)
            assert submit_res.status_code == 200

            draft_res = await client.get("/api/v1/owner/onboarding/draft", headers=headers)
            assert draft_res.status_code == 200
            draft = draft_res.json()["data"]["draft"]

            assert draft["name"] == "Onboard Snapshot Cafe"
            assert draft["supportedGames"] == {"pc": ["Valorant"]}
            assert len(draft["hardwareTiers"]) == 1
            assert draft["hardwareTiers"][0]["platform"] == "pc"
            assert draft["hardwareTiers"][0]["model"] == "RTX 4070"
            assert draft["hardwareTiers"][0]["totalSeats"] == 6
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_onboarding_draft_snapshot.py -v`
Expected: FAIL — `draft` is currently `{}` because `draft_data` was cleared to `{}` at submit time.

- [ ] **Step 3: Implement the snapshot synthesis**

Locate `get_onboarding_draft` in `backend/app/api/v1/owner.py` (search for `@router.get("/onboarding/draft"`). It currently reads:

```python
@router.get("/onboarding/draft", status_code=status.HTTP_200_OK)
async def get_onboarding_draft(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Cafe).where(Cafe.owner_id == current_user.id).order_by(Cafe.created_at.desc())
    res = await db.execute(stmt)
    cafe = res.scalars().first()
    draft_data = cafe.draft_data if cafe else {}
    return {
        "success": True,
        "data": {
            "draft": draft_data
        }
    }
```

Replace the body with:

```python
@router.get("/onboarding/draft", status_code=status.HTTP_200_OK)
async def get_onboarding_draft(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Cafe).where(Cafe.owner_id == current_user.id).order_by(Cafe.created_at.desc())
    res = await db.execute(stmt)
    cafe = res.scalars().first()

    if not cafe:
        return {"success": True, "data": {"draft": {}}}

    if cafe.draft_data:
        return {"success": True, "data": {"draft": cafe.draft_data}}

    if cafe.verification_status == VerificationStatus.DRAFT:
        # A brand-new café that hasn't gone through a full submission yet
        # and has no in-progress draft either — nothing to prefill.
        return {"success": True, "data": {"draft": {}}}

    # The café was fully submitted at least once, which unconditionally
    # clears draft_data (see the submit handler) — reconstruct an
    # OnboardingState-shaped snapshot from the live Cafe + HardwareTier rows
    # instead of returning nothing, so re-entering the wizard (e.g. from a
    # CHANGES_REQUESTED café) doesn't start blank.
    tier_repo = HardwareTierRepository(db)
    tiers = await tier_repo.get_by_cafe_id(cafe.id)
    snapshot = {
        "name": cafe.name,
        "description": cafe.description or "",
        "addressLine1": cafe.address_line1,
        "addressLine2": cafe.address_line2 or "",
        "city": cafe.city,
        "state": cafe.state,
        "pincode": cafe.pincode,
        "latitude": cafe.latitude,
        "longitude": cafe.longitude,
        "googleMapsUrl": cafe.google_maps_url or "",
        "phoneNumber": cafe.phone_number,
        "email": cafe.email or "",
        "openingTime": str(cafe.opening_time)[:5] if cafe.opening_time else "09:00",
        "closingTime": str(cafe.closing_time)[:5] if cafe.closing_time else "23:00",
        "amenities": cafe.amenities or [],
        "photos": cafe.photos or [],
        "supportedGames": cafe.supported_games or {},
        "cancellationPolicy": cafe.cancellation_policy or "",
        "houseRules": cafe.house_rules or [],
        "hardwareTiers": [
            {
                "id": str(t.id),
                "platform": t.platform.value if t.platform else "other",
                "model": t.model or "",
                "totalSeats": t.total_seats,
                "appBookableSeats": t.app_bookable_seats,
                "pricePerHour": float(t.price_per_hour),
                "tierType": t.tier_type,
                "activityKind": t.activity_kind,
            }
            for t in tiers
        ],
    }
    return {"success": True, "data": {"draft": snapshot}}
```

Add `from app.repositories.hardware_tier_repository import HardwareTierRepository` to this file's imports if not already present (it's already imported and used later in the same file for the submit handler, so this import likely already exists — check before adding a duplicate).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_onboarding_draft_snapshot.py -v`
Expected: PASS

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && python -m pytest -q`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/owner.py backend/tests/test_onboarding_draft_snapshot.py
git commit -m "feat(review): synthesize an onboarding draft snapshot for already-submitted cafés"
```

---

### Task 10: Frontend — photo category constant

**Files:**
- Create: `frontend/src/constants/photoCategories.ts`

**Interfaces:**
- Produces: `PHOTO_CATEGORIES: { value: string; label: string }[]`, consumed by Task 11 (owner upload UI) and Task 15 (admin photo grouping).

- [ ] **Step 1: Create the file**

```ts
// Mirrors backend/app/constants.py's PHOTO_CATEGORIES exactly.
export const PHOTO_CATEGORIES: { value: string; label: string }[] = [
  { value: 'exterior', label: 'Exterior' },
  { value: 'entrance', label: 'Entrance' },
  { value: 'play_area', label: 'Play Area' },
  { value: 'seating', label: 'Seating' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'ambience', label: 'Ambience' },
];
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/constants/photoCategories.ts
git commit -m "feat(media): add café photo category constant"
```

---

### Task 11: Frontend — categorized photo gallery in the owner's Edit Profile modal

**Files:**
- Modify: `frontend/src/lib/api/settings.ts` (photo upload/delete signatures)
- Modify: `frontend/src/components/owner/EditCafeModal.tsx` (photo state, handlers, and the Venue Photos grid)

**Interfaces:**
- Consumes: `PHOTO_CATEGORIES` from Task 10.
- Produces: nothing consumed elsewhere — this is the terminal owner-facing UI for the new photo shape.

- [ ] **Step 1: Update the API client**

In `frontend/src/lib/api/settings.ts`, change the photo presign/upload/delete functions to carry a category and the new shape:

```ts
export interface CafePhoto {
  url: string;
  category: string;
}
```

Change `OwnerSettings.photos: string[]` to `photos: CafePhoto[]`.

Change:
```ts
export async function presignCafePhotoUpload(
  cafeId: string,
  contentType: string
): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  return call(() => apiClient.post(`/api/v1/owner/cafes/${cafeId}/photos/presign`, { contentType }));
}
```
to:
```ts
export async function presignCafePhotoUpload(
  cafeId: string,
  contentType: string,
  category: string
): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  return call(() => apiClient.post(`/api/v1/owner/cafes/${cafeId}/photos/presign`, { contentType, category }));
}

export async function uploadCafePhoto(
  cafeId: string,
  file: File,
  category: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const { uploadUrl, publicUrl } = await presignCafePhotoUpload(cafeId, file.type, category);
  await axios.put(uploadUrl, file, {
    headers: { 'Content-Type': file.type },
    onUploadProgress: (evt) => {
      if (onProgress && evt.total) {
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    },
  });
  return publicUrl;
}
```

(Replaces the existing `uploadCafePhoto` — remove the old duplicate definition.) Change `deleteCafePhoto`'s return type to `{ photos: CafePhoto[] }` and `updateCafeDetails`'s `photos?: CafePhoto[]` in `CafeDetailsUpdateParams`.

- [ ] **Step 2: Update `EditCafeModal.tsx` state and handlers**

Change the state declaration (`EditCafeModal.tsx:81`):
```ts
  const [photos, setPhotos] = useState<string[]>(settings.photos || []);
```
to:
```ts
  const [photos, setPhotos] = useState<CafePhoto[]>(settings.photos || []);
  const [uploadCategory, setUploadCategory] = useState<string>('exterior');
```

Add `import { PHOTO_CATEGORIES } from '@/constants/photoCategories';` and `import type { CafePhoto } from '@/lib/api/settings';` (adjust the import path to match wherever `CafePhoto` ends up exported from — `settings.ts` per Step 1).

Update `persistPhotos`, `handleFilesSelected`, and `movePhoto` (`EditCafeModal.tsx:173-222, 303-313`) to work on `CafePhoto[]` instead of `string[]`:

```ts
  const persistPhotos = async (updated: CafePhoto[]) => {
    setPhotos(updated);
    await updateCafeDetails(cafeId, { photos: updated });
    onSaved({ photos: updated });
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);

    const remainingSlots = MAX_PHOTOS - photos.length;
    if (remainingSlots <= 0) {
      setUploadError(`A café can have at most ${MAX_PHOTOS} photos`);
      return;
    }

    const selected = Array.from(files).slice(0, remainingSlots);
    let workingPhotos = photos;

    for (const file of selected) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setUploadError('Only JPEG, PNG, or WebP images are allowed');
        continue;
      }
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
        setUploadError(`"${file.name}" is larger than ${MAX_PHOTO_MB}MB`);
        continue;
      }

      const tempKey = `${file.name}-${file.size}-${Date.now()}`;
      setUploadingCount((c) => c + 1);
      setUploadProgress((p) => ({ ...p, [tempKey]: 0 }));

      try {
        const publicUrl = await uploadCafePhoto(cafeId, file, uploadCategory, (pct) => {
          setUploadProgress((p) => ({ ...p, [tempKey]: pct }));
        });
        workingPhotos = [...workingPhotos, { url: publicUrl, category: uploadCategory }];
        await persistPhotos(workingPhotos);
      } catch (err: unknown) {
        setUploadError(err instanceof Error ? err.message : `Failed to upload "${file.name}"`);
      } finally {
        setUploadingCount((c) => c - 1);
        setUploadProgress((p) => {
          const { [tempKey]: _drop, ...rest } = p;
          return rest;
        });
      }
    }
  };
```

`handleDeletePhoto` calls `deleteCafePhoto(cafeId, url)` where `url` was previously the array element itself — now callers must pass `photo.url` (the delete endpoint still matches by URL string, unchanged server-side per Task 7). No change needed inside `handleDeletePhoto`'s body beyond its type signature accepting `CafePhoto['url']`; update the call sites in the render (Step 3).

`movePhoto` reorders by index and is otherwise shape-agnostic — no change needed beyond the `photos` type already being `CafePhoto[]`.

- [ ] **Step 3: Update the render — category picker + grouped grid**

Replace the "Venue Photos" block (`EditCafeModal.tsx:542-647`) with a category selector above the grid and grouped rendering:

```tsx
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <label className="text-caption font-semibold text-text-primary">
                  Venue Photos <span className="text-text-secondary font-normal">({photos.length}/{MAX_PHOTOS})</span>
                </label>
                {photos.length === 0 && (
                  <span className="text-caption text-text-secondary">Using stock photos until you upload real ones</span>
                )}
              </div>

              {uploadError && (
                <div className="rounded-xl bg-error/10 border border-error/20 p-3 text-caption text-error">{uploadError}</div>
              )}

              {photos.length === 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-warning/10 border border-warning/20 p-3 text-caption text-warning">
                  <ImageOff className="h-4 w-4 flex-shrink-0" />
                  <span>No real photos uploaded yet — customers currently see generic stock images.</span>
                </div>
              )}

              {PHOTO_CATEGORIES.map(({ value, label }) => {
                const categoryPhotos = photos.filter((p) => p.category === value);
                return (
                  <div key={value} className="flex flex-col gap-2">
                    <span className="text-overline text-text-tertiary uppercase tracking-wide">{label}</span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {categoryPhotos.map((photo) => {
                        const idx = photos.indexOf(photo);
                        return (
                          <div key={photo.url} className="relative aspect-square rounded-xl overflow-hidden border border-border group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photo.url}
                              alt={`${label} photo`}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                            {idx === 0 && (
                              <span className="absolute top-1.5 left-1.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
                                Cover
                              </span>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 sm:opacity-0 flex items-center justify-center gap-1.5 transition-opacity">
                              {idx > 0 && (
                                <button
                                  type="button"
                                  onClick={() => movePhoto(idx, -1)}
                                  className="h-8 w-8 flex items-center justify-center rounded-lg bg-white/90 text-text-primary"
                                  aria-label="Move earlier / make cover"
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </button>
                              )}
                              {idx < photos.length - 1 && (
                                <button
                                  type="button"
                                  onClick={() => movePhoto(idx, 1)}
                                  className="h-8 w-8 flex items-center justify-center rounded-lg bg-white/90 text-text-primary"
                                  aria-label="Move later"
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeletePhoto(photo.url)}
                                disabled={deletingUrl === photo.url}
                                className="h-8 w-8 flex items-center justify-center rounded-lg bg-white/90 text-error disabled:opacity-50"
                                aria-label="Delete photo"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {photos.length < MAX_PHOTOS && (
                        <button
                          type="button"
                          onClick={() => {
                            setUploadCategory(value);
                            fileInputRef.current?.click();
                          }}
                          disabled={uploadingCount > 0}
                          className="aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-caption font-semibold text-text-secondary hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                        >
                          <Plus className="h-5 w-5" />
                          <span>Add {label}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {Object.entries(uploadProgress).map(([key, pct]) => (
                <div key={key} className="aspect-square w-24 rounded-xl border border-border bg-surface flex flex-col items-center justify-center gap-1.5 text-caption text-text-secondary">
                  <Upload className="h-5 w-5 animate-pulse" />
                  <span>{pct}%</span>
                </div>
              ))}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
              <p className="text-caption text-text-secondary">
                JPEG, PNG, or WebP — up to {MAX_PHOTO_MB}MB each. First photo overall is the cover shown on listings.
              </p>
            </div>
```

The "Cover" badge and reorder buttons keep operating on the flat `photos` array's overall index (`idx = photos.indexOf(photo)`), preserving today's "first photo in the whole array is the cover" behavior even though the grid now renders grouped by category — reordering across categories still works because `movePhoto` never depended on category, only on array position.

- [ ] **Step 4: Verify it type-checks and manually verify in the browser**

Run: `cd frontend && npx tsc --noEmit`
Then open the owner dashboard → Settings → Edit Profile → Amenities & Photos tab, upload a photo under two different categories, confirm they render in their respective grouped sections, delete one, and confirm the customer-facing café detail page (Task 5b already handles games grouping; photos aren't grouped there per spec — `photosList` there should just flatten `.map(p => p.url)`, verify that still works).

Also update `CafeDetailClient.tsx:203` (`photosList`) since `cafe.photos` is now `CafePhoto[]`:
```ts
  const photosList = cafe.photos && cafe.photos.length > 0 ? cafe.photos.map((p) => p.url) : [];
```
and update `frontend/src/types/cafe.ts:60` (`Cafe.photos: string[]`) to `photos: { url: string; category: string }[]`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/settings.ts frontend/src/components/owner/EditCafeModal.tsx frontend/src/types/cafe.ts "frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx"
git commit -m "feat(media): categorize the owner-facing café photo gallery"
```

---

### Task 12: Frontend — owner-side changes-requested view

**Files:**
- Create: `frontend/src/components/owner/ChangesRequestedView.tsx`
- Modify: `frontend/src/app/(owner)/owner/dashboard/page.tsx:40-44, 293-300`
- Modify: `frontend/src/types/cafe.ts:133-135` (`AdminCafeVerifyRequest.status`)

**Interfaces:**
- Consumes: `statusState.cafe.rejectionReason` (already returned by `GET /owner/status`, unchanged).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Widen the status type**

`frontend/src/types/cafe.ts:133-135`:
```ts
export interface AdminCafeVerifyRequest {
  status: 'verified' | 'rejected' | 'suspended' | 'changes_requested';
  reason?: string;
}
```

- [ ] **Step 2: Create the view component**

```tsx
'use client';

import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { Card, CardContent, Badge, Button } from '@/components/ui';
import Link from 'next/link';

interface ChangesRequestedViewProps {
  cafeName?: string;
  note?: string | null;
  onRefreshStatus?: () => void;
}

export function ChangesRequestedView({ cafeName = 'Your Café', note, onRefreshStatus }: ChangesRequestedViewProps) {
  return (
    <div className="max-w-2xl mx-auto py-12 px-4 flex flex-col items-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-500/10 text-amber-500 mb-6 shadow-sm">
        <AlertTriangle className="h-8 w-8" />
      </div>

      <Badge variant="warning" size="md" className="mb-4">
        Changes Requested
      </Badge>

      <h1 className="font-heading text-display text-text-primary mb-3">
        Almost there — one thing to fix
      </h1>

      <p className="text-body text-text-secondary leading-relaxed mb-4">
        The KHEL verification team reviewed <span className="font-semibold text-text-primary">{cafeName}</span> and
        needs a small change before approving it.
      </p>

      {note && (
        <Card elevation="raised" className="w-full mb-8 text-left bg-surface border border-amber-500/30">
          <CardContent className="p-5">
            <p className="text-overline text-amber-600 font-semibold mb-1">Admin note</p>
            <p className="text-body text-text-primary">{note}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <Link href="/owner/onboarding">
          <Button variant="primary" className="gap-2">
            <span>Fix and Resubmit</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        {onRefreshStatus && (
          <Button variant="secondary" onClick={onRefreshStatus} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            <span>Refresh Status</span>
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire it into the dashboard's status branching**

`frontend/src/app/(owner)/owner/dashboard/page.tsx:40-44`, widen the status union:
```ts
  const [statusState, setStatusState] = useState<{
    status: 'loading' | 'prospective' | 'draft' | 'pending' | 'verified' | 'suspended' | 'changes_requested';
    cafe?: any;
  }>({ status: 'loading' });
```

Add `import { ChangesRequestedView } from '@/components/owner/ChangesRequestedView';` near the existing `ProspectiveOwnerView` import.

After the existing block at `page.tsx:293-300`:
```tsx
  if (statusState.status === 'pending' || statusState.status === 'draft') {
    return (
      <PendingApprovalView
        cafeName={(statusState.cafe?.name as string) || 'Your Gaming Café'}
        onRefreshStatus={loadStatusAndOps}
      />
    );
  }
```
add:
```tsx
  if (statusState.status === 'changes_requested') {
    return (
      <ChangesRequestedView
        cafeName={(statusState.cafe?.name as string) || 'Your Gaming Café'}
        note={statusState.cafe?.rejectionReason as string | undefined}
        onRefreshStatus={loadStatusAndOps}
      />
    );
  }
```

(`loadStatusAndOps` is the function this file already uses as `onRefreshStatus` for `PendingApprovalView` — reuse the same one.)

- [ ] **Step 4: Manually verify in the browser**

Using the admin verification-queue UI (after Task 14 adds the "Request Changes" action), set a test café to `changes_requested` with a note, then log in as that café's owner and confirm the dashboard shows `ChangesRequestedView` with the note, and that "Fix and Resubmit" navigates to `/owner/onboarding`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/owner/ChangesRequestedView.tsx frontend/src/app/\(owner\)/owner/dashboard/page.tsx frontend/src/types/cafe.ts
git commit -m "feat(review): show owners a changes-requested view with the admin's note"
```

---

### Task 13: Frontend — onboarding wizard prefills from a live café snapshot when resuming

**Files:**
- Modify: `frontend/src/app/(owner)/owner/onboarding/page.tsx:134-166` (`loadDraft` effect)

**Interfaces:**
- Consumes: Task 9's `GET /onboarding/draft` snapshot shape (camelCase `OnboardingState`-shaped object, with `hardwareTiers` items shaped like `TierConfig` minus `isCustomModel`).

- [ ] **Step 1: Confirm no code change is needed for the merge itself**

`loadDraft()` (`page.tsx:134-166`) already does `setFormData((prev) => ({ ...prev, ...draft }))`, which works unchanged for the new snapshot shape returned by Task 9 — no frontend change is required there. Tasks 4 and 12 touch other line ranges in this same file (the games step JSX and the `OnboardingState`/`INITIAL_STATE` fields, and the dashboard file respectively) and do not modify this effect, so there's no merge conflict to reconcile.

The existing hardware-tiers sanitizer inside `loadDraft` (`page.tsx:141-152`) filters out any tier missing `platform` and mints an `id` for any survivor that lacks one — Task 9's snapshot already includes `id: str(t.id)` for every tier, so every tier survives the filter and keeps its real id unchanged.

- [ ] **Step 2: Manually verify the resume flow end-to-end**

1. Submit a test onboarding application with 2 hardware tiers and games on 2 platforms.
2. As an admin, use the (Task 14) "Request Changes" action on that café with a note.
3. Log back in as the owner, land on `ChangesRequestedView` (Task 12), click "Fix and Resubmit".
4. Confirm the wizard opens with Step 1 fields, hardware tiers, and games all prefilled from the live snapshot (not blank) — this is the concrete acceptance check for Task 9's backend work, since Task 9 alone only has a backend-level test.
5. Edit one field, submit again, and confirm `GET /owner/status` now reports `pending` again.

- [ ] **Step 3: Commit (only if Step 1 surfaced an actual conflict to fix)**

```bash
git add frontend/src/app/\(owner\)/owner/onboarding/page.tsx
git commit -m "fix(review): confirm onboarding wizard prefill handles a resubmit snapshot"
```

(Skip this commit if Step 1 required no changes — leave a note in the task tracker that verification-only was needed.)

---

### Task 14: Frontend — admin "Request Changes" action

**Files:**
- Modify: `frontend/src/app/(admin)/admin/verification-queue/page.tsx`

**Interfaces:**
- Consumes: `AdminCafeVerifyRequest.status` widened in Task 12.

- [ ] **Step 1: Add the mutation**

In `verification-queue/page.tsx`, alongside the existing `rejectMutation` (around line 93-102), add:

```ts
  const [isChangesModalOpen, setIsChangesModalOpen] = useState(false);
  const [changesNote, setChangesNote] = useState('');

  const requestChangesMutation = useMutation({
    mutationFn: ({ cafeId, reason }: { cafeId: string; reason: string }) =>
      verifyCafe(cafeId, { status: 'changes_requested', reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      setIsChangesModalOpen(false);
      setSelectedCafe(null);
    },
  });
```

- [ ] **Step 2: Add the button next to Approve/Reject**

In the per-card "Inline Action Buttons" block (`page.tsx:262-285`), add a third button between Reject and Approve:

```tsx
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSelectedCafe(cafe);
                        setIsChangesModalOpen(true);
                      }}
                    >
                      Request Changes
                    </Button>
```

Do the same in the Full Details Modal's footer (`page.tsx:433-436`), between "Close" and "Approve Café":

```tsx
          <Button
            variant="secondary"
            onClick={() => {
              setIsChangesModalOpen(true);
            }}
          >
            Request Changes
          </Button>
```

- [ ] **Step 3: Add the reason modal**

Add a new `Modal` block right after the existing "Reject Modal with Reason" block (`page.tsx:293-331`), following the same structure:

```tsx
      {/* Request Changes Modal with Note */}
      <Modal
        isOpen={isChangesModalOpen}
        onClose={() => setIsChangesModalOpen(false)}
        title="Request Changes"
        description={`Tell ${selectedCafe?.name} what needs to change before approval.`}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsChangesModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isLoading={requestChangesMutation.isPending}
              loadingText="Sending..."
              disabled={!changesNote.trim()}
              onClick={() => {
                if (selectedCafe) {
                  requestChangesMutation.mutate({ cafeId: selectedCafe.id, reason: changesNote });
                }
              }}
            >
              Send to Owner
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Textarea
            label="What needs to change? *"
            placeholder="e.g. Please upload a clearer exterior photo / GSTIN doesn't match business name..."
            value={changesNote}
            onChange={(e) => setChangesNote(e.target.value)}
            required
          />
        </div>
      </Modal>
```

Also update the Full Details Modal's outer `isOpen` guard (`page.tsx:335`) so it doesn't stay open behind the new modal:
```tsx
        isOpen={!!selectedCafe && !isRejectModalOpen && !isChangesModalOpen}
```

- [ ] **Step 4: Manually verify in the browser**

Click "Request Changes" on a pending café, enter a note, confirm the mutation succeeds and the café drops out of the pending queue. Query the DB or use the admin analytics count to confirm `verification_status = 'changes_requested'` and `rejection_reason` holds the note.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(admin\)/admin/verification-queue/page.tsx
git commit -m "feat(review): add a Request Changes action to the admin verification queue"
```

---

### Task 15: Frontend — admin review modal shows photos, menu, games, and real pricing

**Files:**
- Modify: `frontend/src/app/(admin)/admin/verification-queue/page.tsx` (Full Details Modal body)
- Modify: `frontend/src/types/cafe.ts` (already updated for `photos`/`supportedGames` shape in Tasks 5/11 — no further type change needed here, just confirm `AdminCafe.tiers: HardwareTier[]` already exists via `CafeDetail`)

**Interfaces:**
- Consumes: `selectedCafe.photos: {url, category}[]` (Task 11), `selectedCafe.menuPhotos: string[]` (unchanged), `selectedCafe.supportedGames: Record<string, string[]>` (Task 1/5), `selectedCafe.tiers: HardwareTier[]` (already present on `AdminCafe` via `CafeDetail` — was already being fetched, just not rendered).

- [ ] **Step 1: Replace the dead hardware-tiers block with real pricing data**

The current block (`page.tsx:418-430`) reads `selectedCafe?.draftData?.hardwareTiers`, which is always empty for any café that has completed a full submission (`draft_data` is cleared at submit — see Task 9's finding). Replace it:

```tsx
          {selectedCafe?.tiers && selectedCafe.tiers.length > 0 && (
            <div className="p-3 rounded-xl bg-surface-hover">
              <h4 className="font-semibold text-caption mb-2">Resources & Pricing</h4>
              <div className="flex flex-col gap-1 text-xs">
                {selectedCafe.tiers.map((tier) => (
                  <div key={tier.id} className="flex justify-between">
                    <span>
                      {tier.name}
                      {tier.tierType === 'activity' && tier.activityKind ? ` (${tier.activityKind})` : ''}
                    </span>
                    <span className="text-text-tertiary">
                      {tier.platform ? `${tier.platform} · ` : ''}₹{tier.pricePerHour}/hr · {tier.totalSeats} seats
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
```

- [ ] **Step 2: Add Photos, Menu, and Games sections**

Add these three blocks after the new Resources & Pricing block, before the modal's closing `</div>` (`page.tsx:431`):

```tsx
          {selectedCafe?.photos && selectedCafe.photos.length > 0 && (
            <div className="p-3 rounded-xl bg-surface-hover">
              <h4 className="font-semibold text-caption mb-2">Photos</h4>
              <div className="flex flex-col gap-3">
                {PHOTO_CATEGORIES.map(({ value, label }) => {
                  const categoryPhotos = selectedCafe.photos.filter((p) => p.category === value);
                  if (categoryPhotos.length === 0) return null;
                  return (
                    <div key={value}>
                      <p className="text-overline text-text-tertiary mb-1">{label}</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {categoryPhotos.map((photo) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={photo.url}
                            src={photo.url}
                            alt={`${label} photo`}
                            className="aspect-square rounded-lg object-cover border border-border"
                            loading="lazy"
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {selectedCafe?.menuPhotos && selectedCafe.menuPhotos.length > 0 && (
            <div className="p-3 rounded-xl bg-surface-hover">
              <h4 className="font-semibold text-caption mb-2">Menu</h4>
              <div className="grid grid-cols-4 gap-1.5">
                {selectedCafe.menuPhotos.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="Menu photo" className="aspect-square rounded-lg object-cover border border-border" loading="lazy" />
                ))}
              </div>
            </div>
          )}

          {selectedCafe?.supportedGames && Object.keys(selectedCafe.supportedGames).length > 0 && (
            <div className="p-3 rounded-xl bg-surface-hover">
              <h4 className="font-semibold text-caption mb-2">Games</h4>
              <div className="flex flex-col gap-2">
                {Object.entries(selectedCafe.supportedGames)
                  .filter(([, games]) => games.length > 0)
                  .map(([platform, games]) => (
                    <div key={platform}>
                      <p className="text-overline text-text-tertiary mb-1">
                        {PLATFORMS.find((p) => p.value === platform)?.label || platform}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {games.map((game) => (
                          <Badge key={game} variant="default" size="sm">{game}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
```

Add `import { PHOTO_CATEGORIES } from '@/constants/photoCategories';` and `import { PLATFORMS } from '@/constants/platforms';` to this file's imports.

- [ ] **Step 3: Manually verify in the browser**

Open a pending café's Full Details modal (one submitted via Task 4/11's flows with photos uploaded through Edit Profile before admin review — recall from the spec that photo upload only happens after café creation, so use a café that's already `pending` and has had photos added via Settings). Confirm Photos render grouped by category, Menu renders if present, Games render grouped by platform, and Resources & Pricing shows real tier data instead of nothing.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(admin\)/admin/verification-queue/page.tsx
git commit -m "feat(review): show photos, menu, games, and real pricing in the admin review modal"
```

---

## Final verification

- [ ] Run `cd backend && python -m pytest -q` — full suite green.
- [ ] Run `cd frontend && npx tsc --noEmit` — no type errors.
- [ ] Walk the end-to-end flow once by hand: onboard a café with mixed PC/PlayStation/activity tiers and platform-scoped games → admin requests changes with a note → owner sees the note and resubmits with tiers/games/photos intact → admin approves, now seeing photos/menu/games/pricing in the review modal.
