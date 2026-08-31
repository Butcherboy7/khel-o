FROM node:18-alpine AS base

WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# P0-A3: API_URL / APP_URL / GOOGLE_CLIENT_ID / RAZORPAY_KEY_ID /
# GOOGLE_MAPS_API_KEY / ENABLE_SANDBOX_MOCK_PAYMENTS are no longer passed as
# build ARGs — baking them here meant the value was frozen into this image
# (visible in `docker history`, and requiring a rebuild to rotate). They're
# now read at request time from the container's real runtime env by
# GET /api/runtime-env and injected into the browser as window.__ENV__ — see
# src/lib/runtimeEnv.ts and docs/audit/frontend-env-audit.md.
#
# NEXT_PUBLIC_SENTRY_DSN is the one exception, still build-time: Sentry's
# client bootstrap (instrumentation-client.ts) runs before our injected
# runtime-env script can reliably execute, and a DSN is meant to be public
# (it only allows submitting events, not reading data) — see the audit doc.
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Production image — standalone output means only the traced dependency
# subset is copied in, not the full node_modules (was ~1.9GB, this is a
# fraction of that).
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
