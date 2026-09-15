# Platform-Scoped Games & Media Review Workflow

Date: 2026-09-15
Status: Approved for implementation
Covers: Phase 6 (Games vs Activities, custom games) and Phase 8 (Media and admin review workflow) of `2026-09-09-venue-agnostic-owner-roadmap.md`

## Context

The onboarding wizard currently treats "games" as a single flat list scoped
to PC gaming (`PRESET_GAMES`, 12 titles), even though a café can now offer
PlayStation, Xbox, Nintendo, or non-gaming activities (snooker, bowling,
etc.) via `PlatformTierConfigurator`. An interim custom-game text box was
added ahead of this spec so owners aren't blocked, but it isn't
platform-aware.

Separately, café photos are a flat `List[str]` with no categorization, and
the admin verification queue's review modal only shows business identity,
documents, and payout info — not photos, menu, games, or resource pricing —
despite `docs/LAUNCH_QA_PLAN.md` and the onboarding flow now collecting all
of that. Admins currently approve or reject cafés they can't actually see
the storefront of. The only two admin actions are `verified` / `rejected`;
there's no way to ask an owner to fix one specific thing without a full
reject, and owners have no visibility into *why* they were rejected beyond
a single reason string with no path back into the form.

This spec covers both together because Phase 8's admin review of games
depends on Phase 6's platform-scoped shape, and both touch the same
onboarding wizard steps.

Phase 7 (structured PC specs) is explicitly out of scope — neither phase
requires it.

## Scope decisions (confirmed with product owner)

- Phase 6: full platform-scoped rework, not a quick patch — separate game
  libraries per platform, wizard shows only the platforms a venue actually
  configured.
- Phase 8: both admin-visibility improvements *and* a changes-requested
  flow (not visibility alone).
- Photos: categorized (exterior, entrance, play area, seating, equipment,
  ambience), not a flat gallery.
- Existing café/hardware-tier/photo rows in the dev DB are test data
  (confirmed prior session) — migrations may backfill with a reasonable
  best guess rather than preserve exact historical semantics.

## Phase 6 — Platform-scoped games

### Data model

`Cafe.supported_games` changes from `List[str]` to `Dict[str, List[str]]`,
keyed by platform id matching the existing `PLATFORMS` constant values:
`pc`, `playstation`, `xbox`, `nintendo`, `other`. Each value is a flat list
of game names (presets and custom entries are stored the same way — a
custom entry is just a string not present in that platform's preset list,
same pattern already used for `hardware_tiers.is_custom_model`).

```json
{
  "pc": ["Valorant", "My Custom LAN Game"],
  "playstation": ["EA Sports FC 24"]
}
```

Backend column stays `JSON`, default changes from `list` to `dict`.
Activities (snooker, bowling, etc.) never appear as keys — they are not
games and have no game library.

### Preset libraries

New file `frontend/src/constants/games.ts` (mirrored in
`backend/app/constants.py` only if the backend ever needs to validate
against presets — it doesn't; games are free-form like custom models, so
no backend validation list is needed, only the frontend needs presets for
the chip UI):

```ts
export const PRESET_GAMES_BY_PLATFORM: Record<string, string[]> = {
  pc: [/* existing 12 */],
  playstation: ['EA Sports FC 24', 'God of War Ragnarök', 'Spider-Man 2',
    'Gran Turismo 7', 'Tekken 8', 'Mortal Kombat 1', 'NBA 2K24',
    'Call of Duty: Modern Warfare III', 'Elden Ring', 'Street Fighter 6'],
  xbox: ['EA Sports FC 24', 'Forza Motorsport', 'Halo Infinite', 'Gears 5',
    'Call of Duty: Modern Warfare III', 'Tekken 8', 'NBA 2K24',
    'Elden Ring', 'Sea of Thieves', 'Street Fighter 6'],
  nintendo: ['Mario Kart 8 Deluxe', 'Super Smash Bros. Ultimate',
    'The Legend of Zelda: Tears of the Kingdom', 'Splatoon 3',
    'Animal Crossing: New Horizons', 'Mario Party Superstars'],
  // 'other' has no presets — custom entry only
};
```

### Onboarding UX

The Games step derives the set of relevant platforms from the resource
tiers configured in the previous step (`formattedHardwareTiers` platforms,
excluding `tierType === 'activity'`). For each relevant platform, render a
labeled subsection: preset chip grid (toggle, same interaction as today)
plus the already-built custom-game input, now scoped per platform and
writing into `supportedGames[platform]` instead of a single flat array. A
venue with only activity tiers configured skips the Games step entirely
(already effectively true, now made explicit).

`OnboardingState.supportedGames` type changes to
`Record<string, string[]>`; submit payload passes it through as-is (no
flattening).

### Backend

- `Cafe.supported_games` model annotation: `Mapped[dict[str, Any]]`,
  `default=dict`.
- `OnboardingSubmitRequest` / draft schemas: `supported_games: Dict[str,
  List[str]]`, default `{}`.
- `CafeResponse`/detail serialization: pass the dict through unchanged.
- Migration: alter column comment/default only (JSON columns don't need a
  type change in Postgres or SQLite); a data migration backfills existing
  flat-list rows by wrapping them as `{"pc": [...existing list...]}` since
  the only games collected historically were PC titles.

### Customer-facing

`CafeDetailClient.tsx` renders games grouped by platform (small heading
per platform + chip row) instead of one flat chip list.

## Phase 8 — Media & admin review

### Photo categories

`Cafe.photos` changes from `List[str]` to `List[{url: str, category:
str}]`. Category enum (shared frontend/backend constant):
`exterior, entrance, play_area, seating, equipment, ambience`.

