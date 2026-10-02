export type PromotionPlayMode = 'any' | 'solo' | 'coop';

export type PromotionType = 'percentage' | 'fixed_amount' | 'fixed_price';

export interface Promotion {
  id: string;
  cafeId: string;
  title: string;
  description: string | null;
  promotionType: PromotionType;
  discountPercentage: number | null;
  fixedDiscountAmount: number | null;
  fixedPriceAmount: number | null;
  minDurationHours: number | null;
  /** PERCENTAGE/FIXED_AMOUNT only: shortest booking (minutes) this offer applies to. */
  minBookingMinutes: number | null;
  /** Derived by the backend from the tier's hourly rate — never stored,
   *  only present on FIXED_PRICE offers. */
  regularPrice: number | null;
  savingsAmount: number | null;
  applicableTierId: string | null;
  applicableTierName: string | null;
  /** 'any' | 'solo' (own console) | 'coop' (friends sharing one). */
  playMode?: PromotionPlayMode;
  validFrom: string;
  validUntil: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  maxUses: number | null;
  currentUses: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Owner list only: unpaid bookings in their payment window holding a spot. */
  heldUses?: number;
  /** Public listing only (never on the owner's own list): server-built so every
   *  screen words an offer the same way. */
  label?: string;
  /** Schedule in words ("Weekdays · 6 PM–9 PM"); null when it runs any time. */
  when?: string | null;
  /** False when today's day/hour window isn't open yet. */
  isLiveNow?: boolean;
  /** Spots left on a capped offer; null/undefined when uncapped. */
  slotsRemaining?: number | null;
}

export type PromotionDetail = Promotion;

export interface PromotionCreateRequest {
  cafeId: string;
  title: string;
  description?: string;
  promotionType: PromotionType;
  discountPercentage?: number | null;
  fixedDiscountAmount?: number | null;
  fixedPriceAmount?: number | null;
  minDurationHours?: number | null;
  applicableTierId?: string | null;
  playMode?: PromotionPlayMode;
  validFrom: string;
  validUntil: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  maxUses?: number | null;
}

export interface PromotionUpdateRequest {
  title?: string;
  description?: string;
  promotionType?: PromotionType;
  discountPercentage?: number | null;
  fixedDiscountAmount?: number | null;
  fixedPriceAmount?: number | null;
  minDurationHours?: number | null;
  applicableTierId?: string | null;
  playMode?: PromotionPlayMode;
  validFrom?: string;
  validUntil?: string;
  daysOfWeek?: number[];
  startHour?: number;
  endHour?: number;
  maxUses?: number | null;
  isActive?: boolean;
}
