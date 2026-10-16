'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { OWNER_TOUR } from '@/lib/ownerTourCopy';
import { TOUR_LATER_FLAG, useTourRecord } from '@/hooks/useOwnerGuide';
import { useOwnerTourStore } from '@/store/ownerTourStore';

/** ₹150 worked through the way checkout does it (checkout_maths.py). */
function MoneyExample() {
  const rows: [string, string][] = [
    ['Your price for 1 hour', '₹150'],
    ['Customer sees', '₹149'],
    ['KHEL-O pays you the ₹1', '+₹1'],
    ['Booking fee (customer pays it, goes to KHEL-O)', 'not from you'],
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface text-caption">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-1.5">
          <span className="text-text-secondary">{label}</span>
          <span className="whitespace-nowrap font-semibold text-text-primary">{value}</span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 bg-success/10 px-3 py-2">
        <span className="font-semibold text-text-primary">You get</span>
        <span className="font-heading text-body font-bold text-success">₹150</span>
      </div>
    </div>
  );
}

/**
 * The owner app tour: a card that walks page to page, explaining each part of
 * the app in plain words while the real page sits behind it. Mounted once in
 * OwnerShell; opened by useOwnerTourAutoStart (dashboard) or Help & Support.
 */
export function OwnerTour() {
  const { open, step, goTo, close } = useOwnerTourStore();
  const { finished, skipped } = useTourRecord();
  const router = useRouter();
  const pathname = usePathname();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const current = OWNER_TOUR[step];
  const last = step === OWNER_TOUR.length - 1;

  // Open the page this step is about.
  useEffect(() => {
    if (open && current && pathname !== current.href) router.push(current.href);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  // Move focus to the new step so screen readers read it.
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open, step]);

  if (!open || !current) return null;

  const later = () => {
    try {
      sessionStorage.setItem(TOUR_LATER_FLAG, '1');
    } catch {
      /* storage blocked: it just shows again next time */
    }
    close();
  };
  const skip = () => {
    skipped();
    close();
  };
  const next = () => {
    if (last) {
      finished();
      close();
    } else {
      goTo(step + 1);
    }
  };

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="owner-tour-title"
      className="fixed inset-x-3 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px)+0.5rem)] z-overlay flex max-h-[min(60vh,30rem)] flex-col rounded-2xl border border-border bg-card shadow-float animate-fade-in-up lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-[400px]"
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-overline font-semibold text-primary">
            App tour · {step + 1} of {OWNER_TOUR.length}
          </span>
        </div>
        <button
          type="button"
          onClick={later}
          aria-label="Close the tour for now"
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-text-secondary hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Progress: one segment per step */}
      <div className="flex gap-1 px-4" aria-hidden>
        {OWNER_TOUR.map((_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-border'}`} />
        ))}
      </div>

      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-4 pb-1 pt-3">
        <h2
          id="owner-tour-title"
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-h3 text-text-primary focus:outline-none"
        >
          {current.title}
        </h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-caption text-text-primary">
          {current.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {current.moneyExample && <MoneyExample />}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/70 px-4 py-3">
        {step === 0 ? (
          <button
            type="button"
            onClick={skip}
            className="min-h-[44px] px-1 text-caption font-semibold text-text-secondary hover:text-text-primary hover:underline"
          >
            Skip tour
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => goTo(step - 1)} className="gap-1" aria-label="Back">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </Button>
            {!last && (
              <button
                type="button"
                onClick={skip}
                className="min-h-[44px] px-2 text-caption font-semibold text-text-secondary hover:text-text-primary hover:underline"
              >
                Skip
              </button>
            )}
          </div>
        )}
        <Button variant="primary" size="sm" onClick={next} className="gap-1">
          {step === 0 ? 'Start' : last ? 'Finish' : 'Next'}
          {!last && <ArrowRight className="h-4 w-4" aria-hidden />}
        </Button>
      </div>
    </section>
  );
}
