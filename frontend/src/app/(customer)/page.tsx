'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { MapPin, SlidersHorizontal, Flame, Sparkles, Navigation, ChevronLeft, ChevronRight, Store, ArrowRight } from 'lucide-react';
import { listCafes } from '@/lib/api/cafes';
import { queryKeys } from '@/hooks/queries/keys';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuthStore } from '@/store/authStore';
import { CafeCard } from '@/components/customer/CafeCard';
import { SearchBarWithSuggestions } from '@/components/customer/SearchBarWithSuggestions';
import { SkeletonCafeGrid, ErrorState, EmptyState } from '@/components/ui';

const FILTER_TAGS = ['PC Gaming', 'PS5', 'Premium PCs', 'Offers', 'Open Now'];
const KNOWN_CITIES = ['Hyderabad', 'Bengaluru', 'Chennai', 'Pune', 'Mumbai', 'Delhi', 'Kochi', 'Ahmedabad', 'Kolkata'];

const PROMO_BANNERS = [
  {
    id: 1,
    tag: 'Off-Peak Offer',
    title: 'Get 30% Off Before 5 PM',
    description: 'Cafés are empty in the afternoon. We pass the savings to you — use code OFFPEAK30.',
    cta: 'Claim 30% Off',
    gradient: 'from-[#18191E] via-[#241F23] to-[#4A2322]',
    code: 'OFFPEAK30',
  },
  {
    id: 2,
    tag: 'Tournament Pass',
    title: 'Weekend Valorant 5v5 Scrim Pass',
    description: 'Book 5 rigs together for 4 hours and get free Monster energy drinks & snack platters.',
    cta: 'Book Squad Pass',
    gradient: 'from-[#0D1F1C] via-[#102A24] to-[#1A3D34]',
    code: 'SQUADPASS',
  },
  {
    id: 3,
    tag: 'Night Owl Special',
    title: 'Midnight All-Nighter (11 PM - 6 AM)',
    description: 'Flat ₹499 for unlimited gaming all night at verified RTX 4080 partner lounges.',
    cta: 'Explore Night Lounges',
    gradient: 'from-[#1B1528] via-[#241A38] to-[#361E4C]',
    code: 'NIGHTOWL',
  },
];

