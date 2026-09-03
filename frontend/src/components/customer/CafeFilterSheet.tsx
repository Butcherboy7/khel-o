'use client';

import {
  Monitor,
  Gamepad2,
  Gamepad,
  MoreHorizontal,
  Snowflake,
  Coffee,
  ParkingCircle,
  Trophy,
  Armchair,
  MapPin,
  type LucideIcon,
} from 'lucide-react';
import { BottomSheet, Button } from '@/components/ui';
import { normalizeAmenityKey } from '@/lib/amenities';
import type { CafeListItem } from '@/types';

export type PlatformFilter = 'All' | 'PC' | 'PS5' | 'Xbox' | 'Other';
export type OpenStatusFilter = 'any' | 'open_now' | 'opening_soon';
export type DistanceFilter = 'any' | 1 | 3 | 5 | 10;

/** Amenity filter buckets — grouped by real, seeded amenity slugs (see
 *  lib/amenities.ts's AMENITY_MAP), not the mockup's literal labels, so
 *  every chip here can actually match a café instead of always coming back
 *  empty for a claim no café's data ever makes. */
export interface AmenityBucket {
  id: string;
  label: string;
  icon: LucideIcon;
  keys: string[];
}

export const AMENITY_BUCKETS: AmenityBucket[] = [
  { id: 'monitors', label: 'High Refresh', icon: Monitor, keys: ['high_refresh_monitors', '4k_monitors'] },
  { id: 'ac', label: 'AC', icon: Snowflake, keys: ['ac', 'air_conditioning', 'air_conditioned'] },
  { id: 'food', label: 'Food & Beverages', icon: Coffee, keys: ['food_beverages', 'snacks_and_beverages', 'snack_bar', 'snacks', 'cafe', 'cafe_bar'] },
  { id: 'parking', label: 'Parking', icon: ParkingCircle, keys: ['parking', 'valet_parking'] },
  { id: 'events', label: 'LAN / Events', icon: Trophy, keys: ['tournament_area', 'tournament_stage', 'bootcamp_rooms'] },
  { id: 'chairs', label: 'Premium Chairs', icon: Armchair, keys: ['ergonomic_chairs'] },
];

export const DISTANCE_OPTIONS: Exclude<DistanceFilter, 'any'>[] = [1, 3, 5, 10];

export const PRICE_MIN = 0;
export const PRICE_MAX = 500;
export const PRICE_STEP = 10;

export function cafeHasAmenityBucket(cafe: CafeListItem, bucket: AmenityBucket): boolean {
  const cafeKeys = new Set((cafe.amenities || []).map(normalizeAmenityKey));
  return bucket.keys.some((k) => cafeKeys.has(k));
}

const PLATFORM_OPTIONS: { key: PlatformFilter; label: string; icon: LucideIcon }[] = [
  { key: 'PC', label: 'PC', icon: Monitor },
  { key: 'PS5', label: 'PS5', icon: Gamepad2 },
  { key: 'Xbox', label: 'Xbox', icon: Gamepad },
  { key: 'Other', label: 'Other', icon: MoreHorizontal },
];

const OPEN_STATUS_OPTIONS: { key: OpenStatusFilter; label: string }[] = [
  { key: 'any', label: 'Any' },
  { key: 'open_now', label: 'Open now' },
  { key: 'opening_soon', label: 'Opening soon' },
];

