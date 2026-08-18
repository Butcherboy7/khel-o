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
  Navigation,
  Gamepad2,
} from 'lucide-react';
import { getCafe } from '@/lib/api/cafes';
import { listCafeReviews, createReview } from '@/lib/api/reviews';
import { getAmenityDisplay } from '@/lib/amenities';
import { listBookings } from '@/lib/api/bookings';
import { queryKeys } from '@/hooks/queries/keys';
import { Button, RatingDisplay, PriceDisplay, Badge, Skeleton, ErrorState } from '@/components/ui';
import { GoogleLocationDisplay } from '@/components/maps/GoogleLocationDisplay';
import { ShareModal } from '@/components/customer/ShareModal';

import { useAuthStore } from '@/store/authStore';
import { useLocationStore } from '@/store/locationStore';
import { calculateDistance, formatDistance } from '@/lib/format';

const DEFAULT_PHOTOS = [
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=1200&q=80',
];

export default function CafeDetailPage() {
  const params = useParams();
  const cafeId = params.id as string;
  const user = useAuthStore((s) => s.user);
  const { userLat, userLng } = useLocationStore();

  const [activeTab, setActiveTab] = useState<'amenities' | 'games' | 'reviews'>('amenities');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [submittedReview, setSubmittedReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.cafes.detail(cafeId),
    queryFn: () => getCafe(cafeId).then((res) => res.cafe),
    enabled: Boolean(cafeId),
    staleTime: 60_000,
  });

  const { data: serverReviewsData, refetch: refetchReviews } = useQuery({
    queryKey: ['cafe-reviews', cafeId],
    queryFn: () => listCafeReviews(cafeId),
    enabled: Boolean(cafeId),
  });

  const { data: userBookingsData } = useQuery({
    queryKey: ['user-cafe-bookings', cafeId, user?.id],
    queryFn: () => listBookings({ limit: 20 }),
    enabled: Boolean(user?.id && cafeId),
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
  const distanceLabel =
    userLat != null && userLng != null && cafe.latitude != null && cafe.longitude != null
      ? formatDistance(calculateDistance(userLat, userLng, cafe.latitude, cafe.longitude))
      : null;
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
            <span>{cafe.averageRating && cafe.averageRating > 0 ? cafe.averageRating.toFixed(1) : 'New'}</span>
            <span className="text-caption font-normal text-text-secondary">
              ({cafe.totalReviews || 0} review{cafe.totalReviews === 1 ? '' : 's'})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="rounded-full bg-success/10 px-3 py-1 text-caption font-semibold text-success">
            Open now
          </span>
          {distanceLabel && (
            <span className="rounded-full bg-surface px-3 py-1 text-caption font-semibold text-text-secondary">
              {distanceLabel} away
            </span>
          )}
          <span className="rounded-full bg-surface px-3 py-1 text-caption font-semibold text-text-secondary">
            PC Gaming
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
                  <span className="rupee-symbol">₹</span>{tier.pricePerHour}<span className="text-caption font-normal text-text-secondary">/hr</span>
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
          cafe.amenities && cafe.amenities.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {cafe.amenities.map((item) => {
                const { icon: AmenityIcon, label } = getAmenityDisplay(item);
                return (
                  <div
                    key={item}
                    className="p-3.5 rounded-2xl bg-card border border-border/80 text-body font-medium text-text-primary flex items-center gap-2"
                  >
                    <AmenityIcon className="h-4 w-4 text-primary flex-shrink-0" />
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-body text-text-secondary italic">No amenities listed by this café yet.</p>
          )
        )}

        {activeTab === 'games' && (
          cafe.supportedGames && cafe.supportedGames.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {cafe.supportedGames.map((game) => (
                <div
                  key={game}
                  className="p-3.5 rounded-2xl bg-card border border-border/80 flex items-center gap-2.5 font-medium text-body text-text-primary"
                >
                  <Gamepad2 className="h-4 w-4 text-accent" />
                  <span>{game}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-body text-text-secondary italic">No supported games listed by this café yet.</p>
          )
        )}

        {activeTab === 'reviews' && (
          <div className="flex flex-col gap-4">
            {/* Submit Review Card */}
            <div className="p-5 rounded-2xl bg-card border border-border/80 flex flex-col gap-3">
              <h4 className="font-heading text-body font-bold text-text-primary">Leave a Rating & Review</h4>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setNewRating(star)}
                    className="p-1 text-warning transition-transform hover:scale-110"
                  >
                    <Star className={`h-6 w-6 ${star <= newRating ? 'fill-warning text-warning' : 'text-text-secondary/40'}`} />
                  </button>
                ))}
              </div>

              {reviewError && (
                <p className="text-caption text-rose-500 font-medium">{reviewError}</p>
              )}

              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Share your experience (ping, seats, setup cleanliness, food)..."
                className="w-full rounded-xl bg-surface border border-border p-3 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[80px]"
              />
              <Button
                variant="primary"
                size="md"
                className="self-end"
                disabled={isSubmittingReview}
                  onClick={async () => {
                    if (!newComment.trim()) return;
                    setReviewError(null);
                    
                    const completedBooking = userBookingsData?.items?.find(
                      (b) => b.cafeId === cafeId && (b.status === 'completed' || b.status === 'checked_in' || b.status === 'confirmed')
                    );

                    if (!completedBooking) {
                      setReviewError('You must have an active or completed booking at this venue to leave a review.');
                      return;
                    }

                    setIsSubmittingReview(true);
                    try {
                      await createReview({
                        bookingId: completedBooking.id,
                        rating: newRating,
                        comment: newComment,
                      });
                      setNewComment('');
                      setSubmittedReview(true);
                      refetchReviews();
                      refetch();
                    } catch (err: any) {
                      setReviewError(err?.message || 'Failed to submit review.');
                    } finally {
                      setIsSubmittingReview(false);
                    }
                  }}
              >
                {isSubmittingReview ? 'Submitting...' : submittedReview ? 'Review Posted ✓' : 'Submit Review'}
              </Button>
            </div>

            {/* List Reviews */}
            {serverReviewsData && serverReviewsData.items && serverReviewsData.items.length > 0 ? (
              serverReviewsData.items.map((rev) => (
                <div key={rev.id} className="p-4 rounded-2xl bg-card border border-border/80 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-heading text-body font-bold text-text-primary">
                      {rev.gamerName || 'Verified Gamer'}
                    </span>
                    <div className="flex items-center text-warning">
                      <Star className="h-4 w-4 fill-warning" />
                      <span className="text-caption font-bold ml-1">{rev.rating}.0</span>
                    </div>
                  </div>
                  <p className="text-caption text-text-secondary">{rev.comment}</p>
                </div>
              ))
            ) : (
              <div className="p-6 rounded-2xl bg-card border border-border/60 text-center">
                <Star className="h-8 w-8 text-warning/40 mx-auto mb-2" />
                <p className="font-heading text-body font-bold text-text-primary">No Reviews Yet</p>
                <p className="text-caption text-text-secondary">Be the first gamer to leave a review for this café after your session!</p>
              </div>
            )}
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
      <div className="fixed bottom-[64px] md:bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border/80 p-4 shadow-overlay">
        <div className="max-w-content mx-auto flex items-center justify-between gap-4">
          <div>
            <span className="text-overline text-text-secondary">Starting from</span>
            <div className="font-data text-price-lg font-bold text-text-primary">
              <span className="rupee-symbol">₹</span>{minPrice}<span className="text-caption font-normal text-text-secondary">/hr</span>
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
