'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { fireAnalyticsEvent } from '@/lib/api/analyticsEvents';
import { recordShareOpen } from '@/lib/share';
import { useAnalyticsStore } from '@/store/analyticsStore';

// Records one first-party page_view per client-side route change, feeding the
// admin Traffic page. Admin routes are skipped (and dropped server-side too) so
// staff browsing the console doesn't count as product traffic.
export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return;

    // Landing from a tracked link (shares, campaign links, Meta ads): remember
    // the source first, so this very page_view already carries the campaign.
    // Signup attribution is first-touch; events carry the latest touch.
    const params = new URLSearchParams(window.location.search);
    if (params.get('utm_source') || params.get('fbclid')) {
      useAnalyticsStore.getState().captureAttributionFromUrl(params);
      if (params.get('utm_source')) recordShareOpen(params);
    }
    fireAnalyticsEvent('page_view', { metadata: { path: pathname } });
  }, [pathname]);

  return null;
}
