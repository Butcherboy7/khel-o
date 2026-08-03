import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

interface RatingDisplayProps {
  rating: number; // 0.0 to 5.0
  totalReviews?: number;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
  className?: string;
}

const STAR_SIZES = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

const TEXT_SIZES = {
  sm: 'text-caption',
  md: 'text-body-emphasis',
  lg: 'text-h4',
};

export function RatingDisplay({
  rating,
  totalReviews,
  size = 'md',
  showCount = true,
  className,
}: RatingDisplayProps) {
  const formattedRating = Number(rating || 0).toFixed(1);

  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      <Star
        className={cn(STAR_SIZES[size], 'fill-warning text-warning flex-shrink-0')}
        aria-hidden="true"
      />
      <span className={cn('font-heading font-semibold text-text-primary', TEXT_SIZES[size])}>
        {formattedRating}
      </span>
      {showCount && totalReviews !== undefined && (
        <span className={cn('text-text-secondary', TEXT_SIZES[size])}>
          ({totalReviews})
        </span>
      )}
    </div>
  );
}
