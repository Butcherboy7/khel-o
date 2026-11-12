# Owner portal revamp: design spec (2026-11-12)

Branch `feat/owner-revamp`, based on origin/main d5b3924 (= dev = prod133).
Workflow: feature branch, then dev QA, then "promote dev to prod". Never straight to prod.

## Goal

A café owner with no technical knowledge can run KHEL-O alone: check today, change a
price, mark a machine broken, make a discount, and describe what the café offers in the
words players use. Every owner screen is judged against that.

## What the user asked for (2026-11-12)

1. Show players what a café offers per console/PC clearly. Lead with **refresh rate (Hz)**,
   then expected FPS for popular games, owner can override FPS.
2. Cabin pricing (Wild Gaming): cabin room fee plus per-PC fee; hall PCs a plain per-hour price.
3. Console co-op (WWE, 4 players) priced per player count.
4. The owner portal is not intuitive and is too narrow on desktop; a full revamp of every page.

## Ground truth from the running code

- `HardwareTier` (backend/app/models/hardware_tier.py) already has `coop_enabled`,
  `coop_max_players`, `coop_extra_player_price`, `coop_price_30m`, `length_prices`,
  min/default/max booking minutes. Specs are a loose JSON blob: no refresh rate, no FPS.
- Backend co-op is NOT platform-restricted: `is_coop = not activity and players > seats_requested`
  (booking_service.py:135, 330); a co-op booking holds ONE unit. Only the owner UI
  (`SetupBookingOptions.showCoop`, `bookingOptionsPayload` forcing `coopEnabled:false` for `pc`)
  blocks it on PCs.
- Per-unit repair exists only for activity tiers (`HardwareTierUnit`); PCs/consoles can only be
  blocked per time slot on Free slots.
- Owner shell already has plain nav labels. Content column is `--owner-max-width: 1200px`
  next to a 256px sidebar; pages add their own 2xl/3xl caps (availability, challenges, support,
  onboarding, scanner); every setup edit happens inside a Modal.

## Findings, setups page and editor (read in full)

P0
- **"Save" does not save.** Inside the editor each card has a primary "Save" button that only
  collapses the card (PlatformTierConfigurator). The real save is "Save changes" at the bottom.
  An owner who taps the card's Save and walks away has changed nothing.
- **Silent 25% default.** A new setup defaults to 4 units, and `appBookableSeats` auto-fills to 25%
  of the total until the owner types in that field. An owner with 20 PCs who never touches it
  exposes 5 to the app. This directly fights the goal "make walk-ins use KHEL-O".

P1
- The card shows only a model name and one ₹/hr. Co-op, length prices, shortest/longest booking
  and anything about speed are invisible until you open the editor.
- Editing is a modal with ~12 controls: platform chips, 13 activity chips, model dropdown,
  Total units, Bookable on KHEL-O app, price, co-op switch, max players, extra per friend,
  shortest, longest, "already selected at checkout", 15/30-min prices, a price table. No order of
  operations; jargon ("Total units", "Bookable on KHEL-O app", "Already selected at checkout").
- "Add configuration" and a platform chip picker for a flow capped at ONE configuration.
- Wording drift inside one screen: header says "Setups", empty state "No resources set up yet",
  error "Failed to load resources", deactivate modal "Deactivate this tier?" / "Deactivate Tier",
  button "Turn off", link "Manage Units".
- Price table meaning carried by colour ("Bold red numbers are prices you set"), columns `1P/2P/3P`.
- No per-machine repair for PCs and consoles.

P2
- Top bar subtitle "Venue Operational Status & Live Management" tells nobody anything.
- Success toast is a fixed corner banner that can sit under the sticky header on phones.
- Content is capped at 1200px with 2xl/3xl caps inside pages, and lists are 2 columns at most.

Not yet audited line by line (do NOT treat as done): dashboard (985 lines), scanner (1111), offers
(1144), onboarding (1531), bookings, availability, payouts, settings, staff, reviews, analytics,
notifications, support, challenges, drops. Each gets the same read in its own phase, in the
order below, and findings are appended here.

## Design

### A. Setup editor becomes "How do you charge?" (replaces the modal pile)

