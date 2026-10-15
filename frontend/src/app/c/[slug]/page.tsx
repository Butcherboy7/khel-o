'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient, call } from '@/lib/api/client';

/**
 * Short campaign link (khel-o.com/c/<slug>). Looks the campaign up and
 * forwards to its page with the tracking tags already on, keeping any
 * fbclid Meta added to the tap so the ad click still counts.
 */
export default function ShortLinkPage() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    call<{ target: string }>(() => apiClient.get(`/api/v1/c/${encodeURIComponent(slug)}`))
      .then(({ target }) => {
        if (cancelled) return;
        const url = new URL(target, window.location.origin);
        const fbclid = new URLSearchParams(window.location.search).get('fbclid');
        if (fbclid) url.searchParams.set('fbclid', fbclid);
        window.location.replace(url.pathname + url.search);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-4 text-center">
      {missing ? (
        <>
          <p className="font-heading text-h2 text-text-primary">This link doesn&apos;t exist</p>
          <Link href="/" className="font-semibold text-primary hover:underline">
            Open KHEL-O
          </Link>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-primary border-t-transparent" aria-hidden />
          <p className="text-body text-text-secondary">Opening KHEL-O…</p>
        </>
      )}
    </main>
  );
}
