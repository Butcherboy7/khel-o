# P0-A3 — Frontend env var audit + runtime injection fix

## What changed

Every `NEXT_PUBLIC_*` value except `NEXT_PUBLIC_SENTRY_DSN` (see below) is now
read from the container's real runtime environment at request time, not baked
into the Docker image at build time.

- `frontend/src/app/api/runtime-env/route.ts` — a `force-dynamic` route that
  reads `process.env` live and returns `window.__ENV__={...}` as JS.
- `frontend/src/app/layout.tsx` — loads it via
  `<Script src="/api/runtime-env" strategy="beforeInteractive" />`, which
  Next.js guarantees runs before any other page code, including hydration.
- `frontend/src/lib/runtimeEnv.ts` — `getPublicEnv(key, fallback)`: browser
  reads `window.__ENV__`, server (SSR) reads live `process.env` via bracket
  access (not the literal `process.env.NEXT_PUBLIC_X` form, which Next's
  build-time inliner would freeze).
- Every call site that previously read `process.env.NEXT_PUBLIC_*` directly
  now calls `getPublicEnv(...)` instead.
- `frontend/Dockerfile` / `docker-compose.prod.yml` — build ARGs removed for
  everything except `NEXT_PUBLIC_SENTRY_DSN`.

Verified: `npm run build` succeeds with every `NEXT_PUBLIC_*` var unset, and a
built image started with `npm start` picks up a **new** value for
`NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` supplied only at start
time — proving rotation no longer requires a rebuild.

## Why `NEXT_PUBLIC_SENTRY_DSN` is the one exception

`instrumentation-client.ts` calls `Sentry.init({ dsn: ... })` as Next's own
client bootstrap hook, and there's no documented guarantee it runs after our
injected `beforeInteractive` script rather than before it — getting this
wrong would silently disable error monitoring. It stays a build-time
`NEXT_PUBLIC_` value, which is safe because a Sentry DSN is *meant* to be
public: it only lets a client submit new events tagged to that project, not
read any data back (https://docs.sentry.io/product/sentry-basics/dsn-explainer/).

## Classification — every env var in `.env.prod.example`

| Variable | Class | Why |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | PUBLIC | Just a URL; every request already reveals it. Runtime-injected. |
| `NEXT_PUBLIC_APP_URL` | PUBLIC | Same. Runtime-injected. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | PUBLIC | OAuth client IDs are designed to be sent to the browser (Google's own Identity Services flow requires it client-side). Runtime-injected. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | PUBLIC | Razorpay's own docs call this the "public key" — used client-side to open Checkout. The matching secret (`RAZORPAY_KEY_SECRET`) is separate and server-only. Runtime-injected. |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | **PUBLIC, but needs a control Docker can't provide** | The Maps JS SDK requires this key in the browser — no amount of runtime injection makes it invisible to a curious user. The real mitigation is an **HTTP-referrer restriction on the key in Google Cloud Console**, scoped to `khel-o.online`, so a copied key can't be used to run up billing elsewhere. Confirm this restriction is set; runtime injection here mainly buys rotation-without-rebuild. |
| `NEXT_PUBLIC_SENTRY_DSN` | PUBLIC | See exception above — DSNs are meant to be exposed. Left build-time deliberately. |
| `NEXT_PUBLIC_ENABLE_SANDBOX_MOCK_PAYMENTS` | PUBLIC | A feature flag, not a credential. Runtime-injected. |
| `SECRET_KEY` | **SECRET** | JWT signing key. Server-only, never had a `NEXT_PUBLIC_` sibling. No change needed. |
| `POSTGRES_PASSWORD` / `DATABASE_URL` | **SECRET** | DB credentials. Server-only. No change needed. |
| `GOOGLE_CLIENT_SECRET` | **SECRET** | OAuth secret. Server-only. No change needed. |
| `RAZORPAY_KEY_SECRET` | **SECRET** | Signs/authenticates payment API calls. Server-only. No change needed. |
| `RAZORPAY_WEBHOOK_SECRET` | **SECRET** | Verifies Razorpay webhook signatures. Server-only. No change needed. |
| `RESEND_API_KEY` | **SECRET** | Sends password-reset email as this account. Server-only. No change needed. |
| `SENTRY_DSN` (backend) | PUBLIC (by the same reasoning as above), kept server-config only | Not client-exposed at all today; no action needed. |
| `SENTRY_AUTH_TOKEN` | **SECRET** | Used only at build time to upload source maps to Sentry; has write scope to the Sentry org. Never becomes `NEXT_PUBLIC_`. No change needed — already correctly excluded from the browser bundle. |
| `SENTRY_ORG` | PUBLIC-ish (org slug) | Build-config only, never shipped to the browser. No change needed. |

## What this does *not* fix

Runtime injection solves image portability and rotation-without-rebuild. It
does **not** make `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` invisible to the browser —
nothing can, for a client-side Maps key. If it isn't already HTTP-referrer
restricted in Google Cloud Console, that's the actual open risk and is a
config change outside this repo, not a code fix.
