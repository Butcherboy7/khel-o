'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, SlidersHorizontal, Flame, Sparkles } from 'lucide-react';
import { listCafes } from '@/lib/api/cafes';
import { queryKeys } from '@/hooks/queries/keys';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuthStore } from '@/store/authStore';
import { CafeCard } from '@/components/customer/CafeCard';
import { SkeletonCafeGrid, ErrorState, EmptyState, Button, Badge } from '@/components/ui';

const FILTER_TAGS = ['PC Gaming', 'PS5', 'Premium PCs', 'Offers', 'Open Now'];
const KNOWN_CITIES = ['Bengaluru', 'Delhi', 'Mumbai', 'Hyderabad', 'Pune'];

export default function ExplorePage() {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.fullName ? user.fullName.split(' ')[0] : 'Gamer';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('Bengaluru');
  const [selectedTag, setSelectedTag] = useState('PC Gaming');

  const debouncedQuery = useDebounce(searchQuery, 300);

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
  const hasActiveFilters = Boolean(searchQuery || selectedCity !== 'Bengaluru' || selectedTag !== 'PC Gaming');

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCity('Bengaluru');
    setSelectedTag('PC Gaming');
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Top Location & Personal Greeting Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1 text-caption font-semibold text-text-secondary">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          <span>{selectedCity}</span>
        </div>
        <h1 className="font-heading text-display text-text-primary tracking-tight">
          Hey {firstName}, where are we playing?
        </h1>
      </div>

      {/* Pill Search Bar with Filter Button */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <input
              type="text"
              placeholder="Search cafés, areas or games"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 w-full rounded-full border border-border bg-card pl-11 pr-4 text-body text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary shadow-card transition-all"
            />
          </div>

          <button
            className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-text-primary shadow-card hover:bg-surface transition-colors"
            aria-label="Filter options"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>

        {/* Filter Pills Row */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
          {FILTER_TAGS.map((tag) => {
            const isSelected = tag === selectedTag;
            return (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag === selectedTag ? '' : tag)}
                className={`rounded-full px-4 py-2 text-caption font-semibold flex-shrink-0 transition-all ${
                  isSelected
                    ? 'bg-secondary text-white shadow-card'
                    : 'bg-card text-text-secondary border border-border hover:bg-surface'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* Off-Peak Banner (Matches Lovable Target) */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-secondary via-secondary to-[#2B2D42] p-6 md:p-8 text-white shadow-float">
        <div className="relative z-10 max-w-lg flex flex-col gap-3">
          <div className="w-fit">
            <span className="rounded-full bg-accent px-3 py-1 text-overline font-bold uppercase tracking-wider text-white">
              Off-peak
            </span>
          </div>

          <h2 className="font-heading text-display text-white">
            Get 30% off before 5 PM
          </h2>

          <p className="text-body text-white/80">
            Cafés are empty in the afternoon. We pass the savings to you — code <span className="font-data font-bold text-primary">OFFPEAK50</span>.
          </p>

          <div className="pt-2">
            <button className="rounded-full bg-white px-6 py-2.5 text-btn font-semibold text-secondary shadow-card hover:bg-surface transition-colors">
              Browse offer cafés
            </button>
          </div>
        </div>
      </section>

      {/* Featured Cafés Section Header */}
      <section className="min-h-[400px]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-heading text-h2 text-text-primary">Featured cafés</h2>
            <p className="text-caption text-text-secondary">
              Hand-checked rigs, peripherals and ping
            </p>
          </div>
        </div>

        {/* 4-State System Content */}
        {isLoading && <SkeletonCafeGrid count={6} />}

        {isError && (
          <ErrorState
            title="Unable to load gaming cafés"
            message={(error as Error)?.message || 'Failed to fetch cafés. Please check your connection.'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && cafes.length === 0 && (
          <EmptyState
            title="No gaming cafés found"
            description={
              hasActiveFilters
                ? 'No cafés match your current search criteria. Try clearing your filters or searching another city.'
                : 'No active gaming cafés are available at the moment. Please check back later.'
            }
            actionLabel={hasActiveFilters ? 'Clear All Filters' : undefined}
            onAction={hasActiveFilters ? handleResetFilters : undefined}
          />
        )}

        {!isLoading && !isError && cafes.length > 0 && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {cafes.map((cafe) => (
              <CafeCard key={cafe.id} cafe={cafe} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
