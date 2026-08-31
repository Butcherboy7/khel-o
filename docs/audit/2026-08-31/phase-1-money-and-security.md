# Phase 1 — Money & Security

**Scope (files read end to end):**
`backend/app/api/deps.py`, `backend/app/core/security.py`, `backend/app/core/sentry.py`, `backend/app/config.py`, `backend/app/main.py`,
`backend/app/services/payment_service.py`, `owner_payout_service.py`, `platform_derivation.py`, `promotion_service.py`, `auth_service.py`,
`backend/app/services/booking_service.py` (money math + cancel/refund paths), `owner_service.py` (`_validate_user_cafe_access`, check-in), `admin_service.py` (audit log, role change),
`backend/app/api/v1/`: `payments.py`, `owner_payouts.py`, `promotions.py`, `rewards.py`, `auth.py`, `admin.py`, `bookings.py`, `cafes.py`, `notifications.py`, `reviews.py`, `support.py`, `owner.py` (endpoint-by-endpoint dependency sweep),
`backend/app/models/`: `payment.py`, `platform_fee.py`, `user.py`, `user_role.py`, `password_reset_token.py`, `staff_invitation.py`, `promotion.py`,
`backend/app/schemas/user.py`, `backend/app/repositories/user_repository.py` (`update_role`),
`frontend/src/hooks/useRazorpay.ts`, `frontend/src/lib/api/client.ts`, `frontend/src/lib/api/payments.ts`, `frontend/src/components/MockPaymentModal.tsx`, `frontend/src/store/authStore.ts`,
`.env.example`, `.env.prod.example`, `frontend/.env.example`, `docker-compose.prod.yml`, `Caddyfile`, `frontend/next.config.js`, `git ls-files`.

**Verdict:** The *routine* authorization layer is genuinely good — I went endpoint by endpoint through every router and found no classic IDOR: every `{cafe_id}` / `{tier_id}` / `{booking_id}` / `{promotion_id}` mutation re-derives ownership from the authenticated user, staff are café-scoped through `UserRoleMapping`, and `owner_id` is never taken from a request body. Razorpay HMAC verification, webhook signature checking, promo row-locking, and Route-transfer idempotency are all implemented. The danger is concentrated in three places instead: (1) `POST /auth/accept-invitation` is an unauthenticated endpoint that overwrites an existing account's password and hands back that account's tokens — a full takeover primitive reachable by any registered user; (2) payment-signature enforcement is *fail-open*, gated on `ENVIRONMENT == "production"` matching that exact string; and (3) the Razorpay key secret and webhook secret have real, committed default values that no production validator checks. Money math (fee %, paise conversion, Decimal handling) is correct; refund *lifecycle* is not (no idempotency, no Route claw-back).

**No real `.env` is tracked in git** — `git ls-files | grep -i env` returns only `.env.example`, `.env.prod.example`, `frontend/.env.example`, `backend/migrations/env.py`, `frontend/next-env.d.ts`. No secret is committed as a *value*; the problem is secrets committed as *defaults* (see 1-3).

## Findings summary

| ID | Sev | Title | File |
|---|---|---|---|
| 1-1 | P0 | Unauthenticated account takeover via `/auth/accept-invitation` password overwrite | `backend/app/api/v1/auth.py:251-306` |
| 1-2 | P0 | Payment signature verification fails open for any `ENVIRONMENT` string other than `"production"` | `backend/app/services/payment_service.py:317-344` |
| 1-3 | P0 | Committed default Razorpay key secret and webhook secret, with no production validation | `backend/app/config.py:31-33, 78-86` |
| 1-4 | P1 | `process_refund` has no idempotency guard — refunds can be replayed | `backend/app/services/payment_service.py:505-599` |
| 1-5 | P1 | Refunds on Route-split bookings never claw back the café's share | `backend/app/services/payment_service.py:510-527` |
| 1-6 | P1 | A transient Razorpay timeout permanently bricks a booking with a fabricated order ID | `backend/app/services/payment_service.py:217-260` |
| 1-7 | P1 | 30-day refresh tokens in `localStorage`, never revocable; password reset does not end sessions | `frontend/src/lib/api/client.ts:23,151-169` |
| 1-8 | P1 | Sentry `send_default_pii=True` ships `Authorization` headers and login bodies to a third party | `backend/app/core/sentry.py:21` |
| 1-9 | P1 | No rate limiting anywhere — login, forgot-password, reset-password, accept-invitation | `backend/app/main.py:382-411` |
| 1-10 | P2 | MockPaymentModal is reachable in production builds when `checkout.js` fails to load | `frontend/src/hooks/useRazorpay.ts:73-113` |
| 1-11 | P2 | Authorization decided from the legacy `users.role` column on four read paths | `backend/app/api/v1/bookings.py:107-127` |
| 1-12 | P2 | `/docs` and `/openapi.json` publicly routed in production | `Caddyfile:16-22` |
| 1-13 | P2 | Promotion `current_uses` incremented at booking creation, never released on expiry | `backend/app/services/promotion_service.py:254-264` |
| 1-14 | P3 | Localhost origins in the production CORS allowlist | `backend/app/main.py:390-404` |

