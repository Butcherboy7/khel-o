import Link from 'next/link';
import { MapPin, Star, Zap } from 'lucide-react';
import { Card, CardImage } from '@/components/ui';
import type { CafeListItem } from '@/types';

interface CafeCardProps {
  cafe: CafeListItem;
}

export function CafeCard({ cafe }: CafeCardProps) {
  const primaryPhoto = cafe.photos && cafe.photos.length > 0 ? cafe.photos[0] : null;

  return (
    <Link href={`/cafe/${cafe.id}`} className="block h-full group">
      <Card
        interactive
        elevation="resting"
        className="h-full flex flex-col overflow-hidden rounded-3xl border border-border/80 bg-card transition-all duration-normal hover:shadow-float"
      >
        {/* Photo Header */}
        <CardImage aspectClass="aspect-[16/10]" className="relative">
          {primaryPhoto ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={primaryPhoto}
              alt={cafe.name}
              className="h-full w-full object-cover transition-transform duration-slow group-hover:scale-105"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : null}

          {/* Gradient Fallback when image fails */}
          <div className="absolute inset-0 bg-gradient-to-br from-secondary via-secondary/90 to-primary/40 flex items-center justify-center p-4 text-center -z-10">
            <span className="font-heading text-h3 text-white opacity-80">{cafe.name}</span>
          </div>

          {/* Overlay Badges */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
            {cafe.hasActivePromotion ? (
              <span className="rounded-full bg-accent px-3 py-1 text-badge font-bold uppercase tracking-wider text-white shadow-card">
                Buy 2 hrs get 1 free
              </span>
            ) : (
              <div />
            )}

            <span className="rounded-full bg-secondary/80 backdrop-blur-md px-3 py-1 text-badge font-semibold text-white">
              Open now
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
                <span>{cafe.averageRating ? cafe.averageRating.toFixed(1) : '4.8'}</span>
              </div>
            </div>

            {/* Location Row */}
            <div className="flex items-center gap-1 text-caption text-text-secondary">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-text-secondary" />
              <span className="truncate">
                {cafe.city}, {cafe.state} • 1.2 km
              </span>
            </div>
          </div>

          {/* Tags Row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="rounded-full bg-surface px-2.5 py-1 text-overline font-semibold text-text-secondary">
              PC Gaming
            </span>
            {cafe.tierNames && cafe.tierNames.length > 0 ? (
              cafe.tierNames.slice(0, 2).map((tier) => (
                <span
                  key={tier}
                  className="rounded-full bg-surface px-2.5 py-1 text-overline font-semibold text-text-secondary truncate max-w-[120px]"
                >
                  {tier}
                </span>
              ))
            ) : (
              <span className="rounded-full bg-surface px-2.5 py-1 text-overline font-semibold text-text-secondary">
                PS5 Lounge
              </span>
            )}
          </div>

          {/* Footer: Price Row */}
          <div className="flex items-center justify-between border-t border-border/60 pt-3 mt-1">
            <div className="flex items-center gap-1 text-caption font-semibold text-text-secondary">
              <Zap className="h-3.5 w-3.5 text-accent" />
              <span>from</span>
              <span className="font-data text-body-emphasis font-bold text-text-primary">
                ₹{cafe.startingPrice || 90}/hr
              </span>
            </div>

            <span className="text-caption font-bold text-primary group-hover:translate-x-0.5 transition-transform">
              Book rig →
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
