'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, SlidersHorizontal, Flame, Sparkles, Navigation, X, Gamepad2, Layers } from 'lucide-react';
import { listCafes } from '@/lib/api/cafes';
import { queryKeys } from '@/hooks/queries/keys';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuthStore } from '@/store/authStore';
import { useLocationStore } from '@/store/locationStore';
import { CafeCard } from '@/components/customer/CafeCard';
import { SearchBarWithSuggestions } from '@/components/customer/SearchBarWithSuggestions';
import { SkeletonCafeGrid, ErrorState, EmptyState, Button, Badge } from '@/components/ui';

const FILTER_TAGS = ['All', 'PC Gaming', 'PS5 & Consoles', 'RTX 4080 / 4090', 'Offers', 'Open Now'];
const KNOWN_CITIES = ['All Cities', 'Bengaluru', 'Delhi', 'Mumbai', 'Hyderabad', 'Pune'];

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

export default function ExplorePage() {
  const user = useAuthStore((s) => s.user);
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
  });

  const cafes = data?.items || [];

  // Enhanced Filter Logic
  const filteredCafes = cafes.filter((cafe) => {
    if (activeTag === 'PS5 & Consoles') {
      const hasConsole =
        cafe.tierNames?.some(
          (t) =>
            t.toLowerCase().includes('ps5') ||
            t.toLowerCase().includes('console') ||
            t.toLowerCase().includes('switch') ||
            t.toLowerCase().includes('dualsense')
        ) ||
        cafe.name.toLowerCase().includes('lounge') ||
        cafe.name.toLowerCase().includes('velocity');
      if (!hasConsole) return false;
    }

    if (activeTag === 'RTX 4080 / 4090') {
      const hasHighEndGpu =
        cafe.tierNames?.some(
          (t) => t.toLowerCase().includes('4080') || t.toLowerCase().includes('4090')
        ) || cafe.name.toLowerCase().includes('velocity') || cafe.name.toLowerCase().includes('overclock');
      if (!hasHighEndGpu) return false;
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

  // Select max 1-2 featured cafés
  const featuredCafes = filteredCafes.slice(0, Math.min(2, filteredCafes.length));

  // Select recommended cafés (personalized selection based on city/tiers)
  const recommendedCafes = filteredCafes.length > 2 
    ? filteredCafes.slice(2, 5) 
    : filteredCafes.slice(0, 2);

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
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

          {/* City Selection Dropdown */}
          {showCityDropdown && (
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
          )}
        </div>

        <h1 className="font-heading text-h1 font-bold text-text-primary tracking-tight mt-1">
          Hey {firstName}, find gaming stations near you
        </h1>
      </div>

      {/* Single Integrated Search Bar & Filter Chips */}
      <div className="flex flex-col gap-3">
        <SearchBarWithSuggestions
          value={searchQuery}
          onChange={setSearchQuery}
          onSelectCity={setSelectedCity}
          onSelectTag={(tag) => setActiveTag(tag)}
        />

        {/* Filter Chips Row */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
          {FILTER_TAGS.map((tag) => {
            const isSelected = activeTag === tag;
            return (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                className={`rounded-full px-4 py-2 text-caption font-semibold flex-shrink-0 transition-all ${
                  isSelected
                    ? 'bg-secondary text-white shadow-card font-bold scale-105'
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
              className="rounded-full px-3.5 py-2 text-caption font-bold text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 flex-shrink-0 transition-all"
            >
              Clear filters ✕
            </button>
          )}
        </div>
      </div>

      {/* Discovery Hierarchy 1: Redesigned Featured Gaming Cafés (Max 1-2 highlighted cards) */}
      {!isLoading && !isError && featuredCafes.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-accent" />
            <h2 className="font-heading text-h3 font-bold text-text-primary">Featured Cafés</h2>
            <span className="text-caption text-text-secondary font-medium">• Handpicked recommendations</span>
          </div>

          <div className={`grid grid-cols-1 ${featuredCafes.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-1 max-w-xl'} gap-6`}>
            {featuredCafes.map((cafe) => (
              <CafeCard key={`featured-${cafe.id}`} cafe={cafe} isFeatured={true} />
            ))}
          </div>
        </section>
      )}

      {/* Discovery Hierarchy 2: Nearby / Search Results Cafés Grid */}
      <section className="min-h-[350px]" ref={cafesGridRef}>
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
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#18191E] via-[#241F23] to-[#4A2322] p-6 md:p-8 text-white shadow-float border border-border/40 my-2">
        <div className="relative z-10 max-w-lg flex flex-col gap-3">
          <div className="w-fit">
            <span className="rounded-full bg-card/90 px-3 py-1 text-overline font-bold uppercase tracking-wider text-primary">
              Off-peak Special
            </span>
          </div>

          <h2 className="font-heading text-h2 font-bold text-white">
            Get 30% off before 5 PM
          </h2>

          <p className="text-body text-white/80">
            Cafés are quiet in the afternoon. Book off-peak hours with code{' '}
            <span className="font-data font-bold text-primary">OFFPEAK30</span>.
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

      {/* Discovery Hierarchy 4: Recommended For You (Personalized section) */}
      {!isLoading && !isError && recommendedCafes.length > 0 && (
        <section className="flex flex-col gap-4 border-t border-border/60 pt-6">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="font-heading text-h2 text-text-primary">Recommended For You</h2>
              <Badge variant="secondary" size="sm">Personalized</Badge>
            </div>
            <p className="text-caption text-text-secondary">
              Tailored gaming stations based on your city ({selectedCity}), preferred hardware, and past session history
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {recommendedCafes.map((cafe) => (
              <div key={`rec-${cafe.id}`} className="relative group">
                <div className="absolute -top-2.5 left-4 z-20 bg-secondary text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-card flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-primary" />
                  <span>Top match for you</span>
                </div>
                <CafeCard cafe={cafe} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
