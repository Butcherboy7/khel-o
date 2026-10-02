import Link from 'next/link';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { offerUrgency } from '@/lib/offers';
import { spotsLine } from '@/lib/campaign';
import type { CampaignInfo } from '@/lib/api/promotions';

interface FoundersBannerProps {
  campaign: CampaignInfo;
  code: string;
  className?: string;
}

/**
 * Shown when someone arrives through a link-only campaign. It says the price
 * is unlocked and already saved, shows the code (so it can be typed anywhere
 * the link is lost), and states how many spots there really are. No invented
 * counts: the numbers come straight from the server.
 */
export function FoundersBanner({ campaign, code, className }: FoundersBannerProps) {
  const spots = spotsLine(campaign);
  const deadline = offerUrgency({ validUntil: campaign.endsAt });
  const tight = campaign.remaining != null && campaign.remaining > 0 && campaign.remaining <= 20;

  if (campaign.isPublic) {
    return (
      <Link
        href={`/campaign/${encodeURIComponent(code)}`}
        className="flex min-h-[44px] items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/5 px-3.5 py-2.5"
      >
        <span className="min-w-0">
          <span className="block font-heading text-body font-bold text-text-primary">{campaign.name}</span>
          <span className="block text-caption text-text-secondary">Special prices are applied automatically. See every café.</span>
        </span>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-primary-dark" aria-hidden />
      </Link>
    );
  }

  return (
    <section
      aria-label={campaign.name}
      className={cn('flex flex-col gap-2 rounded-2xl border border-accent/30 bg-accent/5 p-3.5', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-body font-bold text-text-primary">
            {campaign.full ? `${campaign.name} is full` : `${campaign.name} unlocked`}
          </h2>
          {!campaign.full && (
            <p className="mt-0.5 flex items-center gap-1 text-caption text-text-secondary">
              <Check className="h-3.5 w-3.5 flex-shrink-0 text-success" aria-hidden />
              Saved for checkout. Nothing to type.
            </p>
          )}
        </div>
        <span
          className="flex-shrink-0 rounded-md bg-card px-2 py-1 font-data text-[11px] font-bold tracking-wider text-text-primary ring-1 ring-border"
          aria-label={`Code ${code}`}
        >
          {code}
        </span>
      </div>

      {(spots || deadline) && (
        <p className={cn('text-caption font-semibold', tight || campaign.full ? 'text-primary-dark' : 'text-text-primary')}>
          {[spots, deadline].filter(Boolean).join(' · ')}
        </p>
      )}
    </section>
  );
}
