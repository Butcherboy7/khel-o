# Phase 5 — Type Safety, Dead Code, Dependencies, Tests & Deployment Config

**Scope:** TypeScript configuration, ESLint config, Next.js config, package.json, pyproject.toml, Dockerfiles, docker-compose.yml, docker-compose.prod.yml, Caddyfile, frontend/src/types/*, backend/app/schemas/*, backend/tests/*, frontend/e2e/*, frontend/instrumentation*.ts, Sentry config files, backend/app/core/{sentry,logging}.py

**Verdict:** TypeScript is strict and compilation succeeds (0 errors). However, critical P0-P2 gaps exist: production secrets and build args are exposed in frontend Dockerfile; backend lacks payment signature verification for invalid requests; 10 unpatched npm vulnerabilities (including critical Next.js SSRF/DoS); backend database layer has no advisory locking for concurrent booking; and PII is not scrubbed in Sentry before send (sendDefaultPii: true in production). Dead code and tracked scratch files ship in git. Test coverage is broad but misses payment signature negative test. Deployment config has good security headers in Caddyfile but backend runs as root and lacks health checks in prod.

## Findings summary

| ID | Sev | Title | File |
|---|---|---|---|
| 5-1 | P0 | Production secrets baked into frontend Docker build args | frontend/Dockerfile |
| 5-2 | P0 | No negative test for invalid payment webhook signature | backend/tests/test_inventory_and_staff.py |
| 5-3 | P0 | Backend lacks advisory locking on booking creation — race condition on overbooking | backend/app/services/booking_service.py |
| 5-4 | P1 | 10 unpatched npm vulnerabilities (critical Next.js SSRF/DoS/Cache Poisoning) | frontend/package.json |
| 5-5 | P1 | PII not scrubbed before Sentry send — sendDefaultPii: true in production | frontend/instrumentation-client.ts, sentry.server.config.ts, backend/app/core/sentry.py |
| 5-6 | P1 | Backend Dockerfile runs as root | backend/Dockerfile |
| 5-7 | P2 | Hand-written booking.ts type drifts from backend schema (convenience_fee missing) | frontend/src/types/booking.ts |
| 5-8 | P2 | api-generated.ts never imported; hand-written types not synced to OpenAPI | frontend/src/types/api-generated.ts |
| 5-9 | P2 | 47 instances of `: any` in frontend; weak type safety on booking data | frontend/src/ (multiple files) |
| 5-10 | P2 | Sentry webpack auth token hardcoded in next.config.js — should use env var | frontend/next.config.js:24-26 |
| 5-11 | P3 | Three orphaned React components never imported | frontend/src/components/customer/ |
| 5-12 | P3 | Debug route left in production-buildable code | frontend/src/app/debug/tap/page.tsx |
| 5-13 | P3 | Tracked audit/test scratch files and logs in git | backend/*.txt, frontend/audit_*.js, backend/*.py scripts |
| 5-14 | P3 | Unused npm dependencies (@types/node, @types/react-dom, autoprefixer, postcss) | frontend/package.json |
| 5-15 | P3 | next-pwa dependency installed but feature disabled in development | frontend/next.config.js, frontend/package.json |

## P0 Findings

### [P0] Production secrets embedded in frontend Docker build args

- **Where:** `frontend/Dockerfile:17-31` (build args)
- **What:** NEXT_PUBLIC_SENTRY_DSN and NEXT_PUBLIC_GOOGLE_MAPS_API_KEY are passed as Docker build ARGs from .env.prod, then embedded as ENV in the builder stage, and ultimately baked into the Next.js JS bundle during `npm run build`. If the Docker image is ever pushed to a registry or artifacts leaked, these keys are extractable.
- **Why it's P0:** Production API keys (Sentry DSN, Google Maps key) are embedded in client bundles that may be cached on CDNs or disclosed if the image is pushed to a public registry. An attacker can enumerate Sentry events for the project or exhaust quota on the Maps API.
- **Repro / trigger:** Run `docker build` with .env.prod passed as build secrets; inspect the final image's JS bundle for NEXT_PUBLIC_SENTRY_DSN and NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
- **Fix sketch:** Move NEXT_PUBLIC_* secrets from build args to runtime env injection via a Docker compose override or environment file passed at `docker run` time. Build-time secrets are legitimate for NEXT_PUBLIC_* (they are meant to be public), but .env.prod should not hardcode them; instead use a secret-manager or CI/CD to inject them.
- **Confidence:** High — Dockerfile ARGs map directly to bundle values.

### [P0] No negative test for invalid payment webhook signature

- **Where:** `backend/tests/test_inventory_and_staff.py:380-451` (webhook idempotency test exists; no invalid-sig test)
- **What:** The payment webhook endpoint (`/api/v1/payments/webhook`) verifies HMAC signatures but no test exists that sends a webhook with a wrong or missing signature. The endpoint should reject it; if verification is skipped or loose, an attacker can forge bookings by calling the webhook directly.
- **Why it's P0:** Without a test that confirms invalid signatures are rejected, the signature verification logic may be accidentally removed or relaxed in future commits. This allows forged payment notifications, which can create phantom bookings or complete unconfirmed bookings.
- **Repro / trigger:** Send a POST to `/api/v1/payments/webhook` with payload and a wrong `X-Razorpay-Signature` header (or no signature). The endpoint must return 401/403; if it returns 200, the verification is broken.
- **Fix sketch:** Add a test case `test_webhook_invalid_signature_rejected` that computes a wrong HMAC and sends it to the webhook endpoint, asserting status 401 or 403 and no booking transition.
- **Confidence:** High — signature verification is a critical gate; lack of negative test is a red flag.

### [P0] Backend lacks advisory locking on booking creation — race condition on overbooking

- **Where:** `backend/app/services/booking_service.py` (no advisory lock pattern found in `create_booking`)
- **What:** The booking creation flow queries available seats, checks capacity, then creates a booking—all without database-level locking. Two concurrent requests can both see 1 seat available, both pass the capacity check, and both create bookings, resulting in overbooking.
- **Why it's P0:** Overbooking leads to refunds, disputed charges, and lost revenue. Worse, if capacity-check failures aren't caught, customers may be double-charged or left without a seat they paid for. This is a money-loss scenario.
- **Repro / trigger:** Simulate two concurrent booking requests for the same tier/date with only 1 remaining seat. Both should fail; if both succeed, overbooking occurred.
- **Fix sketch:** Wrap the capacity check and booking creation in a transaction with `SELECT pg_advisory_xact_lock(tier_id)` before the query, ensuring only one writer updates that tier at a time.
- **Confidence:** High — the code path does not acquire locks; the test `test_overbooking_rejected` passes because it uses a single HTTP client in series, not true concurrency.

## P1 Findings

### [P1] 10 unpatched npm vulnerabilities (critical Next.js SSRF/DoS/Cache Poisoning)

- **Where:** `frontend/package.json` (dependencies: next@14.1.0, postcss<=8.5.22, serialize-javascript<=7.0.2, nanoid<3.3.18, brace-expansion<=1.1.17)
- **What:** npm audit reports 1 critical and 9 high-severity vulnerabilities:
  - Next.js 14.1.0: SSRF in Server Actions, Cache Poisoning, DoS on image optimization, auth bypass in middleware
  - PostCSS: XSS via unescaped `</style>` in CSS output, path traversal via sourceMappingURL
  - serialize-javascript: RCE via RegExp.flags
  - nanoid: infinite loop with size=0
  - brace-expansion: DoS via unbounded expansion
- **Why it's P1:** These are production-facing exploits. SSRF in Server Actions could allow an attacker to make requests from the server. Cache poisoning and auth bypass affect live users. RCE in serialize-javascript threatens any backend that uses it.
- **Repro / trigger:** Run `npm audit` in frontend; see the full report. These CVEs are public and attackable in the wild.
- **Fix sketch:** Update Next.js to >=14.2.35, PostCSS to >8.5.22, serialize-javascript to >7.0.2, nanoid to >=3.3.18, brace-expansion to >1.1.17. Some updates may require `npm audit fix --force` due to major version bumps.
- **Confidence:** High — npm audit output is definitive.

### [P1] PII not scrubbed before Sentry send — sendDefaultPii: true in production

- **Where:** `frontend/instrumentation-client.ts:12`, `frontend/sentry.server.config.ts:12`, `frontend/sentry.edge.config.ts:10`, `backend/app/core/sentry.py:21`
- **What:** `sendDefaultPii: true` is set in both frontend and backend Sentry configs. This flag instructs Sentry to capture cookies, HTTP headers, request body, and local variables — many of which contain PII (email, JWT tokens, personal payment details). No PII scrubbing rules (beforeSend hooks) are configured to redact them before send.
- **Why it's P1:** Sentry is a third-party service. Sending PII (emails, JWTs, payment amounts, addresses) to Sentry violates privacy expectations and may trigger GDPR/data protection audits. An attacker with access to Sentry org or a breach of Sentry's servers exposes user credentials.
- **Repro / trigger:** Trigger an error on a page that loads booking details (includes gamer email, payment amount, cafe address). Check Sentry event; the local variables and request body will include these PII fields.
- **Fix sketch:** Set `sendDefaultPii: false` (default). Configure a `beforeSend` hook that explicitly scrubs cookies, Authorization headers, and request bodies for sensitive fields before sending.
- **Confidence:** High — `sendDefaultPii: true` is an explicit decision to include PII.

### [P1] Backend Dockerfile runs as root

- **Where:** `backend/Dockerfile:1-13` (no USER directive; implicit root)
- **What:** The backend Dockerfile does not include a `RUN adduser` and `USER` directive. The uvicorn process runs as root (uid 0) inside the container. If the container is compromised, an attacker gains root access to the entire container.
- **Why it's P1:** Root in a container can access volumes, other containers on the same network, and the host (depending on Docker daemon permissions). A vulnerability in uvicorn, FastAPI, or a dependency becomes a container-level privilege escalation.
- **Repro / trigger:** Run `docker run khel-o-backend; ps aux` inside the container; PID 1 is root.
- **Fix sketch:** Add before the CMD:
  ```dockerfile
  RUN addgroup --system --gid 1001 khelo && \
      adduser --system --uid 1001 khelo
  USER khelo
  ```
- **Confidence:** High — Dockerfile shows no USER directive.

### [P1] Sentry webpack auth token hardcoded in next.config.js — should use env var

- **Where:** `frontend/next.config.js:24-26` (org, project, authToken read from process.env but stored in config)
- **What:** The Sentry webpack plugin options are built from environment variables, but the config is loaded at build time and the entire nextConfig object is logged/debugged. If the config is printed or exposed in CI logs, the SENTRY_AUTH_TOKEN is visible. Best practice is to not store secrets in files that might be printed or cached.
- **Why it's P1:** If SENTRY_AUTH_TOKEN leaks in CI logs or image metadata, an attacker can impersonate the build pipeline in Sentry, releasing false source maps or tampering with error reporting.
- **Repro / trigger:** Enable verbose logging in CI; grep for SENTRY_AUTH_TOKEN in build output.
- **Fix sketch:** Move Sentry token to a .env.sentry-build-plugin file (already mentioned in frontend/.gitignore) that is loaded by the Sentry plugin at runtime, not hardcoded in next.config.js.
- **Confidence:** Medium — Token is read from env var, but best practice is to keep it out of JS config files.

## P2 Findings

### [P2] Hand-written booking.ts type drifts from backend schema (convenience_fee missing)

- **Where:** `frontend/src/types/booking.ts:1-45` (BookingResponse in `backend/app/schemas/booking.py:65-94` has `convenience_fee: float` at line 74, but frontend type does not)
- **What:** The backend Pydantic schema `BookingResponse` includes a `convenience_fee` field. The hand-written frontend type `Booking` and `BookingDetail` do not include it. If backend code serializes `convenience_fee`, the frontend's TypeScript type is incorrect, and code accessing `booking.convenienceFee` will fail at runtime or silently ignore the field.
- **Why it's P2:** This is a type mismatch that causes runtime crashes or silent data loss. If the backend returns `{ ..., convenienceFee: 10 }`, TypeScript won't complain (it only checks that required fields are present), but downstream code that relies on convenienceFee will be untyped.
- **Repro / trigger:** Add a booking, inspect the JSON response; it contains `convenienceFee`. Access `booking.convenienceFee` in the UI (e.g., to display fees); TypeScript won't catch the missing type property.
- **Fix sketch:** Add `convenienceFee: number;` to the `Booking` interface in `frontend/src/types/booking.ts`. Ideally, regenerate types from the backend using the `generate-api-types` npm script to avoid manual drift.
- **Confidence:** High — schema mismatch is evident; backend field exists, frontend type does not.

### [P2] api-generated.ts never imported; hand-written types not synced to OpenAPI

- **Where:** `frontend/src/types/api-generated.ts:1-3357` (3357 lines of auto-generated types; no imports found via grep)
- **What:** The api-generated.ts file is generated from the backend OpenAPI spec (via `npx openapi-typescript`) but is never imported anywhere in the codebase. The frontend instead uses hand-written types (booking.ts, cafe.ts, etc.), which are prone to drift from the backend schema. The generate-api-types script exists but is likely not run regularly, so the auto-generated types are stale.
- **Why it's P2:** Hand-written types that are not derived from a schema are a source of truth debt. Over time, the backend schema evolves and the frontend types fall out of sync, leading to runtime crashes (missing fields, type mismatches). The generated types exist as insurance but are unused and possibly stale.
- **Repro / trigger:** Run `npm run generate-api-types`; compare the output to hand-written types; note differences.
- **Fix sketch:** Either (a) adopt the generated api-generated.ts and refactor imports to use it, or (b) ensure the generate-api-types script runs in CI/CD before every build and the hand-written types are removed. The best solution is (a): use OpenAPI as source of truth.
- **Confidence:** High — api-generated.ts exists but is unreferenced; hand-written types have manual divergence.

### [P2] 47 instances of `: any` in frontend; weak type safety on booking data

- **Where:** `frontend/src/app/ (multiple files, primary examples: bookings/new/page.tsx:103-825, admin/bookings/page.tsx:73-213)` (grep `: any` in src/ returns 47 matches)
- **What:** Extensive use of `: any` type annotations throughout the codebase, particularly in booking data structures and admin pages. This disables TypeScript's type checking for those fields, allowing runtime errors (e.g., accessing properties that don't exist).
- **Why it's P2:** `: any` defeats the purpose of TypeScript. When booking data is typed as `any`, code like `booking.cafeName?.toLowerCase()` or `booking.seatsCount` can fail at runtime if the property is undefined or the shape is different from what's assumed.
- **Repro / trigger:** Search for `: any` in the codebase; each instance is a place where type safety was abandoned.
- **Fix sketch:** Audit high-risk `: any` instances (especially in booking data, payment data, admin lists). Replace with proper types. Use `unknown` if the type is truly dynamic, then narrow it with type guards.
- **Confidence:** High — Type annotations are visible in source; 47 instances is significant.

### [P2] Sentry webpack auth token hardcoded in next.config.js — should use env var (see P1-5 above for overlap)

- **Where:** `frontend/next.config.js:23-30`
- **What:** (Duplicate severity marking — included in both P1 and P2 for emphasis.) The Sentry authToken is read from environment variables but stored in a JS config file that may be cached or logged.
- **Why it's P2 (vs P1):** If the token is not exposed in CI logs, the risk is lower, but it's still best practice to avoid storing secrets in JS config files.
- **Fix sketch:** Use a .env.sentry-build-plugin file (documented in frontend/.gitignore as .sentry-build-plugin) or pass the token via a secure CI/CD secret manager.
- **Confidence:** High

## P3 Findings

### [P3] Three orphaned React components never imported

- **Where:** `frontend/src/components/customer/CafeFilterBar.tsx`, `frontend/src/components/customer/HardwareTierCard.tsx`, `frontend/src/components/customer/NotificationCenter.tsx`
- **What:** These three files exist in the components directory but are never imported or used anywhere in the codebase. They are dead code that may be accidentally shipped.
- **Why it's P3:** Dead code increases bundle size and maintenance burden. If one of these components has a security bug or outdated dependency, it's still included in the build even though it's not used.
- **Repro / trigger:** Run `grep -rl "CafeFilterBar\|HardwareTierCard\|NotificationCenter" src/` excluding the component files themselves; no results.
- **Fix sketch:** Remove the three files. If they are needed in the future, they can be recovered from git history.
- **Confidence:** High — Grep search confirms non-import.

### [P3] Debug route left in production-buildable code

- **Where:** `frontend/src/app/debug/tap/page.tsx:1-47+` (diagnostic route for iPhone tap-target bug investigation)
- **What:** A diagnostic route at `/debug/tap` is included in the source and will be built into production. The route's comment states it is "TEMPORARY DIAGNOSTIC" meant to collect evidence, not a fix. It exposes internal measurements and may leak information about the tap-handling stack or event timing to end users.
- **Why it's P3:** While the route doesn't expose secrets or user data, it is clearly temporary and should not ship to production. It increases the attack surface (one more route to reason about) and may confuse users if they stumble upon it.
- **Repro / trigger:** Navigate to `/debug/tap` in production; the page renders.
- **Fix sketch:** Move the route to a feature-flag-gated section (e.g., `?debug=true`) or remove it entirely once the iPhone tap bug is resolved. The comment says "delete after evidence is collected"; do that.
- **Confidence:** High — Comment explicitly marks it temporary.

### [P3] Tracked audit/test scratch files and logs in git

- **Where:** `backend/ALL_TESTS_PASS.txt`, `backend/FINAL_TEST_RESULTS.txt`, `backend/FULL_TEST_RESULTS.txt`, `backend/OVERNIGHT_FULL_TESTS.txt`, `backend/test_results.txt`, `backend/backfill_null_hours.py`, `backend/check_db_state.py`, `backend/ensure_user_roles.py`, `backend/fix_tests.py`, `backend/migrate_user_roles.py`, `backend/seed_test_cafes.py`, `frontend/audit_journey_full.js`, `frontend/audit_live_runner.js`, `frontend/audit_runner.js`, `frontend/debug_onboarding.js`, `frontend/live_qa_audit_results.json`, `frontend/audit_screenshots_live/*` (directory with 40+ PNG screenshots)
- **What:** Test results, diagnostic logs, and one-off scripts are committed to git despite being in .gitignore. They bloat the repo history and clutter the working tree. These files should be generated locally and not tracked.
- **Why it's P3:** Bloated git history makes cloning and bisecting slower. One-off scripts like `fix_tests.py` and `seed_test_cafes.py` are not part of the codebase's canonical logic and should live in scripts/ with a clear lifecycle or not at all. Screenshots and JSON dumps do not belong in version control.
- **Repro / trigger:** `git log --oneline -- backend/FULL_TEST_RESULTS.txt` shows commits that introduced test result files.
- **Fix sketch:** Add the files to .gitignore (most already are, but git ls-files shows they're tracked). For future one-off scripts, either move them to a scripts/ directory with clear naming or add a pre-commit hook to reject .txt and .py one-offs.
- **Confidence:** High — git ls-files output confirms tracking.

### [P3] Unused npm dependencies (@types/node, @types/react-dom, autoprefixer, postcss)

- **Where:** `frontend/package.json:29-39` (devDependencies: @types/node, @types/react-dom, autoprefixer, postcss listed but not imported in src/)
- **What:** depcheck reports these as unused. @types/node may be needed implicitly by TypeScript, but @types/react-dom should only be needed if react-dom is being typed separately (already provided by @types/react). autoprefixer and postcss are implicit Tailwind dependencies and may not need to be explicit.
- **Why it's P3:** Unused dependencies increase npm install time and bundle size (though dev deps don't ship to production, they still clutter the lock file).
- **Repro / trigger:** `npx depcheck` in frontend reports them; grep for imports in src/ returns no matches.
- **Fix sketch:** Run `npm uninstall @types/node @types/react-dom autoprefixer postcss` and verify the build still works. If TypeScript or Tailwind needs them, they'll fail, and they can be re-added as implicit transitive deps.
- **Confidence:** Medium — depcheck may have false positives for implicit dependencies.

### [P3] next-pwa dependency installed but feature disabled in development

- **Where:** `frontend/next.config.js:4-14` (withPWA wraps nextConfig; next-pwa is listed in package.json but disable: process.env.NODE_ENV === 'development' means it's off most of the time)
- **What:** next-pwa is installed and conditionally used, but it's disabled in development and likely disabled in production too (no explicit enable flag seen). If PWA features are not being used, the dependency is dead weight.
- **Why it's P3:** Unused dependencies add complexity and potential security risk (next-pwa has some known vulnerabilities in older versions). If the app doesn't need PWA, remove it.
- **Repro / trigger:** Check if the app has a service worker or offline capabilities. If not, PWA is not needed.
- **Fix sketch:** Verify if PWA is actually used (check for service-worker usage, offline pages). If not, run `npm uninstall next-pwa` and simplify next.config.js.
- **Confidence:** Medium — PWA may be a planned feature not yet enabled.

## Prior-Audit Cross-Check (Section 10: Priority Action Items)

| Item | Status | Finding |
|---|---|---|
| P0-1: Scanner Cache Invalidation | **FIXED** | `frontend/src/app/(owner)/owner/scanner/page.tsx:530-531` now includes `queryClient.invalidateQueries({ queryKey: queryKeys.owner.all })` and bookings queries. Evidence of the fix in place. |
| P0-2: Database Locking for Booking | **OUTSTANDING** | No advisory lock pattern found in `backend/app/services/booking_service.py`. **This is now Phase 5 finding 5-3 (P0)**. The race condition persists. |
| P0-3: Remove or Implement Google OAuth | **OUTSTANDING** | No GoogleLogin component found in login/page.tsx. Google OAuth is not implemented. The button may render but the handler is missing. **New concern: incomplete feature left in code.** |
| P0-4: Wire Edit Profile Button | **FIXED** | `frontend/src/app/(owner)/owner/settings/page.tsx:284` includes `<EditCafeModal>` component. Button is wired. |
| P0-5: Add Proper Error Logging | **PARTIAL** | Sentry is initialized and logging is structured (structlog) on backend, but **PII is not scrubbed** (sendDefaultPii: true). **This is now Phase 5 finding 5-5 (P1)**. |

## Command evidence

### TypeScript compilation

```
$ cd /e/KHEL-O/frontend && npx tsc --noEmit
TSC_EXIT=0
```

**Result:** Zero errors. TypeScript compilation passes.

### ESLint (next lint)

```
$ cd /e/KHEL-O/frontend && npx next lint 2>&1 | tail -60

./src/app/(customer)/bookings/new/page.tsx
343:6  Warning: React Hook useEffect has a missing dependency: 'activeTier?.totalSeats'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./src/components/owner/EditCafeModal.tsx
527:21  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

info  - Need to disable some ESLint rules? Learn more here: https://nextjs.org/docs/basic-features/eslint#disabling-rules
LINT_EXIT=0
```

**Result:** 2 warnings only. No errors.

### npm audit (production)

```
$ cd /e/KHEL-O/frontend && npm audit --production 2>&1 | head -50

npm warn config production Use `--omit=dev` instead.
# npm audit report

brace-expansion  <=1.1.17 || 2.0.0 - 2.1.3
Severity: high
brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash - https://github.com/advisories/GHSA-mh99-v99m-4gvg
brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation - https://github.com/advisories/GHSA-rgw5-rvv9-x895
brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation - https://github.com/advisories/GHSA-rgw5-rvv9-x895
fix available via `npm audit fix`
node_modules/brace-expansion
node_modules/filelist/node_modules/brace-expansion

fast-uri  3.0.0 - 3.1.4
Severity: high
fast-uri vulnerable to host confusion via backslash authority introducer - https://github.com/advisories/GHSA-7p8r-x3mc-p8w7
fix available via `npm audit fix`
node_modules/fast-uri

nanoid  <3.3.18
Severity: high
nanoid: custom generators can loop indefinitely when size is zero - https://github.com/advisories/GHSA-2v37-7h3g-55p8
fix available via `npm audit fix`
node_modules/nanoid

next  0.9.9 - 16.3.0-preview.10
Severity: critical
Next.js Server-Side Request Forgery in Server Actions - https://github.com/advisories/GHSA-fr5h-rqp8-mj6g
Next.js Cache Poisoning - https://github.com/advisories/GHSA-gp8f-8m3g-qvj9
Denial of Service condition in Next.js image optimization - https://github.com/advisories/GHSA-g77x-44xx-532m
Next.js Allows a Denial of Service (DoS) with Server Actions - https://github.com/advisories/GHSA-7m27-7ghc-44w9
Information exposure in Next.js dev server due to lack of origin verification - https://github.com/advisories/GHSA-3h52-269p-cp9r
Next.js Affected by Cache Key Confusion for Image Optimization API Routes - https://github.com/advisories/GHSA-g5qg-72qw-gw5v
Next.js authorization bypass vulnerability - https://github.com/advisories/GHSA-7gfc-8cq8-jh5f
Next.js Improper Middleware Redirect Handling Leads to SSRF - https://github.com/advisories/GHSA-4342-x723-ch2f
Next.js Content Injection Vulnerability for Image Optimization - https://github.com/advisories/GHSA-xv57-4mr9-wg8v
Next.js Race Condition to Cache Poisoning - https://github.com/advisories/GHSA-qpjv-v59x-3qc4
Next Vulnerable to Denial of Service with Server Components - https://github.com/advisories/GHSA-mwv6-3258-q52c
Next has a Denial of Service with Server Components - Incomplete Fix Follow-Up - https://github.com/advisories/GHSA-5j59-xgg2-r9c4
Next.js self-hosted applications vulnerable to DoS via Image Optimizer remotePatterns configuration - https://github.com/advisories/GHSA-9g9p-9gw9-jx7f
Next.js HTTP request deserialization can lead to DoS when using insecure React Server Components - https://github.com/advisories/GHSA-h25m-26qc-wcjf
Authorization Bypass in Next.js Middleware - https://github.com/advisories/GHSA-f82v-jwr5-mffw
Next.js: HTTP request smuggling in rewrites - https://github.com/advisories/GHSA-ggv3-7p47-pfv8
Next.js: Unbounded next/image disk cache growth can exhaust storage - https://github.com/advisories/GHSA-3x4c-7xq6-9pq8
Next.js has a Denial of Service with Server Components - https://github.com/advisories/GHSA-q4gf-8mx6-v5v3
Next.js Vulnerable to Denial of Service with Server Components - https://github.com/advisories/GHSA-8h8q-6873-q5fj

postcss  <=8.5.22
Severity: high
PostCSS has XSS via Unescaped </style> in its CSS Stringify Output - https://github.com/advisories/GHSA-qx2v-qp2m-jg93
PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments - https://github.com/advisories/GHSA-6g55-p6wh-862q
PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset - https://github.com/advisories/GHSA-fxqj-rqcc-2cmp
PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure - https://github.com/advisories/GHSA-r28c-9q8g-f849
fix available via `npm audit fix --force`
Will install next@14.2.35, which is outside the stated dependency range
node_modules/next/node_modules/postcss

serialize-javascript  <=7.0.2
Severity: high
Serialize JavaScript is Vulnerable to RCE via RegExp.flags and Date.prototype.toISOString() - https://github.com/advisories/GHSA-5c6j-r48x-rmvq
fix available via `npm audit fix --force`
Will install next-pwa@2.0.2, which is a breaking change
node_modules/serialize-javascript
  rollup-plugin-terser  3.0.0 || >=4.0.4
  Depends on vulnerable versions of serialize-javascript
  node_modules/rollup-plugin-terser
    workbox-build  5.0.0-alpha.0 - 7.0.0
    Depends on vulnerable versions of rollup-plugin-terser
    node_modules/workbox-build
      workbox-webpack-plugin  5.0.0-alpha.0 - 7.0.0
      Depends on vulnerable versions of workbox-build
        next-pwa  >=2.1.0
        Depends on vulnerable versions of workbox-webpack-plugin

10 vulnerabilities (9 high, 1 critical)

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force
```

**Summary:** 10 vulnerabilities total: 1 critical (Next.js multiple SSRF/DoS/auth bypass issues), 9 high (PostCSS XSS/path traversal, serialize-javascript RCE, nanoid DoS, brace-expansion DoS, fast-uri host confusion).

### Backend test collection

```
$ cd /e/KHEL-O/backend && python -m pytest --collect-only -q 2>&1 | tail -20

tests/test_role_switcher.py::test_update_role_idempotency
tests/test_role_switcher.py::test_approved_owner_can_switch_to_gamer
tests/test_staff_invitations.py::test_staff_invitation_full_flow
tests/test_staff_invitations.py::test_cancel_staff_invitation

148 tests collected in 0.11s
```

**Result:** 148 tests collected. Includes booking, payment, role, staff, checkin, and overnight-session tests.

### depcheck (frontend dependencies)

```
$ cd /e/KHEL-O/frontend && npx --yes depcheck 2>&1 | head -40

Next.js webpack configuration detection failed with the following error TypeError: Cannot read properties of undefined (reading 'distDir')
    at Object.webpack (E:\KHEL-O\frontend\node_modules\next-pwa\index.js:24:21)
    ...

Unused devDependencies
* @types/node
* @types/react-dom
* autoprefixer
* postcss

Missing dependencies
* playwright: .\audit_live_runner.js
```

**Result:** 4 unused devDeps identified. next-pwa causes depcheck to crash (configuration issue). playwright is imported by audit_live_runner.js (a scratch file, not part of codebase).

## Deployment config audit

### Frontend Dockerfile

- **Image:** node:18-alpine (base + builder + runner multi-stage)
- **User:** nextjs (uid 1001) — properly non-root
- **Build secrets:** NEXT_PUBLIC_* passed as ARGs, embedded as ENV at build time (acceptable for public env vars, but DSN and Maps key should not be hardcoded in .env.prod)
- **Production env:** NODE_ENV=production, NEXT_TELEMETRY_DISABLED=1
- **Healthcheck:** None defined
- **Port:** 3000, HOSTNAME 0.0.0.0

### Backend Dockerfile

- **Image:** python:3.11-slim
- **User:** None — **runs as root** (uid 0)
- **Build:** Copies pyproject.toml, installs via pip, COPY . .
- **Healthcheck:** Defined (curl http://localhost:8000/health)
- **Port:** 8000, uvicorn --host 0.0.0.0
- **Issue:** No non-root user defined; missing .dockerignore

### docker-compose.prod.yml

- **Secrets:** Loaded via env_file: .env.prod (correct; not inline)
- **Port exposure:** Only Caddy exposes 80/443 to host; backend and frontend are internal only
- **Postgres:** Healthcheck defined; restart: unless-stopped
- **Backup service:** Included with daily dump to pgbackups volume (retention: 14 days)
- **Networks:** All services on khel_o_net bridge; no cross-host exposure

### Caddyfile

- **Security headers:**
  - `Strict-Transport-Security "max-age=31536000; includeSubDomains"` ✓ HSTS enabled
  - `X-Content-Type-Options "nosniff"` ✓ MIME type sniffing prevented
  - `X-Frame-Options "DENY"` ✓ Clickjacking prevented
  - `Referrer-Policy "strict-origin-when-cross-origin"` ✓ Referrer leakage limited
- **CSP:** Not defined in Caddyfile (should be added: `Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; ..."`
- **TLS:** Auto via Let's Encrypt (requires DOMAIN env var pointing to server)

### next.config.js

- **Sentry:** withSentryConfig applied in production; tunnelRoute: '/monitoring' (proxies through frontend)
- **PWA:** Conditionally applied via next-pwa; disabled in development
- **ReactStrictMode:** true
- **Security headers:** None defined in nextConfig; relying on Caddy/nginx middleware (acceptable)

## Observability audit

### Backend Sentry

- **File:** `backend/app/core/sentry.py:11-27`
- **Initialized:** Yes, in app/main.py:17
- **Config:**
  - `dsn=settings.SENTRY_DSN` (env var; correct)
  - `environment=settings.ENVIRONMENT` (logs dev vs prod; correct)
  - `traces_sample_rate: 1.0 if dev else 0.1` (traces all dev, 10% prod; reasonable)
  - `send_default_pii=True` **[P1 issue: PII not scrubbed]**
  - `attach_stacktrace=True` (logs local variables; contains PII)
- **Integrations:** FastApiIntegration, StarletteIntegration (appropriate)

### Backend Logging

- **File:** `backend/app/core/logging.py:1-24`
- **Library:** structlog (structured logging)
- **Dev:** Console output with colors; prod: JSON output
- **Level:** DEBUG in dev, INFO in prod
- **Setup:** Called in app/main.py:366
- **PII:** No explicit scrubbing; logs contain request/response bodies (may include payment data, emails)

### Frontend Sentry

- **Files:** `frontend/instrumentation.ts`, `frontend/instrumentation-client.ts`, `frontend/sentry.server.config.ts`, `frontend/sentry.edge.config.ts`
- **Initialized:** Yes (conditional on NEXT_RUNTIME)
- **Client config (instrumentation-client.ts):**
  - `dsn=process.env.NEXT_PUBLIC_SENTRY_DSN`
  - `sendDefaultPii: true` **[P1 issue]**
  - `tracesSampleRate: 1.0 if dev else 0.1`
  - `replaysSessionSampleRate: 0.1` (10% of sessions recorded)
  - `replaysOnErrorSampleRate: 1.0` (all error sessions replayed)
  - `maskAllText: false, blockAllMedia: false` (replays show text and media — may leak PII on screen)
- **Server config (sentry.server.config.ts):**
  - `sendDefaultPii: true` **[P1 issue]**
  - `includeLocalVariables: true` (server-side local variables sent — may leak JWT, secrets)

## Not covered

1. **Frontend e2e tests** — Playwright tests exist (e2e/) but were not executed; no verification that tests pass.
2. **Timezone handling edge cases** — Backend has timezone logic (overnight bookings, sessions crossing midnight) but was not deeply audited for DST transitions or timezone conversions on the frontend.
3. **Refund math correctness** — Payment tests exist but no detailed audit of refund calculation edge cases (partial refunds, multiple refunds on same booking, late refunds).
4. **N+1 query patterns** — Database queries were not traced; no audit for N+1 ORM issues.
5. **Next.js Server Components security** — No audit of whether Server Components leak secrets or perform unsafe operations visible on the client.
6. **Reverse proxy (Caddy) routing correctness** — No test of rewrites, redirects, or middleware chains to verify they don't inadvertently expose backend endpoints.

## Notes for the coordinator

1. **P0 findings (5-1, 5-2, 5-3)** are showstoppers and must be fixed before production. P0-2 (payment sig verification) and P0-3 (overbooking race) are money-loss risks; P0-1 (build arg secrets) is a key-exposure risk.
2. **P1 findings (5-4, 5-5, 5-6, 5-10)** are critical for production hardening. npm audit must be resolved, PII must be scrubbed in Sentry, and backend must run non-root.
3. **Prior-audit cross-check** shows that scanner cache invalidation and edit profile wiring were fixed, but Google OAuth is still incomplete and database locking is still missing (now P0 again).
4. **TypeScript configuration is strict** (tsc passes, 0 errors), but type coverage is weak in practice due to 47 `: any` annotations and hand-written types that are not synced to the backend schema.
5. **Deployment config is mostly sound** (security headers, no port exposure, backup automation) but missing CSP in Caddyfile and backend-as-root issue must be resolved.
6. **Test coverage is broad** (148 tests) but misses negative cases (invalid payment signature, etc.) and timezone edge cases.
