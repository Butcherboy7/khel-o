'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { googleAuth } from '@/lib/api/auth';
import { useAuthStore } from '@/store/authStore';
import { getPublicEnv } from '@/lib/runtimeEnv';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              width?: number;
            },
          ) => void;
        };
      };
    };
  }
}

interface GoogleSignInButtonProps {
  redirectPath?: string | null;
  onError?: (message: string) => void;
}

export function GoogleSignInButton({ redirectPath, onError }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleCredentialResponse = useCallback(
    async (response: { credential: string }) => {
      try {
        const res = await googleAuth(response.credential);
        setAuth(res.user, res.accessToken, res.refreshToken);

        if (redirectPath) {
          router.push(redirectPath);
          return;
        }
        switch (res.user.role) {
          case 'cafe_owner':
          case 'staff':
            router.push('/owner/dashboard');
            break;
          case 'admin':
            router.push('/admin');
            break;
          default:
            router.push('/');
        }
      } catch (err: unknown) {
        const message =
          (err as { message?: string })?.message || 'Google sign-in failed. Please try again.';
        onError?.(message);
      }
    },
    [redirectPath, router, setAuth, onError],
  );

  const initialize = useCallback(() => {
    const clientId = getPublicEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID');
    // Checking `window.google` alone isn't enough: this app also loads the
    // Google Maps JS API, which shares the same `window.google` namespace.
    // If Maps sets `window.google = { maps: {...} }` before (or without)
    // Identity Services populating `.accounts.id`, `window.google` is truthy
    // but `.accounts` is undefined — `window.google.accounts.id.initialize`
    // then throws "Cannot read properties of undefined (reading 'id')",
    // which crashed the whole login page for every logged-out visitor.
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
