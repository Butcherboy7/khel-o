declare global {
  interface Window {
    __ENV__?: Record<string, string>;
  }
}

/**
 * Reads a NEXT_PUBLIC_* value at the point of use instead of at build time.
 *
 * In the browser, reads the config injected by `/api/runtime-env` (loaded via
 * a beforeInteractive <Script> in the root layout, so it's always present
 * before any code that calls this runs).
 *
 * On the server (SSR, route handlers), reads the real container env directly
 * — via bracket notation so Next's build-time inliner, which only rewrites
 * the literal `process.env.NEXT_PUBLIC_X` form, leaves this alone.
 */
export function getPublicEnv(key: string, fallback = ''): string {
  if (typeof window !== 'undefined') {
    const injected = window.__ENV__?.[key];
    return injected || fallback;
  }
  const value = (process.env as Record<string, string | undefined>)[key];
  return value ?? fallback;
}
