'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CUSTOMER_HINTS, HINT_VIEWS, type CustomerHintId } from '@/lib/customerGuideCopy';

const STORAGE_KEY = 'khelo-hints';

function readCounts(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * One quiet line that nudges a first-time customer at a moment they might
 * hesitate. Shown for the first few sightings on this device, then gone —
 * no close button, nothing to manage. Stored in the browser, not the
 * account, because most first visits happen before signing up.
 */
export function Hint({ id, emphasis = false, className }: { id: CustomerHintId; emphasis?: boolean; className?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const counts = readCounts();
    const seen = counts[id] ?? 0;
    if (seen >= HINT_VIEWS) return;
    setShow(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...counts, [id]: seen + 1 }));
    } catch {
      // Storage blocked: the hint just keeps showing, which is harmless.
    }
  }, [id]);

  if (!show) return null;

  return (
    <p
      className={cn(
        'flex items-start gap-1.5 text-caption animate-fade-in-up',
        emphasis ? 'rounded-xl bg-primary/5 px-3 py-2 font-semibold text-text-primary' : 'text-text-secondary',
        className
      )}
    >
      <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" aria-hidden />
      <span>{CUSTOMER_HINTS[id]}</span>
    </p>
  );
}
