'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { trackAction } from '@/lib/api/analyticsEvents';
import { isInAppBrowser } from '@/lib/campaign';

type Platform = 'android' | 'ios' | 'other';

/** Chrome opens straight from this link on Android. The same page and the saved offer come along. */
function chromeIntent(): string {
  const { host, pathname, search } = window.location;
  return `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`;
}

/**
 * Instagram and Facebook open links in their own browser, where Google
 * sign-in is blocked. Only there: a clear way out. Android gets one tap to
 * Chrome, iPhone gets the two taps, everyone can copy the link. Email sign-in
 * always works. Meta does not let an ad force the outside browser, so this is
 * the nearest thing.
 */
export function InAppBrowserNotice({ className, keeps = 'Your offer stays saved.' }: { className?: string; keeps?: string }) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    if (!isInAppBrowser(ua)) return;
    setPlatform(/android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'ios' : 'other');
    trackAction('inapp_notice_shown');
  }, []);
  if (!platform) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      trackAction('inapp_copy_link');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div role="note" className={`flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 text-caption text-text-secondary ${className ?? ''}`}>
      <p className="flex items-start gap-2">
        <ExternalLink className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
        <span>
          <span className="font-semibold text-text-primary">Google sign-in does not work inside Instagram.</span> Open this in your browser, or sign up with email below. {keeps}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {platform === 'android' && (
          <a
            href={chromeIntent()}
            onClick={() => trackAction('inapp_open_chrome')}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-primary px-4 font-bold text-white"
          >
            <ExternalLink className="h-4 w-4" aria-hidden /> Open in Chrome
          </a>
        )}
        {platform === 'ios' && (
          <span className="inline-flex min-h-[40px] items-center rounded-full bg-card px-3 font-semibold text-text-primary">
            Tap <span className="mx-1 font-bold">⋯</span> then Open in Safari
          </span>
        )}
        {platform === 'other' && (
          <span className="inline-flex min-h-[40px] items-center rounded-full bg-card px-3 font-semibold text-text-primary">
            Tap <span className="mx-1 font-bold">⋯</span> then Open in browser
          </span>
        )}
        <button type="button" onClick={copy} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-border bg-card px-4 font-semibold text-text-primary">
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}
