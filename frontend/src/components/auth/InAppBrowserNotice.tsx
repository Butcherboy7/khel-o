'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { isInAppBrowser } from '@/lib/campaign';

/**
 * Instagram and Facebook open links in their own browser, where Google
 * sign-in is often blocked. Only there, say how to open the page in the phone's
 * normal browser. The link and any saved code carry over, so nothing is lost.
 */
export function InAppBrowserNotice({ className }: { className?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(isInAppBrowser(navigator.userAgent));
  }, []);
  if (!show) return null;
  return (
    <p role="note" className={`flex items-start gap-2 rounded-xl bg-surface px-3 py-2 text-caption text-text-secondary ${className ?? ''}`}>
      <ExternalLink className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
      <span>
        Google sign-in can fail inside Instagram. Tap <span className="font-semibold text-text-primary">⋯</span> then{' '}
        <span className="font-semibold text-text-primary">Open in browser</span>, or use email sign-in. Your offer stays saved.
      </span>
    </p>
  );
}
