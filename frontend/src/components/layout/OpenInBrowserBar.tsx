'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, X } from 'lucide-react';
import { isInAppBrowser } from '@/lib/campaign';

const DISMISS_KEY = 'khelo_inapp_bar_dismissed';
const AUTO_KEY = 'khelo_inapp_auto_open';

/**
 * Instagram and Facebook open links in their own browser. It keeps its own
 * cookies, so a person logged in to KHEL-O in their phone's browser looks
 * logged out there, and Google sign-in is often blocked. No link can force the
 * phone to leave it, so this slim bar (only inside those apps) offers the way
 * out: on Android a button that asks the phone to open the page in its normal
 * browser; on iPhone, a copy button and the two-tap steps.
 */
export function OpenInBrowserBar() {
  const [mode, setMode] = useState<null | 'android' | 'other'>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* storage blocked: show it anyway */
    }
    const ua = navigator.userAgent;
    if (!isInAppBrowser(ua)) return;
    const android = /Android/i.test(ua);
    setMode(android ? 'android' : 'other');
    // Android: ask the phone once, right away, to open this page in its own browser.
    // Most phones do it; if not, the page simply stays and the bar below is the way out.
    // (iPhone gives pages no way to do this, so it only gets the bar.)
    if (android) {
      let tried = false;
      try {
        tried = !!sessionStorage.getItem(AUTO_KEY);
        sessionStorage.setItem(AUTO_KEY, '1');
      } catch {
        tried = true;
      }
      if (!tried) {
        const { host, pathname, search, hash, href } = window.location;
        window.location.replace(`intent://${host}${pathname}${search}${hash}#Intent;scheme=https;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(href)};end`);
      }
    }
  }, []);

  if (!mode) return null;

  const openExternally = () => {
    const { host, pathname, search, hash, href } = window.location;
    window.location.href = `intent://${host}${pathname}${search}${hash}#Intent;scheme=https;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(href)};end`;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the steps below still work */
    }
  };

  const close = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setMode(null);
  };

  return (
    <div role="note" className="relative z-[90] flex items-center gap-2 bg-secondary px-3 py-2 text-white">
      <ExternalLink className="h-4 w-4 flex-none" aria-hidden />
      <p className="min-w-0 flex-1 text-[12.5px] leading-snug">
        {mode === 'android' ? (
          <>Open in your browser to stay logged in and sign in with Google.</>
        ) : (
          <>Tap <b>⋯</b> then <b>Open in browser</b> to stay logged in.</>
        )}
      </p>
      {mode === 'android' ? (
        <button type="button" onClick={openExternally} className="min-h-[36px] flex-none rounded-full bg-white px-3.5 text-[12.5px] font-bold text-secondary">
          Open
        </button>
      ) : (
        <button type="button" onClick={copy} className="inline-flex min-h-[36px] flex-none items-center gap-1 rounded-full bg-white px-3 text-[12.5px] font-bold text-secondary">
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      )}
      <button type="button" onClick={close} aria-label="Dismiss" className="flex h-9 w-9 flex-none items-center justify-center rounded-full hover:bg-white/10">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
