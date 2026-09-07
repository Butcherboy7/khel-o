'use client';

import Link from 'next/link';
import { ActivityIcon } from '@/components/icons/ActivityIcons';
import type { HardwareTier } from '@/types/tier';

interface ActivitiesSectionProps {
  cafeId: string;
  activities: HardwareTier[];
}

/** Café-detail "Activities" cards (spec §7) — deliberately shows only what
 *  a customer cares about: what it is, price, and how many are available.
 *  No specs/technical fields, since activity tiers never have them (see
 *  Global Constraints in the implementation plan). Tapping a card reuses
 *  the exact same booking route every gaming tier already uses. */
export function ActivitiesSection({ cafeId, activities }: ActivitiesSectionProps) {
  if (activities.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-h2 text-text-primary">Activities</h2>
      <div className="flex flex-col gap-2.5">
        {activities.map((tier) => (
          <Link
            key={tier.id}
            href={`/bookings/new?cafeId=${cafeId}&tierId=${tier.id}`}
            className="flex items-center gap-4 p-4 rounded-2xl border border-border/80 bg-card hover:shadow-float hover:bg-surface transition-all"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-surface text-text-secondary">
              <ActivityIcon activityKind={tier.activityKind} className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-heading text-body-emphasis font-bold text-text-primary">{tier.name}</h3>
              <div className="flex flex-wrap items-center gap-x-1.5 text-caption text-text-secondary">
                <span>{tier.totalSeats} {tier.totalSeats === 1 ? 'unit' : 'units'}</span>
                {tier.description && (
                  <>
                    <span className="text-text-secondary/50">·</span>
                    <span className="truncate">{tier.description}</span>
                  </>
                )}
              </div>
            </div>
            <div className="font-data text-body-emphasis font-bold text-text-primary flex-shrink-0">
              <span className="rupee-symbol">₹</span>{tier.pricePerHour}
              <span className="text-caption font-normal text-text-secondary">/hr</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
