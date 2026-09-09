# Manual Payout Onboarding — Design

## Context

Razorpay Route is disabled (`RAZORPAY_ROUTE_ENABLED = False`) and café payouts
are now handled manually and weekly by an admin (see
[`2026-09-07-manual-cafe-payouts-design.md`](2026-09-07-manual-cafe-payouts-design.md)
for the payout-batch/ledger layer, which this spec sits upstream of). That
prior work gave admins a way to *record* a payout once money has already
moved, but did nothing about *collecting the destination to send it to* — the
onboarding wizard still asks for Razorpay-Route-shaped bank details, all of
them optional, under copy that promises automated settlement. Concretely:

- `frontend/.../owner/onboarding/page.tsx` step 3 is branded "Razorpay Route
  Settlement" and every payout field is optional — an owner can submit with
  zero payout details.
- `backend/app/api/v1/owner.py`'s `OnboardingSubmitRequest` has no
  server-side validation for any bank field; the only guards exist in the
  wizard's client-side `handleNext()` and are bypassable via direct API call.
- `OwnerPayoutAccount.details["full_account"]` stores the bank account number
  in **plaintext JSON**, and `cafe_service.py` will return it unmasked if
  `bank_account_number_masked` is ever null.
- `kyc_status` is set to `"submitted"` on every onboarding submit, a status
  that implies Razorpay KYC is in flight — it never will be again while Route
  stays off.
- Promotional/status copy in `ProspectiveOwnerView.tsx`, `PendingApprovalView.tsx`,
  and `PayoutSetupCard.tsx` still describes automated Razorpay Route payouts.
- There is no way for an admin to verify that a café's payout destination is
  real before the first weekly transfer goes out.

This spec covers: (1) collecting UPI-first payout details with a bank
fallback, (2) server-side validation matching what the wizard currently only
enforces client-side, (3) a one-time verification step gated on a ₹1 test
transfer, and (4) fixing the plaintext-storage and stale-copy issues found
above while touching this code.

Out of scope: the payout-batch ledger itself (already shipped), automated
VPA/account-name validation via a third-party API, re-enabling Razorpay
Route, and a self-serve owner settings flow for changing payout details after
onboarding (today, resubmitting onboarding is the only path to edit these
fields — that stays true here).

## Decisions

- **Payout rail: UPI-first, bank as fallback.** UPI is the primary ask
  because it's the fastest for an owner to provide and the fastest for an
  admin to pay against for typical weekly balances. Bank details remain
  collectible (optional, collapsed) at onboarding so a balance that exceeds
  the UPI per-transaction cap doesn't require chasing the owner mid-payout-run.
- **Verification: double-entry + a one-time ₹1 test transfer.** An admin's
  UPI app displays the recipient's registered name before a transfer is
  confirmed — this is a free, already-in-hand name check at the moment of
  first payment, so no third-party validation API is needed. The owner
  types the UPI ID twice at submission (typo guard); the admin sends ₹1
  before the first real payout, records the name their app displayed, and
  that flips the café to `verified`. Verification is tied to the UPI ID
  itself: changing it resets the café to `unverified`, and an unchanged,
  already-verified ID is never re-tested.
- **Required to submit: UPI ID only.** Bank fallback, PAN, and GSTIN (unless
  `has_gst` is true) remain optional/conditional — blocking on UPI alone
  keeps the funnel from where it is today (nothing required) while
  guaranteeing every approved café is payable via at least one rail.

## Data model

Additive columns on `OwnerPayoutAccount` (`backend/app/models/owner_payout_account.py`).
No new table — this model is already the single source of truth for payout
details, and the owner↔café relationship is 1:1 in practice throughout this
codebase (every existing query does `Cafe.owner_id == current_user.id` and
takes the latest row).

| column | type | notes |
|---|---|---|
| `upi_vpa` | String(256), nullable | primary payout rail |
| `bank_account_number_encrypted` | String, nullable | replaces plaintext `details["full_account"]` |
| `bank_name` | String(100), nullable | |
| `account_type` | String(20), nullable | `"savings"` \| `"current"` |
| `payout_verification_status` | Enum: `unverified`, `test_sent`, `verified` — default `unverified` | gates first real payout |
| `verified_name` | String(255), nullable | name the admin's UPI app displayed during the test transfer |
| `verified_at` | DateTime, nullable | |
| `verified_by_admin_id` | UUID FK → users.id, nullable | |
| `test_transfer_ref` | String(100), nullable | the ₹1 transfer's UTR, for audit |

`kyc_status` stops being written by onboarding; it's reserved for a future
Razorpay Route return and is left alone by all code in this spec.
`razorpay_account_id` stays nullable and untouched.

**Server-enforced invariant:** any update to `upi_vpa`, `bank_account_number_encrypted`,
or `bank_ifsc` resets `payout_verification_status` to `unverified` and clears
`verified_name` / `verified_at` / `verified_by_admin_id` / `test_transfer_ref`,
in the same transaction as the field change. This is never client-supplied —
computed server-side in `submit_onboarding_application` (and any future
edit path) by diffing against the existing row before overwriting it.

