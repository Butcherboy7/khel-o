import { apiClient } from './client';
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
  | 'google_signin_failed';

export function fireAnalyticsEvent(
  eventType: AnalyticsEventType,
  opts: { cafeId?: string; metadata?: Record<string, unknown> } = {}
): void {
  const store = useAnalyticsStore.getState();
  const sessionId = store.sessionId;
  // Which campaign/ad this visitor last came through, on every event, so an
  // ad's whole funnel (land → view → book) can be followed. Device and
  // in-app browser are added server-side from the User-Agent.
  const touch = store.currentTouch();
  const utm = touch ? { s: touch.s, m: touch.m, c: touch.c, t: touch.t } : undefined;
  apiClient
    .post('/api/v1/analytics/events', {
      sessionId,
      eventType,
      cafeId: opts.cafeId,
      metadata: utm ? { ...(opts.metadata ?? {}), utm } : opts.metadata ?? {},
    })
    .catch(() => {
      // Fire-and-forget: a dropped analytics event must never surface as a
      // user-facing error or block the page it was fired from.
    });
}
