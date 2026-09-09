# Phase 2 — Onboarding UX Fixes + Vocabulary Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four real onboarding UX defects (silent city default, +91 typing burden, activity-chip selection-state inconsistency, config-panel push-down) and rename owner-facing "hardware tier/station/seat" vocabulary to "resource/unit" across the onboarding wizard, the tiers management page, and owner nav — UI copy only, no schema or API changes.

**Architecture:** Four independent, additive edits to existing React components. No new files, no new dependencies, no backend touch. Each task is a self-contained diff to one file (or one file + its shared component), verified by `tsc --noEmit` and a manual read-through against the spec's exact string table.

**Tech Stack:** Next.js/React, TypeScript. No test runner exists in this frontend (`package.json` has only `dev`/`build`) — verification per task is `tsc --noEmit -p .` plus a manual diff read.

**Spec:** [`docs/superpowers/specs/2026-09-09-onboarding-ux-vocabulary-design.md`](../specs/2026-09-09-onboarding-ux-vocabulary-design.md)

## Global Constraints

- No backend/API/schema changes of any kind (Phase 3's job).
- No dashboard, customer-facing, or admin-page vocabulary changes (Phase 8/10's job).
- Internal field/variable names (`totalSeats`, `appBookableSeats`) and DB columns stay unchanged — copy only.
- No frontend test runner exists — verify each task with `tsc --noEmit -p .` run from `frontend/` plus a manual read of the diff against the spec's string table.
- Every renamed string must match the spec's table exactly (see spec's "Changes" section, item 2f table).

---

### Task 1: Blank onboarding defaults (2a) + fixed +91 phone prefix (2b)

**Files:**
- Modify: `frontend/src/app/(owner)/owner/onboarding/page.tsx`

**Interfaces:**
- Consumes: existing `OnboardingState` interface (already has `phoneNumber: string`, `city: string`, `state: string`, `pincode: string`, `latitude: number | null`, `longitude: number | null`).
- Produces: `formData.phoneNumber` continues to be stored as `+91XXXXXXXXXX` (10 digits after `+91`), consumed unchanged by the existing Step 2 validation regex (`^\+91[6-9]\d{9}$`, `page.tsx` inside `handleNext`, `if (step === 2)` block) and by `submitOnboardingApplication`'s `phoneNumber` field.

- [ ] **Step 1: Blank the silent defaults in `INITIAL_STATE`**

Find the `INITIAL_STATE` object (currently around line 84-120) and change:

```ts
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560001',
  latitude: 12.9716,
  longitude: 77.5946,
```

to:

```ts
  city: '',
  state: '',
  pincode: '',
  latitude: null,
  longitude: null,
```

- [ ] **Step 2: Verify Step 1 validation already blocks blank submission**

Read the `handleNext` function's `if (step === 1)` block. It already checks
`!formData.name || !formData.addressLine1 || !formData.city || !formData.state || !formData.pincode`
and returns an error — no change needed here, this step is a read-only
confirmation that Step 1 is unaffected by the blanked defaults.

- [ ] **Step 3: Add a fixed +91 prefix to the phone input**

Find the phone `Input` in Step 2 (currently):

```tsx
                  <Input
                    label="Business Contact Phone Number"
                    placeholder="+91 98765 43210"
                    value={formData.phoneNumber}
                    onChange={(e) => updateField('phoneNumber', e.target.value)}
                  />
```

Replace with a wrapped layout that shows a fixed, non-editable `🇮🇳 +91`
prefix and accepts only 10 digits, normalizing to `+91XXXXXXXXXX` in state:

```tsx
                  <div className="flex flex-col gap-1.5">
                    <label className="text-caption font-semibold text-text-primary">
                      Business Contact Phone Number
                    </label>
                    <div className="flex items-center gap-2 h-10 rounded-xl border border-border bg-card px-3 focus-within:ring-2 focus-within:ring-primary/20">
                      <span className="text-body text-text-secondary select-none">🇮🇳 +91</span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        placeholder="98765 43210"
                        value={formData.phoneNumber.replace(/^\+91/, '')}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                          updateField('phoneNumber', digits ? `+91${digits}` : '');
                        }}
                        className="flex-1 bg-transparent text-body text-text-primary focus:outline-none"
                      />
                    </div>
                  </div>
```

This keeps `formData.phoneNumber` as `''` or `+91XXXXXXXXXX` at every
point, so the existing Step 2 validation regex and the submit payload
(`phoneNumber: formData.phoneNumber || user?.phoneNumber || '+919876543210'`)
both keep working unchanged.

- [ ] **Step 4: Verify with tsc**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: no new errors introduced by this file.

- [ ] **Step 5: Manual diff read**

Re-read the diff for this task: confirm `INITIAL_STATE` has no leftover
Bengaluru/Karnataka/560001/lat/lng values, and the phone input strips
non-digits and caps at 10 before prefixing `+91`.

- [ ] **Step 6: Commit**

```bash
git add "frontend/src/app/(owner)/owner/onboarding/page.tsx"
git commit -m "fix(onboarding): blank silent city/state/pincode defaults, add fixed +91 phone prefix (2a, 2b)"
```

---

### Task 2: Activity chip selection-state parity (2d) + platform panel accordion (2e)

**Files:**
- Modify: `frontend/src/components/owner/PlatformTierConfigurator.tsx`

**Interfaces:**
- Consumes: existing `configs: TierConfig[]`, `onChange`, `maxConfigs` props; `TierConfig.tierType`, `TierConfig.activityKind`, `Platform` type from `@/constants/platforms`.
- Produces: no exported interface changes — `PlatformTierConfiguratorProps` is unchanged, so `onboarding/page.tsx` and `owner/tiers/page.tsx` (both consumers) need no changes for this task.

- [ ] **Step 1: Highlight activity chips that already have a config**

Find the `ACTIVITY_PRESETS.map` block (currently lines 174-188):

```tsx
          {ACTIVITY_PRESETS.map(({ key, label, icon: Icon, defaultIndividualUnits }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                const next = makeDefaultActivityConfig(key, defaultIndividualUnits);
                onChange([...configs, next]);
                setJustAddedId(next.id);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-caption font-semibold border border-border bg-surface text-text-secondary hover:border-primary/60 transition-all"
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
```

Replace with a version that computes `hasConfig` per chip and applies the
same selected-state classes the `PLATFORMS.map` chips use:

```tsx
          {ACTIVITY_PRESETS.map(({ key, label, icon: Icon, defaultIndividualUnits }) => {
            const hasConfig = configs.some((c) => c.tierType === 'activity' && c.activityKind === key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  const next = makeDefaultActivityConfig(key, defaultIndividualUnits);
                  onChange([...configs, next]);
                  setJustAddedId(next.id);
                }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-caption font-semibold border transition-all ${
                  hasConfig
                    ? 'bg-primary text-white border-primary'
                    : 'bg-surface text-text-secondary border-border hover:border-primary/60'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
```

The "Other" activity button (the separate button right after this map,
currently lines 189-200) is left as-is — it has no single `key` to check
selection against, since every click creates a differently-named custom
activity.

- [ ] **Step 2: Add per-platform expanded state**

Find the `PlatformTierConfigurator` function body's state declarations
(after `justAddedId`'s `useEffect`, currently ending around line 82).
Add:

```ts
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<Platform>>(new Set());
```

- [ ] **Step 3: Auto-expand a platform when it's newly toggled on**

Find `togglePlatform` (currently lines 84-100). In each branch that adds a
new config (the `maxConfigs !== undefined` branch and the final `else`
branch), after `setJustAddedId(next.id);`, add:

```ts
      setExpandedPlatforms((prev) => new Set(prev).add(platform));
```

So the full function reads:

```ts
  const togglePlatform = (platform: Platform) => {
    if (selectedPlatforms.includes(platform)) {
      onChange(configs.filter((c) => c.tierType === 'activity' || c.platform !== platform));
    } else if (maxConfigs !== undefined) {
      const next = makeDefaultConfig(platform);
      onChange([...configs.filter((c) => c.tierType === 'activity'), next]);
      setJustAddedId(next.id);
      setExpandedPlatforms((prev) => new Set(prev).add(platform));
    } else {
      const next = makeDefaultConfig(platform);
      onChange([...configs, next]);
      setJustAddedId(next.id);
      setExpandedPlatforms((prev) => new Set(prev).add(platform));
    }
  };
```

- [ ] **Step 4: Turn each platform's panel header into an accordion toggle**

Find the platform panel render block (currently lines 272-360, the
`PLATFORMS.filter((p) => selectedPlatforms.includes(p.value)).map((p) => {...})`
block). Its header is currently:

```tsx
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-heading text-body-emphasis font-bold text-text-primary">
                <PlatformIcon platform={p.value} className="h-4 w-4 text-primary" />
                {p.label}
              </h3>
              {!atCap && (
                <button
                  type="button"
                  onClick={() => addConfig(p.value)}
                  className="flex items-center gap-1 text-caption font-semibold text-primary hover:text-primary/80"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add configuration
                </button>
              )}
            </div>

            {platformConfigs.map((config) => (
```

Replace with a version where the `<h3>` becomes a clickable toggle and the
config list below it is conditionally rendered:

```tsx
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() =>
                  setExpandedPlatforms((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.value)) {
                      next.delete(p.value);
                    } else {
                      next.add(p.value);
                    }
                    return next;
                  })
                }
                className="flex items-center gap-2 font-heading text-body-emphasis font-bold text-text-primary"
              >
                <PlatformIcon platform={p.value} className="h-4 w-4 text-primary" />
                {p.label}
                <ChevronRight
                  className={cn(
                    'h-4 w-4 text-text-tertiary transition-transform',
                    expandedPlatforms.has(p.value) && 'rotate-90'
                  )}
                />
              </button>
              {!atCap && (
                <button
                  type="button"
                  onClick={() => addConfig(p.value)}
                  className="flex items-center gap-1 text-caption font-semibold text-primary hover:text-primary/80"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add configuration
                </button>
              )}
            </div>

            {expandedPlatforms.has(p.value) && platformConfigs.map((config) => (
```

Note the closing of the `.map((config) => (...))` call is unchanged — only
the opening condition gains `expandedPlatforms.has(p.value) &&`.

- [ ] **Step 5: Import `ChevronRight`**

Find the top-of-file import from `lucide-react` (currently
`import { Plus, Trash2 } from 'lucide-react';`) and change to:

```ts
import { Plus, Trash2, ChevronRight } from 'lucide-react';
```

- [ ] **Step 6: Verify with tsc**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 7: Manual diff read**

Confirm: activity chips highlight once a config with matching
`activityKind` exists; toggling a platform on auto-expands its panel;
clicking the header toggles expand/collapse without affecting
`addConfig`/`removeConfig` behavior; the activities section's own render
block (lines ~203-269) is untouched.

- [ ] **Step 8: Commit**

```bash
git add "frontend/src/components/owner/PlatformTierConfigurator.tsx"
git commit -m "fix(onboarding): activity chip selection-state parity, accordion platform panels (2d, 2e)"
```

---

### Task 3: Vocabulary rename — onboarding wizard + shared configurator (2f, part 1)

**Files:**
- Modify: `frontend/src/app/(owner)/owner/onboarding/page.tsx`
- Modify: `frontend/src/components/owner/PlatformTierConfigurator.tsx`

**Interfaces:**
- No signature changes — string literals only.

- [ ] **Step 1: Rename Step 4 heading and stepsList entry in `onboarding/page.tsx`**

Change:

```tsx
                    <span>4. Operating Hours & Hardware Tiers</span>
```

to:

```tsx
                    <span>4. Operating Hours & Resources</span>
```

And change the `stepsList` array entry:

```ts
    { title: 'Hours & Hardware Tiers', icon: Monitor },
```

to:

```ts
    { title: 'Hours & Resources', icon: Monitor },
```

- [ ] **Step 2: Rename the "Total Station Capacity" field label**

Change:

```tsx
                  <NumericField
                    label="Total Station Capacity"
                    min={1}
                    value={formData.totalSeats}
                    onChange={(n) => updateField('totalSeats', n)}
                  />
```

to:

```tsx
                  <NumericField
                    label="Available Units"
                    min={1}
                    value={formData.totalSeats}
                    onChange={(n) => updateField('totalSeats', n)}
                  />
```

- [ ] **Step 3: Rename the Step 6 summary label**

Change:

```tsx
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Hardware Tiers:</span>
                    <span className="font-semibold text-text-primary">{formData.hardwareTiers.length} Tiers Configured</span>
                  </div>
```

to:

```tsx
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Resources & Pricing:</span>
                    <span className="font-semibold text-text-primary">{formData.hardwareTiers.length} Resources Configured</span>
                  </div>
```

- [ ] **Step 4: Rename "Total stations" in `PlatformTierConfigurator.tsx`**

Change:

```tsx
                <NumericField
                  label="Total stations"
                  min={1}
                  value={config.totalSeats}
                  onChange={(n) => updateConfig(config.id, { totalSeats: n })}
                />
```

to:

```tsx
                <NumericField
                  label="Total units"
                  min={1}
                  value={config.totalSeats}
                  onChange={(n) => updateConfig(config.id, { totalSeats: n })}
                />
```

- [ ] **Step 5: Verify with tsc**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 6: Manual diff read**

Grep the two files for the words "hardware", "station", "seat" in
user-visible strings (not variable names) to confirm none remain:

```bash
grep -n -i "hardware tier\|total station\|total stations" "frontend/src/app/(owner)/owner/onboarding/page.tsx" "frontend/src/components/owner/PlatformTierConfigurator.tsx"
```

Expected: no matches in JSX text/label content (matches inside comments
referencing old names are fine to leave, but check none remain in
rendered strings).

- [ ] **Step 7: Commit**

```bash
git add "frontend/src/app/(owner)/owner/onboarding/page.tsx" "frontend/src/components/owner/PlatformTierConfigurator.tsx"
git commit -m "docs(onboarding): rename hardware-tier vocabulary to Resources & Pricing (2f part 1)"
```

---

### Task 4: Vocabulary rename — tiers management page + owner nav (2f, part 2)

**Files:**
- Modify: `frontend/src/app/(owner)/owner/tiers/page.tsx`
- Modify: `frontend/src/components/layout/OwnerShell.tsx`

**Interfaces:**
- No signature changes — string literals only.

- [ ] **Step 1: Rename page title in `owner/tiers/page.tsx`**

Change:

```tsx
        title="Stations & prices"
```

to:

```tsx
        title="Resources & Pricing"
```

- [ ] **Step 2: Rename toast messages**

Change:

```tsx
      setToastMessage('Hardware tier created');
```

to:

```tsx
      setToastMessage('Resource created');
```

Change:

```tsx
      setToastMessage('Hardware tier updated');
```

to:

```tsx
      setToastMessage('Resource updated');
```

- [ ] **Step 3: Rename ErrorState and EmptyState copy**

Change:

```tsx
            title="Failed to load hardware tiers"
```

to:

```tsx
            title="Failed to load resources"
```

Change:

```tsx
            title="No stations set up yet"
            description="Add a group for each kind of station you have — say “Gaming PCs” or “PS5”. Customers can't book until at least one group exists."
```

to:

```tsx
            title="No resources set up yet"
            description="Add a group for each kind of resource you have — say “Gaming PCs” or “PS5”. Customers can't book until at least one group exists."
```

- [ ] **Step 4: Rename per-tier stat copy**

Change:

```tsx
                        {tier.totalSeats} {tier.totalSeats === 1 ? 'seat' : 'seats'} in total
```

to:

```tsx
                        {tier.totalSeats} {tier.totalSeats === 1 ? 'unit' : 'units'} in total
```

- [ ] **Step 5: Rename modal title/description and submit button**

Change:

```tsx
        title={editingTierId ? 'Edit Hardware Tier & Seat Quota' : 'Add Hardware Tier'}
        description="Configure station specs, total seats, app-bookable vs walk-in quota, and hourly rates."
```

to:

```tsx
        title={editingTierId ? 'Edit Resource & Unit Quota' : 'Add Resource'}
        description="Configure specs, total units, app-bookable vs walk-in quota, and hourly rates."
```

Change:

```tsx
              {editingTierId ? 'Save Changes' : 'Create Hardware Tier'}
```

to:

```tsx
              {editingTierId ? 'Save Changes' : 'Create Resource'}
```

- [ ] **Step 6: Rename the validation error message**

Change:

```tsx
      setFormError('App bookable seats cannot exceed total seats.');
```

to:

```tsx
      setFormError('App bookable units cannot exceed total units.');
```

- [ ] **Step 7: Rename the owner nav label in `OwnerShell.tsx`**

Change:

```tsx
        label: 'Stations & Prices',
```

to:

```tsx
        label: 'Resources & Pricing',
```

Also update the comment just above it (currently referencing "Hardware
Tiers" and "Stations & Prices" as jargon examples):

```tsx
// and "Hardware Tiers" are KHEL-O vocabulary that a first-time owner has no
// way to decode; "Scan & Check-in" and "Stations & Prices" describe the task.
```

to:

```tsx
// and "Resources & Pricing" are KHEL-O vocabulary that a first-time owner
// has no way to decode; "Scan & Check-in" and "Resources & Pricing" describe the task.
```

(This comment now reads oddly since both halves converged on the same
label — read the full comment in place before editing and adjust the
wording so it still makes sense contrasting jargon vs. task-describing
labels; if "Resources & Pricing" no longer serves as the "clear" example,
pick a still-accurate contrasting pair from the surrounding nav items
instead of leaving a self-contradictory comment.)

- [ ] **Step 8: Verify with tsc**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 9: Manual diff read**

```bash
grep -n -i "hardware tier\|stations & prices\|seat" "frontend/src/app/(owner)/owner/tiers/page.tsx" "frontend/src/components/layout/OwnerShell.tsx"
```

Expected: no matches in rendered strings (comments referencing history are
acceptable only if they still read coherently after Step 7's edit).

- [ ] **Step 10: Commit**

```bash
git add "frontend/src/app/(owner)/owner/tiers/page.tsx" "frontend/src/components/layout/OwnerShell.tsx"
git commit -m "docs(owner): rename Stations & Prices to Resources & Pricing across tiers page and nav (2f part 2)"
```

---

## Self-Review Notes

**Spec coverage:** 2a → Task 1 Steps 1-2. 2b → Task 1 Step 3. 2c →
documented in spec as already fixed, no task needed (verified by code
read during brainstorming, re-confirmed not to require a task here). 2d →
Task 2 Step 1. 2e → Task 2 Steps 2-4. 2f → Tasks 3-4. All six roadmap
items are accounted for.

**Placeholder scan:** no TBD/TODO; every step has literal before/after
code. Task 4 Step 7's comment update is intentionally left as a judgment
call rather than a fixed literal, because the "correct" contrasting pair
depends on reading the comment's surrounding nav-item list at edit time —
flagged explicitly with instructions rather than left silently vague.

**Type consistency:** `ChevronRight` import added once in Task 2 Step 5,
used once in Task 2 Step 4 — consistent. `expandedPlatforms: Set<Platform>`
declared in Task 2 Step 2, used in Steps 3-4 with matching type. No new
exported interfaces, so no cross-task signature drift is possible.

**Ruling:** Task 4 Step 7's nav comment is the one step in this plan that
isn't a pure literal find-replace — its resolution is deferred to
execution time with explicit reasoning for why (the comment's contrast
depends on which nav item reads as "jargon" vs "clear" once both halves
share a name). This is a documented ruling, not a placeholder.
