# KHEL-O Legal Documents — Technical/Product Audit

**Date:** 2026-09-05
**Scope:** Read-only factual audit of the KHEL-O codebase (backend FastAPI + Next.js frontend + Postgres schema via Alembic migrations) to source facts for drafting: User T&C, Privacy Policy, Booking/Cancellation/Refund Terms, Café Owner Agreement, Café Owner T&C, KHELO-O platform terms.
**Method:** No files/DB modified. Every claim below is cited to a file path (and line number where the source agent captured one). Nothing was drafted.

**Legend used throughout:**
- 🟢 **VERIFIED FROM CODE/DATABASE** — directly confirmed in source/schema.
- 🟡 **CONFIGURED BUT BUSINESS DECISION REQUIRED** — a mechanism/field exists, but the value, policy, or intent behind it is a business call, not something code alone answers.
- 🔴 **NOT FOUND / NOT IMPLEMENTED** — searched for and confirmed absent, or explicitly documented as not built.

Where a fact could not be checked at all (out of scope for the agent that covered it), it is marked **CANNOT VERIFY FROM CODE/DATABASE**.

---

## 1. Executive Summary

**What KHELO does** 🟢
KHEL-O is a booking marketplace for independent gaming cafés. Brand name "KHEL-O"; legal entity is a **sole proprietorship owned by Mohammed Abdullah**, based in Hyderabad, Telangana, India (`frontend/src/app/(legal)/about/page.tsx:11,30`, `frontend/src/app/(legal)/terms/page.tsx:15-17`). Terms of Service explicitly disclaim direct operation: *"We do not own, operate, or staff any Café Partner venue"* (`terms/page.tsx:22-29`). KHELO provides the booking system, online payment collection, and a QR check-in layer; it does not itself run any café.

**User relationship with KHELO** 🟢
A customer ("gamer") creates an account, browses cafés, books a time-slot at a specific hardware tier (PC/console group) at an independent café, pays online via Razorpay, and checks in via QR at the venue.

**Café relationship with KHELO** 🟢
Cafés are independent businesses that self-onboard (owner name/business details/bank details/photos), go through **manual admin verification**, then control their own pricing, hours, inventory counts, amenities, promotions, and can pause/cancel bookings. KHELO takes a percentage-based service fee added on top of the customer's price; the café's own price (base_amount minus any discount) is settled to it in full via Razorpay Route.

**Payment flow** 🟢
Customer pays KHELO's own Razorpay account (order created under KHELO's `RAZORPAY_KEY_ID`) → KHELO's fee is retained → café's share is (attempted to be) split out via Razorpay Route marketplace transfer, gated by a feature flag and the café's KYC activation status. If Route is disabled or the café isn't KYC-activated, no automated money movement to the café happens at all in-app.

**Data flow** 🟢/🟡
User PII (name, email, phone — phone is nullable at the DB but enforced required by the frontend registration form) is collected at signup. Location is client-side only (browser localStorage), never sent to KHELO's DB. Café owners see customer name always on their booking list; **email and phone are also exposed** to café owner/staff at the check-in desk and in a same-day check-in search — this is broader than the current Privacy Policy states (see Conflicts, §13).

**Current legal/product model** 🟡
The product behaves like a **marketplace / intermediary + payment facilitator**, not a directory and not a direct operator — but several claims in the existing legal pages (pricing structure, data sharing scope, age policy enforcement) are **stale or unenforced relative to the current code**, and material commercial questions (refund-clawback-from-café, no-show policy fairness, minimum age, exact fee %) are configured in code but not yet fixed as a stated business policy.

---

## 2. User Data — Complete Table

🟢 = confirmed field exists and behavior verified. Table: `users` (`backend/app/models/user.py`) unless noted; `user_roles` (`backend/app/models/user_role.py`) noted separately.

| Data | DB Table | Field | Required? | Collected When | Used For | Shared With Café? |
|---|---|---|---|---|---|---|
| User ID | users | id (UUID PK) | Yes (system) | Account creation | Internal identity | No |
| Full name | users | full_name | 🟢 Yes (NOT NULL) | Signup (email or Google) | Display, booking name | 🟢 **Yes** — shown to café owner/staff on every booking (`gamerName`, `owner.py:807`) |
| Email | users | email (unique) | 🟢 Yes (NOT NULL) | Signup | Login identifier, notifications | 🟢 **Yes** — exposed at QR check-in validation (`gamerEmail`, `owner.py:808`) |
| Phone number | users | phone_number | 🟡 Nullable at DB/backend schema, but 🟢 enforced required by frontend register form (**conflict**, see §13) | Signup / Razorpay checkout backfill | Contact, booking updates | 🟢 **Yes** — exposed at check-in (`gamerPhone`, `owner.py:809`) and via staff same-day search-by-phone (`owner.py:822-831`) |
| Password hash | users | password_hash | 🟡 Nullable (null for Google-only accounts) | Email signup | Authentication (bcrypt) | No — never returned in any API response |
| Google OAuth ID | users | google_id | 🟡 Nullable | Google sign-in | Link account to Google | No |
| Avatar/profile photo | users | avatar_url | 🟡 Nullable — 🔴 **no user-initiated upload exists**; only auto-populated from Google's `picture` claim | Google sign-in only | Display | Not specifically verified as shown to owners |
| Role (legacy single flag) | users | role (enum: gamer/cafe_owner/staff/admin) | Yes | Account creation/role change | Legacy authorization flag (real RBAC uses `user_roles` table) | No |
| Role-per-café grants | user_roles | user_id, role, cafe_id (nullable) | System-managed | Role assignment (e.g. staff invite, café approval) | Multi-role/multi-café authorization | No |
| Active flag | users | is_active | Yes, default True | Account creation / admin action | Enable/disable login | No |
| Created/updated timestamps | users | created_at, updated_at | Yes | System | Audit | No |
| Date of birth / age | — | — | 🔴 **NOT FOUND** — no such field anywhere | — | — | — |
| Gender | — | — | 🔴 NOT FOUND | — | — | — |
| Home address / city / state / pincode | — | — | 🔴 NOT FOUND on `users` (café has address fields; user does not) | — | — | — |
| GPS coordinates | — | — | 🔴 **Not stored server-side at all** — kept only in browser `localStorage` (`frontend/src/store/locationStore.ts:22-45`) | Browse/explore flow | Sort nearby cafés client-side | No |
| Location history | — | — | 🔴 NOT FOUND | — | — | — |
| Device info / IP address | — | — | 🔴 NOT FOUND as a stored DB field (may exist transiently in web server/Sentry logs — CANNOT VERIFY beyond app DB layer) | — | — | — |
| Login timestamps (per-login log) | — | — | 🔴 NOT FOUND as a dedicated table (only `created_at`/`updated_at` on `users`) | — | — | — |
| Referral information | — | — | 🔴 **NOT IMPLEMENTED** — no referral code/field anywhere (`promotion.py` has no referral concept) | — | — | — |
| Marketing/promotional consent | — | — | 🔴 **NOT IMPLEMENTED** — no opt-in/opt-out field on `users` at all | — | — | — |
| Payment identifiers (card/UPI) | — | — | 🔴 Not stored by KHELO — Razorpay's own checkout collects card/UPI directly; KHELO only stores Razorpay's `order_id`/`payment_id`/`signature` on the `payments` table | Payment | Payment reconciliation | No |
| Staff invitation data | staff_invitations | email, full_name, phone_number (nullable), venue_id, invited_by | email/full_name required | Owner invites staff | Staff onboarding | N/A (staff, not customer) |
| Password reset token | password_reset_token | token, user_id, expiry | System | Forgot-password flow | Auth | No |

