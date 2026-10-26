'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  const pathname = usePathname() ?? '';

  const dismiss = () => {
    setVisible(false);
    document.documentElement.setAttribute('data-cookie-ok', '');
    try {
      localStorage.setItem(COOKIE_NOTICE_KEY, '1');
    } catch {
      // Ignore — banner simply reappears next visit
    }
  };

  // Pages with their own bottom action bar (Book, Pay, Sign up): the notice
  // waits for another page rather than cover the button.
  const busyBottom = pathname.startsWith('/cafe/') || pathname.startsWith('/bookings/new') || pathname.startsWith('/challenge/');
  if (!visible || busyBottom) return null;

  // A small floating note at the bottom (fixed, so nothing shifts), above the
  // bottom menu (see .cookie-notice in globals.css). It's informational: no
  // advertising cookies.
  return (
    <div role="region" aria-label="Cookie notice" className="cookie-notice">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3.5 py-2.5 shadow-overlay">
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