function ChipButton({
  isSelected,
  onClick,
  children,
  disabled,
}: {
  isSelected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border-2 px-4 min-h-[40px] text-caption font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        isSelected
          ? 'border-primary bg-primary/5 text-primary font-bold'
          : 'border-border bg-card text-text-primary hover:bg-surface'
      }`}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-caption font-bold text-text-primary">{children}</span>
  );
}

interface CafeFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  hasLocation: boolean;
  onRequestLocation: () => void;
  distance: DistanceFilter;
  onDistanceChange: (v: DistanceFilter) => void;
  openStatus: OpenStatusFilter;
  onOpenStatusChange: (v: OpenStatusFilter) => void;
  platform: PlatformFilter;
  onPlatformChange: (v: PlatformFilter) => void;
  priceRange: [number, number];
  onPriceRangeChange: (v: [number, number]) => void;
  selectedAmenities: string[];
  onAmenitiesChange: (v: string[]) => void;
  resultCount: number;
  hasAdvancedFilters: boolean;
  onClearAll: () => void;
}

/** The "Filters" bottom sheet — distance, open status, platform, price range,
 *  and amenities live here so the always-visible chip row above stays down
 *  to the handful of filters most searches actually use. Everything below
 *  filters the live café list as it changes; "Show N cafés" just closes the
 *  sheet onto the already-updated result. */
export function CafeFilterSheet({
  isOpen,
  onClose,
  hasLocation,
  onRequestLocation,
  distance,
  onDistanceChange,
  openStatus,
  onOpenStatusChange,
  platform,
  onPlatformChange,
  priceRange,
  onPriceRangeChange,
  selectedAmenities,
  onAmenitiesChange,
  resultCount,
  hasAdvancedFilters,
  onClearAll,
}: CafeFilterSheetProps) {
  const toggleAmenity = (id: string) => {
    onAmenitiesChange(
      selectedAmenities.includes(id)
        ? selectedAmenities.filter((a) => a !== id)
        : [...selectedAmenities, id]
    );
  };

  const handleDistanceClick = (value: DistanceFilter) => {
    if (value !== 'any' && !hasLocation) {
      onRequestLocation();
      return;
    }
    onDistanceChange(value);
  };

  const [minPrice, maxPrice] = priceRange;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <Button variant="primary" size="lg" fullWidth onClick={onClose}>
          Show {resultCount} café{resultCount === 1 ? '' : 's'}
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Header — no separate close button by design: the CTA below and
            the sheet's own backdrop/swipe-down are the two ways out. */}
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-h2 text-text-primary">Filters</h2>
          {hasAdvancedFilters && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-caption font-bold text-primary hover:text-primary-dark min-h-[44px] px-2"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Distance */}
        <div className="flex flex-col gap-2.5">
          <SectionLabel>Distance</SectionLabel>
          <div className="flex flex-wrap gap-2">
            <ChipButton isSelected={distance === 'any'} onClick={() => handleDistanceClick('any')}>
              Any
            </ChipButton>
            {DISTANCE_OPTIONS.map((km) => (
              <ChipButton key={km} isSelected={distance === km} onClick={() => handleDistanceClick(km)}>
                Within {km} km
              </ChipButton>
            ))}
          </div>
          {!hasLocation && (
            <p className="flex items-center gap-1 text-caption text-text-secondary">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
              Enable location to filter by distance.
            </p>
          )}
        </div>

        {/* Open status */}
        <div className="flex flex-col gap-2.5">
          <SectionLabel>Open status</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {OPEN_STATUS_OPTIONS.map((opt) => (
              <ChipButton key={opt.key} isSelected={openStatus === opt.key} onClick={() => onOpenStatusChange(opt.key)}>
                {opt.label}
              </ChipButton>
            ))}
          </div>
        </div>

        {/* Platform / Type */}
        <div className="flex flex-col gap-2.5">
          <SectionLabel>Platform / Type</SectionLabel>
          <div className="grid grid-cols-4 gap-2.5">
            {PLATFORM_OPTIONS.map(({ key, label, icon: Icon }) => {
              const isSelected = platform === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onPlatformChange(isSelected ? 'All' : key)}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 py-3 px-1 transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border bg-card text-text-secondary hover:bg-surface'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[11px] font-semibold">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Price per hour — two overlapping native range inputs sharing one
            track; see .range-slider-thumb in globals.css. */}
        <div className="flex flex-col gap-2.5">
          <SectionLabel>Price per hour</SectionLabel>
          <div className="relative h-5 flex items-center px-1">
            <div className="absolute inset-x-1 h-1 rounded-full bg-border" />
            <div
              className="absolute h-1 rounded-full bg-primary"
              style={{
                left: `${(minPrice / PRICE_MAX) * 100}%`,
                right: `${100 - (maxPrice / PRICE_MAX) * 100}%`,
              }}
            />
            <input
              type="range"
              className="range-slider-thumb absolute inset-x-0 w-full"
              min={PRICE_MIN}
              max={PRICE_MAX}
              step={PRICE_STEP}
              value={minPrice}
              onChange={(e) => {
                const next = Math.min(Number(e.target.value), maxPrice);
                onPriceRangeChange([next, maxPrice]);
              }}
              aria-label="Minimum price per hour"
            />
            <input
              type="range"
              className="range-slider-thumb absolute inset-x-0 w-full"
              min={PRICE_MIN}
              max={PRICE_MAX}
              step={PRICE_STEP}
              value={maxPrice}
              onChange={(e) => {
                const next = Math.max(Number(e.target.value), minPrice);
                onPriceRangeChange([minPrice, next]);
              }}
              aria-label="Maximum price per hour"
            />
          </div>
          <div className="flex items-center justify-between text-caption text-text-secondary">
            <span>₹{PRICE_MIN}</span>
            <span className="font-bold text-text-primary">
              ₹{minPrice}{maxPrice >= PRICE_MAX ? ' – ₹500+' : ` – ₹${maxPrice}`}
            </span>
            <span>₹{PRICE_MAX}+</span>
          </div>
        </div>

        {/* Amenities */}
        <div className="flex flex-col gap-2.5">
          <SectionLabel>Amenities</SectionLabel>
          <div className="grid grid-cols-2 gap-2.5">
            {AMENITY_BUCKETS.map(({ id, label, icon: Icon }) => {
              const isSelected = selectedAmenities.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleAmenity(id)}
                  className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border bg-card text-text-secondary hover:bg-surface'
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="text-caption font-semibold truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
