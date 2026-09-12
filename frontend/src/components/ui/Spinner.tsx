import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface PageSpinnerProps {
  /** Announced to screen readers while the page loads. */
  label?: string;
  className?: string;
}

/**
 * The one full-page loading indicator.
 *
 * Five owner screens each hand-rolled `animate-spin rounded-full border-b-2
 * border-emerald-500` — a hardcoded colour outside the token set, and a
 * borderless-circle trick that reads to every static analyser as an accent
 * border clashing with a rounded corner. One drawn icon, one accent token,
 * one accessible label.
 */
export function PageSpinner({ label = 'Loading', className }: PageSpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex min-h-[400px] items-center justify-center', className)}
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