export default function ExplorePage() {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.fullName ? user.fullName.split(' ')[0] : 'Gamer';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('Bengaluru');
  const [selectedTags, setSelectedTags] = useState<string[]>(['PC Gaming']);
  const [isLocating, setIsLocating] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  const debouncedQuery = useDebounce(searchQuery, 300);

  // Auto-slide banner carousel every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % PROMO_BANNERS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Auto detect user location using Geolocation API + Reverse Geocoding
  const handleDetectLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          const json = await res.json();
          const cityCandidate =
            json.address?.city ||
            json.address?.state_district ||
            json.address?.state ||
            'Bengaluru';

          const matchedCity = KNOWN_CITIES.find((c) =>
            cityCandidate.toLowerCase().includes(c.toLowerCase())
          ) || 'Bengaluru';

          setSelectedCity(matchedCity);
        } catch {
          setSelectedCity('Bengaluru');
        } finally {
          setIsLocating(false);
        }
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
      limit: 50,
    }),
    queryFn: () =>
      listCafes({
        query: debouncedQuery || undefined,
        city: selectedCity || undefined,
        limit: 50,
      }),
    staleTime: 0,
  });

  const cafes = data?.items || [];

  // Filter cafes by selected tags
  const filteredCafes = cafes.filter((cafe) => {
    if (selectedTags.includes('PS5')) {
      const hasPs5 = cafe.tierNames?.some((t) => t.toLowerCase().includes('ps5') || t.toLowerCase().includes('console')) ||
                     cafe.amenities?.some((a) => a.toLowerCase().includes('ps5'));
      if (!hasPs5) return false;
    }
    if (selectedTags.includes('Offers') && !cafe.hasActivePromotion) {
      return false;
    }
    return true;
  });

  // Section categorization
  const featuredCafe = filteredCafes[0] || cafes[0];
  const nearbyCafes = filteredCafes.slice(1, 9);
  const recommendedCafes = filteredCafes.slice(9, 21);

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

  const activeBanner = PROMO_BANNERS[currentBannerIndex];

  return (
    <div className="flex flex-col gap-10">
      {/* 1. Location Header */}
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

      {/* 2. Search Bar & Filter Chips */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <SearchBarWithSuggestions
            value={searchQuery}
            onChange={setSearchQuery}
            onSelectCity={setSelectedCity}
            onSelectTag={(tag) => setSelectedTags([...selectedTags, tag])}
          />

          <button
            onClick={handleResetFilters}
            className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-full border border-border bg-card text-text-primary shadow-card hover:bg-surface transition-all flex-shrink-0 hover:shadow-float active:scale-95"
            title="Reset Filters"
          >
            <SlidersHorizontal className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
          {FILTER_TAGS.map((tag) => {
            const isSelected = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`rounded-full px-5 py-2 min-h-[44px] text-caption font-semibold flex-shrink-0 transition-all ${
                  isSelected
                    ? 'bg-secondary text-white shadow-card font-bold'
                    : 'bg-card text-text-secondary border border-border hover:bg-surface hover:-translate-y-0.5'
                }`}
              >
                {tag}
              </button>
            );
          })}

          {(selectedTags.length > 0 || searchQuery) && (
            <button
              onClick={handleResetFilters}
              className="rounded-full px-5 py-2 min-h-[44px] text-caption font-bold text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 flex-shrink-0 transition-all hover:-translate-y-0.5"
            >
              Clear filters ✕
            </button>
          )}
        </div>
      </div>

      {/* Loading / Error States */}
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
          description={`No verified cafés match your current filter settings for ${selectedCity}.`}
          actionLabel="Clear All Filters"
          onAction={handleResetFilters}
        />
      )}

      {!isLoading && !isError && filteredCafes.length > 0 && (
        <>
          {/* 3. Featured Café Spotlight Banner (On Top) */}
          {featuredCafe && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2 px-1">
                <Flame className="h-5 w-5 text-accent animate-pulse" />
                <h2 className="font-heading text-h3 font-bold text-text-primary">Featured Spotlight</h2>
              </div>

              <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-card to-surface p-5 shadow-float group">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  <div className="md:col-span-7 flex flex-col gap-3 z-10">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-primary/15 text-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider">
                        ★ Top Rated
                      </span>
                      <span className="text-caption text-text-secondary font-medium">
                        {featuredCafe.city}, {featuredCafe.state}
                      </span>
                    </div>

                    <h3 className="font-heading text-h1 font-bold text-text-primary group-hover:text-primary transition-colors">
                      {featuredCafe.name}
                    </h3>

                    <p className="text-body text-text-secondary line-clamp-2">
                      {featuredCafe.description}
                    </p>

                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <span className="rounded-full bg-card border border-border px-3 py-1 text-caption font-bold text-text-primary shadow-sm">
                        From ₹{featuredCafe.startingPrice || 120}/hr
                      </span>
                      {featuredCafe.tierNames?.slice(0, 2).map((t) => (
                        <span key={t} className="rounded-full bg-card/60 border border-border/60 px-3 py-1 text-caption font-medium text-text-secondary">
                          {t}
                        </span>
                      ))}
                    </div>

                    <div className="pt-2">
                      <Link
                        href={`/cafe/${featuredCafe.id}`}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-btn font-bold text-white shadow-card hover:bg-primary/90 transition-all hover:-translate-y-1 hover:shadow-float"
                      >
                        <span>Book Instant Rig</span>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>

                  <div className="md:col-span-5 relative aspect-[16/9] md:aspect-[4/3] rounded-2xl overflow-hidden shadow-card">
                    {featuredCafe.photos?.[0] ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={featuredCafe.photos[0]}
                        alt={featuredCafe.name}
                        className="h-full w-full object-cover transition-transform duration-slow group-hover:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full bg-secondary flex items-center justify-center p-4 text-white font-heading text-h3 text-center">
                        {featuredCafe.name}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 4. Auto-Changing Promotional Banner Carousel */}
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r transition-all duration-700 ease-in-out p-6 md:p-8 text-white shadow-float border border-border/40 min-h-[200px] flex flex-col justify-between group"
            style={{
              backgroundImage: `linear-gradient(to right, var(--tw-gradient-stops))`,
            }}
          >
            <div className={`rounded-3xl p-6 md:p-8 bg-gradient-to-r ${activeBanner.gradient} absolute inset-0 transition-opacity duration-700`} />
            
            <div className="relative z-10 max-w-xl flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-card/90 px-3.5 py-1 text-overline font-bold uppercase tracking-wider text-primary border border-primary/20">
                  {activeBanner.tag}
                </span>

                {/* Banner Carousel Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentBannerIndex((prev) => (prev === 0 ? PROMO_BANNERS.length - 1 : prev - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-card/40 hover:bg-card/80 text-white transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-caption font-bold text-white/80">
                    {currentBannerIndex + 1}/{PROMO_BANNERS.length}
                  </span>
                  <button
                    onClick={() => setCurrentBannerIndex((prev) => (prev + 1) % PROMO_BANNERS.length)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-card/40 hover:bg-card/80 text-white transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <h2 className="font-heading text-display text-white">
                {activeBanner.title}
              </h2>

              <p className="text-body text-white/80">
                {activeBanner.description}
              </p>

              <div className="pt-2">
                <button
                  onClick={() => setSelectedTags([...selectedTags, 'Offers'])}
                  className="rounded-full bg-white px-6 py-2.5 text-btn font-bold text-secondary shadow-card hover:bg-surface transition-colors"
                >
                  {activeBanner.cta}
                </button>
              </div>
            </div>

            {/* Pagination Indicators */}
            <div className="relative z-10 flex items-center justify-center gap-2 pt-4">
              {PROMO_BANNERS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentBannerIndex(i)}
                  className={`h-2 rounded-full transition-all ${
                    currentBannerIndex === i ? 'w-8 bg-primary' : 'w-2 bg-white/40'
                  }`}
                />
              ))}
            </div>
          </section>

          {/* 5. Nearby Gaming Cafés Grid */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-heading text-h2 text-text-primary">Nearby Gaming Cafés</h2>
                <p className="text-caption text-text-secondary">
                  Closest venues near {selectedCity} with instant online seat confirmation
                </p>
              </div>
              <span className="text-caption font-bold text-primary">
                {nearbyCafes.length} cafes near you
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {nearbyCafes.map((cafe) => (
                <CafeCard key={cafe.id} cafe={cafe} />
              ))}
            </div>
          </section>

          {/* 6. Recommended For You Based On Interests */}
          {recommendedCafes.length > 0 && (
            <section className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="font-heading text-h2 text-text-primary">Recommended For You</h2>
                  <p className="text-caption text-text-secondary">
                    Hand-picked cafes matching high FPS PC specs & community ratings
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {recommendedCafes.map((cafe) => (
                  <CafeCard key={cafe.id} cafe={cafe} />
                ))}
              </div>
            </section>
          )}

          {/* 7. Bottom CTA: Own a Gaming Cafe Banner */}
          <section className="relative overflow-hidden rounded-3xl bg-card border-2 border-primary/40 p-8 shadow-float flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary flex-shrink-0">
                <Store className="h-8 w-8" />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="font-heading text-h2 text-text-primary">Own a Gaming Café?</h3>
                <p className="text-body text-text-secondary max-w-xl">
                  Partner with KHEL-O to list your hardware tiers, manage seat reservations, boost off-peak revenue, and reach thousands of local gamers.
                </p>
              </div>
            </div>

            <Link
              href="/register?role=cafe_owner"
              className="rounded-full bg-primary px-8 py-3.5 text-btn font-bold text-secondary shadow-card hover:bg-primary/90 transition-all flex-shrink-0 hover:scale-105"
            >
              List Your Café Now →
            </Link>
          </section>
        </>
      )}
    </div>
  );
}

