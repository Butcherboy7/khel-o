'use client';


import { useCallback, useEffect, useRef, useState } from 'react';
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
  Users,
  CheckCircle2,
  Images,
  Tag,
  X,
  ArrowRight,
} from 'lucide-react';
import { getCafe, cafePath, getCafeLive } from '@/lib/api/cafes';
import { listCafeReviews, createReview, getReviewSettings, editReview } from '@/lib/api/reviews';
import { getAmenityDisplay } from '@/lib/amenities';
import { listBookings } from '@/lib/api/bookings';
import { getWaitlistStatus, joinWaitlist, leaveWaitlist } from '@/lib/api/waitlist';
import { NotifyMeSheet, type NotifyStep } from '@/components/customer/NotifyMeSheet';
import { OwnerIntroForm } from '@/components/customer/OwnerIntroForm';
import { queryKeys } from '@/hooks/queries/keys';
import { BottomSheet, Button, Skeleton, ErrorState } from '@/components/ui';
import { PLATFORMS } from '@/constants/platforms';
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
import { createShare } from '@/lib/share';
import { LoginRequiredDialog } from '@/components/auth/LoginRequiredDialog';
import { ActivitiesSection } from '@/components/customer/ActivitiesSection';
import { OfferChip } from '@/components/customer/OfferChip';
import { useCampaign } from '@/hooks/useCampaign';
import { offerUrgency, offerLabelWithMode, hourlyOffer } from '@/lib/offers';

