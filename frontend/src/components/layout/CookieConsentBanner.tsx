'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePageLoaded } from '@/hooks/usePageLoaded';

export const COOKIE_NOTICE_KEY = 'khelo-cookie-notice-dismissed';

/**
 * Runs inline in <body> before the banner's HTML is parsed (see app/layout),
 * so a returning visitor's banner is hidden before the first paint. The
 * banner used to appear from a useEffect after hydration, pushing the whole
 * page down: PageSpeed's biggest layout-shift culprit (CLS 0.064 of 0.118).
 */
export const COOKIE_NOTICE_SCRIPT = `try{if(localStorage.getItem('${COOKIE_NOTICE_KEY}'))document.documentElement.setAttribute('data-cookie-ok','')}catch(e){}`;

export function CookieConsentBanner() {
  // Always rendered on the server; the inline script plus the
  // html[data-cookie-ok] rule in globals.css hide it for anyone who already
  // dismissed it, without waiting for React.
  const [visible, setVisible] = useState(true);
  const pageLoaded = usePageLoaded();

  const dismiss = () => {
    setVisible(false);
    document.documentElement.setAttribute('data-cookie-ok', '');
    try {
      localStorage.setItem(COOKIE_NOTICE_KEY, '1');
    } catch {
      // Ignore — banner simply reappears next visit
    }
  };

  if (!visible) return null;

  // An in-flow strip at the very top, not a fixed bar: this notice is
  // informational (no advertising cookies), so it must never sit on top of
  // the booking bar or the bottom menu where first-time visitors tap.
  return (
    <div role="region" aria-label="Cookie notice" className="cookie-notice border-b border-border bg-card">
      <div className="mx-auto flex max-w-content items-center justify-between gap-3 px-4 py-2 md:px-6">
        <p className="text-[12px] leading-snug text-text-secondary">
          We only use storage to keep you signed in and see how gamers find KHEL-O. No ad cookies.{' '}
          <Link href="/cookie-policy" prefetch={pageLoaded ? undefined : false} className="font-semibold text-primary hover:underline">
            Details
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="min-h-[36px] shrink-0 rounded-lg bg-primary px-3 text-[12px] font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
