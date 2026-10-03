'use client';

import Link from 'next/link';

/** Links are now made as campaigns, so each one gets a short link and its own numbers. */
export function CampaignLinksTab() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-heading text-h3 text-text-primary">Campaign links moved</h2>
      <p className="text-body text-text-secondary">
        Make every link from Analytics → Campaigns. Each one gets a short khel-o.com/c/… link, a QR code and its own
        numbers.
      </p>
      <Link href="/admin/analytics/ads" className="w-fit font-semibold text-primary hover:underline">
        Open Campaigns
      </Link>
    </div>
  );
}