import { useAuthStore } from '@/store/authStore';
import { useLocationStore } from '@/store/locationStore';
import { calculateDistance, formatDistance, isCafeOpenNow, formatTime } from '@/lib/format';
import { fireAnalyticsEvent } from '@/lib/api/analyticsEvents';
import { InfoTip } from '@/components/shared/InfoTip';
import { CUSTOMER_INFO } from '@/lib/customerGuideCopy';
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
  // The URL segment may be a slug; every API call below (reviews, waitlist,
  // analytics) needs the real id, which the server-fetched café carries.
  const cafeId = initialCafe?.id ?? (params.id as string);

  useEffect(() => {
    fireAnalyticsEvent('venue_viewed', { cafeId });
    // Fires exactly once per mount of a given café's detail page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafeId]);

  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { userLat, userLng } = useLocationStore();
  const heroRef = useRef<HTMLDivElement>(null);

  const campaign = useCampaign(initialCafe?.id);
  const promoSuffix = campaign.code ? `&promoCode=${encodeURIComponent(campaign.code)}` : '';
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
  const [editingReview, setEditingReview] = useState(false);
  const [editRating, setEditRating] = useState(5);
  const [editComment, setEditComment] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
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

  // Stations free to book right now, per tier — the strongest "go now"
  // signal on the page. Lead listings take no bookings, so no query.
  const { data: liveData } = useQuery({
    queryKey: ['cafes', 'live', cafeId],
    queryFn: () => getCafeLive(cafeId),
    enabled: Boolean(cafeId) && initialCafe?.isLeadListing !== true,
    staleTime: 30_000,
    refetchInterval: 60_000,
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
  const waitlistGoal = waitlist?.goal ?? 30;
  const [isJoining, setIsJoining] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyStep, setNotifyStep] = useState<NotifyStep>('signin');
  const [shareCopied, setShareCopied] = useState(false);
  const [ownerIntroOpen, setOwnerIntroOpen] = useState(false);
  const votesLeft = Math.max(waitlistGoal - waitingCount, 0);

  // A friend landing on a shared vote link gets asked once, right away —
  // that's the whole reason the link was sent. Once per café per session,
  // and never to someone who already voted.
  const waitlistLoaded = waitlist !== undefined;
  useEffect(() => {
    if (!isLead || !waitlistLoaded || joined) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('utm_source') !== 'share') return;
    const key = `khelo-vote-invite-${cafeId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // No sessionStorage: may ask again on refresh, which is harmless.
    }
    setNotifyStep('invite');
    setNotifyOpen(true);
  }, [isLead, waitlistLoaded, joined, cafeId]);

  const handleShareWaitlist = async () => {
    const shareText = `Bro help me out 🙏 vote to get ${data?.name ?? 'this café'} on KHEL-O so we can book it online. Takes 2 secs 🥺`;
    const shareUrl = createShare(
      { path: cafePath(data ?? { id: cafeId }), context: 'waitlist', cafeId, campaign: data?.slug ?? cafeId },
      'native'
    );
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `Vote for ${data?.name ?? 'this café'} on KHEL-O`, text: shareText, url: shareUrl });
        return;
      } catch {
        // User cancelled the native share sheet — fall through to clipboard copy.
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  const joinFromSheet = useCallback(
    async (value?: string) => {
      await joinWaitlist(cafeId, value);
      fireAnalyticsEvent('notify_me', {
        cafeId,
        // From the sheet, no contact means the one-tap Google path.
        metadata: { method: value ? 'contact' : 'google' },
      });
      await refetchWaitlist();
    },
    [cafeId, refetchWaitlist],
  );

  const handleNotifyMe = async () => {
    if (isJoining) return;
    // Signed-out visitors get the sheet: one-tap Google (which also gives
    // us a real inbox), or phone/email one tap away. Signed-in visitors are
    // already reachable, so they join on the spot and see the confirmation.
    if (!isAuthenticated && !joined) {
      setNotifyStep('signin');
      setNotifyOpen(true);
      return;
    }
    setIsJoining(true);
    try {
      if (joined) {
        await leaveWaitlist(cafeId);
      } else {
        await joinWaitlist(cafeId);
        fireAnalyticsEvent('notify_me', { cafeId, metadata: { method: 'signed_in' } });
        setNotifyStep('done');
        setNotifyOpen(true);
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

  // Temporary admin toggle (PlatformSetting.reviews_require_booking) — when
  // off, anyone can post a review without an eligible completed booking.
  const { data: reviewSettings } = useQuery({
    queryKey: ['review-settings'],
    queryFn: getReviewSettings,
    staleTime: 5 * 60 * 1000,
  });
  const reviewsRequireBooking = reviewSettings?.requireBooking ?? true;

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
  const photosList = cafe.photos && cafe.photos.length > 0 ? cafe.photos.map((p) => p.url) : [];
  const currentPhoto = photosList[photoIndex % photosList.length];
  const minPrice = cafe.tiers && cafe.tiers.length > 0 ? Math.min(...cafe.tiers.map((t) => t.pricePerHour)) : 100;
  const gamingTiers = (cafe.tiers ?? []).filter((t) => t.tierType !== 'activity');
  const activityTiers = (cafe.tiers ?? []).filter((t) => t.tierType === 'activity');
  // RAM/Monitor rows in the comparison table are PC-only specs — showing
  // that table for a console-only café (e.g. PS5-only) is just dashes,
  // so only offer it when at least one tier actually has PC specs.
  const hasPcTier = gamingTiers.some((t) => Boolean(t.specs?.gpu));
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
  const activeTier = cheapestTier;
  // Hourly price after the setup's live offer, by the same rule as its card; null = none.
  const barPrice = activeTier ? hourlyOffer(activeTier.pricePerHour, activeTier.activePromotion)?.price ?? null : null;

  // isCafeOpenNow treats missing hours as open; with no hours on file we
  // say nothing rather than claim a real business is open.
  const hoursKnown = Boolean(cafe.openingTime && cafe.closingTime);
  const isOpenNow = hoursKnown && isCafeOpenNow(cafe.openingTime, cafe.closingTime);
  const openStatusLabel = !hoursKnown
    ? null
    : isOpenNow
      ? `Open till ${formatTime(cafe.closingTime!)}`
      : `Opens ${formatTime(cafe.openingTime!)}`;
  // "DG Gaming Cafe, Bowenpally" -> "Bowenpally": the café's own name
  // repeated in its address adds nothing next to the title.
  const area =
    (cafe.addressLine1 || '')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part && part.toLowerCase() !== cafe.name.toLowerCase())[0] || cafe.city;
  const freeNowByTier = new Map((liveData?.tiers ?? []).map((t) => [t.tierId, t.freeNow]));

  const amenityBadges = (cafe.amenities ?? []).slice(0, 3).map((a) => getAmenityDisplay(a));

  const fetchedReviews = serverReviewsData?.items ?? [];
  // The signed-in visitor's own review of this café, if any: shown with an
  // Edit button, and it replaces the "leave a review" form.
  const myReview = user ? fetchedReviews.find((r) => r.gamerId === user.id) : undefined;
  const reviewDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
    // above that nav, so it needs clearance beyond the shell's default. The
    // bar is variable-height (the isLead branch below can add a contact-input
    // row and a waiting-count line), so this padding is sized generously for
    // the tallest variant rather than pixel-matched to the shortest one —
    // pb-20/md:pb-12 was tuned to the single-row case and the bar clipped
    // into the Reviews section whenever it grew taller (or even at its
    // shortest, on some viewports — this was reported as unreadable overlap
    // on ordinary bookable cafés too, not just the lead-listing variant).
    <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-40 md:pb-20">
      {/* Hero Header Image with Gallery Arrows */}
      <div ref={heroRef} className="relative h-48 sm:h-64 md:h-96 w-full overflow-hidden rounded-3xl bg-secondary shadow-float group scroll-mt-4">
        {currentPhoto ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={currentPhoto}
            alt={`${cafe.name} photo ${photoIndex + 1}`}
            className="h-full w-full object-cover transition-all duration-300 cursor-pointer"
            loading="eager"
            fetchPriority="high"
            decoding="async"
            // This banner frame is deliberately cropped (object-cover) to
            // stay a consistent hero height regardless of photo orientation.
            // A portrait photo shown only here would look wrongly cropped
            // with no way to see it whole — clicking opens the lightbox
            // (object-contain) which renders the photo at its true aspect
            // ratio/orientation instead.
            onClick={() => openLightbox(photosList, photoIndex)}
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
            <button aria-label="Back to search" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-secondary shadow-card hover:bg-surface transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
          </Link>

          <button
            onClick={() => setIsShareOpen(true)}
            aria-label="Share this café"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-secondary shadow-card hover:bg-surface transition-colors"
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

        {photosList.length > 1 && (
          <span className="absolute bottom-3 right-3 z-10 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-white tabular-nums">
            {(photoIndex % photosList.length) + 1} / {photosList.length}
          </span>
        )}
      </div>

      {/* Title and the facts that decide "can I go?" on one line each —
          hours, area, directions — so the setups and prices below make the
          first screen instead of a grid of badges. */}
      <div className="flex flex-col gap-1.5 -mt-2">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-heading text-h1 text-text-primary">{cafe.name}</h1>
          <span className="flex flex-shrink-0 items-center gap-1 text-caption text-text-secondary">
            <Star className="h-3.5 w-3.5 fill-warning text-warning" />
            <span className="font-bold text-text-primary">
              {cafe.averageRating && cafe.averageRating > 0 ? cafe.averageRating.toFixed(1) : 'New'}
            </span>
            {cafe.totalReviews > 0 && <span>({cafe.totalReviews})</span>}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption text-text-secondary">
          {openStatusLabel && (
            <>
              <span className={`flex items-center gap-1.5 font-bold ${isOpenNow ? 'text-success' : 'text-text-secondary'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isOpenNow ? 'bg-success' : 'bg-text-tertiary'}`} />
                {openStatusLabel}
              </span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>{area}</span>
          {distanceLabel && (
            <>
              <span aria-hidden="true">·</span>
              <span>{distanceLabel} away</span>
            </>
          )}
          {cafe.googleMapsUrl && (
            <>
              <span aria-hidden="true">·</span>
              <a
                href={cafe.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 font-semibold text-primary hover:underline"
              >
                <MapPin className="h-3.5 w-3.5" />
                Directions
              </a>
            </>
          )}
        </div>

        {amenityBadges.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption font-semibold text-text-secondary">
            {amenityBadges.map(({ icon: AmenityIcon, label }) => (
              <span key={label} className="flex items-center gap-1">
                <AmenityIcon className="h-3.5 w-3.5 text-primary" />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Lead café: say plainly why there's no booking, and give the two
          ways a player can help — vote (the sticky bar) or, better, a warm
          intro to the owner. */}
      {isLead && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-h3 text-text-primary">Help get {cafe.name} on KHEL-O 🥺</h2>
            <p className="text-caption text-text-secondary">
              Every vote shows the owner that gamers want online booking here. Hit {waitlistGoal} and we go knock on
              their door 🚪
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOwnerIntroOpen(true)}
            className="flex min-h-[52px] items-center justify-between gap-3 rounded-xl bg-surface px-3.5 py-2.5 text-left transition-colors hover:bg-border/60"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-body font-semibold text-text-primary">Know the owner? Introduce us 👀</span>
              <span className="text-caption text-text-secondary">A friendly intro gets it listed way faster</span>
            </span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-secondary" aria-hidden />
          </button>
        </section>
      )}

      {/* Hardware Tiers Section — selectable here so "Book now" already
          knows which tier the user wants, instead of asking again on the
          booking page with an identical set of cards. Rows, not a grid of
          cards: a list scans in one pass regardless of how many tiers a
          café lists, where a 3-up grid starts wrapping awkwardly past three. */}
      {(gamingTiers.length > 0 || activityTiers.length > 0) && (
      <section className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-heading text-h3 text-text-primary">
            {isLead ? 'What they’ve got' : gamingTiers.length > 0 ? 'Choose your setup' : 'Choose an activity'}
          </h2>
          <p className="text-caption text-text-secondary">
            {isLead ? 'Café prices. Online booking opens once they join KHEL-O.' : 'Tap one to pick your time.'}
          </p>
        </div>

        <>
            <div className="flex flex-col gap-2.5">
              {gamingTiers.map((tier) => {
                const isSelected = activeTier?.id === tier.id;
                const isPc = Boolean(tier.specs?.gpu);
                // Owner-created offers (Owner → Promotional Offers) apply
                // automatically at checkout — surfaced here so gamers see
                // the discount before they even open the booking wizard,
                // not just once they're on the price summary there.
                const promo = tier.activePromotion;
                const promoLive = promo?.isLiveNow !== false;
                // The struck-through hourly price is only honest for a percentage
                // offer that is open right now; any other offer shows as a chip.
                const hourly = hourlyOffer(tier.pricePerHour, promo);
                const discount = hourly?.pct ?? 0;
                const discountedPrice = hourly?.price ?? tier.pricePerHour;
                const coopRate = tier.coopEnabled ? tier.pricePerHour + Number(tier.coopExtraPlayerPrice ?? 0) : 0;
                const coopDeal = hourlyOffer(coopRate, tier.coopPromotion);
                const modelLabel = String(tier.specs?.console || tier.specs?.other || tier.model || 'Gaming Station');
                const modelRepeatsName = modelLabel.trim().toLowerCase() === (tier.name ?? '').trim().toLowerCase();
                return (
                  // Stretched-button card: one full-size select button sits
                  // under the content so the co-op ⓘ can be its own button
                  // (a button can't live inside another button).
                  <div
                    key={tier.id}
                    className={`relative flex items-center gap-3 p-3 rounded-2xl text-left border-2 bg-card ${
                      isLead ? 'border-border' : isSelected ? 'border-primary shadow-card transition-all active:scale-[0.99]' : 'border-border hover:bg-surface transition-all active:scale-[0.99]'
                    }`}
                  >
                    {/* A lead café takes no bookings: the card informs, it doesn't link. */}
                    {!isLead && <button
                      type="button"
                      onClick={() => router.push(`/bookings/new?cafeId=${cafe.id}&tierId=${tier.id}${promoSuffix}`)}
                      aria-label={`Book ${tier.name}, ₹${tier.pricePerHour} per hour${tier.coopEnabled ? ', co-op available' : ''}`}
                      className="absolute inset-0 rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />}
                    <div
                      className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                        isSelected && !isLead ? 'bg-accent/15 text-accent' : 'bg-surface text-text-secondary'
                      }`}
                    >
                      <PlatformIcon platform={isPc ? 'pc' : tier.platform} className="h-5 w-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="font-heading text-body-emphasis font-bold text-text-primary">{tier.name}</h3>
                        {tier.coopEnabled && (
                          <span className="flex items-center gap-1 rounded-full bg-primary/[0.08] px-2 py-0.5 text-[11px] font-bold text-primary-dark flex-shrink-0">
                            <Users className="h-3 w-3" aria-hidden />
                            Co-op
                          </span>
                        )}
                      </div>
                      {(isPc || (!modelRepeatsName && modelLabel !== 'Gaming Station')) && (
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
                            <span className="font-semibold text-text-primary">{modelLabel}</span>
                          )}
                        </div>
                      )}
                      {campaign.active && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {campaign.offers
                            .filter((o) => o.applicableTierId === tier.id)
                            .map((o) => (
                              <OfferChip key={o.id} label={offerLabelWithMode(o.label || 'Offer', o.playMode)} tone="soft" />
                            ))}
                        </div>
                      )}
                      {/* The offer, in the same words as the list and checkout. */}
                      {promo && (
                        <div className="mt-1 flex min-w-0 flex-wrap items-start gap-x-2 gap-y-0.5">
                          <OfferChip
                            label={hourly ? `${hourly.pct}% off` : promo.label || 'Offer'}
                            when={promo.when}
                            live={promoLive}
                            urgency={offerUrgency({ slotsRemaining: promo.slotsRemaining, validUntil: promo.validUntil })}
                          />
                          {promo.title && (
                            <span className="min-w-0 pt-0.5 text-[11px] text-text-secondary">
                              {promo.title.replace(/\s*·\s*[^·]*$/, (m) => (tier.name && m.toLowerCase().includes(tier.name.toLowerCase()) ? '' : m))}
                            </span>
                          )}
                        </div>
                      )}
                      {/* Co-op price on every co-op setup, so PS4 and PS5 read the same. */}
                      {tier.coopEnabled && (
                        <p className="mt-1 flex flex-nowrap items-center gap-1 whitespace-nowrap text-caption text-text-secondary">
                          <span>
                            {(tier.coopMaxPlayers ?? 2) > 2 ? `2–${tier.coopMaxPlayers}` : '2'} players{coopDeal ? ' ' : ' from '}
                            {coopDeal && (
                              <span className="mr-1 text-text-tertiary line-through"><span className="rupee-symbol">₹</span>{coopRate}</span>
                            )}
                            <span className={`font-data font-bold ${coopDeal ? 'text-accent' : 'text-text-primary'}`}>
                              <span className="rupee-symbol">₹</span>{coopDeal?.price ?? coopRate}/hr
                            </span>
                          </span>
                          <InfoTip quiet text={CUSTOMER_INFO.coop} label="What is co-op?" className="relative z-10 -my-1 flex-shrink-0" />
                        </p>
                      )}
                    </div>

                    <div className="flex flex-shrink-0 flex-col items-end gap-0.5 text-right">
                      {discount > 0 && (
                        <span className="text-caption leading-none text-text-tertiary line-through">
                          <span className="rupee-symbol">₹</span>{tier.pricePerHour}
                        </span>
                      )}
                      <div className={`whitespace-nowrap font-data text-body-emphasis font-bold ${discount > 0 ? 'text-accent' : 'text-text-primary'}`}>
                        <span className="rupee-symbol">₹</span>{discountedPrice}
                        <span className="text-caption font-normal text-text-secondary">/hr</span>
                      </div>
                      {liveData?.openNow && freeNowByTier.has(tier.id) && tier.totalSeats > 0 ? (
                        <span className={`whitespace-nowrap text-[11px] font-bold ${(freeNowByTier.get(tier.id) ?? 0) > 0 ? 'text-success' : 'text-warning'}`}>
                          {(freeNowByTier.get(tier.id) ?? 0) > 0
                            ? `${freeNowByTier.get(tier.id)} of ${tier.totalSeats} free`
                            : 'All in use now'}
                        </span>
                      ) : (
                        tier.totalSeats > 0 && (
                          <span className="whitespace-nowrap text-[11px] text-text-secondary">
                            {tier.totalSeats} station{tier.totalSeats === 1 ? '' : 's'}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <ActivitiesSection embedded readOnly={isLead} showHeading={gamingTiers.length > 0} cafeId={cafe.id} activities={activityTiers} promoCode={campaign.code} campaignOffers={campaign.offers} />

            {!isLead && (
              <p className="flex items-center gap-1.5 text-caption text-text-secondary">
                <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-success" />
                Instant confirmation · Full refund if you cancel 2+ hrs before
              </p>
            )}

            {hasPcTier && gamingTiers.length > 1 && (
              <button
                type="button"
                onClick={() => setShowAllTierSpecs((v) => !v)}
                className="self-start flex items-center gap-1.5 text-caption font-semibold text-primary hover:underline"
              >
                {showAllTierSpecs ? 'Hide tier comparison' : 'Compare all tiers'}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAllTierSpecs ? 'rotate-180' : ''}`} />
              </button>
            )}

            {hasPcTier && showAllTierSpecs && gamingTiers.length > 1 && (
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
                      { label: 'Stations', get: (t: (typeof gamingTiers)[number]) => (t.totalSeats > 0 ? String(t.totalSeats) : '—') },
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
      </section>
      )}

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
        {cafe.supportedGames && Object.keys(cafe.supportedGames).length > 0 ? (
          <div className="flex flex-col gap-4">
            {Object.entries(cafe.supportedGames)
              .filter(([, games]) => games.length > 0)
              .map(([platform, games]) => (
                <div key={platform} className="flex flex-col gap-2">
                  <h3 className="flex items-center gap-1.5 text-caption font-semibold text-text-secondary uppercase tracking-wide">
                    <PlatformIcon platform={platform} className="h-3.5 w-3.5 text-primary" />
                    {PLATFORMS.find((p) => p.value === platform)?.label || platform}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {games.map((game) => (
                      <div
                        key={game}
                        className="p-3.5 rounded-2xl bg-card border border-border/80 flex items-center gap-2.5 font-medium text-body text-text-primary"
                      >
                        <Gamepad2 className="h-4 w-4 text-accent" />
                        <span>{game}</span>
                      </div>
                    ))}
                  </div>
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

      {/* Reviews — id+scroll-mt so a QR code / direct link can jump straight
          here (#reviews), same pattern as heroRef's scroll-mt-4 above. */}
      <section id="reviews" className="flex flex-col gap-4 scroll-mt-4">
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

        {/* Submit Review Card — #write-review is where the café's review QR
            code lands. Hidden once this visitor has reviewed (they edit
            their review in the list instead). */}
        {!myReview && (
        <div id="write-review" className="p-5 rounded-2xl bg-card border border-border/80 flex flex-col gap-3 scroll-mt-4">
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

                if (!completedBooking && reviewsRequireBooking) {
                  setReviewError('You must have an active or completed booking at this venue to leave a review.');
                  return;
                }

                setIsSubmittingReview(true);
                try {
                  await createReview(
                    completedBooking
                      ? { bookingId: completedBooking.id, rating: newRating, comment: newComment }
                      : { cafeId, rating: newRating, comment: newComment }
                  );
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
        )}

        {/* List Reviews */}
        {fetchedReviews.length > 0 ? (
          fetchedReviews.map((rev) => {
            const isMine = rev.id === myReview?.id;
            if (isMine && editingReview) {
              return (
                <div key={rev.id} id="write-review" className="p-4 rounded-2xl bg-card border-2 border-primary flex flex-col gap-3 scroll-mt-4">
                  <span className="font-heading text-body font-bold text-text-primary">Edit your review</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setEditRating(star)}
                        aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                        aria-pressed={star <= editRating}
                        className="p-1"
                      >
                        <Star className={`h-6 w-6 ${star <= editRating ? 'fill-warning text-warning' : 'text-text-secondary/40'}`} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={editComment}
                    onChange={(e) => setEditComment(e.target.value)}
                    className="w-full rounded-xl bg-surface border border-border p-3 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[80px]"
                  />
                  {reviewError && <p className="text-caption text-error">{reviewError}</p>}
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setEditingReview(false); setReviewError(null); }}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      isLoading={isSavingEdit}
                      onClick={async () => {
                        setIsSavingEdit(true);
                        setReviewError(null);
                        try {
                          await editReview(rev.id, { rating: editRating, comment: editComment });
                          setEditingReview(false);
                          refetchReviews();
                          refetch();
                        } catch (err: unknown) {
                          setReviewError((err as Error)?.message || "Couldn't save your changes.");
                        } finally {
                          setIsSavingEdit(false);
                        }
                      }}
                    >
                      Save changes
                    </Button>
                  </div>
                </div>
              );
            }
            return (
              <div key={rev.id} id={isMine ? 'write-review' : undefined} className="p-4 rounded-2xl bg-card border border-border/80 flex flex-col gap-1.5 scroll-mt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="font-heading text-body font-bold text-text-primary">
                      {isMine ? 'You' : rev.gamerName || 'Verified Gamer'}
                    </span>
                    <span className="text-[11px] text-text-secondary">
                      {reviewDate(rev.createdAt)}
                      {rev.editedAt && (
                        <span title={`Edited ${reviewDate(rev.editedAt)}`} className="ml-1.5 rounded-full bg-surface px-1.5 py-0.5 font-semibold">
                          Edited
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center text-warning flex-shrink-0">
                    <Star className="h-4 w-4 fill-warning" />
                    <span className="text-caption font-bold ml-1">{rev.rating}.0</span>
                  </div>
                </div>
                {rev.comment && <p className="text-caption text-text-secondary">{rev.comment}</p>}
                {rev.ownerReply && (
                  <div className="mt-1 rounded-xl border-l-2 border-primary bg-surface px-3 py-2">
                    <span className="text-[11px] font-bold text-text-primary">Reply from {cafe.name}</span>
                    <p className="text-caption text-text-secondary">{rev.ownerReply}</p>
                  </div>
                )}
                {isMine && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditRating(rev.rating);
                      setEditComment(rev.comment ?? '');
                      setReviewError(null);
                      setEditingReview(true);
                    }}
                    className="self-start min-h-[36px] text-caption font-semibold text-primary hover:underline"
                  >
                    Edit your review
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <div className="p-6 rounded-2xl bg-card border border-border/60 text-center">
            <Star className="h-8 w-8 text-warning/40 mx-auto mb-2" />
            <p className="font-heading text-body font-bold text-text-primary">No Reviews Yet</p>
            <p className="text-caption text-text-secondary">Be the first gamer to leave a review for this café after your session!</p>
          </div>
        )}
      </section>

      {isLead && (
        <NotifyMeSheet
          isOpen={notifyOpen}
          step={notifyStep}
          onStepChange={setNotifyStep}
          onClose={() => setNotifyOpen(false)}
          cafeId={cafeId}
          cafeName={cafe.name}
          isAuthenticated={isAuthenticated}
          votes={waitingCount}
          goal={waitlistGoal}
          onJoin={joinFromSheet}
          onShare={handleShareWaitlist}
          shareCopied={shareCopied}
          onKnowOwner={() => {
            setNotifyOpen(false);
            setOwnerIntroOpen(true);
          }}
        />
      )}
      {isLead && (
        <BottomSheet isOpen={ownerIntroOpen} onClose={() => setOwnerIntroOpen(false)}>
          <OwnerIntroForm cafeId={cafeId} cafeName={cafe.name} onDone={() => setOwnerIntroOpen(false)} />
        </BottomSheet>
      )}

      {/* Sticky Bottom Action Bar — offset must include the safe-area inset too,
          not just the nav bar's base height, or the home-indicator padding on
          notched iPhones still overlaps this bar's bottom edge. */}
      <div className="action-bar-fixed fixed bottom-[calc(var(--bottom-nav-height)_+_env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 z-overlay bg-card border-t border-border p-4 shadow-overlay">
        {isLead ? (
          /* Lead listing: KHEL-O listed this café from research and the venue
             has not agreed to take bookings yet, so there is no price to show
             and nothing to book. Deliberately no directions or call button —
             those route the visitor straight past KHEL-O to the venue. */
          <div className="max-w-content mx-auto flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <span className="text-overline text-text-secondary">{joined ? 'You voted 🫶' : 'Not on KHEL-O yet 🥺'}</span>
                <p className="text-caption text-text-secondary">
                  {joined ? 'Now get the squad to vote too' : 'Vote to help gamers get it listed'}
                </p>
              </div>
              <button
                onClick={handleNotifyMe}
                disabled={isJoining}
                aria-label={joined ? 'Voted. Tap to remove your vote' : `Vote for ${cafe.name}`}
                className={`inline-flex min-h-[48px] flex-shrink-0 items-center justify-center rounded-2xl px-6 py-3.5 font-heading text-btn font-semibold shadow-float transition-colors disabled:opacity-60 ${
                  joined
                    ? 'bg-surface text-text-primary border border-border'
                    : 'bg-primary text-white hover:bg-primary-dark'
                }`}
              >
                {joined ? 'Voted ✓' : 'Vote 🙏'}
              </button>
            </div>

            <div className="flex flex-col gap-1.5 pt-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-caption font-semibold text-text-primary">
                  {waitingCount > 0 ? (
                    <>
                      {waitingCount}/{waitlistGoal} votes
                      <span className="font-normal text-text-secondary">
                        {votesLeft > 0 ? ` · ${votesLeft} more to go` : ' · goal smashed 🎉'}
                      </span>
                    </>
                  ) : (
                    <span className="font-normal text-text-secondary">Be the first to vote 👑</span>
                  )}
                </span>
                {joined && (
                  <button
                    onClick={handleShareWaitlist}
                    className="min-h-[32px] flex-shrink-0 text-caption font-semibold text-primary hover:underline"
                  >
                    {shareCopied ? 'Link copied ✓' : 'Rally the squad 📣'}
                  </button>
                )}
              </div>
              <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round((waitingCount / waitlistGoal) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
        <div className="max-w-content mx-auto flex items-center justify-between gap-4">
          <div>
            <span className="text-overline text-text-secondary">{activeTier ? activeTier.name : 'Starting from'}</span>
            <div className="font-data text-price-lg font-bold text-text-primary">
              {/* Same rule as the setup card above, so the bar never contradicts the card the visitor tapped. */}
              {barPrice != null && activeTier && barPrice < activeTier.pricePerHour && (
                <span className="mr-1.5 text-caption font-normal text-text-secondary line-through">₹{activeTier.pricePerHour}</span>
              )}
              <span className="rupee-symbol">₹</span>{barPrice ?? activeTier?.pricePerHour ?? minPrice}<span className="text-caption font-normal text-text-secondary">/hr</span>
            </div>
            {/* Flag the fee before checkout so the total never surprises
                anyone, but as an amount-at-checkout, not a percentage — "4%"
                reads as money lost; the exact rupee figure is on checkout. */}
            <span className="text-caption text-text-secondary">
              + platform fee at checkout
            </span>
          </div>

          {/* A <button> nested inside this Link (the previous markup) is
              interactive-content-in-interactive-content — invalid HTML that
              iOS Safari resolves by requiring a second tap to actually
              navigate, even though Chrome/Android tolerate it fine. Styling
              the Link itself as the button avoids the nesting entirely. */}
          <Link
            href={`/bookings/new?cafeId=${cafe.id}${activeTier ? `&tierId=${activeTier.id}` : ''}${promoSuffix}`}
            className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-primary px-6 py-3.5 font-heading text-btn font-semibold text-white shadow-float hover:bg-primary-dark transition-colors"
          >
            Pick a time
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        )}
      </div>

      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        heading="Share this café"
        message={`Check out ${cafe.name} on KHEL-O. Book a seat online:`}
        path={cafePath(cafe)}
        context="cafe"
        cafeId={cafe.id}
        campaign={cafe.slug ?? cafe.id}
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