One page per setup (not a modal), desktop two-column: left = the form, right = a live
"What players see" card. Four plain steps, one visible at a time on phones:

1. **What is it?** Pick from icons with plain names (Gaming PCs, PS5, Xbox, Snooker, VR...).
2. **How many, and how many can go on the app?** Default is ALL on the app; walk-in seats are an
   explicit "Keep N for walk-ins" stepper, never a hidden 25%.
3. **How do you charge?** Three plain choices, each with a one-line example:
   - *Per seat* (price per hour for each PC/console).
   - *Friends share one* (consoles: price for 1 player, then price for 2, 3, 4 players: the
     owner types totals, we derive `price_per_hour` and `coop_extra_player_price`).
   - *Room + seats* (cabin: room fee per hour + price per PC; example row "2 players: ₹600").
     Stored with the existing co-op fields: `price_per_hour = fee + seat`,
     `coop_extra_player_price = seat`, `coop_max_players = PCs in the room`,
     inventory = number of rooms. No migration.
4. **Speed (PCs only):** refresh rate and, optionally, FPS (section B).
   Save is one button at the bottom, always visible; unsaved changes are announced.

Hall PCs stay a normal per-seat setup. A café can have both ("Hall PCs ₹150", "Cabins ₹300 + ₹150").

### B. Refresh rate first, FPS second

- Add `refresh_rate_hz` (int, nullable) and `fps_overrides` (JSON, default `{}`) on `hardware_tiers`
  (one additive alembic migration, nullable, no backfill). Players see Hz as the first badge.
- Below it, "Expected FPS" for ~5 esports titles. Default values are ESTIMATES from a small
  checked-in GPU/CPU tier table (labelled "estimated"); the owner can type a real number for any
  game, which then shows without "estimated". We do not invent numbers: the table must carry a
  source note, and games without a mapped GPU show no FPS at all.

### C. Owner portal shell and pages

- Content column widens (1200 -> 1440px) and list pages use 3 columns on wide screens; remove the
  per-page 2xl/3xl caps; forms stay a readable measure inside the wider column.
- Top bar: replace the filler subtitle with the page title plus the café name.
- Dashboard leads with the three things an owner opens the app for: today's arrivals, what is free
  now, what needs action. Task buttons, not feature names: "Change a price", "Mark under repair",
  "Add a discount", "Scan a customer".
- Per-machine repair for PCs/consoles (see open question 2).
- One words list across the portal: "setup", "seat/machine", "app bookings", "walk-ins", "off/on".
  No "tier", "resource", "unit", "capacity", "allocation".

### D. Phasing (dev-first; each phase deployed to dev and clicked through before the next)

1. Shell + width + wording sweep + fix the two P0s. UI only.
2. Setup editor redesign with Per seat / Friends share one / Room + seats. UI + payload, no migration.
3. Player-side: let checkout offer the player count for PC setups when co-op is on (cabin), and show
   the right words ("2 players in this cabin"). Needs a booking-path test pass.
4. Refresh rate + FPS (migration, public cafe page, owner fields).
5. Page-by-page critique and fixes: dashboard, offers, scanner, bookings, availability, payouts,
   settings, staff, reviews, analytics, notifications, challenges, drops, onboarding.
6. Per-machine repair for PCs and consoles (only if approved, see question 2).

## Testing

- Backend: unit tests for the room price (300 + 150 x players), 1..max players, 30-min variant, that
  a cabin holds one unit regardless of players, and that co-op on a PC setup is accepted.
- Frontend: vitest for the price derivation helpers; `next build` locally before any deploy
  (tsc + eslint miss server/client boundary errors); a real-browser click-through on dev at
  1440 and 390 wide before saying "done".
- Detector: run `impeccable detect` over the changed owner files once per phase.

## Open questions for the user

1. Cabin price on a short session: does the 30-minute price follow the same fee + per-PC rule
   (half of each)? Assumed yes.
2. Per-machine repair for PCs: want named machines ("PC 7") with a Fix/Broken toggle, like activity
   units? Today only a count and time-slot blocking exist. Assumed yes, as phase 6.
3. FPS estimates: are you OK with a clearly labelled "estimated" default, or should it show only
   what the owner types? Assumed estimated default plus owner override.
