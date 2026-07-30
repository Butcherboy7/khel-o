'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Star,
  MapPin,
  Clock,
  ShieldCheck,
  Cpu,
  Monitor,
  CheckCircle2,
  AlertCircle,
  Wifi,
  Wind,
  Coffee,
  Car,
  Headphones,
  Sparkles,
} from 'lucide-react';
import { getCafe } from '@/lib/api';
import { HardwareTier } from '@/types';

// Map amenity strings to Lucide icons
const getAmenityIcon = (amenity: string) => {
  const lower = amenity.toLowerCase();
  if (lower.includes('wifi')) return <Wifi className="w-4 h-4 text-primary" />;
  if (lower.includes('ac') || lower.includes('air')) return <Wind className="w-4 h-4 text-primary" />;
  if (lower.includes('snack') || lower.includes('food') || lower.includes('coffee'))
    return <Coffee className="w-4 h-4 text-primary" />;
  if (lower.includes('parking')) return <Car className="w-4 h-4 text-primary" />;
  if (lower.includes('headset') || lower.includes('audio'))
    return <Headphones className="w-4 h-4 text-primary" />;
  return <CheckCircle2 className="w-4 h-4 text-primary" />;
};

export default function CafeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const cafeId = params?.id as string;

  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);

  const { data: cafe, isLoading, isError, refetch } = useQuery({
    queryKey: ['cafe', cafeId],
    queryFn: () => getCafe(cafeId),
    enabled: Boolean(cafeId),
  });

  const photos = cafe?.photos || [];
  const tiers = cafe?.tiers || [];

  // Default selection to first tier if none selected
  const activeTierId = selectedTierId || (tiers.length > 0 ? tiers[0].id : null);

  const handleBookNow = () => {
    if (activeTierId) {
      router.push(`/bookings/new?cafeId=${cafeId}&tierId=${activeTierId}`);
    } else {
      router.push(`/bookings/new?cafeId=${cafeId}`);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse pb-24">
        {/* Header Back Button Skeleton */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-surface rounded-full" />
          <div className="h-6 bg-surface rounded w-1/3" />
        </div>
        {/* Hero Gallery Skeleton */}
        <div className="w-full h-56 bg-surface rounded-3xl" />
        {/* Title Block Skeleton */}
        <div className="space-y-2">
          <div className="h-7 bg-surface rounded w-2/3" />
          <div className="h-4 bg-surface rounded w-1/2" />
        </div>
        {/* Tiers Skeleton */}
        <div className="space-y-2 pt-4">
          <div className="h-5 bg-surface rounded w-1/4" />
          <div className="w-full h-24 bg-surface rounded-2xl" />
          <div className="w-full h-24 bg-surface rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError || !cafe) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 shadow-md">
        <AlertCircle className="w-12 h-12 text-error" />
        <h3 className="font-heading font-semibold text-lg text-text-primary">
          Café not found
        </h3>
        <p className="text-text-secondary text-sm">
          We couldn't load details for this gaming café.
        </p>
        <div className="flex gap-3 pt-2">
          <Link
            href="/"
            className="border border-border text-text-secondary bg-white px-4 py-2 rounded-2xl text-sm font-medium"
          >
            Back to Explore
          </Link>
          <button
            type="button"
            onClick={() => refetch()}
            className="bg-primary text-white px-4 py-2 rounded-2xl text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Top Bar with Back Button */}
      <div className="flex items-center space-x-3">
        <Link
          href="/"
          className="p-2 bg-card border border-border rounded-full text-text-secondary hover:text-text-primary shadow-sm"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold font-heading text-text-primary truncate">
          {cafe.name}
        </h1>
      </div>

      {/* Photo Gallery Carousel */}
      <div className="relative w-full h-56 rounded-3xl overflow-hidden bg-surface border border-border shadow-md">
        {photos.length > 0 ? (
          <>
            <Image
              src={photos[activePhotoIndex]}
              alt={cafe.name}
              fill
              sizes="(max-width: 768px) 100vw, 448px"
              className="object-cover"
              priority
            />
            {photos.length > 1 && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center space-x-1.5 z-10">
                {photos.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActivePhotoIndex(idx)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      idx === activePhotoIndex
                        ? 'bg-primary w-5'
                        : 'bg-white/70 hover:bg-white'
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-secondary via-slate-800 to-slate-900 flex items-center justify-center p-4 text-center">
            <h2 className="text-white font-heading font-bold text-xl">
              {cafe.name}
            </h2>
          </div>
        )}
      </div>

      {/* Header Info Block */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold font-heading text-text-primary">
              {cafe.name}
            </h2>
            <div className="flex items-center space-x-1 text-sm text-text-secondary mt-1">
              <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
              <span>
                {cafe.addressLine1}, {cafe.city}, {cafe.state}
              </span>
            </div>
          </div>
          {cafe.verificationStatus === 'verified' ? (
            <span className="inline-flex items-center space-x-1 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200 flex-shrink-0">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span>Verified</span>
            </span>
          ) : (
            <span className="inline-flex items-center space-x-1 px-3 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-full border border-amber-200 flex-shrink-0">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span>Unverified</span>
            </span>
          )}
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="bg-card border border-border rounded-2xl p-3 flex items-center space-x-3 shadow-sm">
            <div className="p-2 bg-amber-50 text-amber-500 rounded-xl">
              <Star className="w-5 h-5 fill-amber-400" />
            </div>
            <div>
              <div className="text-xs text-text-secondary">Rating</div>
              <div className="font-data font-semibold text-text-primary text-sm">
                {cafe.averageRating > 0
                  ? `${cafe.averageRating.toFixed(1)} ★ (${cafe.totalReviews})`
                  : 'New Venue'}
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-3 flex items-center space-x-3 shadow-sm">
            <div className="p-2 bg-surface text-primary rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-text-secondary">Hours</div>
              <div className="font-data font-medium text-text-primary text-xs truncate">
                {cafe.openingTime && cafe.closingTime
                  ? `${cafe.openingTime} – ${cafe.closingTime}`
                  : '10:00 AM – 11:00 PM'}
              </div>
            </div>
          </div>
        </div>

        {/* Active Promotions Banner */}
        {cafe.activePromotions && cafe.activePromotions.length > 0 && (
          <div className="bg-gradient-to-r from-emerald-900 to-secondary text-white rounded-2xl p-4 space-y-1 shadow-md">
            <div className="flex items-center space-x-2 text-xs font-bold font-data text-emerald-400 uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>Active Special Offer</span>
            </div>
            <div className="font-heading font-bold text-base">
              {cafe.activePromotions[0].title}
            </div>
            {cafe.activePromotions[0].description && (
              <p className="text-xs text-emerald-100/90 font-body">
                {cafe.activePromotions[0].description}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Hardware Tiers Section */}
      <div className="space-y-3">
        <h3 className="font-heading font-bold text-lg text-text-primary">
          Select Hardware Tier
        </h3>
        {tiers.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-4 text-center text-text-secondary text-sm">
            No hardware tiers published yet.
          </div>
        ) : (
          <div className="space-y-3">
            {tiers.map((tier: HardwareTier) => {
              const isSelected = tier.id === activeTierId;
              return (
                <div
                  key={tier.id}
                  onClick={() => setSelectedTierId(tier.id)}
                  className={`bg-card rounded-2xl border p-4 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/20 shadow-md'
                      : 'border-border shadow-sm hover:border-border/80'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="font-heading font-bold text-base text-text-primary">
                          {tier.name}
                        </h4>
                        {tier.performanceRating && (
                          <div className="flex items-center text-[10px] text-amber-500 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full font-data font-bold">
                            <Star className="w-2.5 h-2.5 fill-current mr-0.5" />
                            <span>{tier.performanceRating.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                      {tier.description && (
                        <p className="text-xs text-text-secondary mt-0.5">
                          {tier.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-data font-semibold text-primary text-base">
                        ₹{tier.pricePerHour}
                        <span className="text-xs text-text-secondary font-normal">
                          /hr
                        </span>
                      </div>
                      <div className="text-[10px] text-text-secondary font-data mt-0.5">
                        {tier.appBookableSeats} seats available
                      </div>
                    </div>
                  </div>

                  {/* Specs Pill List */}
                  {tier.specs && Object.keys(tier.specs).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
                      {Object.entries(tier.specs).map(([key, val]) => (
                        <span
                          key={key}
                          className="inline-flex items-center space-x-1 text-xs bg-surface border border-border px-2.5 py-1 rounded-full text-text-secondary"
                        >
                          <Cpu className="w-3 h-3 text-primary" />
                          <span className="font-medium text-text-primary capitalize">
                            {key}:
                          </span>
                          <span className="font-data">{String(val)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Description & Overview */}
      {cafe.description && (
        <div className="space-y-2">
          <h3 className="font-heading font-bold text-lg text-text-primary">
            About the Venue
          </h3>
          <div className="bg-card border border-border rounded-2xl p-4 text-text-secondary text-sm leading-relaxed shadow-sm">
            {cafe.description}
          </div>
        </div>
      )}

      {/* Amenities Section */}
      {cafe.amenities && cafe.amenities.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-heading font-bold text-lg text-text-primary">
            Amenities
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {cafe.amenities.map((amenity, idx) => (
              <div
                key={idx}
                className="bg-card border border-border rounded-2xl p-3 flex items-center space-x-2.5 text-xs text-text-primary shadow-sm"
              >
                {getAmenityIcon(amenity)}
                <span className="font-medium">{amenity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reviews Section */}
      {cafe.recentReviews && cafe.recentReviews.length > 0 && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-heading font-bold text-lg text-text-primary">
              Recent Gamer Reviews
            </h3>
            <span className="text-xs font-data text-text-secondary">
              {cafe.totalReviews} total
            </span>
          </div>

          <div className="space-y-3">
            {cafe.recentReviews.map((rev) => (
              <div
                key={rev.id}
                className="bg-card border border-border rounded-2xl p-3 space-y-1.5 shadow-sm"
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="font-heading font-semibold text-text-primary">
                    {rev.gamerName || 'Verified Gamer'}
                  </span>
                  <div className="flex items-center text-amber-500 font-data font-medium">
                    <Star className="w-3 h-3 fill-current mr-1" />
                    {rev.rating}.0
                  </div>
                </div>
                {rev.comment && (
                  <p className="text-xs text-text-secondary leading-normal">
                    "{rev.comment}"
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sticky Bottom Action Sheet */}
      <div className="fixed bottom-16 left-0 right-0 z-30 bg-card border-t border-border p-4 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-text-secondary">Selected Rig</div>
            <div className="font-data font-bold text-primary text-base">
              {tiers.find((t) => t.id === activeTierId)
                ? `₹${tiers.find((t) => t.id === activeTierId)?.pricePerHour}/hr`
                : 'Select tier'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleBookNow}
            disabled={tiers.length === 0}
            className="flex-1 bg-primary text-white rounded-2xl py-3 px-6 font-heading font-semibold text-sm shadow-sm active:scale-95 transition-transform disabled:opacity-50 disabled:pointer-events-none text-center"
          >
            Book Gaming Slot
          </button>
        </div>
      </div>
    </div>
  );
}
