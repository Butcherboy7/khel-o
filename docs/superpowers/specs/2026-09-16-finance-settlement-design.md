# Finance Settlement & Cafe Management Reliability — Design

**Status:** Approved by user 2026-09-16 (conversational brainstorming — spike/bounded questions resolved via AskUserQuestion, final "one number, both sides" walkthrough confirmed with "okay i love the idea").

## Context

Razorpay Route is not enabled (`RAZORPAY_ROUTE_ENABLED = False` in `backend/app/config.py:59`) and there is no near-term plan to enable it. There is no KYC or bank-account-verification capability on KHELO's side — the admin cannot verify that a UPI ID an owner submits is correct. The existing "₹1 test transfer" verification flow (`OwnerPayoutAccount.payout_verification_status`, `POST /admin/cafe-payouts/{id}/verify-payout`) pretends this verification is meaningful and **hard-blocks `create_payout`** on it. In practice this has already locked an admin out of paying a real café. This flow must be removed as a gate.

Existing finance data model (confirmed correct, kept as-is):
- `Payment` (`payment.py`) — customer→KHELO transaction, Razorpay order/payment id, status.
- `PlatformFee` (`platform_fee.py`) — per-booking commission snapshot (`fee_percentage_applied`) and `owner_settlement_amount` (the café's entitlement). Route-only fields (`razorpay_transfer_id`, `transfer_status`) stay in the schema but stop being read by any UI path this plan touches.
- `CafePayout` + `CafePayoutItem` (`cafe_payout.py`, `cafe_payout_item.py`) — one manual bank-transfer event covering a set of `PlatformFee` rows; `CafePayoutItem.platform_fee_id` is unique, which is what prevents double-paying a booking's settlement. Kept as-is.
- `CafePayoutRepository._outstanding_base_query` (`cafe_payout_repository.py:25-42`) — outstanding = captured payments' fee rows not yet in a `CafePayoutItem` and not Route-transferred. Kept, extended to net out adjustments (below).

New in this design:
- `Cafe.payout_on_hold: bool` + `Cafe.payout_hold_reason: str | None` — an admin-settable freeze on paying a specific café, independent of any individual payout's status.
- `CafePayoutAdjustment` — a signed ledger row (almost always negative) recording money clawed back from a café's outstanding balance without touching any existing `CafePayout`/`PlatformFee` row. Never deletes anything; explains itself via `reason` + timestamp.
- The `payout_verification_status == "verified"` gate is dropped from `create_payout`. It is replaced by a much weaker, honest check: the owner must have submitted *something* to pay into (`upi_vpa` or the full bank-fallback field set) — you cannot pay into nothing, but a submitted UPI ID is trusted at face value.

## Information architecture (before → after)

| Today | Becomes |
|---|---|
| `/admin/payments` "Payments" | **Unchanged.** Already correctly scoped to customer→KHELO. |
| `/admin/cafe-payouts` "Café Payables" | **Rebuilt** as the single admin finance page: per-café "Owed now", plain display of the owner's submitted UPI/bank details (with a tooltip disclaiming "not independently verified"), a Pay button gated only by "something to pay into" + not on-hold, an On Hold toggle, and a payout history section underneath (previously nonexistent in the UI despite the backend already supporting it via `GET /admin/cafe-payouts`). |
| `/admin/payouts` "Owner Payouts" (Route-era KYC/account status list, `AdminOwnerPayout`/`kycStatus` etc.) | **Deleted.** Its only genuinely useful signal (does this owner have *any* payout details on file) is now visible inline on the merged page above. `verifyCafePayoutDestination`, `listOwnerPayouts`, `AdminOwnerPayout`, `KycStatusBadge` are all deleted as dead code. |
| `/owner/payouts` — two parallel tables ("Booking payments" driven by dead Route `transfer_status`, and "Bank transfers from KHEL-O" driven by real `CafePayout` data) plus ~100 lines of reconciliation logic in `owner.py:1338-1421` to keep them from double-counting | **Simplified to one number + one list**, sourced from the same `GET /owner/payouts/cafe-payouts` endpoint the admin page's numbers come from (this endpoint already exists and is already correct — confirmed via `owner_payouts.py:33-69` — the work here is deleting the Route table and its backing reconciliation, not building something new). |

Both admin and owner pages read "Owed now" from the same formula: `sum(outstanding PlatformFee.owner_settlement_amount) + sum(CafePayoutAdjustment.amount)` (adjustments are negative, so this nets them out). One formula, one number, both screens.

## Payout gate (replaces `payout_verification_status == "verified"`)

`create_payout` now raises `BadRequestException` only when the café's owner has **no** `OwnerPayoutAccount` row, or that row has neither `upi_vpa` nor a complete bank-fallback set. Otherwise it proceeds — no verification step, no test transfer required. The UPI ID / bank details are shown in the admin's Pay dialog immediately before they confirm, so a wrong ID is at least visible, not silently trusted.

Existing test `test_create_payout_rejects_unverified_cafe` (`test_cafe_payout_repository.py:220-242`) asserted the old behavior — replaced with a new test asserting the payout now succeeds for a submitted-but-"unverified" account, plus a new test asserting rejection only when no destination exists at all.

## On Hold

`Cafe.payout_on_hold` (bool, default False) + `Cafe.payout_hold_reason` (nullable string). Admin-only toggle endpoint, audit-logged (`cafe.payout_hold` / `cafe.payout_unhold`, reusing the existing `AdminAuditLog` pattern from `admin_service.write_audit_log`). `create_payout` raises `BadRequestException` when `payout_on_hold` is true, regardless of destination or balance. Both admin and owner payout screens display the hold + reason inline — never silent.

## Refund clawback

When `payment_service.process_refund` runs on a booking whose `PlatformFee` row is already linked to a `CafePayoutItem` (i.e. already paid out), it writes one `CafePayoutAdjustment` row: `cafe_id`, `booking_id`, `amount` = `-owner_settlement_amount`, `reason` = e.g. `"Refunded after payout: booking {ref}"`, `created_by_admin_id` (nullable — refunds can be system-triggered, e.g. TTL expiry), `created_at`. This nets into the next "Owed now" calculation and is listed as its own line in the payable breakdown, so "why is this café owed ₹X" stays answerable without guessing. Today this case only logs a warning (`payment_service.py:707-749`) — the log stays (harmless), the adjustment row is the actual fix.

## Dropped from scope (explicit non-goals, confirmed with user)

- Partial payouts — payouts stay full-sweep-only; adding partial-amount selection is future work, not blocked by anything in this design.
- The ₹1 UPI test-transfer flow, `payout_verification_status`, and the "Verified/Unverified" badge language — removed entirely rather than kept as an optional/advisory step. Not being built into any future path either; if real bank verification becomes possible later (e.g. via Route/KYC), that is new work against fresh requirements, not a resurrection of this flow.
- Razorpay Route split-transfer logic, `PlatformFee.transfer_status`/`razorpay_transfer_id`, `OwnerPayoutAccount.razorpay_account_id`/`kyc_status` — left in the schema untouched (no migration removes them; harmless dead columns), but no UI path added or kept reads them after this work. Re-enabling Route later is a fresh design exercise against these same tables, not blocked by removing their current (broken) UI.

## Cafe management reliability (P0/P1, same plan, separate concern)

**Suspension bug — root cause, not a guess:** two independent client-side bugs, not one intermittent one.
1. Backend requires `reason` min 10 chars (`admin.py:640`, `Field(..., min_length=10)`). Frontend only checks `!suspendReason.trim()` (`cafes/page.tsx:404`) — a short reason passes client-side and 422s server-side.
2. The `suspendMutation` (`cafes/page.tsx:104-113`) has no `onError` handler, and there is no global React Query mutation-error surface in `providers.tsx`. A 422 therefore fails with zero visible feedback — button stops loading, modal stays open, nothing else happens. This is what reads as "sometimes suspend does nothing."

Fix: mirror the 10-char minimum client-side with a live counter/hint in the modal ("Minimum 10 characters — 4/10"), and add an `onError` handler that surfaces the server's rejection message.

**Suspension must notify the owner:** `notification_service.py` already has the pattern (`_send_resend_email` + `_email_wrapper`) for every other transactional email; suspension gets the same treatment, fired only after `AdminService.suspend_cafe` + the audit log both succeed (never before — a failed suspend must never produce a "you've been suspended" email).

**Suspension audit trail:** already implemented (`admin.py:658-665`, `684-690` — `write_audit_log` calls on both suspend and reactivate). No gap here; verify test coverage exists, add if not.

**Cafe list sort:** `cafe_repository.py:47` and `:131` order by `Cafe.created_at.desc()` only. Add a computed "is open right now" derived from `Cafe.opening_time`/`closing_time` (already columns) compared against current local time, sorted before `created_at` — open cafés first, closed cafés after, `created_at.desc()` as the tiebreak within each group.

## Out of scope for this plan

Instagram attribution (item 10 of the original request) is documentation/investigation only, delivered as a separate short doc rather than an implementation task — per instruction, only fix if the audit finds an actual tracking defect.