---

### [P0] Close the unauthenticated password-overwrite in `/auth/accept-invitation`

- **Where:** `backend/app/api/v1/auth.py:251-306` (overwrite at `:276-279`, token issue at `:296-304`); token disclosed at `backend/app/api/v1/owner.py:1139,1194`; role self-grant at `backend/app/api/v1/cafes.py:138-185`.
- **What:** `POST /api/v1/auth/accept-invitation` takes no authentication. It looks up the invitation by token, then looks up a user **by the invitation's email**, and if that user already exists it does `user_repo.update(user.id, {"password_hash": get_password_hash(payload.password)})` and returns a freshly minted access + refresh token pair for that account. It never verifies that the caller controls the invited mailbox. The invitation creator receives the raw token in the `POST /owner/staff/invitations` response body (`"token": invitation.token`, `owner.py:1194`) and again in the list endpoint's `inviteUrl` (`owner.py:1229`), so the attacker never needs the victim's email.
- **Why it's P0:** Full account takeover of *any* existing account, chosen by email address — including `admin@khelo.in` / `admin@example.com` and any café owner. Once inside an admin account the attacker reaches every `require_admin` endpoint: `POST /admin/bookings/{id}/refund` (moves real money), `PATCH /admin/users/{id}/role`, `PATCH /admin/settings`. This is not owner-only: `POST /api/v1/cafes` (`cafes.py:138-185`) runs under plain `get_current_active_user` and unconditionally inserts a `UserRoleMapping(role=CAFE_OWNER)` for the caller, so **any self-registered gamer** can become a café owner in one request and then issue the invitation.
- **Repro / trigger:** Register a normal account → `POST /api/v1/cafes` with any payload (you are now `cafe_owner`) → `POST /api/v1/owner/staff/invitations {"email": "admin@khelo.in", "fullName": "x"}` and read `data.invitation.token` from the response → `POST /api/v1/auth/accept-invitation {"token": "<that token>", "password": "attacker123"}` → the response body contains a valid `accessToken` for the admin account, and the admin's old password no longer works.
- **Fix sketch:** Never touch an existing account's `password_hash` from an invitation. For an existing user, the invitation must only grant the staff role and must require the *logged-in* user's id to match the invited email (or be accepted from an authenticated session); only the create-new-user branch should set a password. Separately, stop returning the raw token in the owner-facing response.
- **Confidence:** High.

### [P0] Make payment signature verification fail closed regardless of `ENVIRONMENT`

- **Where:** `backend/app/services/payment_service.py:309-344` (specifically `:318`, `:341-344`); webhook counterpart at `:393-401`.
- **What:** After computing the expected HMAC, the mismatch branch is:
  ```
  if payload.razorpay_signature != expected_signature:
      if payload.razorpay_signature == 'mock_signature_valid' and settings.ENVIRONMENT != "production":  → accept
      ...
      elif settings.ENVIRONMENT == "production":  → raise INVALID_SIGNATURE
      else:  → logger.warning("...allowing for testing"); fall through and CONFIRM the booking
  ```
  The final `else` accepts **any** signature value. Enforcement therefore depends on `settings.ENVIRONMENT` being exactly the lowercase string `"production"`. `Settings.ENVIRONMENT` defaults to `"development"` (`config.py:15`), and the validator at `config.py:78-86` only fires on that same exact string, so a missing, misspelled (`prod`, `Production`), or `staging` value silently disables signature checking rather than failing the boot. The webhook has the same shape at `:396-401` (empty secret + non-`production` → process the payload unverified).