`menu_photos` is unchanged — it's already semantically its own category
and doesn't need the generality.

Backend:
- `Cafe.photos: Mapped[list[dict]]`, default `list`.
- Presign endpoint (`POST /cafes/{id}/photos/presign`) gains a required
  `category` field, validated against the enum.
- Delete endpoint matches by `url` as today (category is informational,
  not part of the delete key).
- `PATCH /cafes/{id}` accepting `photos: List[PhotoItem]` where
  `PhotoItem = {url: str, category: PhotoCategory}`.
- Migration backfills existing flat URL lists as `category: "exterior"`
  (a reasonable default; test data, no need for precision) — matches the
  "safe to break once" allowance already used for the DB reconciliation
  work.

Frontend (onboarding gallery step + owner settings gallery):
- Upload control requires picking a category first (simple button group),
  then the existing upload flow runs.
- Thumbnails render grouped by category with a category badge, matching
  the grouped-by-platform pattern used for games.

### Admin review modal

`verification-queue/page.tsx`'s "Full Details Modal" gains four new
sections, populated from `selectedCafe.draftData` (already fetched, just
not rendered) and the categorized photo/game shapes above:

1. **Photos** — grouped by category, thumbnail grid, same grouping
   component style as the owner-side gallery.
2. **Menu** — thumbnail grid of `menuPhotos`.
3. **Games** — grouped by platform (reuses Phase 6's shape).
4. **Resource Pricing** — replaces the raw `draftData.hardwareTiers` JSON
   dump with a formatted table: platform/activity, model or activity
   kind, seats, hourly rate.

No new data-fetching is needed — everything already arrives in
`draftData`; this is purely a rendering upgrade.

### Changes-requested flow

- `VerificationStatus` gains `CHANGES_REQUESTED = "changes_requested"`.
  Postgres migration adds the enum value guarded by
  `if op.get_bind().dialect.name == 'postgresql'` (same pattern as
  migrations 022/028); SQLite has no enum constraint so nothing to do
  there.
- No endpoint reshaping: `PATCH /cafes/{id}/verify` already accepts any
  `VerificationStatus` value via `CafeVerifyAdminRequest.status`, and the
  existing `rejection_reason` column is reused as the note field for this
  status too (renamed in intent, not in schema — a generic "admin note").
- Admin UI: a third action button "Request Changes" next to
  Approve/Reject, opening the same reason-modal component used for
  Reject, calling `verifyCafe(cafeId, {status: 'changes_requested',
  reason})`.
- Café list/queue filtering: cafés in `CHANGES_REQUESTED` are excluded
  from the "pending" queue (same treatment as `rejected`) but should be
  visible under a status filter so admins can track them.
- Owner side, corrected after checking the actual draft/prefill code
  (the first pass of this spec wrongly assumed a reusable prefill
  mechanism already existed):
  - `dashboard/page.tsx`'s status branching has no case for `rejected`,
    `suspended`, or (new) `changes_requested` today — those fall through
    to the normal dashboard. Add a `changes_requested` branch (same
    shape as the existing `pending`/`draft` view) showing the admin's
    note (`statusState.cafe.rejectionReason`) with a "Fix and Resubmit"
    link to `/owner/onboarding`, matching `ProspectiveOwnerView`'s
    existing link pattern.
  - The wizard's own `loadDraft()` (`onboarding/page.tsx:134`) calls
    `GET /onboarding/draft`, which reads `cafe.draft_data` — but
    `draft_data` is unconditionally cleared to `{}` on final submit
    (`owner.py:667,697`), so for a café that has already been fully
    submitted once (i.e. any `CHANGES_REQUESTED` café), this returns
    nothing and the wizard would incorrectly start blank.
  - Fix: extend the `GET /onboarding/draft` handler — when
    `draft_data` is empty but the owner's café exists and is not in
    `DRAFT` status, synthesize an `OnboardingState`-shaped snapshot from
    the live `Cafe` row plus its `HardwareTier` rows (the reverse of the
    existing submit-time mapping in the onboarding submit handler) and
    return that as `draft` instead of `{}`. This keeps the frontend
    change to zero — `loadDraft()` already merges whatever `draft` it
    receives into `formData` — all the new logic is backend-side.
  - Submitting the wizard already unconditionally sets
    `verification_status = PENDING` (existing behavior in the onboarding
    submit handler) — no new transition logic needed there once the
    above two gaps are closed.

## Testing

- Backend: unit tests for the `supported_games` dict shape (empty dict
  default, backfill migration), photo category validation on presign,
  the new `CHANGES_REQUESTED` enum round-tripping through
  `PATCH /cafes/{id}/verify`, and the `GET /onboarding/draft` fallback
  snapshot for a `CHANGES_REQUESTED` café (asserting the returned draft
  reconstructs hardware tiers, photos, and games in the shapes the
  wizard expects).
- Frontend: manual verification via running dev servers (browser
  extension unavailable in this environment, as encountered earlier this
  session) — submit an onboarding flow with mixed PC+PlayStation+activity
  tiers and confirm only relevant game pickers show; upload categorized
  photos and confirm grouping; walk an admin through Request Changes →
  owner resubmit → re-review.
- Full backend pytest suite must stay green (426 passing baseline from
  the DB reconciliation work this session).

## Migration/rollout notes

Both schema changes (`supported_games` shape, `photos` shape) are
backward-incompatible with existing JSON contents. Since current rows are
confirmed test data, the migrations backfill in place rather than
supporting dual-read of old and new shapes — no compatibility shim, per
this repo's stated preference for changing code over adding
backwards-compatibility hacks.
