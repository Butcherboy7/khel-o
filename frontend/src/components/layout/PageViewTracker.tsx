'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { fireAnalyticsEvent } from '@/lib/api/analyticsEvents';
import { recordShareOpen } from '@/lib/share';
import { useAnalyticsStore } from '@/store/analyticsStore';

// Records one first-party page_view per client-side route change, feeding the
// admin Traffic page. Admin routes are skipped (and dropped server-side too) so
// staff browsing the console doesn't count as product traffic.
// One per page load: the first page view carries the referrer.
let landed = false;

export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return;

    // Landing from a tracked link (shares, campaign links, Meta ads): remember
    // the source first, so this very page_view already carries the campaign.
    // Signup attribution is first-touch; events carry the latest touch.
    const params = new URLSearchParams(window.location.search);
    // ?internal=1 marks this browser as one of our test devices (=0 undoes it).
    const internal = params.get('internal');
    if (internal === '1' || internal === '0') useAnalyticsStore.getState().setInternal(internal === '1');
    if (params.get('utm_source') || params.get('fbclid')) {
      useAnalyticsStore.getState().captureAttributionFromUrl(params);
      if (params.get('utm_source')) recordShareOpen(params);
    }
    // The first page of a visit also says which site sent them (host only, never the full
    // URL), so Google, Instagram, WhatsApp and ChatGPT show up even without a tagged link.
    let ref: string | undefined;
    if (!landed) {
      landed = true;
      try {
        const host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '';
        ref = host && host !== window.location.hostname.replace(/^www\./, '') ? host : 'direct';
      } catch {
        ref = undefined;
      }
    }
    // A friend's invite link (?inv=<code>) credits them when this browser signs up or books.
    const inv = params.get('inv');
    const meta: Record<string, unknown> = ref ? { path: pathname, ref, land: 1 } : { path: pathname };
    if (inv && /^[0-9a-f]{10}$/.test(inv)) meta.inv = inv;
    fireAnalyticsEvent('page_view', { metadata: meta });
  }, [pathname]);

  // How long they stayed on this page and how far down they scrolled, sent
  // once when they leave it (another page, tab hidden, app closed). Tells a
  // real look from a bounce.
  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return;
    const started = Date.now();
    let visibleMs = 0;
    let shownAt: number | null = document.visibilityState === 'visible' ? started : null;
    let deepest = 0;
    let sent = false;

    const measure = () => {
      const doc = document.documentElement;
      const room = doc.scrollHeight - window.innerHeight;
      const pct = room <= 0 ? 100 : Math.round(((window.scrollY || doc.scrollTop) / room) * 100);
      deepest = Math.max(deepest, Math.min(100, Math.max(0, pct)));
    };
    const send = () => {
      if (sent) return;
      sent = true;
      if (shownAt !== null) visibleMs += Date.now() - shownAt;
      fireAnalyticsEvent('page_exit', {
        metadata: { path: pathname, secs: Math.round(visibleMs / 1000), scroll: deepest },
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        send();
      } else if (sent) {
        // Came back to the same page: start a fresh visit to it.
        sent = false;
        visibleMs = 0;
        shownAt = Date.now();
      } else {
        shownAt = Date.now();
      }
    };

    measure();
    window.addEventListener('scroll', measure, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', send);
    return () => {
      window.removeEventListener('scroll', measure);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', send);
      send();
    };
  }, [pathname]);

  return null;
}
