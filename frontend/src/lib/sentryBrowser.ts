import * as Sentry from '@sentry/nextjs';

// Only ever loaded through startSentry() in lib/monitoring.ts, after the page
// has loaded — importing it anywhere else puts the whole SDK back into the
// first download.
export function initSentry(): typeof Sentry {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    sendDefaultPii: true,

    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,

    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    enableLogs: true,
  });

  // The session recorder is the heaviest part of Sentry (~1s of phone CPU on
  // first load, flagged by PageSpeed). Fetch it once the browser is idle
  // again; errors before then are still reported, just without a replay.
  const loadReplay = () => {
    Sentry.lazyLoadIntegration('replayIntegration')
      .then((replayIntegration) => {
        Sentry.addIntegration(replayIntegration({ maskAllText: false, blockAllMedia: false }));
      })
      .catch(() => {
        // Blocked or offline: carry on without replays.
      });
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(loadReplay, { timeout: 5000 });
  else setTimeout(loadReplay, 2000);

  return Sentry;
}
