# KHEL-O Quick Find — design + plan (2026-11-15)

Owner asked for an Android-Settings-style search + command palette across the
owner portal, built end to end overnight with all decisions delegated
("take your own decisions"). This doc is both the spec and the plan.

## What exists today (inspection report)

Owner portal = `app/(owner)/owner/*` inside `components/layout/OwnerShell.tsx`
(desktop sidebar, mobile top bar + bottom nav + drawer). Staff (activeRole
`staff`) get only Dashboard, Scan, Bookings, Free slots.

| Destination / action | Where | Deep-linkable today? |
|---|---|---|
| Dashboard (today's takings, arrivals, app-vs-walk-in seats) | /owner/dashboard | no |
| Scan & check in (QR, code, name search) | /owner/scanner | no |
| Bookings: today/tomorrow/date/coming up/all + status filter + name/code search | /owner/bookings | only `?ref=` |
| Free slots: hour-by-hour per setup + broken machines | /owner/availability | no |
| Setups & prices: add, edit (price, seats, lengths, co-op), turn off, photos, broken machines | /owner/tiers | no |
| Offers: new / edit / pause | /owner/offers | no |
| Launch drops list + new drop | /owner/drops | no |
| One drop: Manage slots (walk-in / block / price per console, day hours, advance limit), prices, details, consoles, cover, run, share, check-in, CSV, cancel | /owner/drops/[id] | no |
| Reviews, Insights, Alerts, Payouts, Your team (invite), Help | own pages | no |
| Café settings: pause online bookings, emergency close, login, payout bank, details modal (tabs basic/location/hours/amenities/games) | /owner/settings | no |
| Challenges (only while hosting) | /owner/challenges | no |
| GTA 6 owner guide | /owner/gta6-guide | yes |

Permissions: backend already enforces owner vs staff on every endpoint
(`require_cafe_owner`, `require_staff_or_owner`); `/owner/drops` lists only
cafés the user owns. The UI hides owner-only pages from staff. Quick Find
reuses the same role split; it never calls a mutating endpoint itself.

### Gaps found (not built here, reported)
1. **Walk-in sales and time blocks exist only for launch drops** (SlotManager).
   Normal setups have "kept for walk-ins" seats (not recorded) and
   "broken machines" (indefinite, by name). So "Sell PS5 1 for 3 hours" works
   inside a drop; for a normal setup Quick Find says honestly that walk-ins use
   the seats kept off the app, and offers the seat split. Building real
   walk-in/blocked-time bookings for normal setups touches the booking engine
   and money — proposed as the next feature, not done unsupervised.
2. One opening/closing time for every day: no day-wise or holiday schedule for
   the café (drops do have per-day hours). "Close café today" = pause online
   bookings / emergency close, which exist.
3. No refunds screen for owners (refunds are KHEL-O's side); "refund" searches
   explain and point to Help.
4. Staff cannot manage drops (backend list is owner-only) — so staff never see
   drop results.

## Design

### Units
- `lib/quickFind/text.ts` — normalise, tokenise, synonyms → canonical concepts,
  fuzzy token match (prefix, Damerau-Levenshtein ≤1 at ≥4 chars, ≤2 at ≥8).
- `lib/quickFind/parse.ts` — pulls context out of a query: day (today,
  tomorrow, day after, weekday names, "15 nov", ISO), length ("3 hours", "3h",
  "90 min", "1.5 hr", "half hour"), machine ("PS5 2", "ps5 pro 1", "pc 7",
  "xbox"), booking status words, booking code (GC-…). Pure, unit-tested.
- `lib/quickFind/registry.ts` — THE single list of static items: id, title,
  description, group, icon, keywords, kind (`go` | `flow`), roles, needs
  (`drops`, `challenge`), href builder. Plus builders for dynamic items from
  setups, drops + their consoles, and today's bookings.
- `lib/quickFind/search.ts` — scores items: title/alias/keyword/description
  weights, all-token coverage bonus, concept match, usage boost (frequency +
  recency, capped so it never beats a real text match), dedupe by id, groups
  (Best match, Quick actions, Bookings & events, Gaming setups, Settings,
  Pages), returns highlight ranges for the title.
- `lib/quickFind/history.ts` — localStorage only: recent queries (6), use
  counts + last-used per item id; clear all. try/catch everywhere. Nothing
  leaves the device.
- `components/owner/quickfind/QuickFind.tsx` — provider (context `open()`),
  global Ctrl/Cmd+K and `/` (outside inputs), the palette. Desktop: centred
  dialog 640px at 12vh. Mobile (<1024): full-screen sheet, input on top,
  safe areas, big rows. ARIA combobox + listbox + activedescendant, arrows,
  Home/End, Enter, Esc, focus return. Empty state = frequently used,
  suggested actions, recent searches (+ clear). No results = say so, nearby
  suggestions, Help link. Loading row for live bookings lookup.
- `components/owner/quickfind/QuickFindSpotlight.tsx` — in the shell: on
  `?qf=<anchor>` finds `[data-qf~=anchor]` (retry until data loads, ≤4s),
  scrolls it into view, pulses a ring 2s, strips `qf` from the URL.
- Entry points: desktop top bar search field ("Search anything or do
  something…" + Ctrl K hint); mobile top bar search icon next to the bell;
  drawer top row. Same palette everywhere.

### Deep links added to pages (all read-only until the owner confirms)
- bookings: `?day=today|tomorrow|upcoming|all|YYYY-MM-DD&status=…&ref=`
- availability: `?tier=<id>&date=YYYY-MM-DD&machine=<name>` (+ `qf=broken`)
- tiers: `?edit=<tierId>` opens Edit; `?add=1` opens Add (prefill platform);
  `?broken=<tierId>&machine=<name>` expands Something broken with the name typed
- settings: `?edit=hours|basic|location|amenities|games` opens the modal on
  that tab; `qf=pause|emergency|payout|login` spotlights the card
- offers: `?new=1` opens New offer
- staff: `qf=invite`
- drops/[id]: `?slot=walkin|block|price&console=<key>&hours=N&date=…`
  pre-sets SlotManager (owner still taps the confirm), `qf=prices|details|consoles|share|checkin`

### Safety rules
- `go` items navigate. `flow` items open the page's own editor with context
  filled; the existing confirm steps stay (SlotManager "Yes, mark as sold",
  BrokenMachines "Mark broken", pause/emergency toggles, Edit modal Save).
- Missing context is never guessed: no day → the flow's default day picker;
  ambiguous machine ("ps5" with PS5 1 and 2) → no console preselected.
- Rows carry a tag: "Opens" vs "You confirm" so the owner knows nothing
  happens on Enter.

### Scenarios (acceptance)
A "opening time" / "when do we open" / "business hours" → Opening hours.
B "PS5 2 maintenance" → Mark PS5 2 broken (setup prefilled); in a drop with a
  PS5 2 also "Block PS5 2 in <drop>".
C "GTA 6 minimum booking" → GTA 6 drop › Manage slots (price mode, shortest
  booking) and drop prices.
D "tomorrow bookings" → Bookings filtered to tomorrow.
E "sell PS5 1 for 3 hours" → drop Manage slots, Walk-in, PS5 1, 3 hrs.
F "change xbox price" → Edit the Xbox setup (or Add an Xbox setup if none).

### Compact pass (same branch)
Every owner screen at 360/390/768/1280: cut stacked hero blocks to tight
rows, keep 44px targets, no horizontal scroll, consistent headers. Ship the
clear wins; keep copy rules (plain words, never "Failed to…").

### Testing
vitest for text/parse/search/scenarios A-F; `tsc`, `eslint`, `next build`;
puppeteer on dev logged in as the QA AdamsDen owner at 390px + 1280px:
open palette (tap + Ctrl K), run A-F, follow each, screenshot.

## Plan
1. lib/quickFind (text, parse, registry, search, history) + tests.
2. Palette UI + provider + entry points in OwnerShell + spotlight.
3. Deep-link params on bookings, availability, tiers, settings, offers, staff,
   drops/[id] (+ SlotManager `initial`), data-qf anchors.
4. Compact pass on owner screens.
5. tsc, lint, vitest, next build; commit; deploy dev qa226; puppeteer QA;
   fix; report.
