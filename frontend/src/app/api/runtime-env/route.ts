import { NextResponse } from 'next/server';

// Serves the browser's public runtime config as a tiny JS snippet, read from
// this container's actual environment at request time — not baked into the
// Docker image at build time. See docs/audit/frontend-env-audit.md for why
// each key here is PUBLIC (safe for the browser) and which are excluded
// because they're SECRET.
//
// `dynamic = 'force-dynamic'` keeps this one route live per-request; it does
// not affect static optimization anywhere else in the app.
export const dynamic = 'force-dynamic';

const PUBLIC_ENV_KEYS = [
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
  'NEXT_PUBLIC_RAZORPAY_KEY_ID',
  'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_ENABLE_SANDBOX_MOCK_PAYMENTS',
] as const;

export function GET() {
  // Read via bracket notation on a re-bound reference, not literal
  // `process.env.NEXT_PUBLIC_X` — Next's build-time inliner only rewrites the
  // literal form, so this stays a genuine runtime lookup.
  const source: Record<string, string | undefined> = process.env;
  const publicEnv: Record<string, string> = {};
  for (const key of PUBLIC_ENV_KEYS) {
    publicEnv[key] = source[key] ?? '';
  }

  const body = `window.__ENV__=${JSON.stringify(publicEnv)};`;

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
