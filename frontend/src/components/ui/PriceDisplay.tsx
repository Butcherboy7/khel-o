import { cn } from '@/lib/cn';

interface PriceDisplayProps {
  amount: number | null;
  period?: string;
  originalAmount?: number | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = {
  sm: {
    main: 'text-price-sm',
    original: 'text-caption line-through',
    period: 'text-caption',
  },
  md: {
    main: 'text-h2',
    original: 'text-body line-through',
    period: 'text-caption',
  },
  lg: {
    main: 'text-price-lg',
    original: 'text-h3 line-through',
    period: 'text-body',
  },
};

export function PriceDisplay({
  amount,
  period = '/hr',
  originalAmount,
  size = 'md',
  className,
}: PriceDisplayProps) {
  if (amount === null || amount === undefined) {
    return <span className={cn('text-caption text-text-secondary', className)}>N/A</span>;
  }

  const styles = SIZE_MAP[size];

  return (
    <div className={cn('inline-flex items-baseline gap-1', className)}>
      <span className={cn('font-data font-bold text-primary flex items-baseline gap-0.5', styles.main)}>
        <span className="rupee-symbol">₹</span>
        <span>{amount}</span>
      </span>
      {originalAmount && originalAmount > amount && (
        <span className={cn('font-data text-text-secondary opacity-60 flex items-baseline gap-0.5', styles.original)}>
          <span className="rupee-symbol">₹</span>
          <span>{originalAmount}</span>
        </span>
      )}
      {period && (
        <span className={cn('text-text-secondary font-normal', styles.period)}>
          {period}
        </span>
      )}
    </div>
  );
}
