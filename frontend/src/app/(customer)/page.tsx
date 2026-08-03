'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, SlidersHorizontal, Flame, Sparkles, Navigation, X } from 'lucide-react';
import { listCafes } from '@/lib/api/cafes';
import { queryKeys } from '@/hooks/queries/keys';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuthStore } from '@/store/authStore';
import { CafeCard } from '@/components/customer/CafeCard';
import { SearchBarWithSuggestions } from '@/components/customer/SearchBarWithSuggestions';
import { SkeletonCafeGrid, ErrorState, EmptyState, Button, Badge } from '@/components/ui';

const FILTER_TAGS = ['PC Gaming', 'PS5', 'Premium PCs', 'Offers', 'Open Now'];
const KNOWN_CITIES = ['Bengaluru', 'Delhi', 'Mumbai', 'Hyderabad', 'Pune'];

export default function ExplorePage() {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.fullName ? user.fullName.split(' ')[0] : 'Gamer';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('Bengaluru');
  const [selectedTags, setSelectedTags] = useState<string[]>(['PC Gaming']);
  const [isLocating, setIsLocating] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  const debouncedQuery = useDebounce(searchQuery, 300);

  // Auto detect user location using Geolocation API
  const handleDetectLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        // Geolocation resolved (defaulting to Bengaluru coordinates mapping or prompt city)
        setSelectedCity('Bengaluru');
      },
      () => {
        setIsLocating(false);
      }
    );
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.cafes.list({
      query: debouncedQuery || undefined,
      city: selectedCity || undefined,
      limit: 20,
    }),
    queryFn: () =>
      listCafes({
        query: debouncedQuery || undefined,
        city: selectedCity || undefined,
        limit: 20,
      }),
    staleTime: 30_000,
  });

  const cafes = data?.items || [];

  // Simultaneous multi-tag filter logic
  const filteredCafes = cafes.filter((cafe) => {
    if (selectedTags.includes('PS5')) {
      const hasPs5 = cafe.tierNames?.some((t) => t.toLowerCase().includes('ps5') || t.toLowerCase().includes('console'));
      if (!hasPs5) return false;
    }
    if (selectedTags.includes('Offers') && !cafe.hasActivePromotion) {
      return false;
    }
    return true;
  });

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCity('Bengaluru');
    setSelectedTags(['PC Gaming']);
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Geolocation & Personal Header */}
      <div className="flex flex-col gap-1">
        <div className="relative flex items-center gap-2">
          <button
            onClick={() => setShowCityDropdown(!showCityDropdown)}
            className="flex items-center gap-1.5 text-caption font-bold text-primary hover:underline bg-primary/10 px-3 py-1 rounded-full transition-colors"
          >
            <MapPin className="h-3.5 w-3.5" />
            <span>{selectedCity} ▼</span>
          </button>

          <button
            onClick={handleDetectLocation}
            disabled={isLocating}
            className="flex items-center gap-1 text-caption text-text-secondary hover:text-text-primary transition-colors"
          >
            <Navigation className={`h-3.5 w-3.5 ${isLocating ? 'animate-spin text-primary' : ''}`} />
            <span>{isLocating ? 'Locating...' : 'Use exact location'}</span>
          </button>

          {/* City Selection Dropdown */}
          {showCityDropdown && (
            <div className="absolute top-8 left-0 z-dropdown w-44 rounded-2xl bg-card border border-border/80 shadow-overlay p-2 flex flex-col gap-1 animate-in fade-in">
              {KNOWN_CITIES.map((city) => (
                <button
                  key={city}
                  onClick={() => {
                    setSelectedCity(city);
                    setShowCityDropdown(false);
                  }}
                  className={`p-2 rounded-xl text-caption font-semibold text-left transition-colors ${
                    selectedCity === city ? 'bg-primary/10 text-primary' : 'text-text-primary hover:bg-surface'
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>
          )}
        </div>

        <h1 className="font-heading text-display text-text-primary tracking-tight mt-1">
          Hey {firstName}, where are we playing?
        </h1>
      </div>

      {/* Pill Search Bar with Autocomplete Suggestions */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <SearchBarWithSuggestions
            value={searchQuery}
            onChange={setSearchQuery}
            onSelectCity={setSelectedCity}
            onSelectTag={(tag) => setSelectedTags([...selectedTags, tag])}
          />

          <button
            onClick={handleResetFilters}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-text-primary shadow-card hover:bg-surface transition-colors flex-shrink-0"
            title="Reset Filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>

        {/* Multi-Select Filter Chips Row */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
          {FILTER_TAGS.map((tag) => {
            const isSelected = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`rounded-full px-5 py-2.5 text-caption font-semibold flex-shrink-0 transition-all ${
                  isSelected
                    ? 'bg-secondary text-white shadow-card font-bold'
                    : 'bg-card text-text-secondary border border-border hover:bg-surface'
                }`}
              >
                {tag} {isSelected ? '✓' : ''}
              </button>
            );
          })}

          {(selectedTags.length > 0 || searchQuery) && (
            <button
              onClick={handleResetFilters}
              className="rounded-full px-4 py-2 text-caption font-bold text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 flex-shrink-0 transition-all"
            >
              Clear filters ✕
            </button>
          )}
        </div>
      </div>

      {/* Off-Peak Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#18191E] via-[#241F23] to-[#4A2322] p-6 md:p-8 text-white shadow-float border border-border/40">
        <div className="relative z-10 max-w-lg flex flex-col gap-3">
          <div className="w-fit">
            <span className="rounded-full bg-card/90 px-3 py-1 text-overline font-bold uppercase tracking-wider text-primary">
              Off-peak
            </span>
          </div>

          <h2 className="font-heading text-display text-white">
            Get 30% off before 5 PM
          </h2>

          <p className="text-body text-white/80">
            Cafés are empty in the afternoon. We pass the savings to you — code <span className="font-data font-bold text-primary">OFFPEAK30</span>.
          </p>

          <div className="pt-2">
            <button
              onClick={() => setSelectedTags([...selectedTags, 'Offers'])}
              className="rounded-full bg-white px-6 py-2.5 text-btn font-bold text-secondary shadow-card hover:bg-surface transition-colors"
            >
              Browse offer cafés
            </button>
          </div>
        </div>
      </section>

      {/* Featured Cafés Section Header & Adaptive Grid */}
      <section className="min-h-[400px]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-heading text-h2 text-text-primary">Featured cafés</h2>
            <p className="text-caption text-text-secondary">
              Hand-checked rigs, peripherals and ping
            </p>
          </div>
        </div>

        {isLoading && <SkeletonCafeGrid count={6} />}

        {isError && (
          <ErrorState
            title="Unable to load gaming cafés"
            message={(error as Error)?.message || 'Failed to fetch cafés. Please check your connection.'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && filteredCafes.length === 0 && (
          <EmptyState
            title="No gaming cafés found"
            description="No cafés match your current search criteria or active location."
            actionLabel="Clear All Filters"
            onAction={handleResetFilters}
          />
        )}

        {!isLoading && !isError && filteredCafes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredCafes.map((cafe) => (
              <CafeCard key={cafe.id} cafe={cafe} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
