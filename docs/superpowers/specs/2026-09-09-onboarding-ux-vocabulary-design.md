# Phase 2 — Onboarding UX Fixes + Vocabulary Rename — Design Spec

## Context

Source: [`2026-09-09-venue-agnostic-owner-roadmap.md`](2026-09-09-venue-agnostic-owner-roadmap.md),
Phase 2 (items 2a-2f). Schema changes: none. Risk: low. Independent of
Phase 1 and of every later phase.

Two of the roadmap's six items were already resolved by earlier work
(`69f72b7 feat(activities): add Activities mode to PlatformTierConfigurator`),
discovered during this spec's investigation rather than assumed from the
roadmap text. This spec documents what is actually still broken.

## Scope decision: 2f is frontend-only

Item 2f's roadmap text says "the API response layer does the translation,"
which overlaps with Phase 3 ("Resource vocabulary at the API layer"). Ruling
(confirmed with the user): **Phase 2 renames only what the owner reads in
the UI** — labels, headings, toasts, validation copy. No API response shape
changes, no field renames. Phase 3 handles the response-layer translation
later. Internal state field names (`totalSeats`, `appBookableSeats`) and
database columns are untouched — copy only.

## Findings from code investigation

- **2c ("Other" is a dead checkbox)** — **already fixed.** In
  `PlatformTierConfigurator.tsx`, selecting the `other` platform chip renders
  a real text `Input` for the model name (lines 305-310), not a checkbox.
  No code change; verified by reading the current component.
- **2d (selection-state inconsistency)** — **partially fixed.** Platform
  chips (PC/PlayStation/Xbox/Nintendo/Other) already share identical
  `bg-primary`/border selected styling driven by `selectedPlatforms.includes(p.value)`.
  The gap that remains: activity chips (Snooker, Bowling, etc., from
  `ACTIVITY_PRESETS`) are pure "add" buttons with no selected-state styling
  at all — clicking one always adds a new card, and the chip itself never
  reflects that an activity of that kind already exists. This is the
  genuine PC-vs-Snooker inconsistency to fix.
- **2a, 2b, 2e, 2f** — confirmed still present as described below.

## Changes

### 2a — City must never silently default to Bengaluru

`frontend/src/app/(owner)/owner/onboarding/page.tsx`, `INITIAL_STATE`:
blank `city`, `state`, `pincode`, `latitude`, `longitude` (currently
`'Bengaluru'`, `'Karnataka'`, `'560001'`, `12.9716`, `77.5946`). Step 1's
`handleNext` validation already rejects empty city/state/pincode, so no
new validation logic is needed — only the seed values change.

### 2b — Phone input drops the +91 typing burden

Same file, Step 2's phone `Input`: render a fixed, non-editable `🇮🇳 +91`
prefix inline with the field, restrict typed input to 10 digits
(strip non-digits, cap length), and store `formData.phoneNumber` as
`+91XXXXXXXXXX` internally so the existing Step 2 validation regex
(`^\+91[6-9]\d{9}$`) and the backend's identical regex both keep working
unchanged.

### 2d — Activity chip selection-state parity

`PlatformTierConfigurator.tsx`: the `ACTIVITY_PRESETS.map` chip render gets
the same conditional class treatment as `PLATFORMS.map` — highlighted
(`bg-primary`/border) when `configs.some(c => c.tierType === 'activity' && c.activityKind === key)`,
matching the platform chips' visual language. Clicking still adds a new
card (unchanged behavior); only the visual affordance changes.

### 2e — Configuration panels become an accordion

`PlatformTierConfigurator.tsx`: today, each selected platform's config
panel (the `PLATFORMS.filter(...).map(...)` block, lines 272-360) renders
unconditionally below the chip rows — selecting multiple platforms stacks
multiple full panels and pushes later content down. Change: each panel
becomes a collapsible section anchored directly beneath its own chip row,
default-expanded when first added (so the "just added" highlight still
works) and collapsible afterward via a header toggle. Local `expanded`
state (`Record<Platform, boolean>`) keyed by platform, defaulting to
`true` for the platform just toggled on. No change to the activities
list's own per-card layout — only platform panels get the accordion
treatment, since the roadmap's complaint (2e) is specifically about
platform panels pushing cards down.

### 2f — Vocabulary rename (UI copy only)

| File | Current | New |
|---|---|---|
| `onboarding/page.tsx` | "4. Operating Hours & Hardware Tiers" | "4. Operating Hours & Resources" |
| `onboarding/page.tsx` | `stepsList` entry "Hours & Hardware Tiers" | "Hours & Resources" |
| `onboarding/page.tsx` | NumericField label "Total Station Capacity" | "Available Units" |
| `onboarding/page.tsx` | Step 6 summary label "Hardware Tiers:" | "Resources & Pricing:" |
| `PlatformTierConfigurator.tsx` | NumericField label "Total stations" | "Total units" |
| `owner/tiers/page.tsx` | Page title "Stations & prices" | "Resources & Pricing" |
| `owner/tiers/page.tsx` | Toast "Hardware tier created" | "Resource created" |
| `owner/tiers/page.tsx` | Toast "Hardware tier updated" | "Resource updated" |
| `owner/tiers/page.tsx` | ErrorState title "Failed to load hardware tiers" | "Failed to load resources" |
| `owner/tiers/page.tsx` | EmptyState title "No stations set up yet" | "No resources set up yet" |
| `owner/tiers/page.tsx` | EmptyState description "...kind of station you have..." | "...kind of resource you have..." |
| `owner/tiers/page.tsx` | Modal title "Edit Hardware Tier & Seat Quota" | "Edit Resource & Unit Quota" |
| `owner/tiers/page.tsx` | Modal title "Add Hardware Tier" | "Add Resource" |
| `owner/tiers/page.tsx` | Modal description "Configure station specs, total seats..." | "Configure specs, total units..." |
| `owner/tiers/page.tsx` | Button "Create Hardware Tier" | "Create Resource" |
| `owner/tiers/page.tsx` | "{n} seat(s) in total" | "{n} unit(s) in total" |
| `owner/tiers/page.tsx` | Validation "App bookable seats cannot exceed total seats." | "App bookable units cannot exceed total units." |
| `OwnerShell.tsx` | Nav label "Stations & Prices" | "Resources & Pricing" |
| `OwnerShell.tsx` | Comment referencing "Hardware Tiers"/"Stations & Prices" as jargon | update comment to match new label (comment only, no behavior change) |

This literal string list is exhaustive for the two files/component/nav
item in scope. Dashboard "Seats Available" cards, customer-facing pages,
admin pages, and legal pages are explicitly **out of scope** — those
belong to Phase 8 (admin review), Phase 10 (dashboard/nav/insights), or
are unrelated to the owner vocabulary problem entirely.

## Non-goals

- No backend/API changes, no migrations (Phase 3's job).
- No dashboard, customer-facing, or admin-page vocabulary changes (Phase
  8/10's job).
- No games/activity library changes (Phase 6's job).

## Testing

No frontend test runner exists in this repo (`package.json` has only
`dev`/`build` scripts). Verification: `tsc --noEmit -p .` for type
correctness after each change, plus manual code-read verification of each
diff against this spec (no browser available in this environment — flagged
as a follow-up manual-verification item, consistent with Phase 1's
unresolved browser-verification gap).

## Acceptance criteria (from roadmap, unchanged)

A snooker-only venue can complete onboarding without encountering the
words "hardware", "station", or "seat"; no field is pre-filled with a
value the owner did not choose.
