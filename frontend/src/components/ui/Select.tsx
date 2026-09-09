import { forwardRef, useId, type SelectHTMLAttributes, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ── Select ──────────────────────────────────────────────────────── */

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

/**
 * Native <select> wearing the same shell as <Input>: same 48px height, radius,
 * border and focus ring. A bare <select> renders at the platform's own height —
 * ~22px on Android Chrome — which is why every filter dropdown in the portal was
 * effectively untappable. The chevron is ours; the browser's is suppressed with
 * `appearance-none` so the control reads as one vocabulary with the text inputs.
 */
const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, hint, error, id, children, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const errorId = `${selectId}-error`;
    const hintId = `${selectId}-hint`;

    return (
      <div className="flex w-full flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-h4 text-text-primary">
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          <select
            ref={ref}
            id={selectId}
            aria-describedby={
              [error ? errorId : '', hint ? hintId : ''].filter(Boolean).join(' ') || undefined
            }
            aria-invalid={error ? 'true' : undefined}
            className={cn(
              'w-full appearance-none rounded-xl border bg-card font-body text-body text-text-primary',
              'h-input cursor-pointer pl-4 pr-11',
              'transition-colors duration-fast',
              'border-border',
              'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0',
              error && 'border-error focus:ring-error',
              'disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-50',
              className,
            )}
            {...props}
          >
            {children}
          </select>

          <ChevronDown
            className="pointer-events-none absolute right-4 h-4 w-4 text-text-secondary"
            aria-hidden="true"
          />
        </div>

        {hint && !error && (
          <p id={hintId} className="text-caption text-text-secondary">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-caption text-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';

export { Select };
export type { SelectProps };