---

## 3. Café Owner Data — Complete Table

Table: `cafes` (`backend/app/models/cafe.py`) unless noted; payout fields on `owner_payout_accounts` (`backend/app/models/owner_payout_account.py`).

| Data | DB Table | Field | Required? | Collected When | Used For | Who Can Access |
|---|---|---|---|---|---|---|
| Owner name/email/phone | users | full_name, email, phone_number | name/email required, phone nullable | Owner account signup | Owner identity/login | Owner (self), Admin |
| Café/business name | cafes | name | 🟢 Yes (NOT NULL) | Onboarding | Public listing | Public, Owner, Admin |
| Description | cafes | description | Nullable | Onboarding | Public listing | Public, Owner, Admin |
| Address line 1/2 | cafes | address_line1 (required), address_line2 (nullable) | line1 required | Onboarding | Location display | Public, Owner, Admin |
| City / State / Pincode | cafes | city, state, pincode | 🟢 Required (NOT NULL) | Onboarding | Location, search filter | Public, Owner, Admin |
| GPS coordinates | cafes | latitude, longitude | Nullable | Onboarding (map pin) | Map display, sorting | Public, Owner, Admin |
| Café phone / email | cafes | phone_number (required), email (nullable) | phone required | Onboarding | Contact | Public, Owner, Admin |
| Operating hours | cafes | opening_time, closing_time | Nullable in DB model, but required at onboarding-submit API schema | Onboarding | Availability windows | Public, Owner, Admin |
| Total seats / bookable stations | cafes | total_seats, app_bookable_seats (on hardware_tiers), bookable_stations, reserved_walkin_seats | Owner-set | Onboarding/settings | Capacity ceiling | Owner, Admin (aggregate to public) |
| Amenities | cafes | amenities (JSON list) | Defaults `[]` | Onboarding | Listing | Public, Owner, Admin |
| Photos | cafes | photos (JSON list of S3 URLs, max `CAFE_PHOTO_MAX_COUNT`) | Defaults `[]` | Onboarding/settings, via presigned S3 upload | Listing gallery | Public, Owner, Admin |
| Menu photos | cafes | menu_photos (JSON list) | Defaults `[]` | Settings | Menu display | Owner-surfaced; 🔴 no public endpoint found exposing these |
| Supported games | cafes | supported_games (JSON list of strings) | Defaults `[]`; 🟡 UI presents a fixed checklist but **API accepts any free-text list** | Onboarding | Listing | Public, Owner, Admin |
| Business PAN | cafes AND owner_payout_accounts (duplicated) | business_pan | Nullable | Onboarding / payout setup | KYC identity | Owner, Admin — 🔴 stored as **plaintext**, no field-level encryption found |
| GSTIN | cafes | gstin | Nullable | Onboarding | Tax identity | Owner, Admin |
| "Legal document" (trade license etc.) | cafes | legal_document_url | Nullable, `String(500)` | Onboarding | Compliance reference | Owner, Admin — 🔴 **this is a plain-text URL the owner pastes** (e.g. a Google Drive link); KHELO does not host, validate, or verify the underlying document itself |
| Cancellation policy text | cafes | cancellation_policy (Text) | Nullable | Onboarding/settings | Displayed to customer | Public, Owner, Admin |
| House rules | cafes | house_rules (JSON list) | Defaults `[]` | Onboarding/settings | Displayed to customer | Public, Owner, Admin |
| Social links | cafes | social_links (JSON dict) | Defaults `{}` | Settings | Listing | Public, Owner, Admin |
| Verification status | cafes | verification_status (enum: draft/pending/verified/rejected/suspended) | System-managed | Admin review | Gate for going live | Owner (own), Admin |
| Active flag | cafes | is_active | System-managed | Admin action | Gate for bookability | Public (indirect), Owner, Admin |
| Rejection reason | cafes | rejection_reason (String 500) | Nullable | Admin rejection | Owner feedback | Owner, Admin |
| Bookings paused / emergency mode | cafes | bookings_paused, is_emergency_mode | Owner/Admin togglable | Ops | Temporarily halt bookings | Owner, Admin |
| Draft autosave | cafes | draft_data (JSON) | Defaults `{}` | Onboarding wizard | Resume incomplete onboarding | Owner only |
| Bank account (masked) | owner_payout_accounts | bank_account_number_masked | Nullable — only **last 4 digits stored** in this field | Payout setup | Display | Owner, Admin (masked only) |
| Bank account (raw/full) | owner_payout_accounts | inside `details` JSON blob, key `full_account` | Nullable | Payout setup | Razorpay Route account creation | 🔴 **No read endpoint found returning this raw value** — appears write-only from the API surface reviewed; 🟡 CANNOT VERIFY whether it's encrypted at the DB/column level (no application-level encryption call found) |
| IFSC | owner_payout_accounts | bank_ifsc | Nullable, 11-char validated | Payout setup | Bank routing | Owner, Admin |
| Account holder name | owner_payout_accounts | account_holder_name | Nullable | Payout setup | Bank verification | Owner, Admin — plaintext |
| KYC status | owner_payout_accounts | kyc_status (free string: pending/submitted/activated/suspended/rejected) | Default "pending" | Payout setup / Razorpay webhook | Gate for automated payouts | Owner, Admin |
| Razorpay linked-account ID | owner_payout_accounts | razorpay_account_id (unique) | Nullable | Payout setup | Route transfer target | Admin, Owner (display) |
| Hardware tier data | hardware_tiers | name, platform (enum: pc/playstation/xbox/nintendo/other), model, specs (JSON), price_per_hour, total_seats, app_bookable_seats, app_bookable_seats_locked, reserved_walkin_seats, active_seats_count, is_active | price>0 enforced; others owner-set | Onboarding/settings | Inventory + pricing | Public (aggregate), Owner, Admin |

**Explicitly searched for and confirmed 🔴 NOT FOUND anywhere in the codebase:**
- Aadhaar number / Aadhaar document
- UPI ID / VPA (Virtual Payment Address)
- Udyam registration number / MSME certificate
- Café logo (separate from photo gallery)
- Any dedicated KYC/identity-document upload+storage system (only the self-typed PAN/GSTIN text fields and the pasted external document URL — no file KHELO itself stores/verifies)
- Individual station/machine identity (no per-PC/per-console row or ID — inventory is a per-tier *count*, explicitly confirmed absent by an in-code comment: *"there is no per-seat identity in the schema"*, `owner.py:971`)

