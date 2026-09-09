import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface OwnerPageHeaderProps {
  /** Plain-language name of the screen. Kept short so it never wraps on a phone. */
  title: string;
  /** One sentence saying what the owner does here, in their words, not ours. */
  description?: string;
  /** The single most likely action on this screen. Goes full-width on mobile. */
  action?: ReactNode;
  className?: string;
}

/**
 * The one header every owner screen wears.
 *
 * Before this existed each page rolled its own: different heading sizes, some
 * with a coloured icon and some without, some adding `max-w-4xl mx-auto px-4`
 * *inside* OwnerShell's already-padded main (which double-padded the page on a
 * phone and made the content column jump width between tabs). Owners navigate by
 * recognising shape, so the shape has to be the same everywhere.
 *
 * No icon slot on purpose: a decorative glyph beside a two-line title pushed the
 * text into an awkward hanging indent on narrow screens, and the bottom nav
 * already carries the iconography for wayfinding.
 */
export function OwnerPageHeader({
  title,
  description,
  action,
  className,
}: OwnerPageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-h1 text-text-primary text-balance">{title}</h1>
        {description && (
          <p className="max-w-prose text-body text-text-secondary">{description}</p>
        )}
      </div>

      {/* Full-bleed on a phone so it lands under the thumb; shrinks to its own
          width once there is room to put it beside the title. */}
      {action && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{action}</div>
      )}
    </header>
  );
}
