import type { PresetCategory, TierSpecs } from './shared';
import type { Promotion } from './promotion';
import type { Platform } from '@/constants/platforms';

export interface HardwareTier {
  id: string;
  cafeId: string;
  name: string;
  description: string | null;
  specs: TierSpecs;
  totalSeats: number;
  appBookableSeats: number;
  activeSeatsCount: number;
  presetCategory: PresetCategory | null;
  platform: Platform | null;
  model: string | null;
  /** Computed by backend from specs. Not stored in DB. */
  performanceRating: number | null;
  /** Populated when specs fall below preset minimums. */
  warning: string | null;
  pricePerHour: number;
  isActive: boolean;
  /** Populated when listing tiers via GET /cafes/{id}/tiers */
  activePromotion: Promotion | null;
  tierType: 'gaming' | 'activity';
  activityKind: string | null;
  /** Whether this tier's seats are tracked as individually-numbered units
   *  (HardwareTierUnit rows) or as one pooled count. Computed by the
   *  backend, not a stored flag. */
  trackingMode?: 'individual' | 'pooled';
  /** Co-op: friends share ONE unit for coopExtraPlayerPrice per extra player/hr. */
  coopEnabled?: boolean;
  coopMaxPlayers?: number;
  coopExtraPlayerPrice?: number;
  /** Shortest session (VR is often 15) and the length checkout starts on. Only
   *  15, 30 or 60 are valid now — above 1 hour every setup allows 30-minute
   *  steps regardless of this value. */
  minBookingMinutes?: number;
  defaultBookingMinutes?: number | null;
  /** Optional overrides for a 15/30-min session. Null/undefined = derived
   *  from pricePerHour (hourly/4, hourly/2). Only meaningful when
   *  minBookingMinutes allows that length. */
  price15m?: number | null;
  price30m?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TierCreateRequest {
  name?: string;
  description?: string;
  specs: TierSpecs;
  totalSeats: number;
  appBookableSeats: number;
  presetCategory?: PresetCategory | null;
  pricePerHour: number;
  platform?: Platform;
  model?: string;
  /** True when `model` is owner-typed free text (the "Custom" escape hatch
   *  in the model dropdown) rather than one of PLATFORM_MODELS' presets —
   *  see backend derive_tier_display's is_custom parameter. */
  isCustomModel?: boolean;
  tierType?: 'gaming' | 'activity';
  activityKind?: string;
  /** Create-only — see backend HardwareTierCreate.individual_units. Absent
   *  or false = pooled capacity, never sent/used again after creation. */
  individualUnits?: boolean;
  /** Co-op: friends share ONE unit for coopExtraPlayerPrice per extra player/hr. */
  coopEnabled?: boolean;
  coopMaxPlayers?: number;
  coopExtraPlayerPrice?: number;
  /** Shortest session (VR is often 15) and the length checkout starts on. Only
   *  15, 30 or 60 are valid now — above 1 hour every setup allows 30-minute
   *  steps regardless of this value. */
  minBookingMinutes?: number;
  defaultBookingMinutes?: number | null;
  /** Optional overrides for a 15/30-min session. Null/undefined = derived
   *  from pricePerHour (hourly/4, hourly/2). Only meaningful when
   *  minBookingMinutes allows that length. */
  price15m?: number | null;
  price30m?: number | null;
}

export interface TierUpdateRequest {
  name?: string;
  description?: string;
  specs?: TierSpecs;
  totalSeats?: number;
  appBookableSeats?: number;
  presetCategory?: PresetCategory | null;
  pricePerHour?: number;
  isActive?: boolean;
  activeSeatsCount?: number;
  platform?: Platform;
  model?: string;
  isCustomModel?: boolean;
  activityKind?: string;
  /** Co-op: friends share ONE unit for coopExtraPlayerPrice per extra player/hr. */
  coopEnabled?: boolean;
  coopMaxPlayers?: number;
  coopExtraPlayerPrice?: number;
  /** Shortest session (VR is often 15) and the length checkout starts on. Only
   *  15, 30 or 60 are valid now — above 1 hour every setup allows 30-minute
   *  steps regardless of this value. */
  minBookingMinutes?: number;
  defaultBookingMinutes?: number | null;
  /** Optional overrides for a 15/30-min session. Null/undefined = derived
   *  from pricePerHour (hourly/4, hourly/2). Only meaningful when
   *  minBookingMinutes allows that length. */
  price15m?: number | null;
  price30m?: number | null;
}

export interface TierConfig {
  id: string;
  platform: Platform;
  model: string;
  totalSeats: number;
  appBookableSeats: number;
  pricePerHour: number;
  tierType: 'gaming' | 'activity';
  activityKind?: string;
  /** True when `model` is owner-typed free text (the "Custom" escape hatch
   *  in the model dropdown) rather than one of PLATFORM_MODELS' presets. */
  isCustomModel?: boolean;
  /** This component's own working state for the create-time toggle — see
   *  TierCreateRequest.individualUnits above for what it maps to on submit. */
  individualUnits?: boolean;
  /** Co-op: friends share ONE unit for coopExtraPlayerPrice per extra player/hr. */
  coopEnabled?: boolean;
  coopMaxPlayers?: number;
  coopExtraPlayerPrice?: number;
  /** Shortest session (VR is often 15) and the length checkout starts on. Only
   *  15, 30 or 60 are valid now — above 1 hour every setup allows 30-minute
   *  steps regardless of this value. */
  minBookingMinutes?: number;
  defaultBookingMinutes?: number | null;
  /** Optional overrides for a 15/30-min session. Null/undefined = derived
   *  from pricePerHour (hourly/4, hourly/2). Only meaningful when
   *  minBookingMinutes allows that length. */
  price15m?: number | null;
  price30m?: number | null;
}
