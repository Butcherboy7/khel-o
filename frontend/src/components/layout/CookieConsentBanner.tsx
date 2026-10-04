'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'khelo-cookie-notice-dismissed';

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      // localStorage unavailable — skip the banner rather than error
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Ignore — banner simply reappears next visit
    }
  };

  if (!visible) return null;

  // An in-flow strip at the very top, not a fixed bar: this notice is
  // informational (no advertising cookies), so it must never sit on top of
  // the booking bar or the bottom menu where first-time visitors tap.
  return (
    <div role="region" aria-label="Cookie notice" className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-content items-center justify-between gap-3 px-4 py-2 md:px-6">
        <p className="text-[12px] leading-snug text-text-secondary">
          We only use storage to keep you signed in and see how gamers find KHEL-O. No ad cookies.{' '}
          <Link href="/cookie-policy" className="font-semibold text-primary hover:underline">
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
