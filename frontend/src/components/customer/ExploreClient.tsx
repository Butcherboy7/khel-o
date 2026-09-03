'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Navigation, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { listCafes } from '@/lib/api/cafes';
import { queryKeys } from '@/hooks/queries/keys';
import { useDebounce } from '@/hooks/useDebounce';
import { calculateDistance, isCafeOpenNow } from '@/lib/format';
import { hasPcTier, hasPlatformTier } from '@/lib/platformTags';
import { SUPPORTED_CITIES } from '@/constants/cities';
import { useAuthStore } from '@/store/authStore';
import { useLocationStore } from '@/store/locationStore';
import { CafeCard } from '@/components/customer/CafeCard';
import { SearchBarWithSuggestions } from '@/components/customer/SearchBarWithSuggestions';
import { CafeFilterBar } from '@/components/customer/CafeFilterBar';
import { SkeletonCafeGrid, ErrorState, EmptyState } from '@/components/ui';
import type { CafeListItem, PaginatedResponse } from '@/types';

type PlatformFilter = 'All' | 'PC' | 'PS5' | 'Xbox' | 'Open now';
const FILTER_TAGS: PlatformFilter[] = ['All', 'PC', 'PS5', 'Xbox', 'Open now'];

type SortOption = 'recommended' | 'rating' | 'price' | 'distance';
const SORT_LABELS: Record<SortOption, string> = {
  recommended: 'Recommended',
  rating: 'Top rated',
  price: 'Price: Low to high',
  distance: 'Nearest',
};

const KNOWN_CITIES = ['All Cities', ...SUPPORTED_CITIES];

// Coordinates mapping for accurate Indian city detection
const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  Hyderabad: { lat: 17.3850, lng: 78.4867 },
  Bengaluru: { lat: 12.9716, lng: 77.5946 },
  Mumbai: { lat: 19.0760, lng: 72.8777 },
  Delhi: { lat: 28.6139, lng: 77.2090 },
  Pune: { lat: 18.5204, lng: 73.8567 },
};

function findClosestCity(lat: number, lng: number): string {
  let closestCity = 'Hyderabad';
  let minDistance = Infinity;

  for (const [city, coords] of Object.entries(CITY_COORDINATES)) {
    const dist = Math.hypot(lat - coords.lat, lng - coords.lng);
    if (dist < minDistance) {
      minDistance = dist;
      closestCity = city;
    }
  }
  return closestCity;
}

interface ExploreClientProps {
  /** Unfiltered first page fetched server-side, so the raw HTML a crawler
      sees already contains real café listings instead of a loading skeleton.
      Only wired up as react-query initialData when the visitor's actual
      filters match this exact unfiltered query — see the guard below. */
  initialCafes?: PaginatedResponse<CafeListItem>;
}

