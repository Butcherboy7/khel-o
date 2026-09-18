'use client';

import { useEffect } from 'react';
import { apiClient } from '@/lib/api/client';
import { useAnalyticsStore } from '@/store/analyticsStore';

const CAMPAIGN_ID = 'rs100-drop';
const INSTAGRAM_URL = 'https://www.instagram.com/khelo.journey/';

export default function Rs100InstagramRedirect() {
  useEffect(() => {
    const sessionId = useAnalyticsStore.getState().sessionId;
    // Awaited (capped) rather than fire-and-forget: an immediate navigation
    // away would otherwise abort the beacon before it leaves the browser.
    const track = apiClient
      .post('/api/v1/analytics/events', {
        sessionId,
        eventType: 'campaign_instagram_click',
        metadata: { campaignId: CAMPAIGN_ID },
      })
      .catch(() => {});
    const timeout = new Promise((resolve) => setTimeout(resolve, 600));
    Promise.race([track, timeout]).finally(() => {
      window.location.replace(INSTAGRAM_URL);
    });
  }, []);

  return null;
}
