# Owner Onboarding V2 — Platform-First Hardware Configuration

**Status:** Approved design, pending implementation plan
**Scope:** Sub-project 1 of "Owner Portal V2." The broader 10-section Owner
Portal IA (dashboard, bookings, availability, payments, account/security,
etc.) is explicitly out of scope for this spec — it is a follow-on project
once this data model ships, per the user's own sequencing.

## Problem

Café onboarding currently asks owners to configure "Hardware Tiers" by
picking a CPU, GPU, monitor, and RAM from dropdowns/free-text fields, then
separately choosing a "Platform" (PC/PlayStation/Xbox/Nintendo/Other) and a
"Console Model" — a workflow built around KHEL-O's internal data
abstractions, not how a non-technical café owner thinks about their
business. It also produced BUG #3: because there was no structured platform
field, a customer-facing "PS5 / Consoles" badge was derived by guessing from
the café's own *name* (`cafe.name.includes('velocity')`), which is both
fragile and unrelated to the café's actual configured hardware.

The fix is not a UI polish pass — it's introducing platform as a real,
structured field on the data owners already configure, and letting that
replace both the confusing onboarding form and the name-guessing hack.

## Goals

- Owner onboarding follows "what do you offer?" → simple per-platform
  configuration → games/amenities/menu, matching Don't Make Me Think.
- No CPU/GPU/RAM/monitor free text exposed to owners. Customer-facing specs
  are still generated (PC gamers care about GPU tier) — just derived
  server-side from a picklist, not typed by the owner.
- `hasConsoleTier`/`hasPcTier` (BUG #3's fix) stop guessing from café/tier
  names once real platform data exists.
- Zero booking disruption during rollout — capacity, pricing, and seat-lock
  behavior (BUG #1) are completely decoupled from this change.

## Non-goals

- The 10-section Owner Portal V2 IA (dashboard, bookings, availability,
  payments, account/security). Separate spec, separate project.
- Removing or restructuring `total_seats` / `app_bookable_seats` /
  `app_bookable_seats_locked` — those stay exactly as BUG #1 left them.
- A dynamic/admin-editable platform or model list. Fixed code constants,
  consistent with the `SUPPORTED_CITIES` decision made for BUG #2.

## Data model

Two new **nullable** columns on `hardware_tiers` (additive migration, no
backfill required — existing rows remain valid with `platform = NULL`):

- `platform`: enum `pc | playstation | xbox | nintendo | other`
- `model`: short string. For `pc`/`playstation`/`xbox`/`nintendo`, validated
  against a fixed picklist per platform (mirrors each platform's real
  lineup — e.g. PlayStation: PS5, PS5 Pro, PS4 Pro, PS4, Custom; PC: RTX
  4090, RTX 4070, RTX 3060, Budget, Custom). For `other`, free text (this is
  the explicit escape hatch, same pattern as the existing "Custom CPU (type
  below)" convention already used elsewhere in this codebase).

`name` remains on the table but changes role: it becomes a **cosmetic-only**
label, auto-suggested from platform+model (e.g. "PlayStation 5"), editable
by the owner for a custom corner name ("VIP Zone"), and — critically —
**never read by platform-detection logic again**. This is the actual
structural fix for BUG #3: platform classification moves from an unreliable
text signal (tier/café name) to a real typed column.

`specs` (existing JSON column) stays as the storage location for the
customer-facing spec string, but becomes machine-populated: selecting
platform=`pc`, model=`RTX 4070` server-side writes the equivalent of
`{"gpu": "NVIDIA RTX 4070"}` instead of the owner typing it.

`total_seats`, `app_bookable_seats`, `app_bookable_seats_locked`,
`price_per_hour` are **untouched**.

## Onboarding flow

Replaces the single "Hardware Tiers" step with:

1. **"What does your café offer?"** — multi-select chips: PC Gaming,
   PlayStation, Xbox, Nintendo, Other. At least one required. Drives which
   sections appear next.
2. **One configuration section per selected platform.** Each section holds
   one or more "configuration cards" (default one, owner can add more — this
   is how "PS5 ×4" and "PS4 Pro ×3" coexist under one PlayStation section).
   Each card = one `hardware_tiers` row and asks only:
   - Model (picklist for that platform; "Custom" always available)
   - Total stations
   - Bookable on KHEL-O app (**pre-filled at 25% of total stations**,
     per explicit product decision — most current bookings are walk-in —
     owner can adjust either number)
   - Price/hr
3. **Games** — already exists as checkbox multi-select
   (`formData.supportedGames`); unchanged.
4. **Amenities** — already exists as checkbox multi-select
   (`formData.amenities`); unchanged.
5. **Menu photo upload** — new. Single/multi image upload, reusing the
   existing photo-upload component already built for café photos.

The platform-first configuration screen (step 2) is not onboarding-exclusive
— it's the same component used for adding/editing tiers afterward from
owner settings, replacing today's CPU/GPU/Monitor "Add Tier"/"Edit Tier"
forms there too. One component, two entry points, so no second
jargon-heavy form exists for an owner to hit later.

## Migration of existing cafés

Triggered on next login for any owner whose café has ≥1 tier with
`platform IS NULL`. Framed as "Confirm what your café offers," not an error.

Each existing tier is **pre-filled with a best-effort guess** (the same
keyword matching already in `lib/platformTags.ts` — "PS4" in the name →
PlayStation/PS4, "RTX 3060" → PC/RTX 3060) and presented as an **editable
draft** the owner must explicitly confirm or correct. This is materially
different from BUG #3: that bug silently trusted a name-based guess and
displayed it to customers unverified. Here, the guess is only ever a
pre-fill a human confirms before it becomes real structured data.

Booking capability, pricing, and seat counts are completely unaffected
during transition — a café with `platform = NULL` tiers keeps booking
normally. The re-confirm step is a data-quality prompt, never a blocker.

`hasConsoleTier`/`hasPcTier` check the real `platform` column first,
falling back to today's name-guessing only for tiers that haven't been
migrated yet — so the customer-facing badge accuracy improves incrementally
as owners confirm, without ever regressing below today's behavior.

## Testing

- Backend: additive migration (nullable columns, no backfill);
  `model` validated against the platform's picklist (or free text under
  `other`); regression test confirming `platform = NULL` tiers still book,
  check in, and appear in availability exactly as today.
- Frontend: new platform-first config UI (onboarding + post-onboarding tier
  management), the re-confirm flow, and `platformTags.ts` updated to prefer
  the real column with the existing name-guessing as fallback.

## Explicitly out of scope

The 10-section Owner Portal V2 information architecture (dashboard,
bookings, availability, payments, account/security) — separate spec, once
this data model ships.
