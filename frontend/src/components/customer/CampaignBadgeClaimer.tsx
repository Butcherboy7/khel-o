'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { claimCampaignBadge } from '@/lib/api/promotions';
import { trackAction } from '@/lib/api/analyticsEvents';
import { badgeClaimedFor, markBadgeClaimed, readStoredCampaign } from '@/lib/campaign';

/**
 * Campaign visitors are no longer asked to sign in up front: they browse and
 * book first, and sign in only at checkout. Whenever someone who arrived
 * through a public campaign link is signed in, give them its badge once.
 * Only public multi-café campaigns (no café attached) grant it this way.
 */
export function CampaignBadgeClaimer() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  useEffect(() => {
    if (!isAuthenticated) return;
    const stored = readStoredCampaign();
    if (!stored || stored.cafeId || badgeClaimedFor(stored.code)) return;
    claimCampaignBadge(stored.code)
      .then((r) => {
        markBadgeClaimed(stored.code);
        if (r.newlyEarned) trackAction('campaign_badge_claimed', { code: stored.code, via: 'auto' });
      })
      .catch(() => markBadgeClaimed(stored.code));
  }, [isAuthenticated]);
  return null;
}
