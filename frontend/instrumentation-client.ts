import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  sendDefaultPii: true,

  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,

  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  enableLogs: true,
});

// The session recorder is the heaviest part of Sentry (~1s of phone CPU on
// first load, flagged by PageSpeed). Fetch it once the page has loaded and the
// browser is idle; errors before then are still reported, just without a replay.
function loadReplay() {
  Sentry.lazyLoadIntegration('replayIntegration')
    .then((replayIntegration) => {
      Sentry.addIntegration(replayIntegration({ maskAllText: false, blockAllMedia: false }));
    })
    .catch(() => {
      // Blocked or offline: carry on without replays.
    });
}

if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const whenIdle = () =>
    'requestIdleCallback' in window ? window.requestIdleCallback(loadReplay, { timeout: 5000 }) : setTimeout(loadReplay, 2000);
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle, { once: true });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
