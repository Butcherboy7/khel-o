'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MapPin, Star, Zap, Gamepad2 } from 'lucide-react';
import { Card, CardImage } from '@/components/ui';
import { useLocationStore } from '@/store/locationStore';
import { calculateDistance, formatDistance, isCafeOpenNow } from '@/lib/format';
import { hasConsoleTier, hasPcTier } from '@/lib/platformTags';
import { getAmenityDisplay } from '@/lib/amenities';
import type { CafeListItem } from '@/types';

interface CafeCardProps {
  cafe: CafeListItem;
  isFeatured?: boolean;
}

const DEFAULT_CARD_PHOTOS = [
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop',
];

export function CafeCard({ cafe, isFeatured = false }: CafeCardProps) {
  const { userLat, userLng } = useLocationStore();
  const distanceLabel =
    userLat != null && userLng != null && cafe.latitude != null && cafe.longitude != null
      ? formatDistance(calculateDistance(userLat, userLng, cafe.latitude, cafe.longitude))
      : null;

  const photosList = cafe.photos && cafe.photos.length > 0 ? cafe.photos : DEFAULT_CARD_PHOTOS;
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

  const hasConsole = hasConsoleTier(cafe.tierNames, cafe.platforms);
  const showPcGaming = hasPcTier(cafe.tierNames, cafe.platforms);

  const handleOpenMap = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const query = encodeURIComponent(`${cafe.name}, ${cafe.city}, ${cafe.state}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  };

  return (
    <Link href={`/cafe/${cafe.id}`} className="block h-full group">
      <motion.div
        className="h-full"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        whileTap={{ scale: 0.98 }}
      >
      <Card
        interactive
        elevation="resting"
        className={`h-full flex flex-col overflow-hidden rounded-3xl border transition-all duration-normal hover:shadow-float ${
          isFeatured
            ? 'border-primary/40 ring-2 ring-primary/30 shadow-card bg-gradient-to-b from-card via-card to-primary/5'
            : 'border-border/80 bg-card'
        }`}
      >
        {/* Photo Header */}
        <CardImage aspectClass="aspect-[16/10]" className="relative max-h-56 sm:max-h-64">
          {currentPhoto ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={currentPhoto}
              alt={cafe.name}
              className="h-full w-full object-cover transition-all duration-700 group-hover:scale-105"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : null}

          {/* Gradient Fallback when image fails */}
          <div className="absolute inset-0 bg-gradient-to-br from-secondary via-secondary/90 to-primary/40 flex items-center justify-center p-4 text-center -z-10">
            <span className="font-heading text-h3 text-white opacity-80">{cafe.name}</span>
          </div>

          {/* Carousel Dot Indicators */}
          {photosList.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10">
              {photosList.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === photoIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Overlay Badges */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
            {isFeatured ? (
              <span className="rounded-full bg-accent px-3 py-1 text-badge font-bold uppercase tracking-wider text-white shadow-card flex items-center gap-1">
                ★ Featured
              </span>
            ) : cafe.hasActivePromotion ? (
              <span className="rounded-full bg-accent px-3 py-1 text-badge font-bold uppercase tracking-wider text-white shadow-card">
                Buy 2 hrs get 1 free
              </span>
            ) : (
              <div />
            )}

            <span className={`rounded-full backdrop-blur-md px-3 py-1 text-badge font-semibold text-white ${isOpenNow ? 'bg-secondary/80' : 'bg-text-tertiary/80'}`}>
              {isOpenNow ? 'Open now' : 'Closed'}
            </span>
          </div>
        </CardImage>

        {/* Card Body Details */}
        <div className="p-5 flex flex-1 flex-col justify-between gap-3">
          <div>
            {/* Title & Rating Row */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="font-heading text-h3 font-bold text-text-primary group-hover:text-primary transition-colors truncate">
                {cafe.name}
              </h3>
              <div className="flex items-center gap-1 font-heading text-body-emphasis font-bold text-text-primary flex-shrink-0">
                <Star className="h-4 w-4 fill-warning text-warning" />
                <span>{cafe.averageRating && cafe.averageRating > 0 ? cafe.averageRating.toFixed(1) : 'New'}</span>
              </div>
            </div>

            {/* Location Row (Clickable for directions — sized to content so the rest of the card row still opens the cafe page) */}
            <button
              onClick={handleOpenMap}
              className="inline-flex max-w-full items-center gap-1 text-caption text-text-secondary hover:text-primary transition-colors text-left"
              title="Get directions on Google Maps"
            >
              <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
              <span className="truncate hover:underline">
                {cafe.city}, {cafe.state}
                {distanceLabel ? ` • ${distanceLabel}` : ''}
              </span>
            </button>
          </div>

          {/* Amenity Icons Row */}
          {cafe.amenities && cafe.amenities.length > 0 && (
            <div className="flex items-center gap-2.5">
              {cafe.amenities.slice(0, 5).map((amenity) => {
                const { icon: AmenityIcon, label } = getAmenityDisplay(amenity);
                return (
                  <span
                    key={amenity}
                    title={label}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-text-secondary flex-shrink-0"
                  >
                    <AmenityIcon className="h-3.5 w-3.5" />
                  </span>
                );
              })}
              {cafe.amenities.length > 5 && (
                <span className="text-overline font-semibold text-text-tertiary">
                  +{cafe.amenities.length - 5}
                </span>
              )}
            </div>
          )}

          {/* Tags & Console Support Badges Row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {showPcGaming && (
              <span className="rounded-full bg-surface px-2.5 py-1 text-overline font-semibold text-text-secondary">
                PC Gaming
              </span>
            )}

            {hasConsole && (
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-overline font-bold text-primary flex items-center gap-1">
                <Gamepad2 className="h-3 w-3" />
                <span>PS5 / Consoles</span>
              </span>
            )}

            {cafe.tierNames && cafe.tierNames.length > 0
              ? cafe.tierNames.slice(0, 1).map((tier) => (
                  <span
                    key={tier}
                    className="rounded-full bg-surface px-2.5 py-1 text-overline font-semibold text-text-secondary truncate max-w-[120px]"
                  >
                    {tier}
                  </span>
                ))
              : null}
          </div>

          {/* Footer: Price Row */}
          <div className="flex items-center justify-between border-t border-border/60 pt-3 mt-1">
            <div className="flex items-center gap-1 text-caption font-semibold text-text-secondary">
              <Zap className="h-3.5 w-3.5 text-accent" />
              <span>from</span>
              <span className="font-data text-body-emphasis font-bold text-text-primary">
                <span className="rupee-symbol">₹</span>{cafe.startingPrice || 90}/hr
              </span>
            </div>

            <span className="text-caption font-bold text-primary group-hover:translate-x-0.5 transition-transform">
              Book station →
            </span>
          </div>
        </div>
      </Card>
      </motion.div>
    </Link>
  );
}