- **Why it's P0:** With enforcement off, any authenticated gamer gets free confirmed bookings: create a booking, call `/payments/create-order`, then `POST /payments/verify` with the returned `razorpay_order_id`, an arbitrary `razorpay_payment_id`, and an arbitrary signature. The service marks the payment `CAPTURED`, sets the booking `CONFIRMED`, generates the QR pass, emails the confirmation, and — if Route is on — transfers the café's share out of the platform's account. The platform pays the café for a session no customer ever paid for. A `staging` deployment pointed at live Razorpay keys is the realistic trigger.
- **Repro / trigger:** Set `ENVIRONMENT=staging` (or omit it) in the backend env, then `POST /api/v1/payments/verify {"razorpayOrderId": "<your order>", "razorpayPaymentId": "pay_x", "razorpaySignature": "anything"}` → 200, booking `CONFIRMED`.
- **Fix sketch:** Invert the default: reject on signature mismatch unconditionally, and gate the mock/dev bypass behind an explicit opt-in flag (e.g. `ALLOW_MOCK_PAYMENTS=true`) that is separate from `ENVIRONMENT` and that the production validator refuses. Apply the same inversion to the webhook's empty-secret path.
- **Confidence:** High on the code behaviour; the exploit is gated on deployment config, which is exactly why fail-closed matters.

### [P0] Remove the committed default Razorpay key secret and webhook secret

- **Where:** `backend/app/config.py:31-33`; production validator that ignores them at `backend/app/config.py:78-86` and `backend/app/main.py:370-374`.
- **What:**
  ```
  RAZORPAY_KEY_ID: str = "rzp_test_placeholder_key_id"
  RAZORPAY_KEY_SECRET: str = "rzp_test_placeholder_key_secret"
  RAZORPAY_WEBHOOK_SECRET: str = "rzp_test_webhook_secret"
  ```
  These are real, non-empty, world-readable values in the repo. The production guard checks only `SECRET_KEY` and `DATABASE_URL`; it never asserts that the Razorpay secrets were overridden. `.env.example` does not list `RAZORPAY_WEBHOOK_SECRET` at all, so a deploy derived from it inherits the committed default. Because the default is non-empty, `handle_webhook` (`payment_service.py:394-413`) takes the "verify" branch and happily validates HMACs computed with the published secret. The same holds for `verify_payment`'s HMAC, which is keyed on `RAZORPAY_KEY_SECRET`.
- **Why it's P0:** An attacker who can read this repo (or guess the string) can forge `payment.captured` webhooks. `handle_webhook` accepts an arbitrary `order_id` from the payload, looks up the payment, marks it `CAPTURED`, confirms the booking, issues the QR pass, and fires `_create_route_transfer` — paying the café out of the platform's balance for an unpaid booking. The attacker obtains a valid `order_id` for free from their own `/payments/create-order` call. Same secret also forges the `/payments/verify` signature directly.
- **Repro / trigger:** Deploy with `RAZORPAY_WEBHOOK_SECRET` unset (it is absent from `.env.example`). Create a booking and an order; compute `hmac_sha256("rzp_test_webhook_secret", body)` over a `payment.captured` body naming that order id; `POST /api/v1/payments/webhook` with header `X-Razorpay-Signature: <hmac>` → booking `CONFIRMED`, no money taken.
- **Fix sketch:** Make all three fields `Optional[str] = None` with no default value, and extend the `validate_production_security` model validator to raise when any of them is unset or still matches a placeholder while `ENVIRONMENT == "production"`. Add `RAZORPAY_WEBHOOK_SECRET` to `.env.example`.
- **Confidence:** High that the defaults are unguarded; Medium that a given deployment actually inherits them (`.env.prod.example` does include the key, albeit empty — an empty value fails closed).

---

### [P1] Add an idempotency guard to `process_refund`

- **Where:** `backend/app/services/payment_service.py:505-599`; callers at `backend/app/api/v1/admin.py:457-494`, `backend/app/services/booking_service.py:402-416`, `backend/app/api/v1/owner.py:2024-2034`.
- **What:** `process_refund` never checks `payment.status`. It does not reject a payment already in `PaymentStatus.REFUNDED`, does not check `refund_id is not None`, and takes no row lock. Every call POSTs a **full-amount** refund (`"amount": int(round(payment.amount * 100))`, `:548`) to Razorpay, then unconditionally `mark_refunded(...)` and `send_refund_confirmation(...)` (`:589-593`). The admin endpoint `POST /admin/bookings/{booking_id}/refund` has no status precondition of its own either.
- **Why it's P1 (not P0):** Razorpay itself rejects an over-refund, so the second real API call errors out and lands in the `except` at `:565`, which now correctly refuses to mark it refunded. The safety net is entirely the gateway's, not the application's — and it does not cover the credentials-absent branch (`:583-588`), where each replay fabricates a fresh `local_rfnd_...` id, re-marks the row, and emails the customer another "refund confirmed" notice for money that never moved. Concurrent calls (admin clicking twice while the customer cancels) race with no lock.
- **Repro / trigger:** `POST /api/v1/admin/bookings/{id}/refund` twice on the same confirmed booking. Second call re-enters the refund path; with `RAZORPAY_KEY_ID`/`SECRET` unset it returns a new `refundId` and sends a second refund email.
- **Fix sketch:** Load the payment with a row lock, return early with the existing `refund_id` when `status == REFUNDED` or `refund_id` is set, and add a status precondition on the admin endpoint.
- **Confidence:** High.

