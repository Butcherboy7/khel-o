import { Tag } from 'lucide-react';
import { cn } from '@/lib/cn';

interface OfferChipProps {
  /** "20% off", "₹360 for 1 hr": the server's wording, shown as-is. */
  label: string;
  /** Schedule in words ("Weekdays · 6 PM–9 PM"). Shown when the offer isn't open right now. */
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
  const showWhen = !live && when;
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
        {showWhen && <span className="truncate font-medium opacity-80">· {when}</span>}
      </span>
      {urgency && <span className="px-0.5 text-[11px] font-semibold text-primary-dark">{urgency}</span>}
    </span>
  );
}
