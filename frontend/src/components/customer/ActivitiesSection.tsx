'use client';

import Link from 'next/link';
import { ActivityIcon } from '@/components/icons/ActivityIcons';
import type { HardwareTier } from '@/types/tier';
import { ActivitySpecLine } from '@/components/customer/ActivitySpecs';
import { OfferChip } from '@/components/customer/OfferChip';
import { offerUrgency, offerLabelWithMode, hourlyOffer } from '@/lib/offers';
import type { Promotion } from '@/types/promotion';

interface ActivitiesSectionProps {
  cafeId: string;
  activities: HardwareTier[];
  /** A link-only campaign code the visitor arrived with; carried into checkout. */
  promoCode?: string | null;
  campaignOffers?: Promotion[];
  /** Render inside the "Choose your setup" list: no section heading of its own. */
  embedded?: boolean;
  /** With `embedded`: label the group ("Activities") when setups sit above it. */
  showHeading?: boolean;
  /** A lead café (not on KHEL-O yet): show what they have, nothing to book. */
  readOnly?: boolean;
}

/** Café-detail "Activities" cards (spec §7) — deliberately shows only what
 *  a customer cares about: what it is, price, and how many are available,
 *  plus one quiet line of what the owner told us about it ("American pool ·
 *  9 ft") when they did. Tapping a card reuses
 *  the exact same booking route every gaming tier already uses. */
export function ActivitiesSection({ cafeId, activities, promoCode, campaignOffers = [], embedded = false, showHeading = true, readOnly = false }: ActivitiesSectionProps) {
  if (activities.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {(!embedded || showHeading) && (
        <h3 className="mt-1.5 font-heading text-body-emphasis font-bold text-text-primary">Activities</h3>
      )}
      <div className="flex flex-col gap-2.5">
        {activities.map((tier) => {
          const hourly = hourlyOffer(tier.pricePerHour, tier.activePromotion);
          const discount = hourly?.pct ?? 0;
          const shown = hourly?.price ?? tier.pricePerHour;
          const cardClass = 'relative flex items-center gap-3 rounded-2xl border-2 border-border bg-card p-3 text-left';
          const content = (
          <>
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-surface text-text-secondary">
              <ActivityIcon activityKind={tier.activityKind} className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-heading text-body-emphasis font-bold text-text-primary">{tier.name}</h3>
              <ActivitySpecLine tier={tier} />
              {tier.activePromotion && (
                <OfferChip
                  className="my-0.5"
                  label={hourly ? `${hourly.pct}% off` : tier.activePromotion.label || 'Offer'}
                  when={tier.activePromotion.when}
                  live={tier.activePromotion.isLiveNow !== false}
                  urgency={offerUrgency({
                    slotsRemaining: tier.activePromotion.slotsRemaining,
                    validUntil: tier.activePromotion.validUntil,
                  })}
                />
              )}
              {campaignOffers.filter((o) => o.applicableTierId === tier.id).length > 0 && (
                <div className="my-0.5 flex flex-wrap items-center gap-1.5">
                  {campaignOffers
                    .filter((o) => o.applicableTierId === tier.id)
                    .map((o) => (
                      <OfferChip key={o.id} label={offerLabelWithMode(o.label || 'Offer', o.playMode)} />
                    ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-1.5 text-caption text-text-secondary">
                {tier.description && <span>{tier.description}</span>}
              </div>
            </div>
            <div className="flex flex-shrink-0 flex-col items-end gap-0.5 text-right">
              {discount > 0 && (
                <span className="text-caption leading-none text-text-tertiary line-through">
                  <span className="rupee-symbol">₹</span>{tier.pricePerHour}
                </span>
              )}
              <div className={`whitespace-nowrap font-data text-body-emphasis font-bold ${discount > 0 ? 'text-accent' : 'text-text-primary'}`}>
                <span className="rupee-symbol">₹</span>{shown}
                <span className="text-caption font-normal text-text-secondary">/hr</span>
              </div>
              <span className="whitespace-nowrap text-[11px] text-text-secondary">{tier.totalSeats} {tier.totalSeats === 1 ? 'unit' : 'units'}</span>
            </div>
          </>
          );
          return readOnly ? (
            <div key={tier.id} className={cardClass}>{content}</div>
          ) : (
            <Link
              key={tier.id}
              href={`/bookings/new?cafeId=${cafeId}&tierId=${tier.id}${promoCode ? `&promoCode=${encodeURIComponent(promoCode)}` : ''}`}
              className={`${cardClass} transition-all hover:bg-surface active:scale-[0.99]`}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
