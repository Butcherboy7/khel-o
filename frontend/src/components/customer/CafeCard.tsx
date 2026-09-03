'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapPin, Star, Zap } from 'lucide-react';
import { Card, CardImage, PriceDisplay } from '@/components/ui';
import { useLocationStore } from '@/store/locationStore';
import { calculateDistance, formatDistance, isCafeOpenNow, formatTime } from '@/lib/format';
import { hasConsoleTier, hasPcTier } from '@/lib/platformTags';
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

function getPlatformSummary(cafe: CafeListItem): string | null {
  if (cafe.platforms && cafe.platforms.length > 0) {
    const labels = Array.from(
      new Set(
        cafe.platforms
          .map((p) => PLATFORM_SHORT_LABELS[p as Platform])
          .filter((label): label is string => Boolean(label))
      )
    );
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
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    if (photosList.length <= 1) return;
    const timer = setInterval(() => {
      setPhotoIndex((prev) => (prev + 1) % photosList.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [photosList.length]);

  const currentPhoto = photosList[photoIndex % photosList.length];

  const isOpenNow = isCafeOpenNow(cafe.openingTime, cafe.closingTime);
  const statusLabel = isOpenNow
    ? 'Open now'
    : cafe.openingTime
      ? `Opens ${formatTime(cafe.openingTime)}`
      : 'Closed';
  const platformSummary = getPlatformSummary(cafe);

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
            16:9 gives cover enough room to keep the subject centered.
            flex-shrink-0 works around a WebKit bug where a flex child sizing
            itself via aspect-ratio plus a max-height cap can render a few px
            short of its box at certain widths (seen on iPhone Pro Max's
            screen width; Chrome/Android unaffected). */}
        <CardImage aspectClass="aspect-[16/9]" className="relative max-h-36 sm:max-h-40 flex-shrink-0">
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

          {/* Carousel Dot Indicators */}
          {photosList.length > 1 && (
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10">
              {photosList.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1 rounded-full transition-all ${
                    idx === photoIndex ? 'w-3 bg-white' : 'w-1 bg-white/50'
                  }`}
                />
              ))}
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

            <span
              className={`rounded-full backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-white ${
                isOpenNow ? 'bg-secondary/85' : 'bg-text-tertiary/80'
              }`}
            >
              {statusLabel}
            </span>
          </div>
        </CardImage>

        {/* Card Body — one scan-line per fact, so two cards can be compared
            at a glance without opening either one. */}
        <div className="flex flex-1 flex-col justify-center gap-1 px-3.5 py-2.5">
          <h3 className="font-heading text-body-emphasis font-bold text-text-primary group-hover:text-primary transition-colors truncate leading-tight">
            {cafe.name}
          </h3>

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
                <span className="text-text-secondary truncate">{platformSummary}</span>
              </>
            )}
          </div>

          {/* Location (clickable for directions — sized to content so the
              rest of the card row still opens the café page) */}
          <button
            onClick={handleOpenMap}
            className="inline-flex max-w-full items-center gap-1 text-caption text-text-secondary hover:text-primary transition-colors text-left"
            title="Get directions on Google Maps"
          >
            <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
            <span className="truncate hover:underline">
              {distanceLabel ? `${distanceLabel} away` : `${cafe.city}, ${cafe.state}`}
            </span>
          </button>

          {/* Footer: Price */}
          <div className="flex items-center mt-0.5">
            {cafe.startingPrice ? (
              <div className="flex items-center gap-1 text-caption font-semibold text-text-secondary">
                <Zap className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                <span>from</span>
                <PriceDisplay amount={cafe.startingPrice} size="sm" />
              </div>
            ) : (
              <span className="text-caption font-semibold text-text-secondary">Pricing inside</span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
