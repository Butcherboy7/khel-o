# Manual Café Payouts — Phase 1 Design

## Context

Razorpay Route (automated split-transfer payouts to café bank accounts) is
built and working in this codebase, but disabled (`RAZORPAY_ROUTE_ENABLED =
False`) because KHEL-O doesn't yet meet Razorpay's marketplace eligibility
turnover threshold. Real customer bookings are live/imminent, so café
payout money (`PlatformFee.owner_settlement_amount`) is accruing per booking
with no admin or owner visibility and no way to mark it paid. This phase
closes that gap with a manual bank-transfer workflow, built so Route can be
re-enabled later without any rework of this layer — it's a payout-batch
layer sitting on top of the existing settlement data, not a parallel ledger.

Out of scope for this phase (explicitly deferred): partial payouts, owner
dispute/acknowledge flow, payout-batch cadence/scheduling, exports,
reconciliation dashboard, the float→integer money migration, and fixing the
`PlatformSettings.commission_percentage` dead field. These are real, each
individually scoped as future work — not silently dropped.

## Data model

Two new tables. `PlatformFee`, `Booking`, `Payment` are unmodified.

### `CafePayout`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| cafe_id | UUID FK → cafes.id | |
| amount | Numeric(10,2) | full outstanding amount at creation time |
| utr_reference | String(100) | bank transfer reference, admin-entered |
| payment_method | String(50) | e.g. "neft", "upi", "imps" |
| status | Enum: PENDING, PROCESSING, PAID, FAILED, CANCELLED | see state machine below |
| notes | Text, nullable | |
| created_by_admin_id | UUID FK → users.id | |
| paid_at | DateTime, nullable | set when status → PAID |
| created_at | DateTime | |

### `CafePayoutItem`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| payout_id | UUID FK → cafe_payouts.id, CASCADE | |
| platform_fee_id | UUID FK → platform_fees.id, unique | one payout item per fee row, ever |
| booking_id | UUID FK → bookings.id | denormalized for query convenience |
| amount_allocated | Numeric(10,2) | equals the fee row's owner_settlement_amount in Phase 1 (no partial) |

The `platform_fee_id` unique constraint on `CafePayoutItem` is the
mechanism that makes a booking's settlement permanently "claimed" once
paid — it can never appear in a future outstanding calculation or a second
payout, by construction rather than by convention.

## Outstanding balance calculation

For a given café, outstanding payable = sum of `PlatformFee.owner_settlement_amount`
for rows where:
1. The row's `booking_id` has a `Payment` with `status = CAPTURED`
2. That `Payment.status != REFUNDED`
3. No `CafePayoutItem` row references this `platform_fee_id`

This is always computed live from source tables — never cached — so it can't
drift from reality.

## API

All new endpoints; no changes to existing booking/payment endpoints or
their behavior.

### Admin (`/api/v1/admin/payouts`, existing admin-role dependency)
- `GET /outstanding` → `[{cafe_id, cafe_name, outstanding_amount, unpaid_booking_count, oldest_unpaid_at}]`
- `GET /{cafe_id}/breakdown` → the specific bookings/fee rows composing that café's outstanding amount
- `POST /{cafe_id}` body `{utr_reference, payment_method, notes?}` → creates `CafePayout` + `CafePayoutItem` rows for every currently-outstanding fee row, in one DB transaction; writes an `AdminAuditLog` row (`action="cafe_payout_created"`); returns the created payout. Server computes `amount` — not client-supplied — eliminating the overpay class of bug by construction.
- `GET /` → payout history, filterable by `cafe_id`, `status`, date range

### Owner (`/api/v1/owner/payouts`, existing `require_cafe_ownership`-style dependency)
- `GET /outstanding` → their café's current outstanding amount
- `GET /history` → their café's past payouts (amount, UTR, date, bookings covered)

Read-only on the owner side in this phase — no acknowledge/dispute actions.

## State machine

```
PENDING → PROCESSING → PAID
             ↓
           FAILED
PENDING/PROCESSING → CANCELLED
```

Phase 1 only actually drives `PENDING → PAID` synchronously in the create
call (no external payout API to await, since the transfer already happened
via manual bank transfer before the admin clicks "mark paid" — the UTR is
proof of a transfer that already occurred). `PROCESSING`/`FAILED`/`CANCELLED`
are modeled now so Phase 2 (or a Route-based future flow driving this same
table) doesn't need a migration to add states later.

## Edge cases

- **Idempotency**: payout creation is one DB transaction — `CafePayout` +
  all `CafePayoutItem` rows + `AdminAuditLog` entry, or nothing.
- **Concurrent double-click / two admins**: the outstanding recompute and
  the `CafePayoutItem` insert happen in the same transaction; a second
  concurrent request sees the first payout's items already claimed
  (via the unique `platform_fee_id` constraint) and computes a smaller or
  zero remaining balance. DB-level constraint, not just an application check.
- **Refund on an already-paid-out booking**: cannot be prevented (the money
  already left the bank), so Phase 1 logs a warning for manual follow-up at
  refund time when `platform_fee_id` already has a `CafePayoutItem` —
  mirrors the existing, already-accepted Route clawback gap
  (`payment_service.py:573-589`). Full clawback ledger entry is Phase 2.
- **Refund before payout**: automatically excluded from outstanding via the
  `Payment.status != REFUNDED` filter — no special-casing needed.
- **Money precision**: outstanding-sum arithmetic uses `Decimal` internally
  even though the underlying columns remain `Numeric`/float-mapped, to avoid
  introducing new float-precision bugs in this new code path.

## UI

### Admin — new "Payouts" section
- **Outstanding** page: table of cafés with outstanding balance, sorted
  highest-first; click a café → breakdown of bookings composing that amount
  → "Mark as Paid" form (UTR, payment method, notes) → confirm.
- **History** page: all past payouts, filterable by café/status/date.

### Owner — new "Payouts" tab (in existing owner dashboard)
- Current outstanding balance (big number, like existing owner dashboard
  stat cards)
- Payout history table (amount, date, UTR, bookings covered)

Both reuse the existing admin/owner dashboard shell, nav patterns, and
table/stat-card components already in the frontend — no new design system
work, just new pages following established patterns.

## Testing

- Outstanding calc excludes refunded and already-paid-out bookings
- Overpay impossible by construction (server computes amount; test asserts
  a manually-crafted request with a client-supplied amount is ignored/rejected)
- Concurrent payout creation for the same café: second request gets reduced
  or zero remaining balance, no duplicate `CafePayoutItem` for any `platform_fee_id`
- Audit log written on every payout creation
- Owner can only see their own café's outstanding/history
- Admin-role required for all admin payout endpoints

## Migration

Purely additive — two new tables, no changes to existing schema. No backfill
needed (outstanding is computed live from existing data). Lowest-risk
migration category.

## Rollout

No feature flag needed — this is new read/write surface that doesn't touch
the live booking/payment/webhook path at all. Ship after backend tests pass
and the two new frontend sections are manually verified against seeded
dev data (including at least one refunded booking and one already-paid-out
booking, to verify the exclusion logic visually).
