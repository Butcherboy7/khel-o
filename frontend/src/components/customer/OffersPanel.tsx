'use client';

import { useState } from 'react';
import { CheckCircle2, Info, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { lengthLabel, offerUrgency } from '@/lib/offers';
import type { QuoteResponse } from '@/lib/api/bookings';

interface OffersPanelProps {
  /** The server's price for this exact slot: the only source of truth for offers. */
  quote: QuoteResponse | undefined;
  /** True until the first quote arrives. */
  loading: boolean;
  /** A KHELO code the customer typed or arrived with. */
  appliedCode: string | null;
  onChooseOffer: (offerId: string) => void;
  onMakeLength: (minutes: number) => void;
  onApplyCode: (code: string) => void;
  onClearCode: () => void;
  className?: string;
}

const money = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/**
 * Checkout's offers area. Offers apply on their own: this shows what was
 * applied and why, lets the customer swap to another valid offer in one tap,
 * and turns "almost eligible" into a one-tap fix. A KHELO code is just another
 * way to pick an offer, so it lives behind a quiet "Have a code?" link.
 */
export function OffersPanel({
  quote,
  loading,
  appliedCode,
  onChooseOffer,
  onMakeLength,
  onApplyCode,
  onClearCode,
  className,
}: OffersPanelProps) {
  const [codeOpen, setCodeOpen] = useState(false);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  const applied = quote?.appliedOffer ?? null;
  const others = (quote?.availableOffers ?? []).filter((o) => o.id !== applied?.id);
  const hint = !applied ? quote?.offerHint ?? null : null;
  const note = quote?.offerNote ?? null;
  const hasOffers = Boolean(applied || others.length || hint || note);

  const submitCode = () => {
    const code = input.trim().toUpperCase();
    if (code.length < 4) {
      setInputError('Enter the full code.');
      return;
    }
    setInputError(null);
    onApplyCode(code);
    setInput('');
    setCodeOpen(false);
  };

  const codeControl = appliedCode ? (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2">
      <span className="min-w-0 truncate text-caption text-text-secondary">
        Code <span className="font-data font-bold tracking-wider text-text-primary">{appliedCode}</span>
      </span>
      <button
        type="button"
        onClick={onClearCode}
        aria-label="Remove code"
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  ) : codeOpen ? (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          autoFocus
          inputMode="text"
          autoCapitalize="characters"
          aria-label="KHELO code"
          placeholder="e.g. WEEKNIGHT15"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20))}
          onKeyDown={(e) => e.key === 'Enter' && submitCode()}
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 font-data text-caption tracking-wider text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="button"
          onClick={submitCode}
          disabled={!input.trim()}
          className="h-11 flex-shrink-0 rounded-xl bg-primary px-4 text-caption font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Apply
        </button>
      </div>
      {inputError && <p className="text-caption text-error">{inputError}</p>}
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setCodeOpen(true)}
      className="inline-flex min-h-[44px] w-fit items-center text-caption font-semibold text-primary-dark underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
    >
      Have a code?
    </button>
  );

  if (loading && !quote) {
    return <div className={cn('h-16 animate-pulse rounded-2xl bg-surface', className)} aria-hidden />;
  }

  // Nothing to show about offers: just the quiet code link, no empty card.
  if (!hasOffers && !appliedCode) {
    return <div className={cn('-mt-1', className)}>{codeControl}</div>;
  }

  return (
    <section aria-label="Offers" className={cn('flex flex-col gap-2.5 rounded-2xl border border-border/80 bg-card p-3.5', className)}>
      <h2 className="font-heading text-body font-bold text-text-primary">Offers</h2>

      {applied && (
        <div role="status" className="flex items-center gap-2.5 rounded-xl bg-success/10 px-3 py-2.5">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-success" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-caption font-semibold text-text-primary">{applied.title}</p>
            <p className="text-[11px] text-text-secondary">
              {applied.label} applied
            </p>
          </div>
          <span className="flex-shrink-0 font-heading font-bold text-text-primary">
            −<span className="rupee-symbol">₹</span>
            {money(quote?.discountAmount ?? 0)}
          </span>
        </div>
      )}

      {others.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {others.map((o) => {
            const urgency = offerUrgency({ slotsRemaining: o.slotsRemaining });
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => onChooseOffer(o.id)}
                  className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border border-border/80 px-3 py-2 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-caption font-semibold text-text-primary">{o.title}</span>
                    <span className="block truncate text-[11px] text-text-secondary">
                      {o.label}
                      {urgency ? ` · ${urgency}` : ''}
                    </span>
                  </span>
                  <span className="flex-shrink-0 text-right text-[11px] leading-tight">
                    <span className="block font-semibold text-text-primary">
                      Save <span className="rupee-symbol">₹</span>
                      {money(o.discountAmount)}
                    </span>
                    <span className="block font-semibold text-primary-dark">Tap to switch</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hint &&
        (hint.suggestedMinutes ? (
          <button
            type="button"
            onClick={() => onMakeLength(hint.suggestedMinutes!)}
            className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl bg-primary/5 px-3 py-2 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Sparkles className="h-4 w-4 flex-shrink-0 text-primary-dark" aria-hidden />
            <span className="min-w-0 flex-1 text-caption text-text-primary">
              <span className="font-semibold">{hint.title}</span> · {hint.message}
            </span>
            <span className="flex-shrink-0 text-caption font-semibold text-primary-dark">
              Make it {lengthLabel(hint.suggestedMinutes)}
            </span>
          </button>
        ) : (
          <p className="flex items-start gap-2 text-caption text-text-secondary">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
            <span>
              <span className="font-semibold text-text-primary">{hint.title}</span> · {hint.message}
            </span>
          </p>
        ))}

      {note && (
        <p role="status" className="flex items-start gap-2 text-caption text-text-secondary">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          <span>{note}</span>
        </p>
      )}

      {codeControl}
    </section>
  );
}
