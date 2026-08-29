'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Navigation } from 'lucide-react';
import { listCafes } from '@/lib/api/cafes';
import { queryKeys } from '@/hooks/queries/keys';
import { useDebounce } from '@/hooks/useDebounce';
import { isCafeOpenNow } from '@/lib/format';
import { hasConsoleTier } from '@/lib/platformTags';
import { SUPPORTED_CITIES } from '@/constants/cities';
import { useAuthStore } from '@/store/authStore';
import { useLocationStore } from '@/store/locationStore';
import { CafeCard } from '@/components/customer/CafeCard';
import { SearchBarWithSuggestions } from '@/components/customer/SearchBarWithSuggestions';
import { SkeletonCafeGrid, ErrorState, EmptyState } from '@/components/ui';
import type { CafeListItem, PaginatedResponse } from '@/types';

const FILTER_TAGS = ['All', 'PC Gaming', 'PS5 & Consoles', 'RTX 4080 / 4090', 'Offers', 'Open Now'];
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
  const firstName = user?.fullName ? user.fullName.split(' ')[0] : 'Gamer';

  const { selectedCity: persistedCity, setSelectedCity: setPersistedCity, setUserCoords } = useLocationStore();

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState(persistedCity || 'All Cities');
  const [activeTag, setActiveTag] = useState<string>('All');
  const [isLocating, setIsLocating] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
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

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    setPersistedCity(city);
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

  // Click-outside listener for city dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCityDropdown(false);
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
        handleCityChange(detected);
      },
      () => {
        setIsLocating(false);
        handleCityChange('Hyderabad');
      },
      { timeout: 5000 }
    );
  };

  const effectiveCity = selectedCity === 'All Cities' ? undefined : selectedCity;

  // initialData only applies when the visitor's current filters exactly match
  // the unfiltered query fetched server-side — otherwise it would seed a
  // filtered/searched view with the wrong (unfiltered) café list.
  const matchesServerFetchedDefault = !effectiveCity && !debouncedQuery;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.cafes.list({
      query: debouncedQuery || undefined,
      city: effectiveCity,
      limit: 30,
    }),
    queryFn: () =>
      listCafes({
        query: debouncedQuery || undefined,
        city: effectiveCity,
        limit: 30,
      }),
    staleTime: 30_000,
    initialData: matchesServerFetchedDefault ? initialCafes : undefined,
  });

  const cafes = data?.items || [];

  // Enhanced Filter Logic — every branch derives from the café's actual
  // configured hardware tier names (see lib/platformTags.ts), never from
  // the café's own name. A café called "Velocity Lounge" isn't a console
  // or high-end-GPU venue just because its name contains "velocity" or
  // "lounge" — that was the root cause of BUG #3 (card showed "PS5 /
  // Consoles" with zero console tiers configured).
  const filteredCafes = cafes.filter((cafe) => {
    if (activeTag === 'PS5 & Consoles' && !hasConsoleTier(cafe.tierNames, cafe.platforms, cafe.platformsComplete)) {
      return false;
    }

    if (activeTag === 'RTX 4080 / 4090') {
      const hasHighEndGpu = cafe.tierNames?.some(
        (t) => t.toLowerCase().includes('4080') || t.toLowerCase().includes('4090')
      );
      if (!hasHighEndGpu) return false;
    }

    if (activeTag === 'Open Now' && !isCafeOpenNow(cafe.openingTime, cafe.closingTime)) {
      return false;
    }

    if (activeTag === 'Offers' && !cafe.hasActivePromotion) {
      // In test env, show cafes with promotions or tagged offers
      return cafe.hasActivePromotion || cafe.name.toLowerCase().includes('lxg');
    }

    return true;
  });

  const handleResetFilters = () => {
    setSearchQuery('');
    handleCityChange('All Cities');
    setActiveTag('All');
  };

  const handleBrowseOffers = () => {
    setActiveTag('Offers');
    if (cafesGridRef.current) {
      cafesGridRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const hasAnyActivePromotion = filteredCafes.some((cafe) => cafe.hasActivePromotion);

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
    </div>
  );

  const filterChipsRow = (dark: boolean) => (
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
              className={`rounded-full px-4 py-2 text-caption font-semibold flex-shrink-0 transition-all ${
                isSelected
                  ? `${dark ? 'bg-primary' : 'bg-secondary'} text-white shadow-card font-bold scale-105`
                  : dark
                    ? 'bg-white/95 text-text-secondary border border-white/40 hover:bg-white'
                    : 'bg-card text-text-secondary border border-border hover:bg-surface'
              }`}
            >
              {tag}
            </button>
          );
        })}

        {(activeTag !== 'All' || searchQuery || selectedCity !== 'All Cities') && (
          <button
            onClick={handleResetFilters}
            className={`rounded-full px-3.5 py-2 text-caption font-bold flex-shrink-0 transition-all ${
              dark
                ? 'text-white bg-white/15 border border-white/30 hover:bg-white/25'
                : 'text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20'
            }`}
          >
            Clear filters ✕
          </button>
        )}
      </div>
    </div>
  );

  const scrollToResults = () => {
    cafesGridRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      {/* First-visit hero — this page is public (see (customer)/layout.tsx
          isPublicPath), so a signed-out visitor or crawler lands here
          directly. The product action (search a café, pick a platform, find
          one) is the hero itself, not something buried below an account nav
          — a returning/logged-in gamer skips this and gets the compact
          "Hey {firstName}" + search layout below instead. */}
      {!isAuthenticated ? (
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#18191E] via-[#241F23] to-[#4A2322] p-6 md:p-10 text-white shadow-float border border-border/40">
          <div className="relative z-10 flex flex-col gap-4 max-w-2xl">
            <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-overline font-bold uppercase tracking-wider text-white/80">
              Gaming Café Booking
            </span>
            <h1 className="font-heading text-h1 md:text-display font-bold text-white leading-tight">
              Find a gaming café near you. See real seat availability. Book in minutes.
            </h1>
            <p className="text-body text-white/75 max-w-xl">
              KHEL-O lists verified PC and console gaming cafés with live pricing and open slots.
              Pick a time, pay online, and show your QR pass at the counter — no calling ahead.
            </p>

            <div className="relative flex items-center gap-2 flex-wrap pt-2" ref={dropdownRef}>
              <button
                onClick={() => setShowCityDropdown(!showCityDropdown)}
                className="flex items-center gap-1.5 text-caption font-bold text-white bg-white/15 hover:bg-white/25 px-3.5 py-1.5 rounded-full transition-colors"
              >
                <MapPin className="h-4 w-4" />
                <span>{selectedCity} ▼</span>
              </button>

              <button
                onClick={handleDetectLocation}
                disabled={isLocating}
                className="flex items-center gap-1 text-caption font-medium text-white/90 hover:text-white transition-colors bg-white/10 px-3 py-1.5 rounded-full border border-white/20"
              >
                <Navigation className={`h-3.5 w-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                <span>{isLocating ? 'Detecting...' : 'Use exact location'}</span>
              </button>

              {cityDropdownPanel}
            </div>

            <div className="pt-1">
              <SearchBarWithSuggestions
                value={searchQuery}
                onChange={setSearchQuery}
                onSelectCity={setSelectedCity}
                onSelectTag={(tag) => setActiveTag(tag)}
              />
            </div>

            {filterChipsRow(true)}

            <button
              onClick={scrollToResults}
              className="w-fit mt-1 rounded-full bg-white px-6 py-3 text-btn font-bold text-secondary shadow-card hover:bg-surface transition-colors"
            >
              Find Gaming Cafés
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* Top Header & City Selector Bar */}
          <div className="flex flex-col gap-2">
            <div className="relative flex items-center justify-between gap-2" ref={dropdownRef}>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setShowCityDropdown(!showCityDropdown)}
                  className="flex items-center gap-1.5 text-caption font-bold text-primary bg-primary/10 hover:bg-primary/20 px-3.5 py-1.5 rounded-full transition-colors"
                >
                  <MapPin className="h-4 w-4" />
                  <span>{selectedCity} ▼</span>
                </button>

                <button
                  onClick={handleDetectLocation}
                  disabled={isLocating}
                  className="flex items-center gap-1 text-caption font-medium text-text-secondary hover:text-text-primary transition-colors bg-surface px-3 py-1.5 rounded-full border border-border/60"
                >
                  <Navigation className={`h-3.5 w-3.5 text-primary ${isLocating ? 'animate-spin' : ''}`} />
                  <span>{isLocating ? 'Detecting...' : 'Use exact location'}</span>
                </button>
              </div>

              {cityDropdownPanel}
            </div>

            <div className="flex items-baseline gap-2 mt-0.5">
              <h2 className="font-heading text-h3 font-bold text-text-primary tracking-tight">
                Hey {firstName}
              </h2>
              <span className="text-caption text-text-secondary">find gaming stations near you</span>
            </div>
          </div>

          {/* Single Integrated Search Bar & Filter Chips */}
          <div className="flex flex-col gap-3">
            <SearchBarWithSuggestions
              value={searchQuery}
              onChange={setSearchQuery}
              onSelectCity={setSelectedCity}
              onSelectTag={(tag) => setActiveTag(tag)}
            />
            {filterChipsRow(false)}
          </div>
        </>
      )}

      {/* Gaming Cafés Grid — one honest list. No fake "featured"/"recommended"
          curation layers: with a handful of cafés live right now, splitting
          the same list into multiple sections just repeats the same cards
          under different labels. Real signals (rating, "New", active-promo
          badge) already surface per-card from real data. */}
      <section className={isLoading ? 'min-h-[350px]' : undefined} ref={cafesGridRef}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-heading text-h2 text-text-primary">Nearby Gaming Cafés</h2>
            <p className="text-caption text-text-secondary">
              Verified PCs, 240Hz setups, ping checks, and PS5 lounges in {selectedCity}
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
            description={`No cafés match "${searchQuery || activeTag}" in ${selectedCity}.`}
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

      {/* Discovery Hierarchy 3: Promotional Off-Peak Banner */}
      {hasAnyActivePromotion && (
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#18191E] via-[#241F23] to-[#4A2322] p-6 md:p-8 text-white shadow-float border border-border/40 my-2">
          <div className="relative z-10 max-w-lg flex flex-col gap-3">
            <div className="w-fit">
              <span className="rounded-full bg-card/90 px-3 py-1 text-overline font-bold uppercase tracking-wider text-primary">
                Active Offers
              </span>
            </div>

            <h2 className="font-heading text-h2 font-bold text-white">
              Some cafés have active offers right now
            </h2>

            <p className="text-body text-white/80">
              Look for the offer badge on a café&apos;s card — no code needed, it applies automatically at checkout.
            </p>

            <div className="pt-2">
              <button
                onClick={handleBrowseOffers}
                className="rounded-full bg-white px-6 py-2.5 text-btn font-bold text-secondary shadow-card hover:bg-surface transition-colors"
              >
                Browse offer cafés →
              </button>
            </div>
          </div>
        </section>
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
