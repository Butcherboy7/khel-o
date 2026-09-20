import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface PageSpinnerProps {
  /** Announced to screen readers while the page loads. */
  label?: string;
  className?: string;
  /** Show a rotating gaming-themed loading line beneath the spinner. */
  showTip?: boolean;
}

// One picked per mount, via useState's lazy initializer, so it doesn't
// reshuffle every time the surrounding component re-renders.
const LOADING_TIPS = [
  'Getting things ready...',
  'Just a moment...',
  'Setting the scene...',
  'Almost there...',
  'Warming things up...',
  'Making sure everything checks out...',
  'Good things take a second...',
  'Fetching the latest...',
];

/**
 * The one full-page loading indicator.
 *
 * Five owner screens each hand-rolled `animate-spin rounded-full border-b-2
 * border-emerald-500` — a hardcoded colour outside the token set, and a
 * borderless-circle trick that reads to every static analyser as an accent
 * border clashing with a rounded corner. One drawn icon, one accent token,
 * one accessible label.
 */
export function PageSpinner({ label = 'Loading', className, showTip = false }: PageSpinnerProps) {
  const [tip] = useState(() => LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex min-h-[400px] flex-col items-center justify-center gap-3', className)}
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      {showTip && (
        <span className="text-caption text-text-tertiary" aria-hidden="true">
          {tip}
        </span>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}
