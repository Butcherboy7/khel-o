import { type ReactNode } from 'react';
import { PackageOpen } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/cn';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /**
   * Drops the card chrome. Use whenever this sits *inside* a Card — otherwise
   * the page shows a bordered box inside a bordered box, which reads as two
   * nested containers rather than one section that happens to be empty.
   */
  bare?: boolean;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  bare = false,
  className,
}: EmptyStateProps) {
  const hasAction = Boolean(actionLabel && onAction);

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1 p-8 text-center',
        !bare && 'my-4 rounded-2xl border border-border bg-card',
        className,
      )}
    >
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-text-secondary">
        {icon || <PackageOpen className="h-7 w-7" aria-hidden="true" />}
      </div>
      <h3 className="font-heading text-h3 text-text-primary">{title}</h3>
      {description && (
        // Margin only when something follows it — an unconditional mb-6 left a
        // block of dead space under every action-less empty state.
        <p className={cn('max-w-sm text-body text-text-secondary', hasAction && 'mb-5')}>
          {description}
        </p>
      )}
      {hasAction && (
        <Button variant="primary" size="md" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
