'use client';

import React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { CafeListItem } from '@/types';

interface CafeCardProps {
  cafe: CafeListItem;
}

export default function CafeCard({ cafe }: CafeCardProps) {
  const router = Router();
  const hasPhoto = cafe.photos && cafe.photos.length > 0 && cafe.photos[0];

  return (
    <div
      onClick={() => router.push(`/cafes/${cafe.id}`)}
      className="bg-card rounded-2xl border border-border shadow-md p-3 flex gap-3 cursor-pointer active:scale-98 transition-transform"
    >
      {/* Left: Square Image */}
      <div className="relative w-[96px] h-[96px] rounded-xl overflow-hidden flex-shrink-0 bg-surface">
        {hasPhoto ? (
          <Image
            src={cafe.photos[0]}
            alt={cafe.name}
            fill
            sizes="96px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-secondary to-slate-700 flex items-center justify-center text-white text-xs font-heading font-bold p-1 text-center">
            {cafe.name}
          </div>
        )}
      </div>

      {/* Right: Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        {/* Row 1: Name & Rating */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-heading font-semibold text-base text-text-primary truncate">
            {cafe.name}
          </h3>
          <div className="flex items-center gap-1 bg-secondary text-white text-xs px-2 py-0.5 rounded-full flex-shrink-0">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span className="font-data font-medium">
              {cafe.averageRating > 0 ? cafe.averageRating.toFixed(1) : 'New'}
            </span>
          </div>
        </div>

        {/* Row 2: City */}
        <p className="text-text-secondary text-sm truncate">{cafe.city}</p>

        {/* Row 3: Tier Tags */}
        <div className="flex flex-wrap gap-1">
          {cafe.tierNames && cafe.tierNames.slice(0, 3).map((tier, idx) => (
            <span
              key={idx}
              className="text-xs bg-surface border border-border text-text-secondary px-2 py-0.5 rounded-full truncate max-w-[120px]"
            >
              {tier}
            </span>
          ))}
        </div>

        {/* Row 4: Starting Price & Flash Deal Badge */}
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-primary font-data font-medium text-sm">
            {cafe.startingPrice !== null ? `Starting from ₹${cafe.startingPrice}/hr` : 'Price on request'}
          </span>
          {cafe.hasActivePromotion && (
            <span className="bg-accent text-white text-xs px-2 py-1 rounded-full font-medium flex-shrink-0">
              🔥 Flash Deal
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Router() {
  return useRouter();
}
