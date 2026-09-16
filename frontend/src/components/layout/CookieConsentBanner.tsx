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

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-modal border-t border-border bg-card/95 backdrop-blur-md shadow-float"
    >
      <div className="mx-auto flex max-w-content flex-col items-start gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <p className="text-caption text-text-secondary">
          We use browser storage to keep you signed in and understand how gamers find KHEL-O. We don&apos;t use
          advertising cookies. See our{' '}
          <Link href="/cookie-policy" className="font-semibold text-primary hover:underline">
            Cookie Policy
          </Link>{' '}
          for details.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 self-end rounded-xl bg-primary px-4 py-2 text-caption font-semibold text-white transition-colors hover:bg-primary-dark sm:self-auto"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
