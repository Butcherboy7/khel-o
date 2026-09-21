# Activity-Based Customer Preferences

Date: 2026-09-22

## Problem

The customer profile page has a "preferences" section (favorite games,
preferred hardware tier) that only assumes gaming customers. In reality
KHEL-O supports non-gaming activities (snooker, pool, bowling, etc.), and
the current UI cannot express a preference for those. Investigation found
the current feature is **entirely mock**: hardcoded option lists bound to
local component state, never persisted to the backend (`frontend/src/app/
(customer)/profile/page.tsx`, `handleSaveProfile` only sends
`fullName`/`phoneNumber`). No `users` schema, migration, or API exists for
preferences today.

## Goals

- Let customers select any number of preferred activities, gaming and
  non-gaming (PC Gaming, PS5, Xbox, Switch, Snooker, 8-Ball Pool, Bowling,
  etc.)
- Show hardware-tier and favorite-games fields only when a gaming activity
  is selected
- Persist preferences for real, replacing the mock UI
- Keep the activity list easy to extend later without a migration

## Non-goals

- Using preferences to drive recommendations/search/matching (future work)
- Admin-managed/dynamic activity taxonomy (fixed enum is enough for now)
- Per-activity hardware tier (one shared tier across all gaming activities)

## Data model

New table `user_preferences`, one row per user:

| column | type | notes |
|---|---|---|
| `user_id` | FK → users.id, PK | one-to-one |
| `activities` | JSON array of strings | values from the `Activity` enum below |
| `preferred_tier` | nullable enum | `budget` / `mid_range` / `high_end` / `ultra`; only valid when ≥1 gaming activity is selected |
| `favorite_games` | JSON array of strings | free text; only valid when ≥1 gaming activity is selected |
| `created_at`, `updated_at` | timestamps | |

A separate table (not columns on `users`) keeps the core user model lean
and gives room to grow (e.g. versioning, per-activity settings later)
without another users migration.

### Activity taxonomy

Defined once as a shared enum/const, mirrored in backend Python and
frontend TS (not DB-driven — matches the cafe-side `activity_kind`
precedent of being cheap to extend in code):

```
GAMING (is_gaming=true):     pc_gaming, ps5, xbox, nintendo_switch
NON_GAMING (is_gaming=false): snooker, eight_ball_pool, bowling, carrom, foosball
```

Adding a new activity later is a one-line enum addition on both sides, no
migration needed (the column is a JSON array of strings).

## Backend

- `backend/app/models/user_preference.py` — `UserPreference` model, FK to
  `User`, JSON columns for `activities`/`favorite_games`, enum column for
  `preferred_tier`.
- Migration `025_add_user_preferences.py`.
- `backend/app/schemas/user_preference.py` — `UserPreferencesUpdate` /
  `UserPreferencesOut` Pydantic schemas.
- New endpoint `PUT /api/v1/users/me/preferences` (separate from the
  existing `updateMe`, since this is a distinct concern from
  name/phone/email) — upserts the row.
- `GET /api/v1/users/me/preferences` to load current values.
- Validation: if `preferred_tier` or `favorite_games` is sent while no
  gaming activity is present in `activities`, reject with 400 (not
  silently dropped) — keeps the client's mental model honest.

## Frontend

`frontend/src/app/(customer)/profile/page.tsx`:

- Remove `GAME_OPTIONS`/`RIG_TIERS` mock constants and the plain
  `useState` seeded with hardcoded defaults.
- Load real preferences via the new `GET` endpoint on mount.
- Activity picker: multi-select chips, grouped "Gaming" / "Other".
- Hardware-tier `<select>` (Budget/Mid-Range/High-End/Ultra) and favorite
  games multi-select render conditionally — only when the in-progress
  edit-modal selection includes ≥1 gaming activity; clearing the last
  gaming activity clears those two fields client-side too.
- `handleSaveProfile` calls the new `PUT` endpoint alongside the existing
  name/phone update call.
- `frontend/src/lib/api/` gets a small `preferences.ts` client module.

## Testing

- Backend: model/schema unit tests; API test for GET/PUT including the
  400-on-invalid-combination case.
- Frontend: manual browser check — toggle non-gaming-only activity →
  tier/games UI disappears; toggle a gaming activity → reappears; save
  and reload confirms persistence.

## Future extensibility (why this shape)

- New activities: add to the enum, no migration.
- Per-activity tier or richer per-activity settings: add columns/JSON
  keys to `user_preferences` without touching `users`.
- Recommendations/matching: `user_preferences.activities` is already a
  clean queryable field to build on later.
