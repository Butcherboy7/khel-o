'use client';

/** Remembers the last page someone was on (path, query and #tab), so signing in
 *  brings them back to exactly where they were, even without a ?redirect=. */
const KEY = 'khelo.lastPage';
const AUTH_PAGES = /^\/(login|register|forgot-password|reset-password|accept-invitation|auth)(\/|$)/;

export function rememberPage(): void {
  try {
    const { pathname, search, hash } = window.location;
    if (AUTH_PAGES.test(pathname)) return;
    sessionStorage.setItem(KEY, pathname + search + hash);
  } catch {
    /* private window */
  }
}

/** Only same-site paths: never "//evil.com" or a full URL. */
export function safePath(p: string | null | undefined): string | null {
  return p && p.startsWith('/') && !p.startsWith('//') && !AUTH_PAGES.test(p) ? p : null;
}

export function lastPage(): string | null {
  try {
    return safePath(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

/** Where to go after signing in: the explicit ?redirect=, else the page they came from. */
export function returnTarget(redirect: string | null | undefined): string | null {
  const asked = safePath(redirect);
  const last = lastPage();
  // Same page as the ?redirect=, but with its #tab or query: use the fuller one.
  if (asked && last && last !== asked && last.split(/[?#]/)[0] === asked.split(/[?#]/)[0]) return last;
  const back = asked ?? last;
  return back && back !== '/' ? back : asked;
}

/** The current page, for a /login?redirect= link. */
export function hereForLogin(): string {
  if (typeof window === 'undefined') return '/';
  const { pathname, search, hash } = window.location;
  return pathname + search + hash;
}
