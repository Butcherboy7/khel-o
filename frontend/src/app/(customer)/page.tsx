'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, SearchX, AlertCircle } from 'lucide-react';
import { listCafes } from '@/lib/api';
import CafeCard from '@/components/customer/CafeCard';
import CafeCardSkeleton from '@/components/customer/CafeCardSkeleton';

const CITIES = ['All', 'Bengaluru', 'Mumbai', 'Pune', 'Delhi', 'Hyderabad', 'Chennai', 'Kolkata'];

export default function ExplorePage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('All');

  // Debounce search input by 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const cityParam = selectedCity === 'All' ? undefined : selectedCity;
  const queryParam = debouncedQuery.trim() || undefined;

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['cafes', { city: cityParam, query: queryParam, page: 1 }],
    queryFn: () =>
      listCafes({
        city: cityParam,
        query: queryParam,
        page: 1,
        limit: 20,
      }),
    placeholderData: (previousData) => previousData,
  });

  const cafes = data?.items || [];
  const flashDealCafes = cafes.filter((c) => c.hasActivePromotion);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedQuery(searchInput);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setDebouncedQuery('');
    setSelectedCity('All');
  };

  return (
    <div className="space-y-6">
      {/* Search Bar - Sticky below app bar */}
      <div className="sticky top-14 z-30 pt-2 pb-2 bg-surface">
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="absolute left-4 top-3.5 w-5 h-5 text-text-secondary" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search cafés, cities, hardware"
            className="w-full pl-12 pr-4 py-3 bg-card border border-border rounded-full text-sm focus:outline-none focus:border-primary shadow-sm text-text-primary placeholder:text-text-secondary"
          />
        </form>
      </div>

      {/* City Filter Chips */}
      <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-none">
        {CITIES.map((city) => {
          const isActive = selectedCity === city;
          return (
            <button
              key={city}
              type="button"
              onClick={() => setSelectedCity(city)}
              className={`py-2 px-4 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-primary text-white'
                  : 'bg-card border border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              {city}
            </button>
          );
        })}
      </div>

      {/* Flash Deals Section (only shown if any café has hasActivePromotion true) */}
      {!isLoading && !isError && flashDealCafes.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-heading font-bold text-xl text-text-primary">
            🔥 Flash Deals
          </h2>
          <div className="flex space-x-3 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory">
            {flashDealCafes.map((cafe) => {
              const hasPhoto = cafe.photos && cafe.photos.length > 0 && cafe.photos[0];
              return (
                <div
                  key={cafe.id}
                  onClick={() => router.push(`/cafes/${cafe.id}`)}
                  className="w-[240px] flex-shrink-0 snap-start bg-card border border-border rounded-2xl shadow-md overflow-hidden relative cursor-pointer active:scale-98 transition-transform h-36 flex flex-col justify-end"
                >
                  {/* Photo or Gradient background */}
                  {hasPhoto ? (
                    <Image
                      src={cafe.photos[0]}
                      alt={cafe.name}
                      fill
                      sizes="240px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-secondary via-slate-800 to-slate-900" />
                  )}

                  {/* Emerald overlay bottom */}
                  <div className="relative z-10 p-3 bg-gradient-to-t from-emerald-950/90 via-emerald-900/60 to-transparent">
                    <h3 className="font-heading font-bold text-white text-base truncate">
                      {cafe.name}
                    </h3>
                    <p className="text-emerald-200 text-xs font-medium">
                      Off-peak special
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All Cafés Section */}
      <div className="space-y-3">
        <h2 className="font-heading font-bold text-xl text-text-primary">
          Cafés near you
        </h2>

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="space-y-3">
            <CafeCardSkeleton />
            <CafeCardSkeleton />
            <CafeCardSkeleton />
            <CafeCardSkeleton />
          </div>
        )}

        {/* Error State */}
        {!isLoading && isError && (
          <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 shadow-md">
            <AlertCircle className="w-10 h-10 text-error" />
            <h3 className="font-heading font-semibold text-lg text-text-primary">
              Something went wrong
            </h3>
            <p className="text-text-secondary text-sm">
              Failed to load cafés. Please check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="bg-primary text-white font-medium py-2 px-6 rounded-2xl active:scale-95 transition-transform text-sm"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && cafes.length === 0 && (
          <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 shadow-md">
            <SearchX className="w-12 h-12 text-text-secondary" />
            <h3 className="font-heading font-semibold text-lg text-text-primary">
              No cafés found
            </h3>
            <p className="text-text-secondary text-sm">
              Try a different city or search
            </p>
            {(selectedCity !== 'All' || debouncedQuery) && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="bg-primary text-white font-medium py-2 px-6 rounded-2xl active:scale-95 transition-transform text-sm mt-2"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Cafe List */}
        {!isLoading && !isError && cafes.length > 0 && (
          <div className="space-y-3">
            {cafes.map((cafe) => (
              <CafeCard key={cafe.id} cafe={cafe} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
