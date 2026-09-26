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
    fireAnalyticsEvent('page_view', { metadata: { path: pathname } });

    // Landing from a tracked link (shares, campaign links): remember the
    // source now, first-touch wins, so a signup later in the visit — on any
    // page — is attributed to it, and log the open if it was a share.
    const params = new URLSearchParams(window.location.search);
    if (params.get('utm_source')) {
      useAnalyticsStore.getState().captureAttributionFromUrl(params);
      recordShareOpen(params);
    }
  }, [pathname]);

  return null;
}
