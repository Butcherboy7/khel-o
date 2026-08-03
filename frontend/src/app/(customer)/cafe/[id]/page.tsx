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
  ChevronRight,
  Share2,
  Monitor,
  CheckCircle2,
  Navigation,
  Gamepad2,
} from 'lucide-react';
import { getCafe } from '@/lib/api/cafes';
import { queryKeys } from '@/hooks/queries/keys';
import { Button, RatingDisplay, PriceDisplay, Badge, Skeleton, ErrorState } from '@/components/ui';
import { GoogleLocationDisplay } from '@/components/maps/GoogleLocationDisplay';
import { ShareModal } from '@/components/customer/ShareModal';

const DEFAULT_PHOTOS = [
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=1200&q=80',
];

export default function CafeDetailPage() {
  const params = useParams();
  const cafeId = params.id as string;

  const [activeTab, setActiveTab] = useState<'amenities' | 'games' | 'reviews'>('amenities');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [isShareOpen, setIsShareOpen] = useState(false);

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
  const photosList = cafe.photos && cafe.photos.length > 0 ? cafe.photos : DEFAULT_PHOTOS;
  const currentPhoto = photosList[photoIndex % photosList.length];
  const minPrice = cafe.tiers && cafe.tiers.length > 0 ? Math.min(...cafe.tiers.map((t) => t.pricePerHour)) : 100;

  const nextPhoto = () => setPhotoIndex((prev) => (prev + 1) % photosList.length);
  const prevPhoto = () => setPhotoIndex((prev) => (prev - 1 + photosList.length) % photosList.length);

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto pb-28">
      {/* Hero Header Image with Gallery Arrows */}
      <div className="relative h-72 md:h-96 w-full overflow-hidden rounded-3xl bg-secondary shadow-float group">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentPhoto}
          alt={`${cafe.name} photo ${photoIndex + 1}`}
          className="h-full w-full object-cover transition-all duration-300"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-secondary/80 via-transparent to-black/30" />

        {/* Top Controls */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
          <Link href="/">
            <button className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 backdrop-blur-md text-secondary shadow-card hover:bg-white transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
          </Link>

          <button
            onClick={() => setIsShareOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 backdrop-blur-md text-secondary shadow-card hover:bg-white transition-colors"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>

        {/* Desktop Carousel Arrows */}
        {photosList.length > 1 && (
          <>
            <button
              onClick={prevPhoto}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md hover:bg-black/60 transition-colors opacity-0 group-hover:opacity-100"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={nextPhoto}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md hover:bg-black/60 transition-colors opacity-0 group-hover:opacity-100"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {/* Photo Indicators */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
          {photosList.map((_, idx) => (
            <div
              key={idx}
              className={`h-2 rounded-full transition-all ${
                idx === photoIndex ? 'w-6 bg-white' : 'w-2 bg-white/50'
              }`}
            />
          ))}
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
                className="p-3.5 rounded-2xl bg-card border border-border/80 text-body font-medium text-text-primary flex items-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'games' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {['Valorant', 'Counter-Strike 2', 'GTA V', 'EA FC 24', 'Cyberpunk 2077', 'Apex Legends', 'Dota 2', 'Fortnite'].map((game) => (
              <div
                key={game}
                className="p-3.5 rounded-2xl bg-card border border-border/80 flex items-center gap-2.5 font-medium text-body text-text-primary"
              >
                <Gamepad2 className="h-4 w-4 text-accent" />
                <span>{game}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="flex flex-col gap-3">
            {[
              { name: 'Rohan M.', rating: 5, comment: 'Insane 240Hz monitors! Ultra smooth ping for Valorant ranked.' },
              { name: 'Ananya S.', rating: 5, comment: 'Super clean lounge, great snacks, and friendly staff.' },
              { name: 'Karan P.', rating: 4, comment: 'PS5 dualsense controllers were brand new. Great experience.' },
            ].map((rev, i) => (
              <div key={i} className="p-4 rounded-2xl bg-card border border-border/80 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-heading text-body font-bold text-text-primary">{rev.name}</span>
                  <div className="flex items-center text-warning">
                    <Star className="h-4 w-4 fill-warning" />
                    <span className="text-caption font-bold ml-1">{rev.rating}.0</span>
                  </div>
                </div>
                <p className="text-caption text-text-secondary">{rev.comment}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Opening Hours & Interactive Google Map Row */}
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

          <GoogleLocationDisplay
            lat={cafe.latitude}
            lng={cafe.longitude}
            venueName={cafe.name}
          />

          <Button
            variant="secondary"
            size="md"
            fullWidth
            className="gap-2"
            onClick={() => {
              const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                `${cafe.name}, ${cafe.addressLine1}, ${cafe.city}`
              )}`;
              window.open(url, '_blank');
            }}
          >
            <span>Get directions on Google Maps</span>
          </Button>
        </div>
      </section>

      {/* Sticky Bottom Action Bar */}
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

      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        title={cafe.name}
      />
    </div>
  );
}
