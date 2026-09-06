import { apiClient } from './client';
import { useAnalyticsStore } from '@/store/analyticsStore';

export type AnalyticsEventType = 'search_performed' | 'venue_viewed' | 'booking_flow_started';

export function fireAnalyticsEvent(
  eventType: AnalyticsEventType,
  opts: { cafeId?: string; metadata?: Record<string, unknown> } = {}
): void {
  const sessionId = useAnalyticsStore.getState().sessionId;
  apiClient
    .post('/api/v1/analytics/events', {
      sessionId,
      eventType,
      cafeId: opts.cafeId,
      metadata: opts.metadata ?? {},
    })
    .catch(() => {
      // Fire-and-forget: a dropped analytics event must never surface as a
      // user-facing error or block the page it was fired from.
    });
}
