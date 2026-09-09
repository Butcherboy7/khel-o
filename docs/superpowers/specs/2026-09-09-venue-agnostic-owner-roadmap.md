# Venue-Agnostic Owner Ecosystem — Program Roadmap

## What this document is

This is a **decomposition document**, not an implementation plan. The
requested change ("refactor the owner ecosystem so KHELO is venue-type
agnostic and resource-driven") spans a dozen independent subsystems and
cannot be specified, planned, or executed as one unit without guessing.

Each phase below gets its **own** spec → plan → implementation cycle when
it is started. Only Phase 1 has a written plan today
([`2026-09-09-manual-payout-onboarding.md`](../plans/2026-09-09-manual-payout-onboarding.md)).
Writing detailed task lists for Phases 3-11 now would be fabrication —
they depend on decisions made in earlier phases.

## Correction to the premise (read this first)

The brief that generated this roadmap assumed KHELO is architecturally
locked to "gaming café → PC stations → games → station prices," and
proposed replacing that with `Venue → Offering → Resource → Availability →
Pricing`. **That target architecture is largely already implemented.**
Verified against the schema, not assumed:

| Target concept | Already exists as | Evidence |
|---|---|---|
| Venue | `Cafe` | `backend/app/models/cafe.py` |
| Offering (gaming vs non-gaming) | `HardwareTier.tier_type` (`"gaming"` \| `"activity"`) | `hardware_tier.py:17-19,46-48` |
| Offering type (Snooker, VR, Racing…) | `HardwareTier.activity_kind`, **free text, no enum** | `hardware_tier.py:49-52` |
| Resource group | `HardwareTier` row | `hardware_tier.py:21` |
| Quantity | `HardwareTier.total_seats` | `hardware_tier.py:29` |
| Online-bookable vs walk-in split | `app_bookable_seats` / `reserved_walkin_seats` | `hardware_tier.py:30,53` |
| Resource units with states | `HardwareTierUnit` (`available` / `maintenance`) | `hardware_tier_unit.py:10-33` |
| Availability engine | capacity − bookings − maintenance units | `cafe_activities` plan, capacity-safety check |
| Payout ledger | `CafePayout` + `CafePayoutItem` | `models/cafe_payout.py`, `cafe_payout_item.py` |
| Payout statuses | `pending/processing/paid/failed/cancelled` | `cafe_payout.py:10-15` |
| Menu photos separate from venue photos | `Cafe.menu_photos` | `cafe.py:52` |

The `activity_kind` column carries an explicit comment: *"A new activity
type must never require a backend change."* A snooker venue, a VR venue,
and a mixed venue already store correctly today.

**Therefore this program renames and extends; it does not rebuild.**
Replacing these tables with a greenfield `Venue/Offering/Resource` schema
would re-implement working, tested code — the booking engine, the payment
ledger, the fee snapshotting, and the capacity-safety checks all sit on
top of `HardwareTier.id` — under new names, for no behavioral gain. That
is where avoidable breakage lives.

**What is genuinely missing**, and therefore what this program actually
builds:

1. **Vocabulary.** Code and UI say "hardware tier", "seats", "stations".
   Real problem, real fix, but a rename.
2. **Pricing models.** Only `price_per_hour` exists. No per-30-min,
   per-person, per-session, per-game. *The largest genuine gap.*
3. **Individually bookable units.** `HardwareTierUnit` exists but is
   explicitly never attached to a `Booking` — every booking claims pooled
   capacity. Booking a *specific* snooker table is not possible.
4. **Games vs Activities separation, and custom games.**
   `Cafe.supported_games` is one flat untyped list.
5. **Structured PC specs, structured policies, admin "Request Changes",
   payout proof upload, resource-aware dashboard/insights.** All absent.

---

## Phase ordering rationale

Ordered by: financial risk first, then no-schema-change UX fixes (fast
visible wins, zero migration risk), then the schema extensions in
dependency order, then presentation layers that consume them.

**Phases 1 and 2 are independent of everything else and of each other.**
Phases 4 and 5 both touch the booking/money path and must not run
concurrently. Phases 8-11 consume earlier phases and must come last.

```
Phase 1 (Payouts) ──────────────────┐
Phase 2 (Onboarding UX + rename) ───┤
                                    │
Phase 3 (Resource vocabulary API) ──┼──> Phase 4 (Pricing models)
                                    │         │
                                    │         v
                                    │    Phase 5 (Individual booking)
                                    │         │
Phase 6 (Games/Activities) ─────────┤         │
Phase 7 (PC specs) ─────────────────┤         │
                                    │         v
                                    └──> Phase 8 (Media + admin review)
                                         Phase 9 (Policies)
                                         Phase 10 (Dashboard/nav/insights)
                                         Phase 11 (Staff E2E)
```

---

## Phase 1 — Payouts & money clarity

**Status:** spec written, plan written (11 tasks), not yet executed.
**Spec:** [`2026-09-09-manual-payout-onboarding-design.md`](2026-09-09-manual-payout-onboarding-design.md)
**Plan:** [`2026-09-09-manual-payout-onboarding.md`](../plans/2026-09-09-manual-payout-onboarding.md)

Already planned: UPI-first collection with bank fallback, double-entry
typo guards, server-side validation parity, at-rest encryption of the
bank account number, ₹1 test-transfer verification, payout gate blocking
unverified cafés, admin verification UI.

**Amendments required before execution** (from the new brief, folded into
Phase 1 because they are the same surface and the same money path):

- **1a. Payout proof upload.** Admin's "Mark as Paid" requires payment
  date, transaction reference, and a proof screenshot; owner can view it.
  New: `CafePayout.proof_image_url`, `CafePayout.admin_note`; reuse the
  existing S3 presign uploader. The screenshot is **evidence, never the
  financial record** — the structured `CafePayout` row remains the source
  of truth.
- **1b. Owner payout page answers five questions on open:** total earned,
  currently owed, already paid, when the pending amount arrives, where
  it's being sent. Replaces the current ambiguous "we're checking your
  bank details" copy.
- **1c. Earnings vs payouts separated** in owner-facing language and
  totals: revenue generated → KHELO fee → net earnings → already paid →
  pending. Currently conflated on the payouts page.
- **1d. Payout status vocabulary surfaced** using the statuses that
  already exist on `CafePayoutStatus`, each with owner-readable copy
  (`pending` / `processing` / `paid` / `failed` / `on hold` / `disputed` —
  the latter two are new enum values).
- **1e. All owner-facing Razorpay terminology removed** (already partly
  covered by the existing plan's Task 9; extend to the payouts page).

**Acceptance:** an owner can complete onboarding with only a UPI ID; an
admin cannot pay an unverified café; every completed payout carries a
reference number and proof; the owner payout page states earned/owed/paid
without using the word "Razorpay".

---

## Phase 2 — Onboarding UX fixes + vocabulary rename

**Schema changes:** none. **Risk:** low. **Runs independently of Phase 1.**

Deliberately front-loaded and schema-free so the vocabulary lands *once,
everywhere*, before later phases add new surfaces that would otherwise
inherit the old language.

- **2a. City must never silently default to Bengaluru.** `INITIAL_STATE`
  currently ships `city: 'Bengaluru'`, `state: 'Karnataka'`,
  `pincode: '560001'` (`onboarding/page.tsx:84-86`). Blank them; require
  explicit selection. `validate_city` already rejects unsupported cities
  server-side (`backend/app/constants.py:13`), so the backend guard exists.
- **2b. Phone input drops the `+91` typing burden.** Display a fixed
  `🇮🇳 +91` prefix, accept 10 digits, normalize to `+91XXXXXXXXXX` for
  storage. Backend already validates `^\+91[6-9]\d{9}$`.
- **2c. "Other" becomes "+ Add custom offering"** with a real text input,
  not a dead checkbox. `activity_kind` already accepts any free string
  ≤50 chars — this is purely a frontend fix.
- **2d. Selection state is identical across every offering card**
  (border, check icon, background), fixing the inconsistency where PC
  shows selected state but Snooker does not.
- **2e. Configuration panels become an accordion** anchored beneath their
  own card, instead of appending sequentially and pushing cards down.
- **2f. Vocabulary rename, UI only:** "Hardware Tiers" → **Resources &
  Pricing**; "Total Station Capacity" → **Available Units**; "Seats" →
  **Units** / **Availability**; "Stations & Prices" → **Resources &
  Pricing**. Database column names stay (`total_seats`, etc.) — renaming
  columns is churn with migration risk and zero user-visible benefit;
  the API response layer does the translation.

**Acceptance:** a snooker-only venue can complete onboarding without
encountering the words "hardware", "station", or "seat"; no field is
pre-filled with a value the owner did not choose.

---

## Phase 3 — Resource vocabulary at the API layer

**Schema changes:** none (response-shape only). **Depends on:** Phase 2's
vocabulary decisions.

Phase 2 renames what the owner reads; Phase 3 renames what the API
returns, so the frontend stops translating in a dozen places and later
phases have one vocabulary to build against.

- Response schemas expose `units` / `unitsTotal` / `unitsOnlineBookable`
  alongside (not replacing) the existing `totalSeats` / `appBookableSeats`
  keys, with the old keys deprecated in place for one release so no
  consumer breaks mid-flight.
- An `offering` grouping is introduced as a **derived, computed field**
  on the café/tier response (`{offering: "Snooker", tierType: "activity"}`),
  not a new table. Grouping tiers by offering is a presentation concern;
  a separate `offerings` table would add a join and a sync burden for no
  behavior we don't already have.

**Open decision for this phase's spec:** whether `offering` should ever
become a real table. Recommendation is no, but that is a decision to make
with evidence from Phases 4-5, not now.

**Acceptance:** frontend reads one consistent vocabulary from the API;
no response field forces a caller to say "seat" about a snooker table.

---

## Phase 4 — Pricing models

**Schema changes:** additive. **Money path: yes — highest test burden in
the program.** **Depends on:** Phase 3.

The largest genuine gap. Today `HardwareTier.price_per_hour` is the only
pricing concept, and `booking_service.create_booking` reads it directly.

- New `HardwareTier.pricing_unit`: `per_hour` (default, current behavior)
  / `per_30_min` / `per_session` / `per_person` / `per_game`.
- Booking amount calculation becomes unit-aware. `Booking.duration_hours`
  and `seats_count` already exist and carry enough information for
  per-hour, per-30-min, and per-person; `per_session` and `per_game`
  need a quantity concept the booking flow does not have yet — that is
  this phase's real design work.
- **Historical bookings must never reprice.** `PlatformFee` already
  snapshots fees per booking; this phase must not bypass
  `booking_service.create_booking`.
- Owner UI: pricing unit selector per resource group. Customer UI: price
  display reads "₹500 / table / hour", "₹300 / person / game", etc.

**Acceptance:** a bowling venue can price per-person-per-game and a
racing venue per-30-min, with existing per-hour cafés' bookings and fees
byte-identical to before the change.

---

## Phase 5 — Individually bookable units

**Schema changes:** additive. **Money path: yes.** **Depends on:** Phase 4.
**Must not run concurrently with Phase 4.**

`HardwareTierUnit` exists but is deliberately never attached to a booking
— the activities plan states bookings claim pooled capacity for every
tier type, including PC. Booking "Table 3 specifically" is new.

- New `HardwareTier.booking_mode`: `shared_capacity` (default, today's
  behavior) / `individual_units`.
- New nullable `Booking.tier_unit_id`. Availability for an
  `individual_units` tier resolves per-unit rather than by count.
- Owner-facing copy uses the plain-language framing rather than the word
  "pooled": *"Individual Units — each table can be booked separately"* vs
  *"Shared Capacity — customers book from total availability. You have 5
  tables; if 2 are booked, KHELO shows 3 available."*
- Double-booking a specific unit must be prevented by a database
  constraint, not an application check — same reasoning as
  `CafePayoutItem.platform_fee_id`'s unique constraint.

**Acceptance:** a customer can book Snooker Table 3 by name; two
concurrent requests for Table 3 cannot both succeed; existing pooled
cafés are unaffected.

---

## Phase 6 — Games vs Activities, and custom games

**Schema changes:** additive. **Independent of Phases 4-5.**

`Cafe.supported_games` is a flat untyped JSON list, and the onboarding
wizard offers a hardcoded 12-game `PRESET_GAMES` array
(`onboarding/page.tsx:31-44`) with no way to add anything else.

- Game library becomes platform-scoped: PC games, PlayStation games, Xbox
  games, VR experiences.
- The games step renders **only** libraries matching the venue's selected
  offerings — a snooker-only venue is never shown a game picker.
- Custom games: owner adds a game with name + platform + optional
  description; it joins their venue's library. Essential for regional and
  newly-released titles.
- Activities (snooker, bowling, air hockey) are **not** stored in the
  games list — they are already `activity_kind` on the resource group.

**Acceptance:** a mixed PC+snooker venue sees a PC game picker and no
snooker entry in it; an owner can add a game KHELO has never heard of.

---

## Phase 7 — Structured PC specs and resource groups

**Schema changes:** additive (`specs` JSON is already untyped, so this
may need none). **Independent of Phases 4-6.**

- PC configuration captures GPU / CPU / RAM / refresh rate / monitor size
  as structured dropdowns with an "Other" free-text escape, replacing the
  current 5-option model picklist (`PLATFORM_MODELS` in `constants.py:60`).
- Owners define configuration groups with quantities ("RTX 4060 build ×8",
  "RTX 4070 build ×2") rather than configuring identical machines
  individually. **Note:** multiple `HardwareTier` rows per café already
  support exactly this — the gap is UI framing, not schema.
- `performance_rating.py`'s scoring must keep skipping activity tiers
  (already fixed in the activities work) and must handle the richer specs
  shape without regressing existing ratings.

**Acceptance:** an owner with 10 PCs in 2 configurations completes setup
in 2 forms, not 10.

---

## Phase 8 — Media and admin review workflow

**Schema changes:** additive. **Depends on:** Phases 2, 6, 7 (it reviews
what they collect).

- Venue photo categories (exterior, entrance, play area, seating,
  equipment, ambience) and menu photos, both uploaded post-creation via
  the existing presign endpoint.
- **Admin sees the complete submission before approving** — currently the
  review modal shows business identity, documents, and payout account
  only (`verification-queue/page.tsx:324-370`), with photos, menu,
  pricing, and policies invisible. A "Preview as submitted" view.
- **New `VerificationStatus.CHANGES_REQUESTED`** with an admin note, so a
  missing menu photo doesn't require rejecting an entire application. The
  owner edits and resubmits without starting over.

**Acceptance:** an admin can see every photo and price an owner submitted,
and can request one specific fix without rejecting.

---

## Phase 9 — Structured policies

**Schema changes:** additive. **Independent.**

`Cafe.cancellation_policy` is free text and `house_rules` is a free JSON
list, both currently pre-filled with KHELO defaults the owner may
silently overwrite with anything.

- Controlled fields: cancellation window (none / 1h / 3h / 24h / custom),
  age restriction, ID requirement, late-arrival rule, no-show rule,
  refund policy — each with a KHELO default the owner accepts or overrides.
- One free-text "additional instructions" field for everything else.
- **Constraint:** the cancellation window is consumed by real refund logic
  (`payment_service.py`), so this phase must not let an owner author a
  policy the refund engine cannot honor.

**Acceptance:** policies are machine-readable enough for the refund
engine to enforce, with no owner able to write a policy the system
silently ignores.

---

## Phase 10 — Resource-neutral dashboard, navigation, and insights

**Schema changes:** none. **Depends on:** Phases 3, 4, 5.

- Dashboard's "Seats Available" becomes per-resource availability cards
  ("PC Gaming 6/10", "Snooker 3/5", "PS5 2/4").
- "Seats open for online booking" becomes an **Online Booking
  Availability** table (offering / total / online / walk-in) with the
  explanation that a zero default is a deliberate business choice — keep
  capacity back for walk-ins — rather than an unexplained zero.
- Navigation: "Stations & Prices" → **Resources & Pricing**.
- Insights become resource-aware ("Snooker generates 34% of revenue",
  "VR utilization 41%") instead of one blended station-utilization number.

**Acceptance:** a snooker venue's dashboard contains no gaming-specific
vocabulary and reports per-offering revenue.

---

## Phase 11 — Staff invitations end-to-end verification

**Schema changes:** likely none — this is a verification phase.
**Independent.**

Existing staff invitation machinery (`staff_invitation.py`,
`StaffInvitationRepository`) is verified as a full journey rather than a
button that returns 200: invite → delivery → accept → correct role →
scoped visibility → owner disables → access actually revoked → activity
log attributes actions to the right staff member.

**Acceptance:** each of those eight steps has a passing test; any that
fails becomes its own scoped fix.

---

## Explicitly deferred (named, not dropped)

Carried forward from the manual-payouts spec and still outstanding:
partial payouts, owner dispute/acknowledge flow, payout cadence
scheduling, exports, a reconciliation dashboard, the float→integer money
migration, and the dead `PlatformSettings.commission_percentage` field.
The float→integer migration in particular becomes *more* expensive after
Phase 4 adds pricing models — worth scheduling deliberately rather than
discovering.

## How to run this program

One phase at a time. For each: brainstorm → spec → plan → execute →
verify → merge. Do not start a phase's implementation from this document
— it intentionally contains no task-level detail, because that detail
cannot be written honestly before the phase's own investigation.

Phase 1 is ready to execute now.
