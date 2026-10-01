'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { describeTier, useTaxonomy } from '@/lib/taxonomy';
import type { TierAttributes } from '@/types/taxonomy';

interface SpecTier {
  /** PC/console tiers already show their own specs, so only activities get this. */
  tierType?: string;
  taxonomyKey?: string | null;
  attributes?: TierAttributes | null;
  description?: string | null;
}

const MAX_ITEMS = 3;

/**
 * One quiet line of what a serious player wants to know before booking
 * ("American pool · 9 ft"). Renders nothing when the owner told us nothing,
 * so unclassified setups look exactly as they always did.
 */
export function ActivitySpecLine({ tier, className }: { tier: SpecTier; className?: string }) {
  const { data: tax } = useTaxonomy();
  const d = tier.tierType === 'gaming' ? null : describeTier(tax, tier);
  if (!d || d.items.length === 0) return null;
  const shown = d.items.slice(0, MAX_ITEMS);
  const more = d.items.length - shown.length;
  return (
    <p className={cn('truncate text-caption font-semibold text-text-primary/80', className)}>
      {shown.join(' · ')}
      {more > 0 && <span className="font-normal text-text-secondary"> +{more}</span>}
    </p>
  );
}

const CUE_OR_TABLE = new Set(['cue-sports', 'table-games']);

/**
 * Collapsed by default; opens to the full detail, including games offered and
 * a one-sentence explanation of the style for people who don't know the
 * difference. Sits at checkout, where the player is deciding.
 */
export function AboutThisSetup({ tier, className }: { tier: SpecTier; className?: string }) {
  const { data: tax } = useTaxonomy();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const d = tier.tierType === 'gaming' ? null : describeTier(tax, tier);
  if (!d) return null;

  const title = CUE_OR_TABLE.has(d.category) ? 'About this table' : 'About this setup';
  return (
    <div className={cn('rounded-2xl border border-border/60 bg-surface', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="min-w-0">
          <span className="block font-heading text-body font-bold text-text-primary">{title}</span>
          {!open && d.items.length > 0 && (
            <span className="block truncate text-caption text-text-secondary">{d.items.slice(0, MAX_ITEMS).join(' · ')}</span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={cn('h-4 w-4 flex-shrink-0 text-text-secondary transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div id={panelId} className="flex flex-col gap-3 border-t border-border/60 px-3 pb-3 pt-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-caption">
            {d.rows.map((r) => (
              <div key={r.label} className="contents">
                <dt className="text-text-secondary">{r.label}</dt>
                <dd className="font-semibold text-text-primary">{r.value}</dd>
              </div>
            ))}
          </dl>
          {d.styleHint && d.styleLabel && (
            <p className="text-caption text-text-secondary">
              <span className="font-semibold text-text-primary">{d.styleLabel}:</span> {d.styleHint}
            </p>
          )}
          {tier.description && <p className="text-caption text-text-secondary">{tier.description}</p>}
        </div>
      )}
    </div>
  );
}
