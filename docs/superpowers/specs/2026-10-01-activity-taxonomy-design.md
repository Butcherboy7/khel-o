# Activity taxonomy — design (for owner review)

Data file: `backend/app/core/taxonomy.json` (version 1). Nothing reads it yet.

## Rules

- **Activity** is what the customer thinks they're booking. Every tier points at one activity or style through `taxonomy_key`.
- **Style** only exists when the equipment physically differs, *and* a customer would filter for it, *and* one venue could offer both side by side. Keys are `<activity>.<style>`.
- **Attribute** is a detail: size, count, model. It never creates a node.
- **Game played** (8-ball, FIFA, Valorant) is information only. It is never a node and never a filter.
- **The owner's tier is the package.** It already has a name and an hourly price. The taxonomy only classifies it, which is why PC Gaming has no styles: GPU and monitor Hz are attributes.
- **"Don't know" is always allowed** and is stored as null. Optional attributes never filter a listing out.
- **`bookable_now`** is true when today's hourly per-seat booking already fits the activity. False means a discovery-only listing.
- **`billing_unit`** is display text only. Pricing does not change.

## Tree

| Category | Activity | Styles | Bookable now |
|---|---|---|---|
| Gaming | PC Gaming | (none; attrs: GPU, Hz, RAM, private room) | yes |
| Gaming | Console | PlayStation / Xbox / Nintendo (model is an attribute) | yes |
| VR & Simulators | VR | Station / Free-roam / Motion seat | yes |
| VR & Simulators | Racing Simulator | Static / Motion | yes |
| VR & Simulators | Cricket Simulator | (none) | yes |
| VR & Simulators | Escape Room | (none) | **no** |
| Cue Sports | Snooker | (none; table size 12ft/10ft/mini) | yes |
| Cue Sports | Pool | American / English (table size 7/8/9 ft; games offered = info) | yes |
| Cue Sports | Billiards (English) | (none) | yes |
| Cue Sports | Carom Billiards | (none) | yes |
| Table Games | Air Hockey, Foosball, Table Tennis, Carrom, Darts | (none; darts board type is an attribute) | yes |
| Entertainment | Bowling, Karaoke, Arcade | (none) | yes |
| Entertainment | Go-Karting | Electric / Petrol | **no** |
| Entertainment | Laser Tag, Trampoline & Play | (none) | **no** |

## Questions for the owner

1. **Darts:** steel-tip vs electronic is an attribute, not a style, because almost no venue has both. Agree?
2. **Arcade:** it has live hourly tiers today (2 in prod), so it stays bookable. Is arcade really sold by the hour, or should it become discovery-only?
3. **Cricket Simulator:** it's lane-per-hour, so it's marked bookable. Agree?
4. **Snooker / Pool tiers:** 5 activity tiers plus 5 mis-filed gaming tiers in prod use the old merged chip. Which cafés are snooker and which are pool? Until told, they stay unclassified and the owner dashboard asks "Snooker or Pool?".

## Backfill (from real prod data, 2026-10-01)

- **Gaming tiers with a platform:** `pc` → `pc-gaming`, `playstation` / `xbox` / `nintendo` → the matching console style.
- **Activity tiers, and gaming tiers with platform `other` or empty:** matched by name against labels and aliases. A style match beats its parent activity, so "Sim Racing Motion Rig" → `racing-simulator.motion`. GPU or Hz words → `pc-gaming`.
- **No match or ambiguous** ("Snooker / Pool", "PAYMENT TESTING"): stays null. Nothing is guessed.
- **User preferences:** `eight_ball_pool` → `pool`, `pc_gaming` → `pc-gaming`, `ps5` → `console.playstation`, `xbox` → `console.xbox`, `nintendo_switch` → `console.nintendo`.

Dry run against prod's tier names: 22 of 24 distinct names classified, and the 2 left null are correct.

## Next (after review)

1. **Additive migration:** nullable `hardware_tiers.taxonomy_key` + `attributes` JSONB. The backfill is above. No pricing or booking changes.
2. **`app/core/activities.py`:** reads `taxonomy.json` instead of its hard-coded catalog. Existing activity keys stay identical, so URLs and SEO pages are untouched.
3. **Owner tier form:** "What do you offer?" → "What kind?" (or "Don't know") → recommended attributes → seats → price.
4. **Customer side:** category → activity browsing, with style filters only where styles exist.
5. **Ship order:** dev first, then prod.