**Security fix (bundled, not optional):** the bank account number is
currently stored in plaintext inside the `details` JSON column and can leak
unmasked via `cafe_service.py:115-124`'s fallback. This spec replaces that
with `bank_account_number_encrypted` (Fernet, key sourced from
`settings.SECRET_KEY`-adjacent config — a new `PAYOUT_ENCRYPTION_KEY` setting,
not reusing the JWT signing key). No response schema ever includes the
decrypted value; only `bank_account_number_masked` (last 4 digits, as today)
is returned. The `details` JSON column stops being used for account numbers
entirely — existing `{"full_account": ...}` rows are left as-is (test data
per project memory, not carried forward) and superseded by the new column
going forward.

## API changes

### `OnboardingSubmitRequest` (`backend/app/api/v1/owner.py`)

New/changed fields:

```python
upi_vpa: str = Field(..., pattern=r"^[\w.\-]{2,256}@[a-zA-Z]{2,64}$")
confirm_upi_vpa: str  # validated, never persisted
bank_account_number: Optional[str] = Field(None, min_length=9, max_length=18)
confirm_bank_account_number: Optional[str] = None  # validated, never persisted
bank_ifsc: Optional[str] = Field(None, pattern=r"^[A-Z]{4}0[A-Z0-9]{6}$")
account_holder_name: Optional[str] = Field(None, min_length=2, max_length=100)
bank_name: Optional[str] = Field(None, max_length=100)
account_type: Optional[Literal["savings", "current"]] = None
business_pan: Optional[str] = Field(None, pattern=r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$")
has_gst: bool = False
gstin: Optional[str] = None
```

`model_validator(mode="after")` enforcing:
1. `upi_vpa.lower() == confirm_upi_vpa.lower()` (trimmed) — else 400
   `UPI_MISMATCH`.
2. If any of `bank_account_number` / `bank_ifsc` / `account_holder_name` is
   set, all three must be set, and `bank_account_number == confirm_bank_account_number`
   — else 400 `BANK_DETAILS_INCOMPLETE`. This is the same all-or-nothing rule
   the wizard already enforces client-side at `onboarding/page.tsx:213-226`;
   today nothing enforces it if you post to the endpoint directly.
3. If `has_gst` is true, `gstin` must be present and pass the existing GSTIN
   regex — else 400 `GSTIN_REQUIRED`. Today this is UI-only
   (`onboarding/page.tsx:191-197`).

`business_pan` keeps its existing regex (already correct) but the frontend
default value changes from `'ABCDE1234F'` to `''` — see Frontend changes.

### New admin endpoint

`POST /api/v1/admin/cafes/{cafe_id}/payout/verify`
Body: `{ utrReference: str, verifiedName: str }`
- Requires `payout_verification_status != "verified"` on the target café's
  payout account (404/400 `NOT_FOUND` / `ALREADY_VERIFIED` otherwise).
- Sets `payout_verification_status = "verified"`, `verified_name`,
  `verified_at = now()`, `verified_by_admin_id = current_admin.id`,
  `test_transfer_ref = utrReference`.
- Writes an `AdminAuditLog` row (`action="payout_verified"`), same pattern as
  `admin_cafe_payouts.py`'s existing audit-log-in-same-transaction approach.

### Payout gate

`CafePayoutRepository.create_payout` — add a check at the top: if the
target café's `OwnerPayoutAccount.payout_verification_status != "verified"`,
raise the same `BadRequestException` pattern already used for the
concurrent-payout race, message "This café's payout details haven't been
verified yet." This is the actual enforcement point — the admin UI gate is
a convenience, not the guarantee.

## Frontend changes

### Onboarding wizard (`frontend/.../owner/onboarding/page.tsx`)

- Step 3 renamed **"Payout Details"** (from "Bank & Razorpay Route
  Settlement"); card copy changed from "KHEL processes customer payments
  securely through Razorpay Route..." to something like "KHEL-O pays out
  your weekly earnings via UPI or bank transfer — add your UPI ID below so
  we know where to send it."
- New required field pair: **UPI ID** + **Confirm UPI ID**, validated
  client-side with the same pattern as the backend (fail fast, same message
  vocabulary) before `handleNext()` allows advancing past step 3.
- Bank fields become a collapsed disclosure — "Add bank details (optional,
  recommended for larger payouts)" — closed by default, containing Account
  Holder Name, Account Number + Confirm, IFSC, Bank Name (plain text),
  Account Type (radio: Savings/Current). Opening it makes all fields
  required together, matching the backend's all-or-nothing rule.
- `INITIAL_STATE.businessPan` changes from `'ABCDE1234F'` to `''` — the
  current pre-fill means any owner who never touches the field submits a
  well-formed *fake* PAN, which is worse than submitting none.
