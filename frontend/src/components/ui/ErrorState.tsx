import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/cn';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'Failed to load data. Please check your connection and try again.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8 rounded-2xl bg-card border border-error/20 my-4',
        className,
      )}
      role="alert"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-error/10 text-error mb-4">
        <AlertCircle className="h-7 w-7" />
      </div>
      <h3 className="font-heading text-h3 text-text-primary mb-1">{title}</h3>
      <p className="text-body text-text-secondary max-w-sm mb-6">{message}</p>
      {onRetry && (
        <Button variant="outline" size="md" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          <span>Try Again</span>
        </Button>
      )}
    </div>
  );
}
