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
}

export interface TierConfig {
  id: string;
  platform: Platform;
  model: string;
  totalSeats: number;
  appBookableSeats: number;
  pricePerHour: number;
}
