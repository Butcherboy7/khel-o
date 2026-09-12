'use client';

import Link from 'next/link';
import { MapPin, Star, Zap } from 'lucide-react';
import { Card, CardImage, PriceDisplay } from '@/components/ui';
import { useLocationStore } from '@/store/locationStore';
import { calculateDistance, formatDistance, isCafeOpenNow, formatTime } from '@/lib/format';
import { hasConsoleTier, hasPcTier } from '@/lib/platformTags';
import { PlatformIcon } from '@/components/icons/PlatformIcons';
import type { Platform } from '@/constants/platforms';
import type { CafeListItem } from '@/types';

// Short labels for the card's one-line platform summary. 'other' is
// deliberately excluded — it isn't a specific claim worth surfacing here.
const PLATFORM_SHORT_LABELS: Partial<Record<Platform, string>> = {
  pc: 'PC',
  playstation: 'PS5',
  xbox: 'Xbox',
  nintendo: 'Switch',
};

// Fixed order so a café offering PS5 + PC always renders PC first — a
// stable badge order reads as "the café's lineup", not a shuffled list.
const PLATFORM_ORDER: Platform[] = ['pc', 'playstation', 'xbox', 'nintendo'];

function getConfirmedPlatforms(cafe: CafeListItem): Platform[] {
  if (!cafe.platforms || cafe.platforms.length === 0) return [];
  const present = new Set(cafe.platforms as Platform[]);
  return PLATFORM_ORDER.filter((p) => present.has(p));
}

function getPlatformSummary(cafe: CafeListItem): string | null {
  const confirmed = getConfirmedPlatforms(cafe);
  if (confirmed.length > 0) {
    const labels = confirmed.map((p) => PLATFORM_SHORT_LABELS[p]).filter((l): l is string => Boolean(l));
    if (labels.length > 0) return labels.join(' · ');
  }
  // Not yet migrated to confirmed per-tier platforms — fall back to the
  // same generic, non-overclaiming tier-name heuristic used elsewhere.
  const parts: string[] = [];
  if (hasPcTier(cafe.tierNames, cafe.platforms, cafe.platformsComplete)) parts.push('PC');
  if (hasConsoleTier(cafe.tierNames, cafe.platforms, cafe.platformsComplete)) parts.push('Console');
  return parts.length > 0 ? parts.join(' · ') : null;
}

interface CafeCardProps {
  cafe: CafeListItem;
  isFeatured?: boolean;
}

