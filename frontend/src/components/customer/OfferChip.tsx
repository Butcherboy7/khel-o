import { Tag } from 'lucide-react';
import { cn } from '@/lib/cn';

interface OfferChipProps {
  /** "20% off", "₹360 for 1 hr": the server's wording, shown as-is. */
  label: string;
  /** Schedule in words ("Weekdays · 6 PM–9 PM"). Always shown, so a weekday
   * price seen on Friday night isn't mistaken for the Saturday price. */
  when?: string | null;
  /** "Only 4 left" / "Ends today". Rendered as a quiet second line of text, not another pill. */
  urgency?: string | null;
  /** False when today's day/hour window isn't open yet. */
  live?: boolean;
  /** `solid` sits on photos; `soft` sits on cards and rows. */
  tone?: 'solid' | 'soft';
  className?: string;
}

/**
 * The one way an offer looks anywhere in the app, so a gamer who spots a deal
 * on the list recognises the same deal on the café page and at checkout.
 * Renders only text the server supplied: it computes no prices.
 */
export function OfferChip({ label, when, urgency, live = true, tone = 'soft', className }: OfferChipProps) {
  const showWhen = Boolean(when);
  return (
    <span className={cn('inline-flex min-w-0 max-w-full flex-col items-start gap-0.5', className)}>
      <span
        className={cn(
          'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold leading-tight',
          tone === 'solid'
            ? 'bg-accent text-white shadow-card'
            : live
            ? 'bg-accent/10 text-primary-dark ring-1 ring-inset ring-accent/25'
            : 'bg-surface text-text-secondary ring-1 ring-inset ring-border',
        )}
      >
        <Tag className="h-3 w-3 flex-shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
        {showWhen && <span className="truncate font-medium">· {when}</span>}
      </span>
      {urgency && <span className="px-0.5 text-[11px] font-semibold text-primary-dark">{urgency}</span>}
    </span>
  );
}

interface OfferLineProps {
  label: string;
  /** 'solo' | 'coop' | 'any': who the offer is for, said in players. */
  playMode?: string | null;
  when?: string | null;
  urgency?: string | null;
  live?: boolean;
  className?: string;
}

/**
 * The quiet form of an offer for setup cards: one line of text with a tag
 * icon, no pill. Same words as OfferChip (label, who, when), so the deal still
 * reads the same here as on the list and at checkout.
 */
export function OfferLine({ label, playMode, when, urgency, live = true, className }: OfferLineProps) {
  const who = playMode === 'solo' ? '1 player' : playMode === 'coop' ? '2 players' : null;
  const text = [label, who, when, urgency].filter(Boolean).join(' · ');
  return (
    <p className={cn('flex min-w-0 items-center gap-1 text-caption font-semibold', live ? 'text-primary-dark' : 'text-text-secondary', className)}>
      <Tag className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
      <span className="truncate">{text}</span>
    </p>
  );
}
