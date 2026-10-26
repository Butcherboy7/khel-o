import { redirect } from 'next/navigation';
import { apiClient, call } from '@/lib/api/client';
import { ShortLinkClient } from './ShortLinkClient';

// Looked up on every request: campaigns are edited in Admin at any time.
export const dynamic = 'force-dynamic';

/**
 * Short campaign link (khel-o.com/c/<slug>). Redirects on the server to the
 * campaign's page with the tracking tags on, keeping any fbclid Meta added to
 * the tap. A server redirect (not a browser one) so WhatsApp / Instagram link
 * previews follow it and show the landing page's own card.
 */
export default async function ShortLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  let target: string | null = null;
  try {
    ({ target } = await call<{ target: string }>(() => apiClient.get(`/api/v1/c/${encodeURIComponent(slug)}`)));
  } catch {
    // Unknown link or the API hiccuped: the browser version retries and
    // shows "This link doesn't exist" if it really doesn't.
    return <ShortLinkClient />;
  }
  const url = new URL(target, 'https://khel-o.com');
  const fbclid = typeof query.fbclid === 'string' ? query.fbclid : null;
  if (fbclid) url.searchParams.set('fbclid', fbclid);
  redirect(url.pathname + url.search);
}
