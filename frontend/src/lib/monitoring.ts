import type * as SentrySdk from '@sentry/nextjs';

/**
 * Error reporting that keeps Sentry off the first screen.
 *
 * Sentry's browser SDK was the biggest script on the site (most of a 111 KB
 * chunk every page downloaded and ran before it could show anything). It now
 * starts once the page has loaded (instrumentation-client.ts). Client code
 * reports through captureException here; a static `import * as Sentry from
 * '@sentry/nextjs'` in a client file would pull the whole SDK back in.
 */

type Sdk = typeof SentrySdk;
type CaptureContext = Parameters<Sdk['captureException']>[1];

let started: Promise<Sdk> | undefined;

/** Loads and starts Sentry in the browser, once. */
export function startSentry(): Promise<Sdk> {
  if (!started) started = import('./sentryBrowser').then((mod) => mod.initSentry());
  return started;
}

/** Sentry if it has been started, for hooks that shouldn't start it. */
export function startedSentry(): Promise<Sdk> | undefined {
  return started;
}

export function captureException(error: unknown, context?: CaptureContext): void {
  // The server SDK is set up by instrumentation.ts; in the browser, an error
  // before the page has loaded starts Sentry early rather than being lost.
  const sdk = typeof window === 'undefined' ? import('@sentry/nextjs') : startSentry();
  sdk.then((Sentry) => Sentry.captureException(error, context)).catch(() => {});
}
