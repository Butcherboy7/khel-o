import { Search, MapPin, SlidersHorizontal, X } from 'lucide-react';
import { Input, Button } from '@/components/ui';

interface CafeFilterBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  selectedCity: string;
  onCityChange: (c: string) => void;
  availableCities: string[];
  onReset: () => void;
  hasActiveFilters: boolean;
}

export function CafeFilterBar({
  query,
  onQueryChange,
  selectedCity,
  onCityChange,
  availableCities,
  onReset,
  hasActiveFilters,
}: CafeFilterBarProps) {
  return (
    <div className="flex flex-col gap-3 w-full my-4">
      {/* Search Input + City Dropdown Row */}
      <div className="flex flex-col sm:flex-row gap-2 w-full">
        <div className="flex-1">
          <Input
            placeholder="Search by café name, GPU, or location..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            rightElement={
              query ? (
                <button
                  type="button"
                  onClick={() => onQueryChange('')}
                  className="text-text-secondary hover:text-text-primary"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : undefined
            }
          />
        </div>

        {/* City Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
          <button
            onClick={() => onCityChange('')}
            className={`px-3 py-2 rounded-xl text-caption font-semibold flex-shrink-0 transition-colors ${
              !selectedCity
                ? 'bg-primary text-white'
                : 'bg-card text-text-secondary border border-border hover:bg-surface'
            }`}
          >
            All Cities
          </button>

          {availableCities.map((city) => (
            <button
              key={city}
              onClick={() => onCityChange(city === selectedCity ? '' : city)}
              className={`px-3 py-2 rounded-xl text-caption font-semibold flex-shrink-0 transition-colors flex items-center gap-1 ${
                city === selectedCity
                  ? 'bg-primary text-white'
                  : 'bg-card text-text-secondary border border-border hover:bg-surface'
              }`}
            >
              <MapPin className="h-3 w-3" />
              <span>{city}</span>
            </button>
          ))}

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="text-error hover:bg-error/10 flex-shrink-0 text-caption gap-1"
            >
              <X className="h-3.5 w-3.5" />
              <span>Reset</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
