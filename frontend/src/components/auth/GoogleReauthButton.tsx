'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef } from 'react';
import { getPublicEnv } from '@/lib/runtimeEnv';
// google-identity.d.ts is a global ambient type augmentation, picked up
// automatically via tsconfig.json's `include` -- it has no runtime module
// to import, so a value import of it breaks the production webpack build.

interface GoogleReauthButtonProps {
  onToken: (idToken: string) => void;
}

/**
 * Re-verification for Google-only accounts (no KHEL-O password). Renders the
 * same Google Identity Services button as sign-in, but hands the fresh
 * id_token to the caller instead of logging in — used as proof-of-identity
 * for sensitive changes (e.g. email) in place of a password these accounts
 * don't have.
 */
export function GoogleReauthButton({ onToken }: GoogleReauthButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleCredentialResponse = useCallback(
    (response: { credential: string }) => {
      onToken(response.credential);
    },
    [onToken],
  );

  const initialize = useCallback(() => {
    const clientId = getPublicEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID');
    if (!clientId || !window.google?.accounts?.id || !containerRef.current) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredentialResponse,
    });

    const width = Math.min(400, Math.max(200, containerRef.current.clientWidth || 320));

    window.google.accounts.id.renderButton(containerRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      width,
    });
  }, [handleCredentialResponse]);

  useEffect(() => {
    if (window.google?.accounts?.id) initialize();
  }, [initialize]);

  if (!getPublicEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID')) return null;

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={initialize}
      />
      <div ref={containerRef} className="flex w-full justify-center" />
    </>
  );
}
