'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BottomSheet, Button } from '@/components/ui';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { getPublicEnv } from '@/lib/runtimeEnv';

interface CheckoutSignInSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** "₹119": the amount about to be paid. */
  amountLabel: string;
  /** "PlayStation 4 · 1 hr · 1 player": what is being booked. */
  summary: string;
  /** Signed in with Google without leaving checkout. */
  onSignedIn: () => void;
  /** The full email/password pages (they bring the visitor back here). */
  onUseEmail: () => void;
  onCreateAccount: () => void;
}

/**
 * Sign-in at the moment of paying, over the checkout instead of a separate
 * page: one tap on Google and the booking carries on with every pick kept.
 * Email and password stay one link away for people without Google.
 */
export function CheckoutSignInSheet({
  isOpen,
  onClose,
  amountLabel,
  summary,
  onSignedIn,
  onUseEmail,
  onCreateAccount,
}: CheckoutSignInSheetProps) {
  const [error, setError] = useState<string | null>(null);
  const hasGoogle = Boolean(getPublicEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID'));

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={`One step to pay ${amountLabel}`}>
      <p className="-mt-1 text-caption text-text-secondary">{summary}. Your picks stay as they are.</p>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-error/10 px-3 py-2 text-caption text-error">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {hasGoogle ? (
          <>
            {isOpen && <GoogleSignInButton onSuccess={onSignedIn} onError={setError} />}
            <button
              type="button"
              onClick={onUseEmail}
              className="min-h-[44px] w-full rounded-xl text-caption font-semibold text-primary-dark hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Use email and password instead
            </button>
          </>
        ) : (
          <>
            <Button variant="primary" fullWidth onClick={onUseEmail}>
              Log in
            </Button>
            <Button variant="outline" fullWidth onClick={onCreateAccount}>
              Create an account
            </Button>
          </>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] leading-snug text-text-secondary">
        New here? This makes your account too. By continuing you agree to our{' '}
        <Link href="/terms" target="_blank" className="font-semibold underline">
          Terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" target="_blank" className="font-semibold underline">
          Privacy Policy
        </Link>
        .
      </p>
    </BottomSheet>
  );
}
