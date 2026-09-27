'use client';

import { CampaignLinkGenerator } from '@/components/admin/CampaignLinkGenerator';

/** Same generator as Analytics → Ad campaigns, so every link is built one way. */
export function CampaignLinksTab() {
  return <CampaignLinkGenerator />;
}
