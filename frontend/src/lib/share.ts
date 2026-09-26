import { fireAnalyticsEvent } from '@/lib/api/analyticsEvents';
import { getPublicEnv } from '@/lib/runtimeEnv';

// Every share is traceable end to end: the link carries a unique share id
// (`sid`) plus UTM tags, `share_created` is logged when it's sent, and
// `share_opened` when someone lands on it (see PageViewTracker). A signup
// from that visit is attributed utm_source=share, so Admin → Shares can show
// shares → opens → signups → bookings per channel and per café.

export type ShareChannel = 'whatsapp' | 'telegram' | 'facebook' | 'x' | 'copy' | 'native';
export type ShareContext = 'cafe' | 'booking' | 'waitlist';

export interface ShareTarget {
  /** Site path being shared, e.g. /cafe/dg-gaming-cafe-hyderabad. */
  path: string;
  context: ShareContext;
  cafeId?: string;
  /** Café slug — becomes utm_campaign so signups map back to the café. */
  campaign?: string;
}

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.com');

function newShareId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    : Math.random().toString(36).slice(2, 18);
}

/** Builds the tracked link for one share and logs `share_created`. */
export function createShare(target: ShareTarget, channel: ShareChannel): string {
  const sid = newShareId();
  const origin = typeof window !== 'undefined' ? window.location.origin : SITE_URL;
  const url = new URL(target.path, origin);
  url.searchParams.set('utm_source', 'share');
  url.searchParams.set('utm_medium', channel);
  if (target.campaign) url.searchParams.set('utm_campaign', target.campaign);
  url.searchParams.set('sid', sid);

  fireAnalyticsEvent('share_created', {
    cafeId: target.cafeId,
    metadata: { sid, channel, context: target.context, path: target.path },
  });
  return url.toString();
}

const OPENED_KEY = 'khelo-share-opened';

/** Logs `share_opened` once per share id per browser session. */
export function recordShareOpen(params: URLSearchParams): void {
  const sid = params.get('sid');
  if (!sid || params.get('utm_source') !== 'share') return;
  try {
    const seen: string[] = JSON.parse(sessionStorage.getItem(OPENED_KEY) || '[]');
    if (seen.includes(sid)) return;
    sessionStorage.setItem(OPENED_KEY, JSON.stringify([...seen, sid].slice(-20)));
  } catch {
    // No sessionStorage — may double-count a refresh, which is acceptable.
  }
  fireAnalyticsEvent('share_opened', {
    metadata: { sid, channel: params.get('utm_medium') || 'other', path: window.location.pathname },
  });
}