### [P1] Reverse the Route transfer when refunding a split payment

- **Where:** `backend/app/services/payment_service.py:510-527`.
- **What:** The code explicitly documents that it does not handle this: when `fee_row.transfer_status == "transferred"`, the café's share has already left the platform's Razorpay balance via Route, but `process_refund` still refunds the **full** `payment.amount` on the original payment and only writes a `logger.warning` telling a human to reverse the transfer by hand.
- **Why it's P1:** Every cancellation or admin refund of a Route-split booking costs KHEL-O the café's entire share out of pocket (`owner_settlement_amount` = the full discounted subtotal, `booking_service.py:215`) on top of losing its own service fee. On a ₹1,000 booking that is roughly ₹1,000 of real platform loss per refund, recoverable only by someone reading the logs. It is P1 rather than P0 only because `RAZORPAY_ROUTE_ENABLED` defaults to `False` (`config.py:39`) and `.env.prod.example` ships it `false`, so no transfer exists to claw back today — the day that flag flips, this is live P0 money loss.
- **Repro / trigger:** With `RAZORPAY_ROUTE_ENABLED=true`, confirm a booking (transfer fires, `transfer_status="transferred"`), then cancel it more than 2h before the session. The customer is refunded 100%; the café keeps its share.
- **Fix sketch:** Before refunding, call Razorpay's transfer-reversal API for `fee_row.razorpay_transfer_id` and only proceed once the reversal is accepted; record the reversal on the `PlatformFee` row. Until that exists, hard-block the refund path for `transfer_status == "transferred"` instead of warning.
- **Confidence:** High — stated in the code's own comment.

### [P1] Stop persisting a fabricated Razorpay order ID when order creation fails

- **Where:** `backend/app/services/payment_service.py:232-273`, with the poisoning early-return at `:217-224`.
- **What:** `create_razorpay_order` calls the Razorpay orders API with a **5-second** timeout (`:253`). On any exception it logs a warning and falls through to `order_id = f"order_{booking.booking_reference}_{uuid4().hex[:6]}"` (`:259-260`), then persists a `Payment` row with that made-up id. On the next attempt, `existing_payment = await self.payment_repo.get_by_booking_id(booking_id)` (`:217`) returns that row and the endpoint hands the client the same fake order id forever.
- **Why it's P1:** One transient 5s network hiccup permanently breaks a booking on the core money path. Razorpay Checkout rejects the unknown `order_id`, the customer cannot pay, retrying does not help because the poisoned row is returned verbatim, and the booking dies at the 15-minute TTL (`:346-355`) — a lost sale plus a customer who thinks the site is broken. It also silently degrades the amount-integrity story: the fake order was never registered with the gateway at any amount.
- **Repro / trigger:** Block egress to `api.razorpay.com` (or exceed 5s) for one request, call `POST /payments/create-order`, then call it again — both return `order_KH-XXXX_abc123`, which Razorpay Checkout will not open.
- **Fix sketch:** On order-creation failure, do not create the `Payment` row — return a retryable 502 to the client. If a local placeholder is kept for offline dev, mark the row so the `existing_payment` short-circuit skips it and re-attempts the real API.
- **Confidence:** High.

### [P1] Move refresh tokens out of `localStorage` and make them revocable