- PAN's format validation already happens on step 3's `handleNext()`
  (`page.tsx:202-208`) despite the field living on step 2 — moved to step 2's
  validation block so the error surfaces on the same screen as the field.
- GSTIN requirement (already conditionally shown when `hasGst` is true)
  gets a `handleNext()` guard on step 2 requiring non-blank `gstin` when
  `hasGst` is true, matching the new backend enforcement.

### Copy updates (Razorpay Route language removed)

- `ProspectiveOwnerView.tsx:21,43,85` — "direct Razorpay Route payouts" /
  "Seamless Razorpay Route automated settlements" / "Bank Payout Account
  (Razorpay)" → manual weekly UPI/bank payout language.
- `PendingApprovalView.tsx:50` — "Razorpay Route payout setup (in progress)"
  → "payout details verification (in progress)".
- `PayoutSetupCard.tsx:93-95` — "receive future booking payments directly
  via Razorpay Route, instead of manual settlement" → this component's
  framing inverts entirely (manual is the norm now, not the fallback); copy
  rewritten accordingly. This card's own submit flow (`setupPayout`) doesn't
  yet collect UPI — out of scope for this spec since owner-editable settings
  (vs. onboarding) is explicitly deferred, but the misleading copy is fixed
  since it's actively wrong today regardless.
- Owner payouts page (`owner/payouts/page.tsx:302`) already says "While
  Razorpay Route is unavailable, KHEL-O pays out via direct bank transfer" —
  this one is already accurate and untouched.

### Admin verification UI

- Café detail / verification-queue view gains a **Payout Verification**
  card: shows UPI ID, bank fallback (if provided), current status.
- When `unverified`: a "Record ₹1 test transfer" action opens a small form
  (UTR reference, name shown by UPI app) → calls the new verify endpoint.
- `/admin/cafe-payouts` outstanding list shows an "unverified" badge per
  café so an admin doesn't attempt a payout that the backend will reject
  anyway.

## Edge cases

- **UPI ID changed after verification** (via re-onboarding, the only edit
  path today): resets to `unverified` per the server-enforced invariant
  above — blocks payouts until re-verified.
- **Verified UPI, balance exceeds typical UPI transaction ceiling**: not
  hard-blocked (admin judgment, and ceilings vary by bank/app) — but the
  outstanding list flags amounts over a configurable threshold (default
  ₹1,00,000) so the admin knows to reach for the bank fallback instead.
- **Bank fallback given, UPI verification still pending**: the gate is on
  `payout_verification_status`, which today only the UPI test-transfer flow
  can set to `verified` — bank details alone don't unlock payouts in this
  phase. (Verifying the bank fallback independently is real future work,
  not silently dropped — deferred because UPI is the primary rail.)
- **Existing test-data café rows** (test data as of 2026-08-27 per project
  memory): no backfill: new columns default to `unverified`/null, which is
  correct — nothing has actually been verified yet.
- **Direct API submission bypassing the wizard**: every rule enforced here
  server-side (UPI match, bank all-or-nothing, GSTIN-when-GST) closes the
  exact gap where today only client-side `handleNext()` checks exist.

## Migration

`026_add_manual_payout_fields.py` — additive columns + one new
`payout_verification_status` enum type on `owner_payout_accounts`. No
backfill, no existing-column changes, no data loss risk — same "lowest-risk
migration category" as `020_add_cafe_payouts.py`.

## Rollout

No feature flag — this is new required-field surface on a wizard that isn't
yet gating real production onboarding traffic at volume, and the payout gate
only affects payout *creation*, not any live booking/payment path. Ship
after backend tests pass and the wizard is manually walked end-to-end
(including the confirm-mismatch and bank-fields-partial error paths) against
dev data.

## Testing

- `OnboardingSubmitRequest`: mismatched `confirm_upi_vpa` → 400
  `UPI_MISMATCH`
- One bank field set without the other two → 400 `BANK_DETAILS_INCOMPLETE`
- Bank account number set without matching confirm → 400
- `has_gst=true`, blank `gstin` → 400 `GSTIN_REQUIRED`
- Valid UPI only (no bank fields) → submission succeeds,
  `payout_verification_status == "unverified"`
- Admin verify endpoint: flips status to `verified`, populates
  `verified_name`/`verified_at`/`verified_by_admin_id`/`test_transfer_ref`;
  writes audit log
- Admin verify on an already-verified café → 400 `ALREADY_VERIFIED`
- Re-submitting onboarding with a changed `upi_vpa` after verification →
  status resets to `unverified`, verification fields cleared
- `CafePayoutRepository.create_payout` on an `unverified` café → rejected
  with a clear error, no `CafePayout`/`CafePayoutItem` rows created
- Bank account number round-trips through encryption correctly; no API
  response ever contains the decrypted value, only the masked form
- PAN validation error surfaces on step 2's `handleNext()`, not step 3's
