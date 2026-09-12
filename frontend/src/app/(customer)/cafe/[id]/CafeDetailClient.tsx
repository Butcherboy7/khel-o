'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter, usePathname } from 'next/navigation';
import {
  MapPin,
  Clock,
  Star,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Share2,
  Navigation,
  Gamepad2,
  CheckCircle2,
  Images,
  Tag,
  X,
} from 'lucide-react';
import { getCafe } from '@/lib/api/cafes';
import { listCafeReviews, createReview } from '@/lib/api/reviews';
import { getAmenityDisplay } from '@/lib/amenities';
import { listBookings } from '@/lib/api/bookings';
import { getWaitlistStatus, joinWaitlist, leaveWaitlist } from '@/lib/api/waitlist';
import { queryKeys } from '@/hooks/queries/keys';
import { Button, Skeleton, ErrorState } from '@/components/ui';
import { PLATFORMS, type Platform } from '@/constants/platforms';
import { PlatformIcon } from '@/components/icons/PlatformIcons';
import dynamic from 'next/dynamic';

const GoogleLocationDisplay = dynamic(
  () => import('@/components/maps/GoogleLocationDisplay').then((m) => m.GoogleLocationDisplay),
  {
    ssr: false,
    loading: () => (
      <div className="h-44 w-full rounded-2xl bg-surface border border-border flex items-center justify-center text-caption text-text-secondary animate-pulse">
        Loading interactive map...
      </div>
    ),
  }
);
import { ShareModal } from '@/components/customer/ShareModal';
import { LoginRequiredDialog } from '@/components/auth/LoginRequiredDialog';
import { ActivitiesSection } from '@/components/customer/ActivitiesSection';

import { useAuthStore } from '@/store/authStore';
import { useLocationStore } from '@/store/locationStore';
import { calculateDistance, formatDistance, isCafeOpenNow, formatTime } from '@/lib/format';
import { fireAnalyticsEvent } from '@/lib/api/analyticsEvents';
import type { CafeDetail } from '@/types';

interface CafeDetailClientProps {
  /** Fetched server-side so the first paint (and search-engine crawlers) see
      real café content instead of a loading skeleton. Undefined when the
      server-side fetch failed — the client query below still tries again. */
  initialCafe?: CafeDetail;
}

