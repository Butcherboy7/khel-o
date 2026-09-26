'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { fireAnalyticsEvent } from '@/lib/api/analyticsEvents';

// Records one first-party page_view per client-side route change, feeding the
// admin Traffic page. Admin routes are skipped (and dropped server-side too) so
// staff browsing the console doesn't count as product traffic.
export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return;
    fireAnalyticsEvent('page_view', { metadata: { path: pathname } });
  }, [pathname]);

  return null;
}
