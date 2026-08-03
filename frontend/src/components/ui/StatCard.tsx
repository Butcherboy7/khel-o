import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { Card, CardContent } from './Card';
import { cn } from '@/lib/cn';

interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: ReactNode;
  trend?: {
    value: string | number;
    isPositive: boolean;
  };
}

const StatCard = forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, label, value, subtext, icon, trend, ...props }, ref) => {
    return (
      <Card ref={ref} className={cn('relative overflow-hidden', className)} {...props}>
        <CardContent className="p-5 flex flex-col justify-between h-full gap-2">
          <div className="flex items-start justify-between gap-2">
            <span className="text-overline text-text-secondary uppercase tracking-wider font-semibold">
              {label}
            </span>
            {icon && (
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface text-primary">
                {icon}
              </div>
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <span className="font-data text-price-lg text-text-primary tracking-tight">
              {value}
            </span>
            {trend && (
              <span
                className={cn(
                  'text-caption font-semibold rounded-md px-1.5 py-0.5',
                  trend.isPositive ? 'bg-success/10 text-success' : 'bg-error/10 text-error',
                )}
              >
                {trend.isPositive ? '+' : ''}
                {trend.value}
              </span>
            )}
          </div>

          {subtext && (
            <p className="text-caption text-text-secondary">{subtext}</p>
          )}
        </CardContent>
      </Card>
    );
  },
);

StatCard.displayName = 'StatCard';

export { StatCard };
export type { StatCardProps };