export function CafeDetailClient({ initialCafe }: CafeDetailClientProps) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const cafeId = params.id as string;

  useEffect(() => {
    fireAnalyticsEvent('venue_viewed', { cafeId });
    // Fires exactly once per mount of a given café's detail page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafeId]);

  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { userLat, userLng } = useLocationStore();
  const heroRef = useRef<HTMLDivElement>(null);

  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [showAllTierSpecs, setShowAllTierSpecs] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [isShareOpen, setIsShareOpen] = useState(false);
  // Tapping a Photos/Menu thumbnail opens this in place, over whatever the
  // user was scrolled to — it previously called jumpToPhoto's
  // heroRef.scrollIntoView, which yanked the page up to the hero every time,
  // regardless of how far down the user had scrolled to find that thumbnail.
  const [lightbox, setLightbox] = useState<{ open: boolean; images: string[]; index: number }>({
    open: false,
    images: [],
    index: 0,
  });
  const touchStartXRef = useRef<number | null>(null);

  // Declared above the isLoading/isError early returns below so hook order
  // stays constant across renders (Rules of Hooks) even though the lightbox
  // itself can only ever open once cafe data exists.
  useEffect(() => {
    if (!lightbox.open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox((prev) => ({ ...prev, open: false }));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lightbox.open]);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [submittedReview, setSubmittedReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.cafes.detail(cafeId),
    queryFn: () => getCafe(cafeId).then((res) => res.cafe),
    enabled: Boolean(cafeId),
    staleTime: 60_000,
    initialData: initialCafe,
  });

  const { data: serverReviewsData, refetch: refetchReviews } = useQuery({
    queryKey: ['cafe-reviews', cafeId],
    queryFn: () => listCafeReviews(cafeId, { limit: 50 }),
    enabled: Boolean(cafeId),
  });

  const isLead = data?.isLeadListing === true;

  const { data: waitlist, refetch: refetchWaitlist } = useQuery({
    queryKey: ['waitlist', cafeId],
    queryFn: () => getWaitlistStatus(cafeId),
    enabled: Boolean(cafeId) && isLead,
    staleTime: 30_000,
  });
  const joined = waitlist?.joined ?? false;
  const waitingCount = waitlist?.count ?? 0;
  const [isJoining, setIsJoining] = useState(false);
  const [contact, setContact] = useState('');
  const [showContactInput, setShowContactInput] = useState(false);

  const handleNotifyMe = async () => {
    if (isJoining) return;
    // Signed-out visitors give us a way to reach them; signed-in ones are
    // already reachable, so asking again would be friction for nothing.
    if (!isAuthenticated && !showContactInput && !joined) {
      setShowContactInput(true);
      return;
    }
    setIsJoining(true);
    try {
      if (joined) {
        await leaveWaitlist(cafeId);
      } else {
        await joinWaitlist(cafeId, contact.trim() || undefined);
        setShowContactInput(false);
      }
      await refetchWaitlist();
    } finally {
      setIsJoining(false);
    }
  };

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
  // Real photos only — a café with none gets the branded gradient fallback
  // below, never a stock photo of an unrelated venue standing in as "its" photo.
  const photosList = cafe.photos && cafe.photos.length > 0 ? cafe.photos : [];
  const currentPhoto = photosList[photoIndex % photosList.length];
  const minPrice = cafe.tiers && cafe.tiers.length > 0 ? Math.min(...cafe.tiers.map((t) => t.pricePerHour)) : 100;
  const gamingTiers = (cafe.tiers ?? []).filter((t) => t.tierType !== 'activity');
  const activityTiers = (cafe.tiers ?? []).filter((t) => t.tierType === 'activity');
  // Picking the tier here (instead of only on the booking page) removes an
  // entire duplicate step — the booking page shows the exact same tier
  // cards, so a user reads specs once here rather than twice. Defaults to
  // the cheapest GAMING tier so "Book now" opens on the same card the
  // visible "Hardware tiers" section shows as selected — defaulting to the
  // cheapest tier overall let an Activity priced below every gaming tier
  // win silently, sending a visitor into an Activity booking they never
  // picked while nothing above looked selected. Falls back to the cheapest
  // Activity only when the café has no gaming tiers at all, so a
  // Snooker-only café still gets a sensible "Book now" default.
  const defaultTierPool = gamingTiers.length > 0 ? gamingTiers : activityTiers;
  const cheapestTier =
    defaultTierPool.length > 0
      ? [...defaultTierPool].sort((a, b) => a.pricePerHour - b.pricePerHour)[0]
      : null;
  const activeTier =
    (cafe.tiers && selectedTierId ? cafe.tiers.find((t) => t.id === selectedTierId) : undefined) ||
    cheapestTier;

  const isOpenNow = isCafeOpenNow(cafe.openingTime, cafe.closingTime);
  const openStatusLabel = isOpenNow
    ? 'Open now'
    : cafe.openingTime
      ? `Opens ${formatTime(cafe.openingTime)}`
      : 'Closed';

  const platformBadges = Array.from(
    new Set((cafe.tiers ?? []).map((t) => t.platform).filter((p): p is Platform => Boolean(p)))
  ).map((p) => ({ value: p, label: PLATFORMS.find((entry) => entry.value === p)?.label || p }));

  const amenityBadges = (cafe.amenities ?? []).slice(0, 3).map((a) => getAmenityDisplay(a));

  const fetchedReviews = serverReviewsData?.items ?? [];
  const ratingCounts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: fetchedReviews.filter((r) => Math.round(r.rating) === star).length,
  }));
  const maxRatingCount = Math.max(1, ...ratingCounts.map((r) => r.count));

  const nextPhoto = () => setPhotoIndex((prev) => (prev + 1) % photosList.length);
  const prevPhoto = () => setPhotoIndex((prev) => (prev - 1 + photosList.length) % photosList.length);
  const jumpToPhoto = (idx: number) => {
    setPhotoIndex(idx);
    heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openLightbox = (images: string[], index: number) => setLightbox({ open: true, images, index });
  const closeLightbox = () => setLightbox((prev) => ({ ...prev, open: false }));
  const lightboxNext = () =>
    setLightbox((prev) => ({ ...prev, index: (prev.index + 1) % prev.images.length }));
  const lightboxPrev = () =>
    setLightbox((prev) => ({ ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length }));

  return (
    // CustomerShell's <main> already reserves pb-24/md:pb-12 for the mobile
    // bottom nav. This page also has its own fixed "Book now" bar stacked
    // above that nav, so it needs clearance beyond the shell's default — but
    // adding a full bar-height's worth on top of the shell's padding (as the
    // old pb-28 did) double-counts and leaves a visible empty gap before you
    // hit the fixed bars. pb-20/md:pb-12 here is sized to the bar's own
    // height, not the bar-plus-nav total the shell already covers.
    <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-20 md:pb-12">
      {/* Hero Header Image with Gallery Arrows */}
      <div ref={heroRef} className="relative h-52 sm:h-64 md:h-96 w-full overflow-hidden rounded-3xl bg-secondary shadow-float group scroll-mt-4">
        {currentPhoto ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={currentPhoto}
            alt={`${cafe.name} photo ${photoIndex + 1}`}
            className="h-full w-full object-cover transition-all duration-300"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-secondary via-secondary/90 to-primary/40 flex items-center justify-center p-6 text-center">
            <span className="font-heading text-h1 text-white opacity-80">{cafe.name}</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-secondary/80 via-transparent to-black/30" />

        {/* Top Controls */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
          <Link href="/">
            <button aria-label="Back to search" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 backdrop-blur-md text-secondary shadow-card hover:bg-white transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
          </Link>

          <button
            onClick={() => setIsShareOpen(true)}
            aria-label="Share this café"
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
              aria-label="Previous photo"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md hover:bg-black/60 transition-colors opacity-0 group-hover:opacity-100"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={nextPhoto}
              aria-label="Next photo"
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
          <span
            className={`rounded-full px-3 py-1 text-caption font-semibold ${
              isOpenNow ? 'bg-success/10 text-success' : 'bg-surface text-text-secondary'
            }`}
          >
            {openStatusLabel}
          </span>
          {distanceLabel && (
            <span className="rounded-full bg-surface px-3 py-1 text-caption font-semibold text-text-secondary">
              {distanceLabel} away
            </span>
          )}
          {platformBadges.map(({ value, label }) => (
            <span
              key={value}
              className="rounded-full bg-surface px-3 py-1 text-caption font-semibold text-text-secondary flex items-center gap-1.5"
            >
              <PlatformIcon platform={value} className="h-3.5 w-3.5 text-primary" />
              {label}
            </span>
          ))}
          {amenityBadges.map(({ icon: AmenityIcon, label }) => (
            <span
              key={label}
              className="rounded-full bg-surface px-3 py-1 text-caption font-semibold text-text-secondary flex items-center gap-1.5"
            >
              <AmenityIcon className="h-3.5 w-3.5 text-primary" />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Hardware Tiers Section — selectable here so "Book now" already
          knows which tier the user wants, instead of asking again on the
          booking page with an identical set of cards. Rows, not a grid of
          cards: a list scans in one pass regardless of how many tiers a
          café lists, where a 3-up grid starts wrapping awkwardly past three. */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-h2 text-text-primary">Hardware tiers</h2>
          {gamingTiers.length > 1 && (
            <span className="text-caption text-text-secondary">Tap to select</span>
          )}
        </div>

        {gamingTiers.length > 0 ? (
          <>
            <div className="flex flex-col gap-2.5">
              {gamingTiers.map((tier) => {
                const isSelected = activeTier?.id === tier.id;
                const isPc = Boolean(tier.specs?.gpu);
                // Owner-created offers (Owner → Promotional Offers) apply
                // automatically at checkout — surfaced here so gamers see
                // the discount before they even open the booking wizard,
                // not just once they're on the price summary there.
                const discount = tier.activePromotion?.discountPercentage ?? 0;
                const discountedPrice = discount > 0 ? Math.round(tier.pricePerHour * (1 - discount / 100)) : tier.pricePerHour;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => setSelectedTierId(tier.id)}
                    className={`flex items-center gap-4 p-4 rounded-2xl text-left border transition-all active:scale-[0.99] ${
                      isSelected
                        ? 'border-accent bg-accent/5 ring-2 ring-accent/60 shadow-card'
                        : 'border-border/80 bg-card hover:shadow-float hover:bg-surface'
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                        isSelected ? 'bg-accent/15 text-accent' : 'bg-surface text-text-secondary'
                      }`}
                    >
                      <PlatformIcon platform={isPc ? 'pc' : tier.platform} className="h-5 w-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="font-heading text-body-emphasis font-bold text-text-primary">{tier.name}</h3>
                        {discount > 0 && (
                          <span className="flex items-center gap-1 rounded-full bg-accent/10 text-accent px-2 py-0.5 text-[11px] font-bold flex-shrink-0">
                            <Tag className="h-3 w-3" />
                            {discount}% OFF
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption text-text-secondary">
                        {isPc ? (
                          <>
                            <span className="font-semibold text-text-primary">{tier.specs.gpu}</span>
                            {tier.specs?.ram && (
                              <>
                                <span className="text-text-secondary/50">·</span>
                                <span>{tier.specs.ram}</span>
                              </>
                            )}
                          </>
                        ) : (
                          <span className="font-semibold text-text-primary">
                            {tier.specs?.console || tier.specs?.other || tier.model || 'Gaming Station'}
                          </span>
                        )}
                        <span className="text-text-secondary/50">·</span>
                        <span>{tier.totalSeats || 18} seats</span>
                      </div>
                      {discount > 0 && tier.activePromotion?.title && (
                        <p className="text-[11px] text-accent font-medium mt-0.5 truncate">{tier.activePromotion.title}</p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {isSelected ? (
                        <div className="h-5 w-5 rounded-full border-2 border-accent bg-accent flex items-center justify-center">
                          <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                        </div>
                      ) : (
                        <div className="h-5 w-5" />
                      )}
                      {discount > 0 ? (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-caption text-text-tertiary line-through">
                            <span className="rupee-symbol">₹</span>{tier.pricePerHour}
                          </span>
                          <div className="font-data text-body-emphasis font-bold text-accent">
                            <span className="rupee-symbol">₹</span>{discountedPrice}
                            <span className="text-caption font-normal text-text-secondary">/hr</span>
                          </div>
                        </div>
                      ) : (
                        <div className="font-data text-body-emphasis font-bold text-text-primary">
                          <span className="rupee-symbol">₹</span>{tier.pricePerHour}
                          <span className="text-caption font-normal text-text-secondary">/hr</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {gamingTiers.length > 1 && (
              <button
                type="button"
                onClick={() => setShowAllTierSpecs((v) => !v)}
                className="self-start flex items-center gap-1.5 text-caption font-semibold text-primary hover:underline"
              >
                {showAllTierSpecs ? 'Hide tier comparison' : 'Compare all tiers'}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAllTierSpecs ? 'rotate-180' : ''}`} />
              </button>
            )}

            {showAllTierSpecs && gamingTiers.length > 1 && (
              <div className="overflow-x-auto rounded-2xl border border-border/80">
                <table className="w-full text-caption">
                  <thead>
                    <tr className="bg-surface">
                      <th className="p-3 text-left font-semibold text-text-secondary">Spec</th>
                      {gamingTiers.map((tier) => (
                        <th key={tier.id} className="p-3 text-left font-heading font-bold text-text-primary whitespace-nowrap">
                          {tier.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Hardware', get: (t: (typeof gamingTiers)[number]) => t.specs?.gpu || t.specs?.console || t.specs?.other || t.model || '—' },
                      { label: 'RAM', get: (t: (typeof gamingTiers)[number]) => t.specs?.ram || '—' },
                      { label: 'Monitor', get: (t: (typeof gamingTiers)[number]) => t.specs?.monitor || '—' },
                      { label: 'Seats', get: (t: (typeof gamingTiers)[number]) => String(t.totalSeats || 18) },
                      { label: 'Price', get: (t: (typeof gamingTiers)[number]) => `₹${t.pricePerHour}/hr` },
                    ].map((row) => (
                      <tr key={row.label} className="border-t border-border/60">
                        <td className="p-3 font-semibold text-text-secondary">{row.label}</td>
                        {gamingTiers.map((tier) => (
                          <td key={tier.id} className="p-3 text-text-primary whitespace-nowrap">
                            {row.get(tier)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <p className="text-body text-text-secondary italic">No hardware tiers listed.</p>
        )}
      </section>

      <ActivitiesSection cafeId={cafe.id} activities={activityTiers} />

      {/* About */}
      {cafe.description && (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-h2 text-text-primary">About this café</h2>
          <p className={`text-body text-text-secondary ${showFullDescription ? '' : 'line-clamp-3'}`}>
            {cafe.description}
          </p>
          {cafe.description.length > 160 && (
            <button
              type="button"
              onClick={() => setShowFullDescription((v) => !v)}
              className="self-start text-caption font-semibold text-primary hover:underline"
            >
              {showFullDescription ? 'Read less' : 'Read more'}
            </button>
          )}
        </section>
      )}

      {/* Amenities */}
      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-h2 text-text-primary">Amenities</h2>
        {cafe.amenities && cafe.amenities.length > 0 ? (
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
        )}
      </section>

      {/* Games */}
      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-h2 text-text-primary">Games available</h2>
        {cafe.supportedGames && cafe.supportedGames.length > 0 ? (
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
        )}
      </section>

      {/* Menu */}
      {cafe.menuPhotos && cafe.menuPhotos.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-heading text-h2 text-text-primary">Menu</h2>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {cafe.menuPhotos.map((photo, idx) => (
              <button
                key={photo + idx}
                type="button"
                onClick={() => openLightbox(cafe.menuPhotos!, idx)}
                className="relative flex-shrink-0 w-40 aspect-[3/4] overflow-hidden rounded-xl border border-border/80"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo}
                  alt={`${cafe.name} menu ${idx + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Photos */}
      {photosList.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-heading text-h2 text-text-primary">Photos</h2>
          <div className="grid grid-cols-4 gap-2">
            {photosList.slice(0, 3).map((photo, idx) => (
              <button
                key={photo + idx}
                type="button"
                onClick={() => openLightbox(photosList, idx)}
                className="relative aspect-square overflow-hidden rounded-xl"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt={`${cafe.name} photo ${idx + 1}`} className="h-full w-full object-cover" loading="lazy" decoding="async" />
              </button>
            ))}
            {photosList.length > 3 && (
              <button
                type="button"
                onClick={() => openLightbox(photosList, 3)}
                className="relative aspect-square overflow-hidden rounded-xl bg-secondary/90 flex flex-col items-center justify-center gap-1 text-white"
              >
                <Images className="h-5 w-5" />
                <span className="text-caption font-bold">+{photosList.length - 3} More</span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* Opening Hours & Interactive Google Map Row */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-3xl bg-card border border-border/80 flex flex-col gap-2">
          <div className="flex items-center gap-2 font-heading text-h3 text-text-primary">
            <Clock className="h-5 w-5 text-accent" />
            <span>Opening hours</span>
          </div>
          <p className="text-body text-text-secondary mt-1">
            {cafe.openingTime && cafe.closingTime
              ? `Daily: ${formatTime(cafe.openingTime)} - ${formatTime(cafe.closingTime)}`
              : 'Hours not listed by this café yet.'}
          </p>
        </div>

        <div className="p-5 rounded-3xl bg-card border border-border/80 flex flex-col justify-between gap-4">
          <div className="flex items-center gap-2 font-heading text-h3 text-text-primary">
            <Navigation className="h-5 w-5 text-primary" />
            <span>Location</span>
          </div>

          <GoogleLocationDisplay
            addressLine1={cafe.addressLine1}
            city={cafe.city}
            googleMapsUrl={cafe.googleMapsUrl}
          />
        </div>
      </section>

      {/* Reviews */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-h2 text-text-primary">Reviews</h2>
          {cafe.totalReviews > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="font-heading text-h3 font-bold text-text-primary flex items-center gap-1">
                <Star className="h-4 w-4 fill-warning text-warning" />
                {cafe.averageRating.toFixed(1)}
              </span>
              <span className="text-caption text-text-secondary">({cafe.totalReviews} reviews)</span>
            </div>
          )}
        </div>

        {fetchedReviews.length > 0 && (
          <div className="flex flex-col gap-1.5 p-4 rounded-2xl bg-card border border-border/80">
            {ratingCounts.map(({ star, count }) => (
              <div key={star} className="flex items-center gap-2">
                <span className="w-3 text-caption font-semibold text-text-secondary">{star}</span>
                <Star className="h-3 w-3 fill-warning text-warning flex-shrink-0" />
                <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-full bg-warning"
                    style={{ width: `${(count / maxRatingCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right text-caption text-text-secondary">{count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Submit Review Card */}
        <div className="p-5 rounded-2xl bg-card border border-border/80 flex flex-col gap-3">
          <h4 className="font-heading text-body font-bold text-text-primary">Leave a Rating & Review</h4>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setNewRating(star)}
                aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                aria-pressed={star <= newRating}
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

                if (!isAuthenticated) {
                  setShowLoginPrompt(true);
                  return;
                }

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
        {fetchedReviews.length > 0 ? (
          fetchedReviews.map((rev) => (
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
      </section>

      {/* Sticky Bottom Action Bar — offset must include the safe-area inset too,
          not just the nav bar's base height, or the home-indicator padding on
          notched iPhones still overlaps this bar's bottom edge. */}
      <div className="action-bar-fixed fixed bottom-[calc(var(--bottom-nav-height)_+_env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 z-overlay bg-card/95 backdrop-blur-md border-t border-border/80 p-4 shadow-overlay">
        {isLead ? (
          /* Lead listing: KHEL-O listed this café from research and the venue
             has not agreed to take bookings yet, so there is no price to show
             and nothing to book. Deliberately no directions or call button —
             those route the visitor straight past KHEL-O to the venue. */
          <div className="max-w-content mx-auto flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <span className="text-overline text-text-secondary">Booking soon</span>
                <p className="text-caption text-text-secondary">
                  {joined
                    ? "We'll message you the moment booking opens."
                    : "We're onboarding this café right now."}
                </p>
              </div>
              <button
                onClick={handleNotifyMe}
                disabled={isJoining}
                className={`inline-flex flex-shrink-0 items-center justify-center rounded-2xl px-6 py-3.5 font-heading text-btn font-semibold shadow-float transition-colors disabled:opacity-60 ${
                  joined
                    ? 'bg-surface text-text-primary border border-border'
                    : 'bg-primary text-white hover:bg-primary-dark'
                }`}
              >
                {joined ? '✓ Notifying you' : 'Notify me'}
              </button>
            </div>

            {showContactInput && !joined && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Phone or email"
                  aria-label="Phone number or email to notify you on"
                  className="flex-1 min-h-input rounded-xl border border-border bg-card px-3 text-body text-text-primary placeholder:text-text-secondary/70"
                />
                <button
                  onClick={handleNotifyMe}
                  disabled={isJoining || contact.trim().length === 0}
                  className="rounded-xl bg-primary px-4 py-2.5 font-heading text-btn font-semibold text-white disabled:opacity-60"
                >
                  Done
                </button>
              </div>
            )}

            {waitingCount >= 5 && (
              <p className="text-caption text-text-secondary">{waitingCount} people waiting</p>
            )}
          </div>
        ) : (
        <div className="max-w-content mx-auto flex items-center justify-between gap-4">
          <div>
            <span className="text-overline text-text-secondary">{activeTier ? activeTier.name : 'Starting from'}</span>
            <div className="font-data text-price-lg font-bold text-text-primary">
              <span className="rupee-symbol">₹</span>{activeTier?.pricePerHour ?? minPrice}<span className="text-caption font-normal text-text-secondary">/hr</span>
            </div>
          </div>

          {/* A <button> nested inside this Link (the previous markup) is
              interactive-content-in-interactive-content — invalid HTML that
              iOS Safari resolves by requiring a second tap to actually
              navigate, even though Chrome/Android tolerate it fine. Styling
              the Link itself as the button avoids the nesting entirely. */}
          <Link
            href={`/bookings/new?cafeId=${cafe.id}${activeTier ? `&tierId=${activeTier.id}` : ''}`}
            className="inline-flex items-center justify-center rounded-2xl bg-secondary px-8 py-3.5 font-heading text-btn font-semibold text-white shadow-float hover:bg-secondary/90 transition-colors"
          >
            Book now
          </Link>
        </div>
        )}
      </div>

      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        title={cafe.name}
      />

      <LoginRequiredDialog
        isOpen={showLoginPrompt}
        onCancel={() => setShowLoginPrompt(false)}
        onLogin={() => {
          router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
        }}
        title="Login required"
        description="Please log in to leave a review for this café."
      />

      {lightbox.open && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black/95"
          onClick={closeLightbox}
          onTouchStart={(e) => {
            touchStartXRef.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const startX = touchStartXRef.current;
            touchStartXRef.current = null;
            if (startX == null) return;
            const deltaX = e.changedTouches[0].clientX - startX;
            // 40px threshold keeps an ordinary tap-to-close from being
            // misread as a swipe.
            if (Math.abs(deltaX) < 40) return;
            if (deltaX < 0) lightboxNext();
            else lightboxPrev();
          }}
        >
          <div className="flex items-center justify-between p-4 text-white">
            <span className="text-caption font-semibold">
              {lightbox.index + 1} / {lightbox.images.length}
            </span>
            <button
              type="button"
              onClick={closeLightbox}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative flex-1 flex items-center justify-center px-4 pb-4" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.images[lightbox.index]}
              alt={`${cafe.name} enlarged photo ${lightbox.index + 1}`}
              className="max-h-full max-w-full object-contain select-none"
            />

            {lightbox.images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={lightboxPrev}
                  aria-label="Previous photo"
                  className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={lightboxNext}
                  aria-label="Next photo"
                  className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