- **Where:** `frontend/src/lib/api/client.ts:23` (read), `:151-169` (refresh + rewrite), `frontend/src/store/authStore.ts:63-67,115-124`; server side `backend/app/services/auth_service.py:194-232`, `:347-365`.
- **What:** Both the 15-minute access token and the **30-day** refresh token (`REFRESH_TOKEN_EXPIRE_DAYS: int = 30`, `config.py:24`) live in `localStorage`, readable by any script on the origin. Server-side there is no refresh-token store, no `jti`, and no denylist: `refresh_access_token` validates the JWT signature, checks `type == "refresh"`, and re-issues an access token for the subject. `logout()` (`authStore.ts:115-124`) only clears `localStorage`. `reset_password` (`auth_service.py:347-365`) changes the hash and marks the reset token used but does not invalidate any issued token.
- **Why it's P1:** Any XSS anywhere in the Next.js app — including a third-party script, and the app injects `https://checkout.razorpay.com/v1/checkout.js` at runtime (`useRazorpay.ts:57-62`) — yields a 30-day, unrevocable session for the victim, which for an owner or admin is money-moving access. Worse, the standard remediation does not work: a user who suspects compromise and resets their password leaves the attacker's stolen refresh token fully valid for the remaining 30 days. The only kill switch is an admin deactivating the account (`is_active` is re-checked at `deps.py:47-56`).
- **Repro / trigger:** Copy `localStorage.refreshToken` from a logged-in browser, have the user log out and reset their password, then `POST /api/v1/auth/refresh` with the copied token → 200 with a fresh access token.
- **Fix sketch:** Store the refresh token in an httpOnly, Secure, SameSite cookie and persist a server-side record (id + revoked flag) so refresh can be denied; revoke all of a user's refresh records on password reset, password change, and logout.
- **Confidence:** High.

### [P1] Turn off Sentry `send_default_pii`

- **Where:** `backend/app/core/sentry.py:21`.
- **What:** `sentry_sdk.init(..., send_default_pii=True)` with the FastAPI/Starlette integrations attached. That flag is precisely what makes the SDK attach request headers, cookies, and user identity to every captured event.
- **Why it's P1:** Every unhandled exception on an authenticated request ships the caller's `Authorization: Bearer <jwt>` header to Sentry. An exception on `POST /auth/login`, `/auth/reset-password`, or `/auth/change-password` can carry the plaintext password in the request body. The result is live session tokens and credentials sitting in a third-party system with a different access-control boundary than the app — a data leak, not just noise. `backend/app/main.py:493-510` also returns `str(exc)` to the client in development, which is correctly gated.
- **Repro / trigger:** Trigger any 500 on an authenticated endpoint with `SENTRY_DSN` configured; inspect the event's request headers in the Sentry UI.
- **Fix sketch:** Set `send_default_pii=False` and add a `before_send` scrubber that strips `Authorization`, `Cookie`, and any `password`/`token`/`secret` body key.
- **Confidence:** High.

### [P1] Add rate limiting to the authentication endpoints

- **Where:** `backend/app/main.py:382-411` (no limiter middleware registered); endpoints at `backend/app/api/v1/auth.py:69` (`/login`), `:99` (`/forgot-password`), `:109` (`/reset-password`), `:251` (`/accept-invitation`), `:79` (`/google`).
- **What:** I grepped the whole of `backend/app/` for `slowapi`, `limiter`, and `ratelimit`: the only hit is `limiter = None` in `cafes.py:22`. No rate-limiting middleware is registered on the app, and Caddy applies none either (`Caddyfile` has no `rate_limit`).
- **Why it's P1:** `/auth/login` is an unthrottled credential-stuffing oracle against bcrypt (which also makes it a cheap CPU-exhaustion DoS on a single-container backend). `/auth/reset-password` and `/auth/accept-invitation` are unthrottled token-guessing oracles — the reset token is `secrets.token_urlsafe(32)` and the invite token is `secrets.token_hex(32)`, so brute force is infeasible on entropy alone, but with 1-1 in play an unthrottled `/accept-invitation` is the endpoint an attacker hammers. `/forgot-password` is an unthrottled email-send amplifier against the Resend quota.
- **Repro / trigger:** Send 10,000 `POST /api/v1/auth/login` requests with the same email; all are processed, each running a full bcrypt comparison.
- **Fix sketch:** Add `slowapi` (or Caddy `rate_limit`) with a per-IP and per-email budget on `/auth/*`, tightest on `login`, `forgot-password`, `reset-password`, and `accept-invitation`.
- **Confidence:** High.

---

### [P2] Do not fall back to MockPaymentModal in production builds

