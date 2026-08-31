import { Star, X } from 'lucide-react';
import { Input } from '@/components/ui';

/** Rating floor options — filters on the café's real `averageRating`
    (already returned by /api/v1/cafes), so every option here reflects data
    that exists rather than a fabricated scale. */
const RATING_OPTIONS = [4.5, 4, 3.5, 3];

interface CafeFilterBarProps {
  minPrice: string;
  maxPrice: string;
  onMinPriceChange: (v: string) => void;
  onMaxPriceChange: (v: string) => void;
  minRating: number | null;
  onMinRatingChange: (v: number | null) => void;
  onClear: () => void;
}

/** "More filters" expansion — houses the filters that are useful but not
    used on every search (price range, minimum rating), kept out of the
    always-visible chip row so that row stays scannable. Both filters map
    to real, backend/data-model-supported fields: price range is sent as
    minPrice/maxPrice query params the café list endpoint already accepts,
    and rating filters client-side on the café's real averageRating. */
export function CafeFilterBar({
  minPrice,
  maxPrice,
  onMinPriceChange,
  onMaxPriceChange,
  minRating,
  onMinRatingChange,
  onClear,
}: CafeFilterBarProps) {
  const hasAdvancedFilters = Boolean(minPrice || maxPrice || minRating != null);

  return (
    <div className="flex flex-col gap-4 w-full rounded-2xl border border-border bg-card p-4 shadow-card animate-in fade-in">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-body-emphasis font-bold text-text-primary">More filters</h3>
        {hasAdvancedFilters && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 text-caption font-semibold text-primary hover:text-primary-dark min-h-[44px] px-2"
          >
            <X className="h-3.5 w-3.5" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Price range — backed by the real minPrice/maxPrice params the
          café list endpoint accepts (see backend/app/api/v1/cafes.py). */}
      <div className="flex flex-col gap-2">
        <span className="text-caption font-semibold text-text-secondary">Price per hour (Rs.)</span>
        <div className="flex items-center gap-2 max-w-xs">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Min"
            value={minPrice}
            onChange={(e) => onMinPriceChange(e.target.value)}
            aria-label="Minimum price per hour"
            className="h-11"
          />
          <span className="text-text-secondary">–</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Max"
            value={maxPrice}
            onChange={(e) => onMaxPriceChange(e.target.value)}
            aria-label="Maximum price per hour"
            className="h-11"
          />
        </div>
      </div>

      {/* Minimum rating — backed by the café's real averageRating field. */}
      <div className="flex flex-col gap-2">
        <span className="text-caption font-semibold text-text-secondary">Minimum rating</span>
        <div className="flex items-center gap-2 flex-wrap">
          {RATING_OPTIONS.map((rating) => {
            const isSelected = minRating === rating;
            return (
              <button
                key={rating}
                type="button"
                onClick={() => onMinRatingChange(isSelected ? null : rating)}
                className={`flex items-center gap-1 rounded-full px-3.5 min-h-[44px] text-caption font-semibold transition-colors ${
                  isSelected
                    ? 'bg-primary text-white'
                    : 'bg-surface text-text-secondary border border-border hover:bg-border/40'
                }`}
              >
                <Star className={`h-3.5 w-3.5 ${isSelected ? 'fill-white' : 'fill-current'}`} />
                <span>{rating.toFixed(1)}+</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
