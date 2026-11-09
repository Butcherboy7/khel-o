'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { hereForLogin } from '@/lib/returnTo';

/**
 * One-tap sign-in in a sheet, on top of the page. Google opens in a pop-up, so
 * the page underneath (tab, choice, typed text) stays exactly as it was and the
 * action finishes by itself once signed in. Email sign-in comes back here too.
 */
export function QuickSignIn({
  title,
  line,
  onClose,
  onSignedIn,
}: {
  title: string;
  line: string;
  onClose: () => void;
  onSignedIn: () => void;
}) {
  const [error, setError] = useState('');
  const [back, setBack] = useState('/');
  useEffect(() => {
    setBack(hereForLogin());
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 md:items-center" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-card p-5 pb-7 md:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-h3 font-bold text-text-primary">{title}</h3>
            <p className="mt-0.5 text-body text-text-secondary">{line}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-surface">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="mt-4 flex flex-col items-center gap-3">
          <GoogleSignInButton onSuccess={onSignedIn} onError={setError} inAppKeeps="Your choice stays saved." />
          {error && <p role="alert" className="text-caption text-error">{error}</p>}
          <Link href={`/login?redirect=${encodeURIComponent(back)}`} className="text-caption font-semibold text-text-secondary underline">
            Use email instead
          </Link>
        </div>
      </div>
    </div>
  );
}