- **Where:** `frontend/src/hooks/useRazorpay.ts:73-113`; component `frontend/src/components/MockPaymentModal.tsx:14-83`; build arg `docker-compose.prod.yml` (`NEXT_PUBLIC_ENABLE_SANDBOX_MOCK_PAYMENTS:-false`).
- **What:** The mock branch is entered when `!isLoaded || typeof window.Razorpay === 'undefined' || isMockKey` (`:81`). The first two conditions have nothing to do with the sandbox flag — they are true whenever `checkout.js` fails to load (ad blocker, tracking-protection list, flaky network, CSP). The component is imported unconditionally, so it ships in the production bundle regardless of the flag.
- **Why it's P2 and not P0:** The forged `mock_signature_valid` it produces is correctly rejected by the backend when `ENVIRONMENT == "production"` (`payment_service.py:318-321`), so no free booking results — *provided* 1-2 is not also in play. What the user gets instead is a white-labelled modal reading "Sandbox Payment / Test Mode / Simulate SUCCESS" on a real checkout, followed by a hard `INVALID_SIGNATURE` failure. That is a trust-destroying UX failure on the money path, and it makes real payment outages look like a rigged test harness.
- **Repro / trigger:** Enable uBlock Origin (which blocks `checkout.razorpay.com` on some lists) or throttle the network so `script.onerror` fires, then start a booking checkout on production.
- **Fix sketch:** Gate the mock branch solely on `NEXT_PUBLIC_ENABLE_SANDBOX_MOCK_PAYMENTS === 'true'`, dynamically `import()` the modal so it is tree-shaken out otherwise, and give the script-load failure its own honest error state with a retry.
- **Confidence:** High.

### [P2] Stop reading authorization from the legacy `users.role` column

- **Where:** `backend/app/api/v1/bookings.py:107-127`, `backend/app/services/booking_service.py:235` and `:370`, `backend/app/api/v1/support.py:46`.
- **What:** These four paths branch on `current_user.role` (the single legacy column on `users`) rather than on `UserRoleMapping`. `app/services/owner_service.py:187-193` carries an explicit comment saying this column is *not* kept in sync with granted roles and must never be trusted for authorization; `deps.py:19-24` calls `user_roles` "the sole source of truth". `user_repository.update_role` (`:167-192`) only ever ratchets the column *upward* through a hierarchy and never clears it, so it can outlive a revoked grant.
- **Why it's P2:** Any account whose legacy column reads `admin` — including one demoted via `PATCH /admin/users/{id}/role`, since the column never ratchets back down — passes `role_val != "admin"` at `bookings.py:126`, `current_user.role == UserRole.ADMIN` at `booking_service.py:235`/`:370`, and `current_user.role.value != "admin"` at `support.py:46`. That yields read access to any booking's QR pass and any user's support ticket, plus the ability to cancel any booking. Not P1 because reaching that state requires an admin to have granted then revoked the role — the column can only be *raised* by a privileged action, never self-set.
- **Repro / trigger:** Admin grants a user the `admin` role, then changes it back to `gamer` (`update_role` at `:185` only assigns when the new level is *higher*, so `users.role` stays `admin`). That user can now `GET /api/v1/bookings/{any_id}/qr-pass`.
- **Fix sketch:** Replace all four checks with `get_user_roles(...)` from `deps.py`, matching the pattern already used in `owner_service._validate_user_cafe_access`.
- **Confidence:** Medium — the code path is certain; the drift precondition depends on admin behaviour I could not observe in data.

### [P2] Close `/docs` and `/openapi.json` in production

- **Where:** `Caddyfile:16-22`; `backend/app/main.py:382-387` (FastAPI constructed with default `docs_url="/docs"`, `openapi_url="/openapi.json"`).
- **What:** The reverse proxy explicitly routes `/docs` and `/openapi.json` to the backend, and the app does not disable them.
- **Why it's P2:** Publishes the complete authenticated API surface — every admin, owner, and payment route with its exact request schema — to anonymous visitors on `khel-o.online`. That is reconnaissance value handed over, not a breach on its own, and every route behind it is dependency-guarded.
- **Repro / trigger:** `curl https://khel-o.online/openapi.json`.
- **Fix sketch:** Pass `docs_url=None, redoc_url=None, openapi_url=None` to `FastAPI(...)` when `ENVIRONMENT == "production"`, and drop the two `handle` blocks from the Caddyfile.
- **Confidence:** High.

### [P2] Release promotion uses when a booking never gets paid

- **Where:** `backend/app/services/promotion_service.py:254-264`; consumed at `backend/app/services/booking_service.py:159-170`; TTL expiry at `backend/app/services/payment_service.py:346-355`.
- **What:** `apply_promotion_to_booking` increments `current_uses` under the row lock at booking-creation time, i.e. while the booking is still `PENDING_PAYMENT`. The increment is deliberately not committed separately so it rolls back if the *insert* fails — but nothing decrements it when the booking later expires at the 15-minute TTL, fails payment, or is cancelled.
- **Why it's P2:** Promo inventory leaks. A café's "first 50 bookings" promotion can be exhausted by 50 people who opened checkout and walked away, so paying customers see `PROMOTION_EXHAUSTED` and the café's campaign silently dies. It is lost revenue and a bad customer experience, not a direct money-loss or authz bug — and it is the *safe* direction of the error (over-counting, never over-discounting).
- **Repro / trigger:** Create bookings with a `max_uses=1` promo and abandon payment; `current_uses` stays at 1 and no one can use the promo again.
- **Fix sketch:** Decrement `current_uses` (guarded at zero) wherever a promoted booking transitions to `FAILED`, `CANCELLED`, or expires — or count uses from confirmed bookings rather than a denormalized counter.
- **Confidence:** High.

