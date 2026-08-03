'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  MapPin,
  Clock,
  Star,
  ChevronLeft,
  Share2,
  Monitor,
  CheckCircle2,
  Navigation,
} from 'lucide-react';
import { getCafe } from '@/lib/api/cafes';
import { queryKeys } from '@/hooks/queries/keys';
import { Button, RatingDisplay, PriceDisplay, Badge, Skeleton, ErrorState } from '@/components/ui';

export default function CafeDetailPage() {
  const params = useParams();
  const cafeId = params.id as string;

  const [activeTab, setActiveTab] = useState<'amenities' | 'games' | 'reviews'>('amenities');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.cafes.detail(cafeId),
    queryFn: () => getCafe(cafeId).then((res) => res.cafe),
    enabled: Boolean(cafeId),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 max-w-4xl mx-auto py-4">
        <Skeleton className="h-80 w-full rounded-3xl" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-2/3 rounded-xl" />
          <Skeleton className="h-4 w-1/3 rounded-lg" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        title="Café not found"
        message={(error as Error)?.message || 'Could not fetch café details.'}
        onRetry={() => refetch()}
      />
    );
  }

  const cafe = data;
  const primaryPhoto = cafe.photos && cafe.photos.length > 0 ? cafe.photos[0] : null;
  const minPrice = cafe.tiers && cafe.tiers.length > 0 ? Math.min(...cafe.tiers.map((t) => t.pricePerHour)) : 100;

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto pb-28">
      {/* Hero Header Image (Matches Lovable Target) */}
      <div className="relative h-72 md:h-96 w-full overflow-hidden rounded-3xl bg-secondary shadow-float">
        {primaryPhoto ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={primaryPhoto}
            alt={cafe.name}
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : null}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-secondary/80 via-transparent to-black/30" />

        {/* Floating Top Nav Buttons */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
          <Link href="/">
            <button className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 backdrop-blur-md text-secondary shadow-card hover:bg-white transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
          </Link>

          <button className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 backdrop-blur-md text-secondary shadow-card hover:bg-white transition-colors">
            <Share2 className="h-4 w-4" />
          </button>
        </div>

        {/* Carousel Indicators at Bottom Center */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
          <div className="h-2 w-6 rounded-full bg-white" />
          <div className="h-2 w-2 rounded-full bg-white/50" />
          <div className="h-2 w-2 rounded-full bg-white/50" />
        </div>
      </div>

      {/* Title & Metadata Block */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-display text-text-primary">{cafe.name}</h1>
            <p className="text-body text-text-secondary flex items-center gap-1 mt-1">
              <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
              <span>{cafe.addressLine1}, {cafe.city}</span>
            </p>
          </div>

          <div className="flex items-center gap-1 font-heading text-h3 font-bold text-text-primary flex-shrink-0">
            <Star className="h-5 w-5 fill-warning text-warning" />
            <span>{cafe.averageRating ? cafe.averageRating.toFixed(1) : '4.8'}</span>
            <span className="text-caption font-normal text-text-secondary">({cafe.totalReviews || 120} reviews)</span>
          </div>
        </div>

        {/* Status Pills Row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="rounded-full bg-success/10 px-3 py-1 text-caption font-semibold text-success">
            Open now
          </span>
          <span className="rounded-full bg-surface px-3 py-1 text-caption font-semibold text-text-secondary">
            1.2 km away
          </span>
          <span className="rounded-full bg-surface px-3 py-1 text-caption font-semibold text-text-secondary">
            PC Gaming
          </span>
          <span className="rounded-full bg-surface px-3 py-1 text-caption font-semibold text-text-secondary">
            Premium PCs
          </span>
          <span className="rounded-full bg-surface px-3 py-1 text-caption font-semibold text-text-secondary">
            PS5
          </span>
        </div>
      </div>

      {/* Hardware Tiers Section */}
      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-h2 text-text-primary">Hardware tiers</h2>

        {cafe.tiers && cafe.tiers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {cafe.tiers.map((tier) => (
              <div
                key={tier.id}
                className="flex flex-col justify-between p-5 rounded-3xl bg-card border border-border/80 shadow-card hover:shadow-float transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-heading text-h3 text-text-primary">{tier.name}</h3>
                    <Monitor className="h-5 w-5 text-accent" />
                  </div>

                  <div className="flex flex-col gap-1.5 text-caption text-text-secondary mb-4">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-text-primary">⚙ {tier.specs?.gpu || 'RTX 3050'}</span>
                    </div>
                    <div>{tier.specs?.ram || '16GB RAM'}</div>
                    <div>{tier.specs?.monitor || '144Hz display'}</div>
                    <div>{tier.totalSeats || 18} seats</div>
                  </div>
                </div>

                <div className="font-data text-h3 font-bold text-text-primary border-t border-border/60 pt-3">
                  ₹{tier.pricePerHour}<span className="text-caption font-normal text-text-secondary">/hr</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-body text-text-secondary italic">No hardware tiers listed.</p>
        )}
      </section>

      {/* Tabs: Amenities / Games / Reviews */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center rounded-2xl bg-surface p-1.5">
          {[
            { id: 'amenities', label: 'Amenities' },
            { id: 'games', label: 'Games' },
            { id: 'reviews', label: 'Reviews' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-2.5 rounded-xl text-body font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-card text-text-primary shadow-card'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'amenities' && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              'Air conditioned',
              'Free water',
              'Café & snacks',
              'Discord booth',
              'Washroom',
              'Parking',
            ].map((item) => (
              <div
                key={item}
                className="p-3.5 rounded-2xl bg-card border border-border/80 text-body font-medium text-text-primary"
              >
                {item}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Opening Hours & Location Map Row */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-3xl bg-card border border-border/80 flex flex-col gap-2">
          <div className="flex items-center gap-2 font-heading text-h3 text-text-primary">
            <Clock className="h-5 w-5 text-accent" />
            <span>Opening hours</span>
          </div>
          <p className="text-body text-text-secondary mt-1">
            Mon - Sun: 10:00 AM - 2:00 AM
          </p>
        </div>

        <div className="p-5 rounded-3xl bg-card border border-border/80 flex flex-col justify-between gap-4">
          <div className="flex items-center gap-2 font-heading text-h3 text-text-primary">
            <Navigation className="h-5 w-5 text-primary" />
            <span>Location</span>
          </div>

          <div className="h-28 w-full rounded-2xl bg-surface/80 border border-border flex items-center justify-center text-caption text-text-secondary">
            [ Interactive Map ]
          </div>

          <Button variant="secondary" size="md" fullWidth className="gap-2">
            <span>Get directions</span>
          </Button>
        </div>
      </section>

      {/* Sticky Bottom Action Bar (Dark Button like Lovable) */}
      <div className="fixed bottom-0 left-0 right-0 z-sticky bg-card/95 backdrop-blur-md border-t border-border/80 p-4 shadow-overlay">
        <div className="max-w-content mx-auto flex items-center justify-between gap-4">
          <div>
            <span className="text-overline text-text-secondary">Starting from</span>
            <div className="font-data text-price-lg font-bold text-text-primary">
              ₹{minPrice}<span className="text-caption font-normal text-text-secondary">/hr</span>
            </div>
          </div>

          <Link href={`/bookings/new?cafeId=${cafe.id}`}>
            <button className="rounded-2xl bg-secondary px-8 py-3.5 font-heading text-btn font-semibold text-white shadow-float hover:bg-secondary/90 transition-colors">
              Book now
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