---

## 4. Booking Flow

**User → KHELO → Payment → Booking → Café → Completion** (🟢 all verified in `backend/app/services/booking_service.py`, `payment_service.py`, `owner_service.py`)

1. **Selection (frontend only, no DB write)** — café, hardware tier, date, time, duration, seat count chosen in `frontend/src/app/(customer)/bookings/new/page.tsx`.
2. **Booking row created FIRST, before payment** — `POST /bookings` → `BookingService.create_booking`. Validates café is `VERIFIED`+`is_active`+not paused/emergency; tier is active; start time ≥30 min ahead; duration 0.5–8h; **overnight sessions explicitly rejected** (documented code limitation in the overlap-check query). Row-locked seat-capacity check. Per-user daily cap: 60 seats/café/day. Row is inserted with **`status = PENDING_PAYMENT`**.
3. **Payment order created** — `POST /payments/create-order` → Razorpay order under KHELO's own account. `payments` row created with `status = CREATED`. Enforced 1 payment row per booking (`UNIQUE(booking_id)`).
4. **Payment verified/captured** — `POST /payments/verify` (client) or `payment.captured` webhook (server, idempotent). HMAC signature verified. **15-minute payment window** from booking creation — if capture arrives late, code auto-refunds and closes the booking rather than leaving it in limbo. On success: **`payment.status = CAPTURED`, `booking.status = CONFIRMED`** — this exact transition is what "confirmed" means in this system.
5. **Café notified** — in-app `Notification` row to owner on confirmation (no SMS/push; email confirmation goes to the customer, not routinely to the café).
6. **Café payout attempt** — Razorpay Route transfer attempted immediately on capture, only if the Route feature flag is enabled AND the café's payout KYC is `activated`; otherwise transfer is skipped and recorded as such — no automatic fallback payment mechanism exists in-app.
7. **Check-in** — QR scan or manual, only from `CONFIRMED`, window = 15 min before start through session end, row-locked against double check-in. Status → `CHECKED_IN`.
8. **Lifecycle auto-transitions — lazy, not scheduled** 🔴: `CONFIRMED → NO_SHOW` if session ends with no check-in; `CHECKED_IN → ACTIVE` once start time passes; `ACTIVE → COMPLETED` once end time passes. **These only run when a booking is read by some API call** — there is no cron/background job. A stale `PENDING_PAYMENT` row can sit unpaid indefinitely if nobody ever queries it again.
9. **Cancellation** — by user (2-hour cutoff before session, for paid bookings only), by café owner (no cutoff), by admin (force-cancel without refund, or refund separately), via emergency-close-day (bulk).
10. **Refund** — always **full amount only**, no partial refunds implemented. Triggered automatically on user/owner cancellation of a `CONFIRMED` booking; NOT triggered automatically on no-show (café keeps the money).
11. **Café payout on refund** 🟡 **business-risk gap**: if the café's Route transfer already completed before a refund is issued, **the café's share is NOT automatically clawed back** — this is an explicitly logged known gap requiring manual reversal via the Razorpay dashboard.
12. **Completion** — booking auto-flips to `COMPLETED` once session end time passes (lazily, on next read), independent of actual attendance beyond the check-in flag.

**Database status enums:**
- Booking (`backend/app/models/booking.py`): `PENDING_PAYMENT, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW, CHECKED_IN, ACTIVE, FAILED`. ⚠️ **Discrepancy**: the tracked Postgres migration for `bookingstatus` enum only defines `pending_payment, confirmed, cancelled, completed, no_show` — `checked_in`, `active`, `failed` exist in the Python model/app logic but no migration was found adding them to the DB enum type. **CANNOT VERIFY** from source whether the live DB enum was manually widened outside migration tracking; flagged as a possible live bug, not just a documentation gap.
- Payment (`backend/app/models/payment.py`): `CREATED, CAPTURED, FAILED, REFUNDED` (matches DB exactly, no discrepancy).

**Booking modification/transfer:** 🔴 **NOT IMPLEMENTED** — no endpoint changes date/time/tier/seats on an existing booking, and no endpoint transfers a booking to another user. Only cancel-and-rebook is possible.

**Multiple stations/cafés/recurring bookings in one transaction:** 🔴 **NOT IMPLEMENTED** — one `cafe_id` + one `hardware_tier_id` per booking row (seats_count 1–6 of the *same* tier only); no recurrence field or logic anywhere.

---

## 5. Money Flow

