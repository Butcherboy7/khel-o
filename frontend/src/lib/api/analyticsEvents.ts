import { getApiUrl } from './client';
import { useAnalyticsStore } from '@/store/analyticsStore';

export type AnalyticsEventType =
  | 'search_performed'
  | 'venue_viewed'
  | 'booking_flow_started'
  | 'campaign_landing_view'
  | 'campaign_cta_click'
  | 'campaign_instagram_click'
  | 'page_view'
  | 'share_created'
  | 'share_opened'
  | 'location_shared'
  | 'city_selected'
  | 'notify_me'
  | 'google_signin_failed'
  | 'checkout_login_shown'
  | 'payment_opened'
  | 'payment_failed'
  | 'payment_dismissed'
  | 'booking_completed'
  // A tap worth counting (pop-up buttons, directions, see prices…): metadata.action names it.
  | 'ui_action'
  // Leaving a page: metadata.secs (time on it) and metadata.scroll (deepest %, 0–100).
  | 'page_exit'
  | 'signin_completed';

export function fireAnalyticsEvent(
  eventType: AnalyticsEventType,
  opts: { cafeId?: string; metadata?: Record<string, unknown> } = {}
): void {
  if (typeof window === 'undefined') return;
  const store = useAnalyticsStore.getState();
  const sessionId = store.sessionId;
  // Which campaign/ad this visitor last came through, on every event, so an
  // ad's whole funnel (land → view → book) can be followed. Device and
  // in-app browser are added server-side from the User-Agent.
  const touch = store.currentTouch();
  const utm = touch ? { s: touch.s, m: touch.m, c: touch.c, t: touch.t } : undefined;
  const metadata: Record<string, unknown> = { ...(opts.metadata ?? {}) };
  if (utm) metadata.utm = utm;
  if (store.internal) metadata.internal = true;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const token = localStorage.getItem('accessToken');
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {}

  // keepalive lets the request finish even when the tap navigates away
  // (to sign-in, to payment, to another site) or the tab is closing, which is
  // exactly when the most telling events fire. Fire-and-forget: a dropped
  // event must never surface as an error or block the page.
  try {
    fetch(`${getApiUrl()}/api/v1/analytics/events`, {
      method: 'POST',
      headers,
      keepalive: true,
      body: JSON.stringify({ sessionId, eventType, cafeId: opts.cafeId, metadata }),
    }).catch(() => {});
  } catch {}
}

/** Shorthand for a counted tap: `trackAction('popup_sign_in', { code })`. */
export function trackAction(action: string, metadata: Record<string, unknown> = {}, cafeId?: string): void {
  fireAnalyticsEvent('ui_action', { cafeId, metadata: { action, ...metadata } });
}