export function ExploreClient({ initialCafes }: ExploreClientProps) {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const firstName = user?.fullName ? user.fullName.split(' ')[0] : null;

  const {
    selectedCity: persistedCity,
    setSelectedCity: setPersistedCity,
    setUserCoords,
    isPreciseLocation,
    userLat,
    userLng,
    clearLocation,
  } = useLocationStore();

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState(persistedCity || 'All Cities');
  const [activeTag, setActiveTag] = useState<PlatformFilter>('All');
  const [sortBy, setSortBy] = useState<SortOption>('recommended');
  const [isLocating, setIsLocating] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [minRating, setMinRating] = useState<number | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const cafesGridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<number>(0);

  const debouncedQuery = useDebounce(searchQuery, 300);

  useEffect(() => {
    const cityParam = searchParams.get('city');
    if (cityParam && KNOWN_CITIES.includes(cityParam)) {
      setSelectedCity(cityParam);
      setPersistedCity(cityParam);
    }
  }, [searchParams, setPersistedCity]);

  const handleCityChange = (city: string, precise: boolean = false) => {
    setSelectedCity(city);
    setPersistedCity(city, { precise });
    const params = new URLSearchParams(searchParams.toString());
    if (city && city !== 'All Cities') {
      params.set('city', city);
    } else {
      params.delete('city');
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const handleScroll = () => {
      scrollRef.current = window.scrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const savedPos = sessionStorage.getItem('explore_scroll_pos');
    if (savedPos) {
      const pos = parseInt(savedPos, 10);
      if (!isNaN(pos) && pos > 0) {
        setTimeout(() => {
          window.scrollTo({ top: pos, behavior: 'auto' });
        }, 50);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      sessionStorage.setItem('explore_scroll_pos', String(scrollRef.current));
    };
  }, []);

  // Click-outside listeners for the two floating panels
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCityDropdown(false);
      }
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
        setShowSortDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto detect user location using Geolocation API + distance lookup
  const handleDetectLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude } = pos.coords;
        setUserCoords(latitude, longitude);
        const detected = findClosestCity(latitude, longitude);
        handleCityChange(detected, true);
      },
      () => {
        setIsLocating(false);
        handleCityChange('Hyderabad');
      },
      { timeout: 5000 }
    );
  };

  const effectiveCity = selectedCity === 'All Cities' ? undefined : selectedCity;

  // Price range is sent straight through to the café list endpoint, which
  // already accepts minPrice/maxPrice (see backend/app/api/v1/cafes.py) —
  // no invented backend capability, just wiring up what's already there.
  const minPrice = minPriceInput.trim() ? Number(minPriceInput) : undefined;
  const maxPrice = maxPriceInput.trim() ? Number(maxPriceInput) : undefined;

  // initialData only applies when the visitor's current filters exactly match
  // the unfiltered query fetched server-side — otherwise it would seed a
  // filtered/searched view with the wrong (unfiltered) café list.
  const matchesServerFetchedDefault =
    !effectiveCity && !debouncedQuery && minPrice === undefined && maxPrice === undefined;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.cafes.list({
      query: debouncedQuery || undefined,
      city: effectiveCity,
      minPrice,
      maxPrice,
      limit: 30,
    }),
    queryFn: () =>
      listCafes({
        query: debouncedQuery || undefined,
        city: effectiveCity,
        minPrice,
        maxPrice,
        limit: 30,
      }),
    staleTime: 30_000,
    initialData: matchesServerFetchedDefault ? initialCafes : undefined,
  });

  const cafes = data?.items || [];

  // Filter Logic — every branch derives from the café's actual configured
  // hardware tier names (see lib/platformTags.ts), never from the café's own
  // name. A café called "Velocity Lounge" isn't a console venue just because
  // its name contains "velocity" — that was the root cause of BUG #3 (card
  // showed "PS5 / Consoles" with zero console tiers configured).
  const filteredCafes = cafes.filter((cafe) => {
    if (activeTag === 'PC' && !hasPcTier(cafe.tierNames, cafe.platforms, cafe.platformsComplete)) {
      return false;
    }

    if (activeTag === 'PS5' && !hasPlatformTier('playstation', cafe.tierNames, cafe.platforms, cafe.platformsComplete)) {
      return false;
    }

    if (activeTag === 'Xbox' && !hasPlatformTier('xbox', cafe.tierNames, cafe.platforms, cafe.platformsComplete)) {
      return false;
    }

    if (activeTag === 'Open now' && !isCafeOpenNow(cafe.openingTime, cafe.closingTime)) {
      return false;
    }

    if (minRating != null && !(cafe.averageRating >= minRating)) {
      return false;
    }

    return true;
  });

  const distanceOf = (cafe: CafeListItem): number =>
    userLat != null && userLng != null && cafe.latitude != null && cafe.longitude != null
      ? calculateDistance(userLat, userLng, cafe.latitude, cafe.longitude)
      : Infinity;

  const sortedCafes = [...filteredCafes];
  if (sortBy === 'rating') {
    sortedCafes.sort((a, b) => b.averageRating - a.averageRating);
  } else if (sortBy === 'price') {
    sortedCafes.sort((a, b) => (a.startingPrice ?? Infinity) - (b.startingPrice ?? Infinity));
  } else if (sortBy === 'distance') {
    sortedCafes.sort((a, b) => distanceOf(a) - distanceOf(b));
  }

  const hasActiveFilters =
    activeTag !== 'All' ||
    Boolean(searchQuery) ||
    selectedCity !== 'All Cities' ||
    minPrice !== undefined ||
    maxPrice !== undefined ||
    minRating != null;

  const handleResetFilters = () => {
    setSearchQuery('');
    handleCityChange('All Cities');
    setActiveTag('All');
    setMinPriceInput('');
    setMaxPriceInput('');
    setMinRating(null);
    clearLocation();
  };

  const handleClearAdvancedFilters = () => {
    setMinPriceInput('');
    setMaxPriceInput('');
    setMinRating(null);
  };

  const advancedFilterCount = (minPrice !== undefined ? 1 : 0) + (maxPrice !== undefined ? 1 : 0) + (minRating != null ? 1 : 0);

  const cityDropdownPanel = showCityDropdown && (
    <div className="absolute top-10 left-0 z-50 w-52 rounded-2xl bg-card border border-border/80 shadow-overlay p-2 flex flex-col gap-1 animate-in fade-in">
      {KNOWN_CITIES.map((city) => (
        <button
          key={city}
          onClick={() => {
            handleCityChange(city);
            setShowCityDropdown(false);
          }}
          className={`p-2.5 rounded-xl text-caption font-semibold text-left transition-colors flex items-center justify-between ${
            selectedCity === city
              ? 'bg-primary/10 text-primary font-bold'
              : 'text-text-primary hover:bg-surface'
          }`}
        >
          <span>{city}</span>
          {selectedCity === city && <span>✓</span>}
        </button>
      ))}
      <button
        onClick={() => {
          handleDetectLocation();
          setShowCityDropdown(false);
        }}
        disabled={isLocating}
        className="flex items-center gap-1.5 p-2.5 rounded-xl text-caption font-semibold text-left text-primary hover:bg-primary/5 transition-colors border-t border-border/60 mt-1 pt-2.5"
      >
        <Navigation className={`h-3.5 w-3.5 ${isLocating ? 'animate-spin' : ''}`} />
        <span>{isLocating ? 'Detecting…' : 'Use exact location'}</span>
      </button>
    </div>
  );

  const sortDropdownPanel = showSortDropdown && (
    <div className="absolute top-10 right-0 z-50 w-44 rounded-2xl bg-card border border-border/80 shadow-overlay p-2 flex flex-col gap-1 animate-in fade-in">
      {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
        <button
          key={option}
          onClick={() => {
            setSortBy(option);
            setShowSortDropdown(false);
          }}
          className={`p-2.5 rounded-xl text-caption font-semibold text-left transition-colors flex items-center justify-between ${
            sortBy === option
              ? 'bg-primary/10 text-primary font-bold'
              : 'text-text-primary hover:bg-surface'
          }`}
        >
          <span>{SORT_LABELS[option]}</span>
          {sortBy === option && <span>✓</span>}
        </button>
      ))}
    </div>
  );

  const filterChipsRow = (
    <div className="relative">
      {/* Edge-fades on the trailing side hint that the row scrolls
          horizontally, since chips otherwise clip mid-word at the viewport
          edge with no visual cue. */}
      <div
        className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1"
        style={{ maskImage: 'linear-gradient(to right, black 92%, transparent)', WebkitMaskImage: 'linear-gradient(to right, black 92%, transparent)' }}
      >
        {FILTER_TAGS.map((tag) => {
          const isSelected = activeTag === tag;
          return (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`rounded-full px-4 min-h-[36px] text-caption font-semibold flex-shrink-0 transition-all ${
                isSelected
                  ? 'bg-secondary text-white shadow-card font-bold'
                  : 'bg-card text-text-secondary border border-border hover:bg-surface'
              }`}
            >
              {tag}
            </button>
          );
        })}

        {/* Everything most people never touch (platform-agnostic price
            range, minimum rating) lives behind this one toggle instead of
            adding permanent chips for filters most searches don't need. */}
        <button
          onClick={() => setShowMoreFilters((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full px-4 min-h-[36px] text-caption font-semibold flex-shrink-0 transition-all ${
            showMoreFilters || advancedFilterCount > 0
              ? 'bg-secondary text-white shadow-card font-bold'
              : 'bg-card text-text-secondary border border-border hover:bg-surface'
          }`}
          aria-expanded={showMoreFilters}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>Filters{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ''}</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} />
        </button>

        {hasActiveFilters && (
          <button
            onClick={handleResetFilters}
            className="rounded-full px-3.5 min-h-[36px] text-caption font-bold flex-shrink-0 transition-all text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20"
          >
            Clear ✕
          </button>
        )}
      </div>

      {showMoreFilters && (
        <div className="mt-3">
          <CafeFilterBar
            minPrice={minPriceInput}
            maxPrice={maxPriceInput}
            onMinPriceChange={setMinPriceInput}
            onMaxPriceChange={setMaxPriceInput}
            minRating={minRating}
            onMinRatingChange={setMinRating}
            onClear={handleClearAdvancedFilters}
          />
        </div>
      )}
    </div>
  );

  // The current search location must always be visible, not just implied by
  // an unlabeled pill — so this spells out whether it's the "no location
  // picked yet" state, a GPS fix, or a manually-chosen city.
  const locationLabel =
    selectedCity === 'All Cities'
      ? 'Choose location'
      : isPreciseLocation
        ? `Near you · ${selectedCity}`
        : `Near · ${selectedCity}`;

  return (
    <div className="flex flex-col gap-4 max-w-5xl mx-auto">
      {/* Discovery header — one compact block covering brand tagline,
          search, platform filters, and location/sort, whether or not the
          visitor is signed in. This page is public (see
          (customer)/layout.tsx isPublicPath), so a signed-out visitor or
          crawler lands here directly; the product action (search a café,
          pick a platform, find one) is the page itself, not something
          buried below a marketing hero. */}
      <div className="flex flex-col gap-2.5">
        <div>
          <h1 className="font-heading text-h2 md:text-h1 font-bold text-text-primary tracking-tight">
            {firstName ? `Hey ${firstName}` : 'Find the best gaming cafés'}
          </h1>
          <p className="text-caption text-text-secondary">
            {firstName ? 'Find gaming stations near you' : 'Book your rig. Play more.'}
          </p>
        </div>

        <SearchBarWithSuggestions
          value={searchQuery}
          onChange={setSearchQuery}
          onSelectCity={setSelectedCity}
          onSelectTag={() => {}}
        />

        {filterChipsRow}

        <div className="flex items-center justify-between gap-2">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowCityDropdown(!showCityDropdown)}
              className="flex items-center gap-1 text-caption font-semibold text-text-secondary hover:text-primary transition-colors min-h-[32px]"
              aria-haspopup="listbox"
              aria-expanded={showCityDropdown}
            >
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <span>{locationLabel}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {cityDropdownPanel}
          </div>

          <div className="relative" ref={sortRef}>
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center gap-1 text-caption font-semibold text-text-secondary hover:text-primary transition-colors min-h-[32px]"
              aria-haspopup="listbox"
              aria-expanded={showSortDropdown}
            >
              <span>Sort: {SORT_LABELS[sortBy]}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {sortDropdownPanel}
          </div>
        </div>
      </div>

      {/* Gaming Cafés Grid — one honest list. No fake "featured"/"recommended"
          curation layers: with a handful of cafés live right now, splitting
          the same list into multiple sections just repeats the same cards
          under different labels. Real signals (rating, active-promo badge)
          already surface per-card from real data. */}
      <section className={isLoading ? 'min-h-[350px]' : undefined} ref={cafesGridRef}>
        {isLoading && <SkeletonCafeGrid count={6} />}

        {isError && (
          <ErrorState
            title="Unable to load gaming cafés"
            message={(error as Error)?.message || 'Failed to fetch cafés. Please check your connection.'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && sortedCafes.length === 0 && (
          <EmptyState
            title="No gaming cafés found"
            description={`No cafés match "${searchQuery || activeTag}" in ${selectedCity}.`}
            actionLabel="Clear All Filters"
            onAction={handleResetFilters}
          />
        )}

        {!isLoading && !isError && sortedCafes.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {sortedCafes.map((cafe) => (
              <CafeCard key={cafe.id} cafe={cafe} />
            ))}
          </div>
        )}
      </section>

      {!isAuthenticated && (
        <p className="text-center text-caption text-text-secondary -mt-2">
          <Link href={`/login?redirect=${encodeURIComponent(pathname)}`} className="font-semibold text-primary hover:underline">
            Log in
          </Link>{' '}
          to book a slot and track your bookings.
        </p>
      )}

      {/* Legal Footer Links */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pt-4 pb-2 text-caption text-text-secondary border-t border-border/60">
        <Link href="/terms" className="hover:text-primary transition-colors">Terms &amp; Conditions</Link>
        <Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
        <Link href="/refund-policy" className="hover:text-primary transition-colors">Cancellation &amp; Refunds</Link>
        <Link href="/shipping-policy" className="hover:text-primary transition-colors">Service Delivery</Link>
        <Link href="/contact" className="hover:text-primary transition-colors">Contact Us</Link>
      </div>
    </div>
  );
}
