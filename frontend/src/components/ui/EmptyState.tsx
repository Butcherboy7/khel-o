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
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8 rounded-2xl bg-card border border-border my-4',
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-text-secondary mb-4">
        {icon || <PackageOpen className="h-7 w-7" />}
      </div>
      <h3 className="font-heading text-h3 text-text-primary mb-1">{title}</h3>
      {description && (
        <p className="text-body text-text-secondary max-w-sm mb-6">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button variant="primary" size="md" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