export function CafeCard({ cafe, isFeatured = false }: CafeCardProps) {
  const { userLat, userLng } = useLocationStore();
  const distanceLabel =
    userLat != null && userLng != null && cafe.latitude != null && cafe.longitude != null
      ? formatDistance(calculateDistance(userLat, userLng, cafe.latitude, cafe.longitude))
      : null;

  // Real photos only — a café with none gets the branded gradient fallback
  // below, never a stock photo of an unrelated venue standing in as "its" photo.
  const photosList = cafe.photos && cafe.photos.length > 0 ? cafe.photos : [];
  // Cover photo only. The grid used to auto-rotate every photo on a 4s timer,
  // which meant up to 22 cards animating at once with no prefers-reduced-motion
  // guard; the remaining photos live on the detail page, where the visitor
  // chose to look.
  const currentPhoto = photosList[0];

  const isLead = cafe.isLeadListing === true;
  const waitingCount = cafe.waitlistCount ?? 0;
  // "5 waiting" is worth showing; "1 waiting" does the opposite of what the
  // count is for, so it stays hidden below the threshold.
  const showWaiting = waitingCount >= 5;

  // Hours we never confirmed. isCafeOpenNow returns true when either end is
  // missing, so without this guard a café with no hours on file asserts
  // "Open now" — a claim about a real business's trading hours that nothing
  // backs. Most researched cafés are in exactly this state, and it outlives
  // the lead-listing phase: once claimed, isLead goes false while hours can
  // still be unset. No badge is the honest answer.
  const hoursKnown = Boolean(cafe.openingTime && cafe.closingTime);

  const isOpenNow = !isLead && hoursKnown && isCafeOpenNow(cafe.openingTime, cafe.closingTime);
  // A lead listing says nothing about the venue being open — these are real
  // businesses already trading, and we only know our own onboarding state.
  // What is coming soon is booking on KHEL-O, not the café.
  const statusLabel = isLead
    ? 'Booking soon'
    : !hoursKnown
      ? null
      : isOpenNow
        ? 'Open now'
        : cafe.openingTime
          ? `Opens ${formatTime(cafe.openingTime)}`
          : 'Closed';
  const platformSummary = getPlatformSummary(cafe);
  const confirmedPlatforms = getConfirmedPlatforms(cafe);

  const handleOpenMap = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const query = encodeURIComponent(`${cafe.name}, ${cafe.city}, ${cafe.state}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  };

  return (
    <Link href={`/cafe/${cafe.id}`} className="block h-full group">
      <Card
        interactive
        elevation="resting"
        className={`h-full flex flex-col overflow-hidden border transition-all duration-normal hover:shadow-float ${
          isFeatured
            ? 'border-primary/40 ring-2 ring-primary/30 shadow-card bg-gradient-to-b from-card via-card to-primary/5'
            : 'border-border/80 bg-card'
        }`}
      >
        {/* Photo Header — kept compact on purpose: it identifies the café at
            a glance, it does not carry the decision. But not so short that
            object-cover has to crop real photos down to a sliver — a 3:1
            banner ratio on a normal landscape photo pushes the actual
            subject to one edge and leaves bare background filling the rest
            of the frame, which is what "wrapped around the pic" looked like.
            16:9 gives cover enough room to keep the subject centered; max-h
            trims it further for density but deliberately stops short of
            drifting back toward that same ~3:1 crop on a full-width mobile
            card (~358px wide, so max-h-32's 128px still keeps it under 2.8:1).
            flex-shrink-0 works around a WebKit bug where a flex child sizing
            itself via aspect-ratio plus a max-height cap can render a few px
            short of its box at certain widths (seen on iPhone Pro Max's
            screen width; Chrome/Android unaffected). w-full is load-bearing
            for the same reason at a larger scale: without an explicit width,
            mobile Safari solves the aspect-ratio from the clamped max-height
            instead of stretching to the flex parent's width, leaving a wide
            blank strip beside the photo in production. */}
        <CardImage aspectClass="aspect-[2/1] sm:aspect-[16/9]" className="relative w-full flex-shrink-0">
          {currentPhoto ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={currentPhoto}
              alt={cafe.name}
              className="block h-full w-full object-cover object-center transition-all duration-700 group-hover:scale-105"
              loading={isFeatured ? 'eager' : 'lazy'}
              decoding="async"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-secondary via-secondary/90 to-primary/40 flex items-center justify-center p-3 text-center">
              <span className="font-heading text-caption font-bold text-white opacity-80 line-clamp-2">{cafe.name}</span>
            </div>
          )}


          {/* Overlay Badges — small status pills, not a full-width bar: the
              image identifies the café, it shouldn't carry a headline. */}
          <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none z-10">
            {isFeatured ? (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-card">
                ★ Featured
              </span>
            ) : cafe.hasActivePromotion ? (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-card">
                Offer
              </span>
            ) : (
              <span />
            )}

            {statusLabel && (
              <span
                className={`rounded-full backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-white ${
                  isLead ? 'bg-accent/90' : isOpenNow ? 'bg-secondary/85' : 'bg-text-tertiary/80'
                }`}
              >
                {statusLabel}
              </span>
            )}
          </div>
        </CardImage>

        {/* Card Body — one scan-line per fact, so two cards can be compared
            at a glance without opening either one. Location and price share
            a row (was two) since neither needs its own line to read — that's
            where the compaction comes from, not from dropping the platform
            tag or shrinking the photo further. */}
        <div className="flex flex-1 flex-col justify-center gap-1 px-3 py-2.5">
          <h3 className="font-heading text-h3 text-text-primary group-hover:text-primary transition-colors line-clamp-2 leading-tight">
            {cafe.name}
          </h3>

          {isLead ? (
            /* A lead listing has no reviews, usually no tiers and no agreed
               price, so the rating and price rows below would be three lines
               of nothing. What it does have is a location and — once enough
               people ask — a real count of them. */
            <>
              <div className="flex items-center gap-1 text-caption text-text-secondary min-w-0">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                <span className="truncate">{`${cafe.city}, ${cafe.state}`}</span>
              </div>

              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className={`text-caption truncate ${platformSummary ? 'text-text-secondary' : 'text-text-secondary/70 italic'}`}>
                  {platformSummary ?? 'Hardware coming soon'}
                </span>
                {showWaiting && (
                  <span className="text-caption font-semibold text-text-secondary flex-shrink-0">
                    {waitingCount} waiting
                  </span>
                )}
              </div>
            </>
          ) : (
          <>
          {/* Rating + platform summary */}
          <div className="flex items-center gap-1.5 text-caption min-w-0">
            <Star className="h-3.5 w-3.5 fill-warning text-warning flex-shrink-0" />
            <span className="font-heading font-bold text-text-primary">
              {cafe.averageRating && cafe.averageRating > 0 ? cafe.averageRating.toFixed(1) : 'New'}
            </span>
            {cafe.totalReviews > 0 && (
              <span className="text-text-secondary">({cafe.totalReviews})</span>
            )}
            {platformSummary && (
              <>
                <span className="text-text-secondary/50">·</span>
                {confirmedPlatforms.length > 0 && (
                  <span className="flex items-center gap-1 flex-shrink-0" aria-hidden="true">
                    {confirmedPlatforms.map((p) => (
                      <PlatformIcon key={p} platform={p} className="h-3 w-3 text-text-secondary" />
                    ))}
                  </span>
                )}
                <span className="text-text-secondary truncate">{platformSummary}</span>
              </>
            )}
          </div>

          {/* Location (clickable for directions) + Price, sharing one row */}
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <button
              onClick={handleOpenMap}
              className="inline-flex min-w-0 items-center gap-1 text-caption text-text-secondary hover:text-primary transition-colors text-left"
              title="Get directions on Google Maps"
            >
              <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
              <span className="truncate hover:underline">
                {distanceLabel ? `${distanceLabel} away` : `${cafe.city}, ${cafe.state}`}
              </span>
            </button>

            {cafe.startingPrice ? (
              <div className="flex items-center gap-1 text-caption font-semibold text-text-secondary flex-shrink-0">
                <Zap className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                <span>from</span>
                <PriceDisplay amount={cafe.startingPrice} size="sm" />
              </div>
            ) : (
              <span className="text-caption font-semibold text-text-secondary flex-shrink-0">Pricing inside</span>
            )}
          </div>
          </>
          )}
        </div>
      </Card>
    </Link>
  );
}