**Customer ₹X → Razorpay (KHELO's account) → KHELO retains fee → Café's share split via Razorpay Route (if enabled + KYC-activated)**

🟢 Verified formula (`backend/app/services/booking_service.py`):
```
subtotal = base_amount − discount_amount
service_fee_percent = RAZORPAY_COST_PERCENT (2.65% default) + PLATFORM_MARGIN_PERCENT (1.20% default)
gateway_fee = round(subtotal × service_fee_percent / 100, 2)
convenience_fee = 0.00   (legacy flat fee column, retired, always zero in current code)
total_amount = subtotal + gateway_fee + convenience_fee   ← what the customer pays
owner_settlement_amount = subtotal                        ← what the café is owed (100% of its own discounted price)
```

| Line item | Who sets it | Verified value | Configurable? |
|---|---|---|---|
| Café's base price | Café owner | `hardware_tiers.price_per_hour` | 🟢 Owner-editable, only constraint is `> 0` |
| Platform/service fee | KHELO | ~3.85% combined by default (2.65% + 1.20%), added **on top of** customer price | 🟢 Env-var configurable without redeploy (`config.py:53-58`); 🟡 the exact % to charge, and whether/why it's split into two named components, is a business decision |
| Commission "taken from café" | — | 🔴 **KHELO does not deduct a cut from the café's price** — café gets 100% of its own subtotal; KHELO's revenue is entirely the added-on fee |
| `PlatformSetting.commission_percentage` (DB, default 10%) | Admin-editable via `/admin/settings` | 🔴 **Appears to be a dead/unused field** — no code path was found reading it to affect any actual pricing or payout calculation |
| GST/Tax | — | 🔴 **NOT IMPLEMENTED** — no tax field or calculation anywhere on booking/payment; only a code *comment* noting Razorpay's own gateway cost already bakes in 18% GST on Razorpay's side, which is not the same as KHELO charging/passing through GST on its own service |
| Discount/coupon funding | Café | 🟢 Café absorbs 100% of any discount — no "platform-funded promo" mechanism exists; KHELO's fee is computed on the post-discount amount, so KHELO's fee shrinks too, but KHELO contributes nothing |
| Price breakdown shown to customer | — | 🟢 Yes — frontend renders base total, discount line, "platform service fee (X%)" line, and total; **no tax line** (none exists) |
| Café revenue vs KHELO revenue recorded separately | — | 🟢 Yes, in `platform_fees` table: `owner_settlement_amount` (café) vs `gateway_fee`+`convenience_fee` (KHELO/gateway) |
| Refund amount | — | 🟢 Always the full captured `payment.amount` — **no partial refunds implemented anywhere** |
| Payout mechanism | — | 🟢 Razorpay Route marketplace transfer, per-booking, near-real-time on capture — **not batched**, no scheduled payout run |
| Payout eligibility | — | 🟢 Requires `RAZORPAY_ROUTE_ENABLED=true` AND `owner_payout_accounts.kyc_status == "activated"` (set only via Razorpay's own `account.activated` webhook) |
| Refund clawback from café after payout | — | 🔴 **NOT IMPLEMENTED** — explicitly logged known gap; café keeps its share even if KHELO refunds the customer, unless someone manually reverses it in the Razorpay dashboard |
| Can KHELO hold/reverse/adjust a payout | — | 🔴 **NOT IMPLEMENTED** — no admin endpoint exists for this |
| Payout auditability | — | 🟡 Partially — `platform_fees.transfer_status/transfer_error/razorpay_transfer_id` track transfer state, but Route transfers do **not** write to the `AdminAuditLog` table the way other admin actions do |

**Marketing-vs-code conflict** 🔴: the customer-facing `/partner` page advertises a "3–5% convenience fee" to prospective café owners — this does not match the `PlatformSetting.commission_percentage` default of 10% found in the DB, nor does it match the actual ~3.85%-of-subtotal fee formula that's really charged to the *customer* (not the café). These are three different numbers describing three different things; flag for reconciliation before drafting fee-related legal language.

---

## 6. Café Owner Permissions

| Action | Café Can Do? | Exact Permission/Endpoint | Data They Can See |
|---|---|---|---|
| View bookings for own café | 🟢 Yes | `GET /owner/bookings` (`require_staff_or_owner`, scoped to own café) | Booking ref, gamer **name**, gamer ID, date/time, tier, amounts, status, cancellation reason — see §3 schema |
| View customer phone | 🟢 Yes, but **only in two narrow contexts** | `POST /owner/bookings/validate-qr` (returns phone+email) and `GET /owner/bookings/search-checkin` (returns phone, same-day only) — 🔴 **not** included in the general booking-list response |
| View customer email | 🟢 Yes, only via `validate-qr` (check-in desk flow) — 🔴 not in the general booking list |
| Cancel a booking | 🟢 Yes | `POST /owner/bookings/{id}/cancel` — allowed from `PENDING_PAYMENT` or `CONFIRMED`, **no time cutoff** (deliberately, since the customer didn't choose the timing), triggers automatic full refund if was `CONFIRMED` |
| Confirm/approve a booking manually | 🔴 No such action exists | Confirmation is payment-driven only — no owner "accept booking" step |
| Change pricing | 🟢 Yes, per hardware tier | `price_per_hour` editable, only constraint `>0` — no platform ceiling/floor |
| Change/pause availability | 🟢 Yes | Owner can toggle `bookings_paused`, `is_emergency_mode`, per-tier `is_active`, and per-tier seat counts |
| Export customer list/CSV | 🔴 **Not found** — no export/CSV/download endpoint exists anywhere |
| View customer's full booking history across visits | 🔴 **Not implemented** — no cross-booking customer-profile aggregation for a café |
| View customers who never booked their café | 🔴 **Not possible** — every owner-facing query is scoped by the café's own ID; verified no endpoint accepts an arbitrary user ID |
| Delete customer info | 🔴 **Not implemented** — no such endpoint |
| Contact customer directly / marketing to past customers | 🔴 **Not found** — no messaging or notify-past-customers feature |
| Respond to a review | 🟢 Yes | `PATCH /reviews/{id}/reply`, restricted to the review's own café's owner |
| Delete/edit a review (own or customer's) | 🔴 **Not implemented for anyone** — no edit/delete review endpoint exists at all, for owner or customer |
| Create/manage promotions (own café) | 🟢 Yes | `POST/PATCH/DELETE /promotions`, scoped to own café; discount capped 1–50% |
| See KYC/payout status | 🟢 Yes | `GET /owner/payouts/status` |
| Self-deactivate/close café permanently | 🔴 **Not implemented** — only pause-bookings/emergency-close-day exist; permanent deactivation is admin-only (suspend) |
| Invite/manage staff for own café | 🟢 Yes | Staff invitation flow (`staff_invitations` table) |

---

## 7. Customer Permissions

| Action | User Can Do? | Exact Permission/Endpoint | Notes |
|---|---|---|---|
| Browse cafés without an account | 🟡 Likely yes | Not directly gated in the reviewed endpoints, but not explicitly confirmed by reading a route guard on the public café-listing endpoint — CANNOT FULLY VERIFY |
| Book without an account | 🔴 **No** | `POST /bookings` requires `require_gamer` (authenticated) — no guest checkout |
| Sign up via email/password | 🟢 Yes | `auth.py` register endpoint, bcrypt-hashed password |
| Sign up via Google | 🟢 Yes | Google ID-token verification against Google's tokeninfo endpoint |
| Sign up via phone/OTP | 🔴 **Not implemented** — no OTP/SMS auth exists anywhere |
| Sign up via Apple | 🔴 **Not found** |
| Cancel own booking (unpaid) | 🟢 Yes, anytime | `PENDING_PAYMENT`/`FAILED` — no cutoff |
| Cancel own booking (paid/confirmed) | 🟢 Yes, but only ≥2 hours before session start | Hardcoded global constant, not configurable per café |
| Get a refund on cancellation | 🟢 Yes, full amount only | No partial refunds exist |
| Modify a booking (date/time/tier) | 🔴 **Not implemented** |
| Transfer a booking to someone else | 🔴 **Not implemented** |
| Book multiple stations/cafés at once | 🔴 **Not implemented** — one tier/café per booking (multiple *seats* of the same tier only, 1–6) |
| Leave a review | 🟢 Yes, but 🔴 **not gated on the booking actually being completed** — the service checks ownership and "no existing review for this booking" but never checks `booking.status == COMPLETED`; a booking ID can even be omitted, in which case a random UUID is substituted, meaning a review is not strictly tied to a verifiable real booking in every code path |
| Edit/delete own review | 🔴 **Not implemented** — no such endpoint exists |
| Upload photos/videos with a review or profile | 🔴 **Not implemented** |
| Message a café directly | 🔴 **Not implemented** — no chat/messaging feature |
| Report a café or another user | 🟡 Partial — generic support-ticket system exists (`support_tickets`), not a dedicated "report" feature; visible to creator + admin only |
| Delete own account | 🔴 **Not implemented** — no self-service deletion anywhere |
| Export/download own data | 🔴 **Not implemented** |
| Correct/update own profile | 🟢 Yes | `PATCH /auth/me` |
| Opt out of marketing | 🔴 **N/A** — no marketing consent field exists to opt out of; also no promotional messages are actually sent (`NotificationType.PROMOTION` enum exists but is never used anywhere in code) |
| Refer a friend | 🔴 **Not implemented** — no referral system found |

---

## 8. Third-Party Services

| Provider | Purpose | Data Sent | Where Used |
|---|---|---|---|
| Razorpay | Payment gateway — order creation, capture, signature verification, refunds | Booking amount, currency, order/payment IDs; Razorpay's own checkout UI separately collects card/UPI/contact details directly from the customer | `backend/app/services/payment_service.py` |
| Razorpay Route | Marketplace split-settlement to café owners | Café's masked bank details, IFSC, PAN, account holder name, a **hardcoded placeholder phone `"9999999999"`** sent in the account-creation call (not the real owner phone — a data-accuracy issue worth noting) | `backend/app/services/owner_payout_service.py` |
| AWS SES | Transactional email (booking confirmation, payment failure, session reminder, refund confirmation, staff invite, password reset) | Recipient email, name, booking details, amount | `backend/app/services/notification_service.py` (method still internally named `_send_resend_email` — a legacy name from a replaced provider, not a live Resend integration) |
| AWS S3 | Café photo/menu-photo storage via presigned uploads | Café photos (JPEG/PNG/WebP), bucket path `cafes/{cafe_id}/...` | `backend/app/services/storage_service.py` |
| Google OAuth 2.0 | "Sign in with Google" | Email, name, Google user ID | `backend/app/services/auth_service.py` |
| Google Maps (`@react-google-maps/api`) | Map display, café location picking, reverse-geocode | Café addresses/coordinates; browser/IP context sent to Google when the map loads | Frontend map components |
| Sentry | Error monitoring (backend + frontend, separate DSNs) | Stack traces, request context — potentially including PII if present in error context; scrubbing config not fully verified | `backend/app/core/sentry.py`, `@sentry/nextjs` |
| Let's Encrypt (via Caddy) | TLS certificate issuance/renewal | Domain name only | `Caddyfile` |
| Self-hosted Postgres backup | Daily `pg_dump`, 14-day retention, stored on the same EC2 host | Full DB snapshot | `docker-compose.prod.yml` `backup` service |

**Confirmed 🔴 NOT FOUND anywhere in the repo** (backend, frontend, package.json, pyproject.toml, docker-compose, Caddyfile, env-example files): Firebase, RazorpayX as a distinct product, Apple Sign-In, Supabase, Cloudflare, Vercel, Netlify, Render, Railway, Twilio, MSG91, SendGrid, an actually-live Resend integration, Mailgun, PostHog, Mixpanel, Meta/Facebook/Instagram APIs, any AI API (OpenAI/Anthropic), Cloudinary, any SMS/WhatsApp-as-a-business-channel provider (the only WhatsApp touchpoint is a client-side "share via WhatsApp" deep link the user's own device opens — KHELO does not send WhatsApp messages itself).

---

## 9. Data Security

**Authentication** 🟢 — JWT (HS256), bcrypt-hashed passwords. Startup validator hard-fails production boot if the default placeholder `SECRET_KEY` or SQLite is still configured.

**Authorization / RBAC** 🟢 — Role-based via FastAPI dependency guards (`require_gamer`, `require_cafe_owner`, `require_staff`, `require_staff_or_owner`, `require_admin`, `require_cafe_ownership`). Roles: `GAMER`, `CAFE_OWNER`, `STAFF`, `ADMIN`. Authorization source of truth is a separate `user_roles` mapping table; the `users.role` single-enum column is a **legacy secondary representation that could drift** — not itself exploited, but a data-consistency note.

**Row-level access control** 🟢 — Enforced entirely at the **application layer** (explicit `user_id`/`cafe_id`/`gamer_id` comparisons in service methods), not via database Row-Level Security policies. Verified: a gamer cannot see another gamer's notifications or bookings; a café cannot see another café's bookings/promotions/data.

**Encryption at rest** 🟡 — Passwords are bcrypt-hashed (correct practice, not "encrypted" in the reversible sense). **Bank account number**: only last 4 digits are ever stored in the display field; the full number, if present, lives in a JSON blob with **no application-level encryption found**. **PAN and account holder name are stored as plain unencrypted strings** — flagged as a real risk given PAN is a sensitive Indian government ID. Whether the underlying Postgres/EBS volume has disk-level encryption is an infrastructure setting **CANNOT VERIFY FROM CODE**.

**Encryption in transit** 🟢 — TLS enforced at the edge via Caddy/Let's Encrypt, with HSTS and standard security headers set. Internal container-to-container traffic is unencrypted but not exposed to the internet.

**Secrets handling** 🟢 — Pydantic `Settings` loaded from `.env`; example files contain placeholders only; no live secret values were found or disclosed in this audit.

**Logging of personal data — RISK FOUND** 🔴 — Recipient **email addresses are logged in plaintext** on every SES email send (success and failure paths) in `notification_service.py`. No card numbers, CVVs, or full bank account numbers were found in any logger call.

**Backup system** 🟢 — Daily `pg_dump`, 14-day retention, on the same host (no off-host replication found in this repo).

**Security risks found (full list):**
1. Customer email addresses logged in plaintext structured logs on every transactional email send.
2. Phone numbers are never verified (no OTP) — either self-reported via a prompt, or silently backfilled from Razorpay's `contact` field without a distinct consent step.
3. Café PAN and bank-account-holder name stored as plaintext strings with no field-level encryption.
4. Hardcoded placeholder phone number (`9999999999`) sent to Razorpay's Route account-creation API instead of the owner's real number.
5. No database-level Row-Level Security backstop — all authorization relies on application code being correct in every endpoint.
6. Dual role representation (`users.role` vs `user_roles` table) creates a data-consistency risk if any code path ever reads the legacy column directly.
7. Refund-without-clawback gap (see §5) is a financial-control risk, not a security risk per se, but material to café-agreement liability language.

---

## 10. Account Deletion & Data Retention

| Event | What Actually Happens (Verified) |
|---|---|
| User deletes account | 🔴 **NOT IMPLEMENTED** — no self-service deletion endpoint exists anywhere (backend or frontend). Only an admin can flip `is_active=False` on a user (soft flag, no data removed). |
| Café closes/deactivates account | 🔴 **NOT IMPLEMENTED** as a self-service action — only admin-driven suspend/reactivate exists (`verification_status`/`is_active` toggles). Owner-initiated permanent closure was not found; only pause-bookings/emergency-close-day (temporary) are self-service. |
| Booking is completed | 🟢 Status auto-flips to `COMPLETED` on next read after session end passes; row is retained indefinitely (no purge). |
| Booking is cancelled | 🟢 Status set to `CANCELLED`, `cancelled_at`/`cancellation_reason` populated (single shared free-text field for all cancelling actors — not split by who cancelled); row retained. |
| Refund happens | 🟢 `payments.status = REFUNDED`, `refund_id`/`refunded_at` populated; **full amount only**; row retained. |
| Data anonymization | 🔴 **NOT IMPLEMENTED** — no anonymization routine anywhere in the codebase. |
| Data physically deleted | 🔴 **Effectively never** — no hard-delete code path exists for users, cafés, or bookings; most relevant foreign keys have no `ON DELETE` cascade specified (default `RESTRICT`/`NO ACTION`), so even if someone tried, a booking-referencing row could not be deleted without first removing the booking. Two exceptions found: `owner_payout_accounts.owner_id → users.id` and `platform_fees.booking_id → bookings.id` are `ON DELETE CASCADE`. |
| Defined retention period | 🔴 **NOT IMPLEMENTED / NOT FOUND** — no retention-period constant or scheduled purge job exists anywhere in code or config. Do not assume or invent a period for the Privacy Policy; state that none is currently enforced, or set one as a forward business decision. |
| Backups retained | 🟢 14 days, daily `pg_dump`, same-host storage (`docker-compose.prod.yml`). |
| Data export/download ("my data") | 🔴 **NOT IMPLEMENTED**. |
| Data correction | 🟢 `PATCH /auth/me` lets a user update their own profile. |

---

## 11. Current Policies Already Implemented (in code or existing legal pages)

- **Cancellation policy (user-facing, hardcoded)** 🟢: paid bookings cancellable up to 2 hours before session start, full refund, no fee; unpaid bookings cancellable anytime. This is a **global constant in `booking_service.py`**, not read from any settings table — not currently configurable per café despite `cafes.cancellation_policy` being a free-text field owners can fill in (that field is **display-only text**, not wired into actual enforcement logic — 🟡 flag this: the café's own stated cancellation policy text is not what the system actually enforces).
- **Café cancellation policy** 🟢: no cutoff, always triggers full refund if the booking was paid.
- **No-show policy** 🟢: after session end + 15 min grace with no check-in, booking auto-flips to `NO_SHOW`. **No refund is issued** — the café keeps 100% of the payment (money was already captured; refund logic never fires for this path).
- **Refund policy** 🟢: always full amount; no partial refunds exist anywhere in the system.
- **Existing Privacy Policy wording** (`frontend/src/app/(legal)/privacy/page.tsx`) 🟡 — states phone is "optional," claims only "name, booking reference, seat count" go to café partners, and claims a 13+ minimum age with a takedown-on-report mechanism. **All three claims are inconsistent with the current implementation** (see §13).
- **Existing Terms wording** (`frontend/src/app/(legal)/terms/page.tsx`) 🟡 — describes an outdated "2% gateway fee + flat ₹10 fee" pricing model that does not match the current combined-percentage formula in `config.py`. Also states "confirmed only after successful payment," which **is accurate** and matches code.
- **Café commission rules** 🟡 — `/partner` marketing page claims "3–5% convenience fee" to prospective owners; actual `PlatformSetting.commission_percentage` DB default is 10% (but appears unused/dead in the pricing formula); the real customer-facing fee formula computes to ~3.85% by default. Three different numbers in three different places — needs reconciliation before any agreement states a number.
- **User restrictions / prohibited activities** 🟡 — Terms page contains general account-misuse and liability-disclaimer language, but 🔴 **no content-ownership/licensing clause** exists anywhere covering photos, reviews, or café-submitted content.
- **Review content rules** 🟢 — one review per booking (DB-enforced via unique FK), but 🔴 the completed-status check is not actually enforced in the service layer, and reviews **cannot be edited or deleted** by their author once submitted; admin can only hide (not delete) a review.

---

## 12. Legal-Relevant Product Facts

| Issue | What KHELO Currently Does | Agreement Must Address? | Why |
|---|---|---|---|
| Customer data shared with café | Name always; email+phone at check-in desk and same-day search | Yes | Privacy Policy currently understates this — must be corrected and disclosed accurately |
| Café cancellation with no cutoff | Café can cancel a confirmed booking any time before session, always full refund | Yes | Customer-facing Booking/Refund Terms must set expectations; currently no compensation/goodwill mechanism beyond refund |
| No-show — customer keeps no refund, café keeps 100% | Automatic status flip, no refund path | Yes | Must be explicitly stated as a policy, since it is currently just a code side-effect, not a stated rule |
| Café no-show (café fails to honor booking) | 🔴 No distinct mechanism exists — only owner-initiated cancellation | Yes | A legal remedy/compensation policy for this scenario does not exist in the product and must be defined as a business decision |
| Refund without payout clawback | If a café was already paid via Route before a refund, the café is not automatically debited | Yes | Café Agreement must define the café's contractual obligation to return funds in this scenario, since the system doesn't enforce it technically |
| Partial refunds | Not implemented — full or nothing | Yes | Refund Policy must state this as the current mechanism, or flag it as a future capability |
| Reviews | Implemented, but 🔴 not gated on completed bookings; no edit/delete for authors | Yes | User Terms/UGC section must describe review submission rules as they actually work, and clarify KHELO's moderation (hide-only, no delete) |
| Age / minors | 🔴 No DOB, no age gate, no enforcement of any minimum age anywhere in signup | Yes | Must decide and then either implement enforcement or accurately soften the legal claim to match reality |
| Booking modification/transfer | 🔴 Not implemented | Yes | Terms should state customers can only cancel-and-rebook, not modify |
| Data retention period | 🔴 Not implemented/defined | Yes | Privacy Policy must not claim a specific retention period that doesn't exist in the system; either implement one or state data is retained indefinitely absent a deletion mechanism |
| Account deletion | 🔴 Not implemented (self-service) | Yes | Cannot promise "you may delete your account" in Privacy Policy without either implementing it or removing/adjusting the claim |
| PAN/bank data encryption | Stored largely as plaintext (full bank number's encryption status unverified; PAN confirmed plaintext) | Possibly | Relevant to data-security representations in Privacy Policy / Café Agreement — recommend not overstating security posture |
| Commission/fee figures | Three inconsistent numbers exist across marketing copy, DB default, and actual formula | Yes | Café Agreement and Terms must state one reconciled, accurate figure |

---

## 13. Conflicts / Risks (Actual Findings Only)

1. **Pricing text is stale**: `terms/page.tsx` describes a "2% gateway fee + flat ₹10 convenience fee" model; the actual code (`config.py`) computes a combined ~3.85% percentage fee instead, with the old flat fee hardcoded to zero.
2. **Phone-number "optional" claim mismatch**: Privacy Policy and Terms both call phone number optional; backend/DB agree it's nullable, but the **frontend registration form enforces it as required** with validation — so the actual user experience contradicts the legal text (which happens to match the backend, not the UI).
3. **Data-sharing understatement**: Privacy Policy says only name/booking-reference/seat-count go to café partners; code shows **email and phone number are also exposed** to café owner/staff at check-in and via a same-day phone-search feature.
4. **Age policy unenforced**: Privacy Policy claims a 13+ minimum age with a takedown-on-report process, but there is **no DOB field, no age gate, and no code-level enforcement anywhere** in the signup flow.
5. **Café's own displayed cancellation-policy text is not authoritative**: `cafes.cancellation_policy` is a free-text field owners can set and customers see, but the **actual enforced cancellation rule (2-hour cutoff, full refund) is a hardcoded global constant** unrelated to that text field — a café could type any policy text and it would have no effect on what the system actually does.
6. **Refund-without-clawback**: KHELO can refund a customer after the café has already been paid via Route, with **no automated mechanism to recover that money from the café** — an explicitly logged, known code gap.
7. **Commission/fee numbers disagree across three sources**: marketing copy (3–5%), `PlatformSetting.commission_percentage` DB default (10%, apparently unused/dead field), and the actual applied customer-facing formula (~3.85% of subtotal). None of these describe the same thing, and none should be assumed correct without a business decision reconciling them.
8. **Review integrity gap**: the review system's booking-linkage check does not verify the booking was actually completed, and in one code path a review can be created with a *fabricated* booking ID rather than a real one, undermining any "verified booking" claim a Terms/UGC section might want to make about reviews.
9. **Booking status enum mismatch**: the Python application model and business logic use `checked_in`, `active`, and `failed` booking statuses that are **not present in the tracked database migration's enum type** — this is an engineering discrepancy that could also mean data claims about "all valid booking statuses" are unreliable without an infra-level check outside this audit's scope.
10. **Hardcoded placeholder phone sent to Razorpay**: the payout-account-creation call sends a fake phone number (`9999999999`) instead of the real café owner's number — a data-accuracy issue relevant if any agreement represents that accurate data is transmitted to payment partners.
11. **PII logged in plaintext**: customer email addresses appear in structured application logs on every transactional email send — relevant to any security/data-handling representations in the Privacy Policy.

---

## 14. NOT FOUND / NOT IMPLEMENTED (Consolidated)

- Date of birth / age field, age verification, parental consent, any child-data handling
- Phone/SMS OTP authentication; Apple Sign-In
- Guest/no-account booking
- Server-side storage of user GPS location (client-side only)
- Referral system / referral fields
- Marketing consent field on user profile; any promotional email/SMS/WhatsApp/push actually sent (enum placeholder exists, unused)
- Targeted advertising / third-party ad SDKs; personalized recommendation engine
- Café "featured"/"sponsored"/priority placement mechanism
- Aadhaar, UPI/VPA, Udyam, MSME fields for café onboarding
- Café logo field (separate from photo gallery)
- Dedicated KYC/identity-document upload-and-storage system for cafés
- Individual station/machine identity or per-station status (active/maintenance)
- Dedicated games catalogue/table; game age ratings; per-game licensing metadata; VR/racing-sim as distinct platform types
- Booking modification (date/time/tier/seat change) and booking transfer to another user
- Multi-café / multi-tier / recurring bookings in a single transaction
- Partial refunds
- Automated payout clawback after a refund
- Admin ability to hold/reverse/adjust a payout directly
- Café no-show handling, late-arrival/early-departure fee adjustment
- Review editing/deletion by the author; review deletion by admin (hide-only exists); review moderation/flagging beyond a binary visibility toggle; anti-fraud/rating-manipulation detection
- Customer photo/video uploads (reviews or profile); user-to-café or user-to-user messaging/chat; public user profiles
- CSV/export of bookings or customers for café owners
- Cross-booking customer profile aggregation visible to a café
- Self-service account deletion (user or café owner); data anonymization; defined data-retention period; data export/download ("my data") feature
- Content-ownership/licensing clause for user- or café-submitted content
- Scheduled/cron background jobs of any kind (all lifecycle transitions are lazy, computed only on next read)
- Off-host/offsite backup replication (backups are same-host only)
- DB-level Row-Level Security (all authorization is app-layer only)

---

## 15. Questions KHELO Must Answer Before Agreements Are Drafted

### 1. Business/legal decisions
- **Q:** Is the sole-proprietorship structure ("Mohammed Abdullah," Hyderabad) the final legal entity to name in all six documents, or is incorporation planned/underway? **Why needed:** every agreement's contracting-party clause depends on this.
- **Q:** Should KHELO formally classify itself as a "marketplace e-commerce entity" for Consumer Protection (E-Commerce) Rules, 2020 purposes? **Why needed:** determines mandatory disclosures (grievance officer, return/refund policy display, seller identity disclosure) the code doesn't currently address at all.

### 2. Pricing/commission decisions
- **Q:** What is the actual, final commission/fee percentage KHELO charges — and should the dead `PlatformSetting.commission_percentage` field, the marketing "3–5%" claim, and the real ~3.85% formula be reconciled into one number, or does the business want a range? **Why needed:** three inconsistent figures currently exist in different parts of the product; the Café Agreement and Terms need one authoritative statement.
- **Q:** Should GST be itemized separately to customers/cafés, or does KHELO intend to continue treating gateway costs (which already include GST on Razorpay's side) as sufficient? **Why needed:** no tax computation exists in code at all; a legal/accounting decision must precede any tax-related clause.

### 3. Cancellation/refund decisions
- **Q:** Is the hardcoded 2-hour cancellation cutoff and full-refund-only policy the intended final consumer policy, or should it vary by café/booking value/time-of-day? **Why needed:** currently global and not configurable; the Booking/Cancellation/Refund Terms must match what's enforced, not what a café's own free-text policy field says (which currently does nothing).
- **Q:** What should happen on a customer no-show — is "café keeps 100%, no refund" the intended final policy, or should there be a partial-refund/credit path? **Why needed:** currently just a side-effect of a status flip, not a considered policy; no partial-refund mechanism exists to implement any alternative today.
- **Q:** What should happen on a café no-show (café fails to honor a confirmed booking)? **Why needed:** no distinct mechanism or compensation policy exists in the product at all.
- **Q:** Who bears the risk/obligation when a refund is issued after the café has already been paid out — is the café contractually obligated to return funds on demand? **Why needed:** the system provides no automated clawback; this must be a contractual (not technical) safeguard.

### 4. Café-owner commercial terms
- **Q:** What are the specific grounds and process for suspending/terminating a café's account, and what notice/appeal rights (if any) does a café have? **Why needed:** code shows admin can suspend with only a free-text reason (min 10 characters) — no defined criteria exist today; this is a business/legal policy call.
- **Q:** Should café owners be contractually required to keep their own displayed `cancellation_policy` text consistent with KHELO's actual enforced 2-hour rule, given the text currently has no functional effect? **Why needed:** avoids a misrepresentation risk to end customers.

### 5. Privacy/data decisions
- **Q:** What data retention period should KHELO adopt, and should a deletion/anonymization mechanism be built before or after the Privacy Policy is published? **Why needed:** none currently exists; publishing a retention promise without implementing it creates legal exposure under DPDP-style principles.
- **Q:** What is KHELO's intended minimum user age, and will age verification be implemented to match whatever the Privacy Policy states? **Why needed:** current 13+ claim has zero technical enforcement.
- **Q:** Should the Privacy Policy be corrected now to accurately describe that café staff can see customer email and phone (not just name/reference/seat count)? **Why needed:** current text materially understates data sharing.

### 6. Marketing decisions
- **Q:** Does KHELO intend to actually launch promotional messaging (the `PROMOTION` notification type exists but is unused), and if so, will an opt-in/opt-out consent field be built? **Why needed:** no consent mechanism exists today; any marketing-communications clause should reflect current reality (no marketing sent) unless building this is imminent.

### 7. Customer-support/grievance decisions
- **Q:** Who is the designated Grievance Officer (name/contact) as may be required under IT Rules / e-commerce rules, and what is the committed response SLA? **Why needed:** the current support-ticket system has no defined SLA or officer designation in code — this is a policy decision, not a technical one.

### 8. Any other decisions
- **Q:** Should the booking-status DB/model enum discrepancy (`checked_in`/`active`/`failed` missing from the tracked migration) be investigated and fixed before go-live, since it could affect data-integrity representations made in any agreement about system reliability? **Why needed:** unresolved engineering question that a legal drafter should be aware of, even though it's not itself a legal clause.

---

## 16. Final Database / Platform Reference

### Core tables and key fields
| Table | Key Fields | Purpose |
|---|---|---|
| `users` | id, email, password_hash, google_id, full_name, phone_number, role, is_active, avatar_url | Customer/owner/admin accounts |
| `user_roles` | user_id, role, cafe_id | Multi-role/multi-café authorization (source of truth for RBAC) |
| `cafes` | id, owner_id, name, address fields, city/state/pincode, lat/long, phone/email, opening/closing time, total_seats, amenities, photos, menu_photos, supported_games, business_pan, gstin, legal_document_url, cancellation_policy, house_rules, social_links, verification_status, is_active, rejection_reason, bookings_paused, is_emergency_mode, draft_data | Café listings and lifecycle |
| `hardware_tiers` | id, cafe_id, name, platform (enum), model, specs (JSON), price_per_hour, total_seats, app_bookable_seats, app_bookable_seats_locked, reserved_walkin_seats, active_seats_count, is_active | Inventory (grouped stations, not per-machine) |
| `bookings` | id, booking_reference, gamer_id, cafe_id, hardware_tier_id, seats_count, session_date, start/end_time, duration_hours, base_amount, discount_amount, gateway_fee, convenience_fee, total_amount, status (enum), promotion_id, qr_code_url, notes, cancelled_at, cancellation_reason, actual_start/end_time, checked_in_by, checked_in_at, checkin_method | Core booking record |
| `payments` | id, booking_id (unique), razorpay_order_id (unique), razorpay_payment_id, razorpay_signature, amount, currency, status (enum), failure_reason, refund_id, refunded_at | Payment lifecycle, 1:1 with booking |
| `promotions` | id, cafe_id, title, discount_percentage, applicable_tier_id, valid_from/until, days_of_week, start/end_hour, max_uses, current_uses, is_active | Café-created coupons |
| `platform_fees` | id, booking_id (unique, CASCADE), convenience_fee, gateway_fee, tds_amount, owner_settlement_amount, razorpay_transfer_id, transfer_status, transfer_error | Per-booking revenue split record |
| `platform_settings` | id (singleton), commission_percentage (appears unused), support_email, maintenance_mode, updated_by | Admin-editable global settings |
| `owner_payout_accounts` | id, owner_id (CASCADE), razorpay_account_id, kyc_status, business_pan, bank_account_number_masked, details (JSON, may hold full account number), bank_ifsc, account_holder_name | Café payout/KYC record |
| `reviews` | id, cafe_id, gamer_id, booking_id (unique), rating, comment, is_visible, owner_reply, owner_replied_at | Customer reviews |
| `notifications` | id, user_id, type (enum incl. unused PROMOTION), payload/message fields | In-app notifications |
| `support_tickets` | id, user_id, cafe_id (nullable), booking_id (nullable), subject, description, category, priority, status, admin_notes | Support/grievance/dispute tickets |
| `staff_invitations` | id, email, full_name, phone_number, venue_id, invited_by, token, status | Café staff onboarding |
| `admin_audit_log` | id, admin_id, admin_email, action, entity_type, entity_id, entity_name, reason, created_at | Admin action audit trail |
| `password_reset_token` | token, user_id, expiry | Forgot-password flow |

### Status enums
- **Booking**: `pending_payment, confirmed, cancelled, completed, no_show` (DB-migration-confirmed) + `checked_in, active, failed` (used in app code, **not confirmed present in the tracked DB enum** — discrepancy noted).
- **Payment**: `created, captured, failed, refunded`.
- **Café verification**: `draft, pending, verified, rejected, suspended`.
- **KYC (payout)**: free-string `pending, submitted, activated, suspended, rejected` (not a DB enum type).
- **User role**: `gamer, cafe_owner, staff, admin`.
- **Notification type**: includes an unused `promotion` value.

### Roles
`GAMER`, `CAFE_OWNER`, `STAFF`, `ADMIN` — enforced via FastAPI dependency guards; a café-scoped grant (`user_roles.cafe_id`) allows one user to hold different roles at different cafés (e.g., staff at one café).

### Key APIs (by area)
- Auth: register, login (email + Google), refresh, forgot/reset/change password, `/me` (get/patch), switch-role, staff invitation accept.
- Bookings: create, get, cancel, list (customer + owner + admin variants).
- Payments: create-order, verify, webhook (`payment.captured`, `payment.failed`, `account.activated/suspended/rejected`).
- Owner: onboarding (draft/submit), café settings, hardware tiers, availability timeline, bookings (list/checkin/status/cancel/validate-qr/search-checkin), payouts (status/setup), promotions, analytics (partly mocked), emergency-close-day.
- Admin: café verify/suspend/reactivate/pause-bookings, user list/deactivate/activate/role-change, bookings list/detail/force-cancel/refund, promotions list/deactivate, reviews list/hide-restore, payments list, staff list/revoke, audit-log, support tickets, platform settings, payouts list.
- Reviews: create, list-by-café, owner-reply.
- Support: create/list/get own tickets; admin list/get/update.

### Webhooks
- `POST /payments/webhook` — Razorpay events: `payment.captured`, `payment.failed`, `account.activated`, `account.suspended`, `account.rejected`. HMAC-verified against `RAZORPAY_WEBHOOK_SECRET`, fails closed in production if secret missing.

### External services (recap — see §8 for full detail)
Razorpay, Razorpay Route, AWS SES, AWS S3, Google OAuth, Google Maps, Sentry, Let's Encrypt/Caddy, self-hosted Postgres backups.

---

*End of audit. All findings above are sourced from code/schema inspection performed on 2026-09-05 against the current working tree at `E:\KHEL-O`. No legal text has been drafted. No application or database state was modified.*
