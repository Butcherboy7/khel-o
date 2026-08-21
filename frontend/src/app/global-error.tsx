'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

const RELOAD_GUARD_KEY = 'khelo_chunk_error_reloaded';

// A page left open across a deploy still references the previous build's
// content-hashed JS chunk filenames. Once the new build replaces them on the
// server, any lazy import the old page tries to make 404s as a
// ChunkLoadError, which — with no recovery here — showed Next's raw
// "Application error: a client-side exception has occurred" black screen
// (this is what looked like the booking-flow crash). A stale chunk isn't a
// real bug: the fix is just to fetch the current page once. Guarded by a
// sessionStorage flag so a genuine repeated error doesn't reload-loop.
function isChunkLoadError(error: Error): boolean {
  return (
    error.name === 'ChunkLoadError' ||
    /Loading chunk [\d\w-]+ failed/i.test(error.message) ||
    /Failed to fetch dynamically imported module/i.test(error.message)
  );
}

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);

    if (isChunkLoadError(error) && !sessionStorage.getItem(RELOAD_GUARD_KEY)) {
      sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
      window.location.reload();
    }
  }, [error]);

  return (
    <html>
      <body style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', background: '#F1EFEA', color: '#111318', padding: '24px', textAlign: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>Hold on a moment</h1>
          <p style={{ color: '#5A5E6B', marginBottom: '20px' }}>
            That didn&apos;t load right. Tap reload and you&apos;ll be right back where you left off — nothing you selected is lost.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: '#E54D42', color: '#fff', border: 'none', borderRadius: '12px', padding: '12px 24px', fontWeight: 700, fontSize: '1rem' }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
