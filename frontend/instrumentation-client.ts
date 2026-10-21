import { afterPageLoad } from '@/lib/afterPageLoad';
import { startSentry, startedSentry } from '@/lib/monitoring';

// Sentry starts once the page has loaded, not before the first paint: its
// SDK was the largest script every page downloaded and ran up front. Errors
// thrown before then are kept here and reported as soon as it is running.
// The config itself lives in src/lib/sentryBrowser.ts.
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const early: unknown[] = [];
  const onError = (event: ErrorEvent) => early.push(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => early.push(event.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  afterPageLoad()
    .then(startSentry)
    .then((Sentry) => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      early.forEach((error) => Sentry.captureException(error));
    })
    .catch(() => {
      // Blocked or offline: carry on without error reporting.
    });
}

// Next 15.3+ calls this on every client-side navigation (Next 14 ignores it).
export function onRouterTransitionStart(href: string, navigationType: string) {
  startedSentry()?.then((Sentry) => Sentry.captureRouterTransitionStart(href, navigationType));
}