---

### [P3] Drop localhost origins from the production CORS allowlist

- **Where:** `backend/app/main.py:390-404`.
- **What:** `allow_origins` is a fixed list containing `settings.FRONTEND_URL` plus six hardcoded `http://localhost:*` / `http://127.0.0.1:*` entries, with `allow_credentials=True` and `allow_methods=["*"]`.
- **Why it's P3:** Not a wildcard and not `allow_origin_regex`, so this is not the classic CORS bypass — and since tokens are sent in an `Authorization` header rather than cookies, `allow_credentials` buys an attacker nothing here. The residual risk is narrow: a developer running something on `localhost:3000` against the production API. Worth removing for hygiene, not urgent.
- **Repro / trigger:** From a page served at `http://localhost:3000`, cross-origin requests to the production API pass the CORS preflight.
- **Fix sketch:** Build the origin list conditionally — `settings.FRONTEND_URL` only when `ENVIRONMENT == "production"`.
- **Confidence:** High.

---

## Verified as NOT broken (checked, do not re-audit)

These were on the hunt list and came back clean; recording them so the coordinator does not spend another pass here.

- **No IDOR in any router.** I walked every mutating endpoint in `api/v1/`. `require_cafe_ownership` (`deps.py:109-135`) re-reads the café and compares `owner_id` to the authenticated user. Endpoints that use only `require_cafe_owner` push the check into the service, and each one is present: `cafe_service.update_cafe:121`, `hardware_tier_service.update_hardware_tier:130`, `promotion_service.create_promotion:96` / `update_promotion:186` / `deactivate_promotion:204`, `owner.py:1388` (emergency mode, scoped by `owner_id` in the query), `owner.py:1800` (tier confirm-platform), `owner.py:2002` (owner booking cancel), `owner.py:1732` (tier belongs to café). Staff are café-scoped through `UserRoleMapping.cafe_id` in `owner_service._validate_user_cafe_access:204-221`, used by status update, check-in, and QR validation.
- **No `owner_id`/`cafe_id` trusted from a request body.** `promotions.py:33` passes `payload.cafe_id` but the service verifies ownership; payout setup derives `owner_id` from `current_owner.id` (`owner_payouts.py:38`). `UserUpdateRequest` (`schemas/user.py:63-70`) exposes only `full_name`, `phone_number`, `avatar_url` — no `role`, no `is_active` — so `PATCH /auth/me` cannot escalate.
- **Amount is recomputed server-side.** `booking_service.py:153-181` derives `base_amount` from the DB tier price, applies the server-side discount, and computes the fee as `(RAZORPAY_COST_PERCENT + PLATFORM_MARGIN_PERCENT)%` of the subtotal in `Decimal`. The client sends no amount. `verify_payment:302-307` re-asserts `payment.amount == booking.total_amount`.
- **Paise/rupee conversions are correct.** All three gateway calls use `int(round(x * 100))` on a `Numeric(10,2)` `Decimal`: order `:247`, transfer `:156`, refund `:548`. No float rounding drift, no double conversion. The `MockPaymentModal` divides by 100 for display, consistent with its input.
- **Route transfers are idempotent.** `_create_route_transfer:109-119` claims the row with a conditional `UPDATE ... WHERE transfer_status NOT IN ('transferred','processing')` and checks `rowcount`, so the client-driven and webhook-driven paths cannot double-pay.
- **Promotions cannot be stacked or double-applied.** One `promotion_id` per booking (`booking_service.py:159`), discount computed server-side (`promotion_service.py:250-252`), `max_uses` checked under `SELECT ... FOR UPDATE` (`:223`), café and tier scoping enforced (`:227`, `:247`), discount capped at 1-50% on both create and update (`:66`, `:190`). A promo cannot be applied after payment — there is no endpoint to attach one to an existing booking.
- **Password reset tokens are sound.** `secrets.token_urlsafe(32)` (`auth_service.py:333`), 30-minute expiry (`:337`), prior tokens invalidated on reissue (`:331`), `used_at` single-use enforced (`:355-356`), expiry re-checked (`:361`), and `request_password_reset` returns silently for unknown emails so it cannot enumerate accounts.
- **JWTs are signed correctly.** HS256 explicitly on both encode and decode (`security.py:8,33,37`), algorithm pinned as a list on decode so `alg: none` is rejected, `type` claim checked to stop refresh-for-access swaps (`auth_service.py:242`, `:202`), 15-minute access expiry.
- **`switch-role` does not escalate.** `switch_active_role` (`auth_service.py:263-312`) puts a `roles` claim in the token, but nothing reads it — `deps.get_user_roles` always queries `user_roles`. The `cafe_owner` self-grant path requires an existing `VERIFIED` café.
- **`activeRole` in `localStorage` is not a permission.** `sanitizeActiveRole` (`authStore.ts:20-28`) discards any value not in the server-returned roles, and it is a view-mode preference only.
- **Admin surface is uniformly gated.** All 30+ routes in `admin.py` carry `Depends(require_admin)`, which reads `user_roles` (`deps.py:100-107`). `write_audit_log` is called on all 14 mutating admin actions (verify, suspend, reactivate, pause, deactivate/activate user, role change, force-cancel, refund, promo deactivate, review visibility, staff revoke, ticket update, settings update).
- **Notifications, rewards, and support are correctly scoped.** Every notification query filters on `Notification.user_id == current_user.id`; `/rewards` is read-only and derives XP from the caller's own completed bookings.
- **No real `.env` is tracked in git**, and no secret appears as a committed *value*.

## Not covered

- **Runtime/deployment state.** I did not inspect the live server, so I cannot say what `ENVIRONMENT`, `RAZORPAY_WEBHOOK_SECRET`, or `RAZORPAY_ROUTE_ENABLED` are actually set to in production. Findings 1-2, 1-3, and 1-5 hinge on that; someone with server access should check `.env.prod` first.
- **Git history.** I checked only the current tree for tracked secrets. A secret committed and later removed would not show up in `git ls-files`.
- **`storage_service.py` / S3 presigned URLs** (`owner.py:1892`, `:1941`) — the AWS credential surface and presign scoping are unexamined; they are an upload-security question adjacent to this phase.
- **`notification_service.py`** — I confirmed only that refund/confirmation emails are *sent*; template injection and recipient derivation are unreviewed.
- **Google OAuth deep-dive.** `login_with_google` verifies `aud` against `GOOGLE_CLIENT_ID` — but only `if settings.GOOGLE_CLIENT_ID` is truthy, and it defaults to `None` (`config.py:27`). I did not develop this into a finding because `.env.prod.example` provisions the variable; if it is ever left blank in production, any Google id_token from any application would authenticate. Worth a second look.
- **SQL injection / raw SQL** — out of scope for this phase; note that `main.py:33-44` executes raw DDL on every boot with hardcoded statements (no user input).
- Everything in Phases 2+: booking races, availability math, timezone correctness, frontend UX.

## Notes for the coordinator

- **The three P0s share one root cause worth naming in the summary:** security decisions are *fail-open* by default. `ENVIRONMENT` defaults to `development`, the Razorpay secrets default to working placeholder strings, and the production validator checks only `SECRET_KEY` and `DATABASE_URL`. A single hardening pass on `config.py:78-86` — asserting every security-relevant setting was explicitly overridden in production — closes 1-2 and 1-3 together and prevents the next one.
- **1-1 is the one to fix today.** It needs no misconfiguration, no gateway access, and no race: any registered user can own the admin account in four HTTP requests. It should not wait for a batch.
- **Prior audit cross-reference (`LAUNCH_READINESS_AUDIT.md`):** its five "P0" items are all UX/DX issues — scanner cache invalidation, a dead OAuth button, a dead Edit Café button, silent error swallowing, and a booking-creation race. Under this rubric none of those is P0 (the race is P1, the rest P2). More importantly, that audit found **zero** of the money/security issues above; its §3.1/§3.2 "Authentication"/"Authorization" sections should be treated as unverified and not relied on as clearance. Its P0-5 claim about `client.ts:127-129` swallowing errors is now partially wrong: that block does `Sentry.captureException` (`client.ts:128-130`).
- **Phase 2 handoff:** `booking_service.py:126-151` (seat locking) and `promotion_service.py:223` (promo row lock) are the concurrency primitives; I read them for *money* correctness only and did not evaluate whether the locks actually prevent double-booking under load. Finding 1-13 (promo use leak) sits on the boundary between the two phases.
- **Phase 3 handoff:** finding 1-10 (mock modal in production) is as much a UX defect as a security one; the checkout error-state work belongs with the payment-flow UX review.
